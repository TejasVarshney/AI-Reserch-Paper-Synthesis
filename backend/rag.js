// rag.js
// Retrieval over paper passages. Two retrievers live here:
//   • BM25 — lexical scoring, always available, no external services.
//   • hybrid — BM25 blended with embedding cosine similarity, when an
//     embedding endpoint is reachable (see embeddings.js). Falls back to
//     pure BM25 when it isn't, so retrieval degrades gracefully.
// Each passage keeps its provenance (paper index, title, section) so every
// retrieved snippet — and the claims grounded in it — stays traceable.

import { embeddingsAvailable, embed, embedAll, cosine, WEIGHTS, warnOnce } from './embeddings.js';

// Upper bound on how many passages we embed per query. Below this we embed
// the whole corpus (so semantic search can surface passages BM25 missed);
// above it we embed only the strongest BM25 candidates to bound cost.
const EMBED_POOL_MAX = Number(process.env.RAG_EMBED_POOL_MAX ?? 256);

const STOP = new Set(
  ('a an the of to in on for and or but with without within into from by as at is are was were be been being ' +
   'this that these those it its their our your his her we they i you he she them us has have had do does did ' +
   'not no nor so than then there here which who whom whose what when where why how all any both each few more ' +
   'most other some such only own same can will just should now also via using used use based per across')
    .split(' ')
);

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 1 && !STOP.has(w));
}

// Split text into overlapping word windows so long sections become passages.
function windows(text, size = 150, overlap = 30) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= size) return [text.trim()];
  const out = [];
  for (let i = 0; i < words.length; i += size - overlap) {
    out.push(words.slice(i, i + size).join(' '));
    if (i + size >= words.length) break;
  }
  return out;
}

// Derive the labelled sections of a paper from whatever we have on it.
function sectionsOf(paper) {
  if (Array.isArray(paper.sections) && paper.sections.length) {
    return paper.sections.filter((s) => s.text && s.text.trim());
  }
  const s = paper.structured;
  if (s && Object.values(s).some(Boolean)) {
    return [
      ['Abstract', s.abstract],
      ['Methodology', s.methodology],
      ['Key Findings', s.keyFindings],
      ['Limitations', s.limitations],
      ['Conclusion', s.conclusion],
    ]
      .filter(([, v]) => v && String(v).trim())
      .map(([heading, text]) => ({ heading, text: String(text) }));
  }
  if (paper.fullText && paper.fullText.trim()) return [{ heading: 'Full text', text: paper.fullText }];
  if (paper.abstract && paper.abstract.trim()) return [{ heading: 'Abstract', text: paper.abstract }];
  return [];
}

/**
 * Build labelled passages from an ordered list of papers.
 * Paper order defines the [P#] index used in citations.
 */
export function buildPassages(papers) {
  const passages = [];
  papers.forEach((paper, idx) => {
    const p = idx + 1;
    for (const section of sectionsOf(paper)) {
      windows(section.text).forEach((chunk, ci) => {
        passages.push({
          pid: `P${p}-${slug(section.heading)}-${ci}`,
          paperId: paper.id,
          paperIndex: p,
          title: paper.title || `Paper ${p}`,
          section: section.heading,
          text: chunk.trim(),
          // index the heading + title alongside the text so topical probes
          // (e.g. "methodology", "limitations") match even when the prose
          // doesn't repeat those words.
          tokens: tokenize(`${section.heading} ${paper.title || ''} ${chunk}`),
        });
      });
    }
  });
  return passages;
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}

// Score every passage against the query with BM25. Returns raw scores for
// ALL passages (including 0), so callers can re-rank or blend them.
function computeBm25(query, passages) {
  const qTerms = [...new Set(tokenize(query))];
  const N = passages.length;
  const avgdl = passages.reduce((s, p) => s + p.tokens.length, 0) / N || 1;

  // document frequency per query term
  const df = new Map();
  for (const t of qTerms) {
    let n = 0;
    for (const p of passages) if (p.tokens.includes(t)) n++;
    df.set(t, n);
  }
  const idf = (t) => Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5));

  const k1 = 1.5;
  const b = 0.75;
  return passages.map((p) => {
    const dl = p.tokens.length || 1;
    let score = 0;
    for (const t of qTerms) {
      if (!df.get(t)) continue;
      let f = 0;
      for (const w of p.tokens) if (w === t) f++;
      if (!f) continue;
      score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
    }
    return { passage: p, score };
  });
}

