// crag.js
// Corrective RAG (CRAG). Wraps hybrid retrieval with an LLM relevance grader
// and a query-rewrite + re-retrieve loop, so the generator is fed only the
// passages judged actually relevant to the question.
//
// Flow:
//   1. retrieve (hybrid BM25 + semantic)
//   2. grade every passage 0..1 with one batched LLM call → verdict
//        CORRECT    — at least one strongly relevant passage; proceed
//        AMBIGUOUS  — weak/partial support; rewrite query and re-retrieve
//        INCORRECT  — nothing relevant; rewrite query and re-retrieve
//   3. keep only graded-relevant passages (highest first)
//   4. if correction still finds nothing, flag `insufficient` so the answer
//      layer reports what's missing instead of hallucinating from noise.
//
// This project is strictly grounded ("use no outside knowledge") and has no
// web-search tool, so CRAG's corrective action here is query refinement +
// honest insufficiency reporting rather than the canonical web fallback.

import { chat } from './llm.js';
import { hybridRetrieve } from './rag.js';

// ── Knobs (all overridable via env) ──────────────────────────────
const ENABLED = (process.env.CRAG_ENABLED ?? 'true').toLowerCase() !== 'false';
const MAX_REWRITES = Number(process.env.CRAG_MAX_REWRITES ?? 1);
// A passage counts as "relevant" at/above this graded score.
const REL_THRESHOLD = Number(process.env.CRAG_RELEVANCE_THRESHOLD ?? 0.5);
// Verdict bands on the strongest graded passage.
const UPPER = Number(process.env.CRAG_UPPER ?? 0.7); // >= UPPER  → CORRECT
const LOWER = Number(process.env.CRAG_LOWER ?? 0.3); // <  LOWER  → INCORRECT
// How much passage text to show the grader (chars). Keeps grading cheap.
const GRADE_CLIP = Number(process.env.CRAG_GRADE_CLIP ?? 500);

export const CRAG_ENABLED = ENABLED;

function stripFences(s) {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// ── Relevance grader ─────────────────────────────────────────────
const GRADER_SYSTEM = `You are a retrieval evaluator for a citation-grounded research assistant.
For each numbered passage, judge how well it helps answer the user's question.
Score each passage from 0.0 to 1.0:
  1.0 = directly answers the question
  0.5 = related/partial, some useful information
  0.0 = irrelevant, off-topic, or unhelpful
Judge only relevance to the question — do not reward fluency or length.
Respond with ONLY a JSON object, no prose:
{ "passages": [ { "i": <passage number>, "score": <0.0-1.0> } ] }`;

/**
 * Grade each retrieved passage for relevance in a single batched LLM call.
 * On any failure the passages are treated as relevant (score 1) so a grader
 * outage never silently strips the generator's context.
 * @returns {Promise<Array<{passage: object, score: number, relevant: boolean}>>}
 */
export async function gradePassages(question, retrieved) {
  if (!retrieved.length) return [];
  const list = retrieved
    .map(
      (r, i) =>
        `[#${i + 1}] [P${r.paperIndex} §${r.section}] ${r.title || ''}\n${String(r.text).slice(0, GRADE_CLIP)}`
    )
    .join('\n\n');
  const user = `Question: ${question}\n\nPassages:\n${list}\n\nReturn the JSON scores now.`;

  let scores;
  try {
    const { content } = await chat([
      { role: 'system', content: GRADER_SYSTEM },
      { role: 'user', content: user },
    ]);
    const data = JSON.parse(stripFences(content));
    scores = new Map((data.passages || []).map((p) => [Number(p.i), Number(p.score)]));
  } catch {
    return retrieved.map((r) => ({ passage: r, score: 1, relevant: true }));
  }

  return retrieved.map((r, i) => {
    const raw = scores.has(i + 1) ? scores.get(i + 1) : 0;
    const score = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 0;
    return { passage: r, score, relevant: score >= REL_THRESHOLD };
  });
}

// Classic CRAG verdict from the strongest graded passage.
function verdictOf(grades) {
  const max = grades.reduce((m, g) => Math.max(m, g.score), 0);
  if (max >= UPPER) return 'CORRECT';
  if (max < LOWER) return 'INCORRECT';
  return 'AMBIGUOUS';
}

// ── Query rewriter ───────────────────────────────────────────────
const REWRITE_SYSTEM = `You rewrite a user's question into a better search query for retrieving
passages from research papers. Expand key concepts, add synonyms and technical terms a paper would use,
and drop conversational filler. Respond with ONLY the rewritten query on a single line — no quotes, no preamble.`;

/** Rewrite the question into a denser retrieval query. Falls back to the original on error. */
export async function rewriteQuery(question) {
  try {
    const { content } = await chat([
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: question },
    ]);
    const q = (content || '').trim().split('\n')[0].replace(/^["']|["']$/g, '').trim();
    return q.slice(0, 300) || question;
  } catch {
    return question;
  }
}

// ── Corrective retrieval ─────────────────────────────────────────
/**
 * Retrieve passages for `question` and correct weak retrieval.
 * @returns {Promise<{
 *   retrieved: object[],   // passages to feed the generator (graded-relevant, or best-effort)
 *   verdict: string,       // CORRECT | AMBIGUOUS | INCORRECT | EMPTY | DISABLED
 *   insufficient: boolean, // true when no relevant passage survived correction
 *   query: string,         // final query used (may be a rewrite)
 *   steps: object[],       // trace of what CRAG did, for transparency
 * }>}
 */
export async function correctiveRetrieve({ question, passages, k = 8 }) {
  const steps = [];
  let retrieved = await hybridRetrieve(question, passages, k);

  // CRAG off, or nothing to grade → return raw hybrid results.
  if (!ENABLED) {
    return { retrieved, verdict: 'DISABLED', insufficient: false, query: question, steps };
  }
  if (!retrieved.length) {
    return { retrieved, verdict: 'EMPTY', insufficient: true, query: question, steps };
  }

  let grades = await gradePassages(question, retrieved);
  let verdict = verdictOf(grades);
  let query = question;
  steps.push({
    action: 'grade',
    query,
    verdict,
    kept: grades.filter((g) => g.relevant).length,
    total: grades.length,
  });

  // Correction loop: while retrieval is weak, rewrite and pull more.
  let rewrites = 0;
  while (verdict !== 'CORRECT' && rewrites < MAX_REWRITES) {
    rewrites++;
    const nq = await rewriteQuery(question);
    if (nq.toLowerCase() === query.toLowerCase()) break; // no new query → stop
    query = nq;
    const more = await hybridRetrieve(nq, passages, k);
    const seen = new Set(retrieved.map((r) => r.pid));
    retrieved = [...retrieved, ...more.filter((m) => !seen.has(m.pid))];
    grades = await gradePassages(question, retrieved);
    verdict = verdictOf(grades);
    steps.push({
      action: 'rewrite+retrieve',
      query: nq,
      verdict,
      kept: grades.filter((g) => g.relevant).length,
      total: grades.length,
    });
  }

  // Keep graded-relevant passages, strongest first, capped at k.
  const relevant = grades
    .filter((g) => g.relevant)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((g) => ({ ...g.passage, relevance: Number(g.score.toFixed(3)) }));

  if (relevant.length) {
    return { retrieved: relevant, verdict, insufficient: false, query, steps };
  }

  // Nothing cleared the bar. Hand back the best-scoring passages anyway so the
  // generator has context, but flag insufficiency so it reports the gap.
  const best = [...grades]
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((g) => ({ ...g.passage, relevance: Number(g.score.toFixed(3)) }));
  return { retrieved: best, verdict, insufficient: true, query, steps };
}
