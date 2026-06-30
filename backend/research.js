// research.js
// LLM-backed research operations: structured ingestion, RAG-grounded Q&A
// with citation extraction, and structured brief generation.

import { chat } from './llm.js';
import { buildPassages, hybridRetrieveWithFallback, formatContext } from './rag.js';
import { correctiveRetrieve } from './crag.js';

// ── Helpers ──────────────────────────────────────────────────
function stripFences(s) {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

// Pull every [P# §Section] marker out of an answer and map it to the
// passage / paper it refers to. This is what makes claims traceable.
function extractCitations(answer, retrieved) {
  const byKey = new Map();
  const re = /\[P(\d+)\s*§\s*([^\]]+)\]/g;
  let m;
  const order = [];
  while ((m = re.exec(answer))) {
    const paperIndex = Number(m[1]);
    const section = m[2].trim();
    const key = `${paperIndex}|${section.toLowerCase()}`;
    if (byKey.has(key)) continue;
    const src =
      retrieved.find(
        (r) => r.paperIndex === paperIndex && r.section.toLowerCase() === section.toLowerCase()
      ) || retrieved.find((r) => r.paperIndex === paperIndex);
    byKey.set(key, {
      marker: `[P${paperIndex} §${section}]`,
      paperIndex,
      section,
      paperId: src?.paperId || null,
      title: src?.title || null,
      quote: src ? src.text.slice(0, 280) : null,
    });
    order.push(key);
  }
  return order.map((k) => byKey.get(k));
}

// ── Ingestion ────────────────────────────────────────────────
const INGEST_SYSTEM = `You are a careful scientific reading assistant. You extract structured information
from a research paper's text. You never invent details: if a field is not present in the text, return an empty string for it.
Respond with a single JSON object and nothing else.`;

export async function ingestText(text, { title = '' } = {}) {
  const clipped = text.slice(0, 24000); // keep prompt bounded
  const user = `Extract the following fields from this paper as JSON with exactly these keys:
{
  "title": string,            // the paper's title (use the given one if present)
  "authors": string,          // comma-separated, or ""
  "year": string,             // publication year or ""
  "abstract": string,         // the abstract, lightly cleaned
  "methodology": string,      // how the work was done (data, methods, setup)
  "keyFindings": string,      // the main results, quantitative where possible
  "limitations": string,      // stated weaknesses / threats to validity
  "conclusion": string        // the authors' conclusions / takeaways
}
Be faithful and concise. Use "" for anything not supported by the text.

${title ? `Hinted title: ${title}\n\n` : ''}PAPER TEXT:
"""
${clipped}
"""`;

  const { content, usage, model } = await chat([
    { role: 'system', content: INGEST_SYSTEM },
    { role: 'user', content: user },
  ]);

  let data;
  try {
    data = JSON.parse(stripFences(content));
  } catch {
    data = { abstract: text.slice(0, 1500) };
  }
  const structured = {
    abstract: data.abstract || '',
    methodology: data.methodology || '',
    keyFindings: data.keyFindings || '',
    limitations: data.limitations || '',
    conclusion: data.conclusion || '',
  };
  return {
    title: data.title || title || '',
    authors: data.authors || '',
    year: data.year || '',
    structured,
    usage,
    model,
  };
}

// ── RAG Q&A ──────────────────────────────────────────────────
const ASK_SYSTEM = `You are a rigorous research assistant. You answer ONLY from the provided source passages.

Hard rules:
- Use no outside knowledge. If the passages do not contain the answer, say exactly what is missing.
- Every factual claim MUST end with a citation marker of the form [P# §Section] taken from the passage labels — e.g. [P2 §Methodology].
- Never write a claim without a citation. Do not invent papers, sections, numbers, or findings.
- Quote or paraphrase faithfully. Prefer specific, quantitative statements.
- Use clear Markdown. Be concise.`;