// Shape the top-k raw BM25 scores into retrieval results. `semantic`/
// `relevance` are null here to signal "no embedding signal was used".
function lexicalTopK(bm25, k) {
  return bm25
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({
      ...s.passage,
      score: Number(s.score.toFixed(3)),
      bm25: Number(s.score.toFixed(3)),
      semantic: null,
      relevance: null,
    }));
}

/** Rank passages against a query with BM25 and return the top-k (lexical only). */
export function retrieve(query, passages, k = 8) {
  if (!passages.length) return [];
  return lexicalTopK(computeBm25(query, passages), k).map(
    ({ bm25, semantic, relevance, ...p }) => p
  );
}

/**
 * Like retrieve(), but always returns up to k passages: relevant ones first,
 * then fills with remaining passages so a brief/answer never starves for
 * context on a small corpus.
 */
export function retrieveWithFallback(query, passages, k = 8) {
  const scored = retrieve(query, passages, k);
  if (scored.length >= k) return scored;
  const used = new Set(scored.map((s) => s.pid));
  const filler = passages
    .filter((p) => !used.has(p.pid))
    .slice(0, k - scored.length)
    .map((p) => ({ ...p, score: 0 }));
  return [...scored, ...filler];
}

// ── Hybrid retrieval (BM25 + semantic embeddings) ────────────────
// Min-max normalizer over a set of values, returned as a function. Maps the
// observed range onto [0,1]; a flat range collapses to 1 (positive) or 0.
function minMax(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  return (v) => (range > 0 ? (v - min) / range : v > 0 ? 1 : 0);
}

/**
 * Rank passages with a weighted blend of BM25 and embedding cosine
 * similarity. Both signals are min-max normalized across the candidate pool
 * before blending (WEIGHTS.bm25 / WEIGHTS.semantic). Returns passages with
 * `score` (blended), plus `bm25`, `semantic` and `relevance` for inspection.
 * Falls back to pure BM25 if the embedding endpoint is unavailable.
 */
export async function hybridRetrieve(query, passages, k = 8) {
  if (!passages.length) return [];
  const bm25 = computeBm25(query, passages);

  let semantic = false;
  try {
    semantic = await embeddingsAvailable();
  } catch {
    semantic = false;
  }
  if (!semantic) return lexicalTopK(bm25, k);

  const bm25ByPid = new Map(bm25.map((s) => [s.passage.pid, s.score]));

  // Embed a bounded candidate pool: the whole corpus when it's small,
  // otherwise the strongest BM25 candidates (keeps embedding cost predictable).
  let pool = passages;
  if (passages.length > EMBED_POOL_MAX) {
    pool = [...bm25]
      .sort((a, b) => b.score - a.score)
      .slice(0, EMBED_POOL_MAX)
      .map((s) => s.passage);
  }

  let qVec;
  let vecs;
  try {
    qVec = await embed(query);
    vecs = await embedAll(pool.map((p) => p.text));
  } catch (err) {
    warnOnce(`semantic scoring failed, using BM25 only: ${err.message}`);
    return lexicalTopK(bm25, k);
  }

  const semByPid = new Map(pool.map((p, i) => [p.pid, cosine(qVec, vecs[i])]));
  const total = WEIGHTS.bm25 + WEIGHTS.semantic || 1;
  const wB = WEIGHTS.bm25 / total;
  const wS = WEIGHTS.semantic / total;
  const normB = minMax(pool.map((p) => bm25ByPid.get(p.pid) || 0));
  const normS = minMax(pool.map((p) => semByPid.get(p.pid) || 0));

  return pool
    .map((p) => {
      const b = bm25ByPid.get(p.pid) || 0;
      const s = semByPid.get(p.pid) || 0;
      const score = wB * normB(b) + wS * normS(s);
      return {
        ...p,
        score: Number(score.toFixed(3)),
        bm25: Number(b.toFixed(3)),
        semantic: Number(s.toFixed(3)),
        relevance: Number(score.toFixed(3)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Hybrid retrieve, padded to k with unused passages so context never starves. */
export async function hybridRetrieveWithFallback(query, passages, k = 8) {
  const scored = await hybridRetrieve(query, passages, k);
  if (scored.length >= k) return scored;
  const used = new Set(scored.map((s) => s.pid));
  const filler = passages
    .filter((p) => !used.has(p.pid))
    .slice(0, k - scored.length)
    .map((p) => ({ ...p, score: 0, bm25: 0, semantic: null, relevance: 0 }));
  return [...scored, ...filler];
}

/** Render retrieved passages into a labelled context block for the prompt. */
export function formatContext(retrieved) {
  return retrieved
    .map(
      (r) =>
        `[P${r.paperIndex} §${r.section}] (${r.title})\n${r.text}`
    )
    .join('\n\n---\n\n');
}
