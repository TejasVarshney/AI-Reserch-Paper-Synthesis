// rag.js
// Lexical retrieval (BM25) over paper passages. Each passage keeps its
// provenance (paper index, title, section) so every retrieved snippet —
// and therefore every claim grounded in it — is traceable to a source.

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

/** Rank passages against a query with BM25 and return the top-k. */
export function retrieve(query, passages, k = 8) {
  if (!passages.length) return [];
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
  const scored = passages.map((p) => {
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

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((s) => ({ ...s.passage, score: Number(s.score.toFixed(3)) }));
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

/** Render retrieved passages into a labelled context block for the prompt. */
export function formatContext(retrieved) {
  return retrieved
    .map(
      (r) =>
        `[P${r.paperIndex} §${r.section}] (${r.title})\n${r.text}`
    )
    .join('\n\n---\n\n');
}