export async function ask({ papers, question, history = [] }) {
  const passages = buildPassages(papers);
  if (!passages.length) {
    return { answer: '_No readable content found in this bucket yet. Add papers or ingest a PDF first._', citations: [], passages: [], retrieval: null, usage: null, model: null };
  }
  // Corrective RAG: retrieve, grade for relevance, and rewrite + re-retrieve
  // if support is weak. `insufficient` means nothing relevant survived.
  const { retrieved, verdict, insufficient, steps } = await correctiveRetrieve({ question, passages, k: 8 });
  const context = formatContext(retrieved);

  const convo = history
    .slice(-6)
    .map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.content }));

  // When correction couldn't find relevant support, tell the model plainly so
  // it reports the gap rather than stretching weak passages into an answer.
  const weakNote = insufficient
    ? '\n\nNote: an automated relevance check found weak support for this question in the sources. If the passages below do not actually answer it, say exactly what is missing instead of guessing.'
    : '';

  const user = `Source passages (the ONLY information you may use):

${context}

=== END OF SOURCES ===

Question: ${question}${weakNote}

Answer using only the passages above, citing every claim with [P# §Section].`;

  const { content, usage, model } = await chat([
    { role: 'system', content: ASK_SYSTEM },
    ...convo,
    { role: 'user', content: user },
  ]);

  return {
    answer: content,
    citations: extractCitations(content, retrieved),
    passages: retrieved.map((r) => ({ paperIndex: r.paperIndex, title: r.title, section: r.section, paperId: r.paperId, score: r.score, relevance: r.relevance ?? null, preview: r.text.slice(0, 200) })),
    retrieval: { verdict, insufficient, steps },
    usage,
    model,
  };
}

// ── Brief generation ─────────────────────────────────────────
const BRIEF_SYSTEM = `You are a research analyst writing a grounded research brief from source passages only.
Follow the same citation rules: every claim ends with [P# §Section]; use no outside knowledge; never fabricate.
Write in clean Markdown with the exact section headings requested.`;

export async function brief({ papers, question = '' }) {
  const passages = buildPassages(papers);
  if (!passages.length) {
    return { brief: '_Add papers with content to generate a brief._', citations: [], passages: [], usage: null, model: null };
  }
  // Pull broad context using the question plus generic research probes.
  // A brief wants recall across the corpus, so we use hybrid retrieval here
  // (BM25 + semantic) rather than CRAG's precision-oriented filtering.
  const probe = `${question} methodology results findings limitations conclusion contributions comparison`;
  const retrieved = await hybridRetrieveWithFallback(probe, passages, 16);
  const context = formatContext(retrieved);
  const titles = papers.map((p, i) => `P${i + 1}: ${p.title || 'Untitled'}`).join('\n');

  const user = `Papers in scope:
${titles}

Source passages (the ONLY information you may use for claims):

${context}

=== END OF SOURCES ===

${question ? `Research question: ${question}\n\n` : ''}Write a **Research Brief** with these exact sections (use ## headings):

## Executive Summary
A 3–5 sentence grounded overview.

## Key Findings by Theme
Group findings into 2–4 themes (### sub-headings). Each finding cited with [P# §Section].

## Areas of Consensus
Where the papers agree, with citations.

## Open Questions
Unresolved questions / gaps the sources reveal, with citations where applicable.

## Recommended Next Papers
3–5 concrete search directions or topics to read next (these are suggestions, mark them as such).

Cite every factual claim with [P# §Section]. Do not use outside knowledge.`;

  const { content, usage, model } = await chat([
    { role: 'system', content: BRIEF_SYSTEM },
    { role: 'user', content: user },
  ]);

  return {
    brief: content,
    citations: extractCitations(content, retrieved),
    passages: retrieved.map((r) => ({ paperIndex: r.paperIndex, title: r.title, section: r.section, paperId: r.paperId, score: r.score, preview: r.text.slice(0, 200) })),
    usage,
    model,
  };
}
