// discovery.js
// Search academic sources and return a normalized, ranked list of papers.
// Sources: arXiv (Atom XML) and Semantic Scholar (JSON). No API keys needed.

import { XMLParser } from 'fast-xml-parser';

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function fetchWithRetry(url, options, retries = 2, baseDelay = 1500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t = withTimeout(12000);
    let res;
    try {
      res = await fetch(url, { ...options, signal: t.signal });
    } finally {
      t.done();
    }
    if (res.status === 429 || res.status === 503) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)));
        continue;
      }
      throw new Error(`rate-limited (${res.status}), try again shortly`);
    }
    return res;
  }
}

// ── arXiv ────────────────────────────────────────────────────
async function searchArxiv(query, limit) {
  const url =
    `https://export.arxiv.org/api/query?search_query=${encodeURIComponent('all:' + query)}` +
    `&start=0&max_results=${limit}&sortBy=relevance`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'SynthesisEngine/1.0' } });
  if (!res.ok) throw new Error(`arXiv ${res.status}`);
  const feed = xml.parse(await res.text());
  const entries = asArray(feed?.feed?.entry);
  return entries.map((e, i) => {
    const id = String(e.id || '').trim();
    const arxivId = id.split('/abs/')[1] || id;
    return {
      id: `arxiv:${arxivId}`,
      source: 'arxiv',
      title: String(e.title || '').replace(/\s+/g, ' ').trim(),
      authors: asArray(e.author).map((a) => a.name).filter(Boolean),
      year: e.published ? Number(String(e.published).slice(0, 4)) : null,
      venue: 'arXiv',
      abstract: String(e.summary || '').replace(/\s+/g, ' ').trim(),
      url: id,
      pdfUrl: asArray(e.link).find((l) => l['@_title'] === 'pdf')?.['@_href'] || null,
      doi: e['arxiv:doi'] || null,
      citationCount: null,
      rank: i,
    };
  });
}

// ── Semantic Scholar ─────────────────────────────────────────
async function searchSemanticScholar(query, limit) {
  const fields = 'title,abstract,year,authors,venue,externalIds,url,openAccessPdf,citationCount';
  const url =
    `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}` +
    `&limit=${limit}&fields=${fields}`;
  const res = await fetchWithRetry(url, { headers: { 'User-Agent': 'SynthesisEngine/1.0' } });
  if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`);
  const data = await res.json();
  return asArray(data.data).map((p, i) => ({
    id: `s2:${p.paperId}`,
    source: 'semanticscholar',
    title: (p.title || '').trim(),
    authors: asArray(p.authors).map((a) => a.name).filter(Boolean),
    year: p.year || null,
    venue: p.venue || null,
    abstract: (p.abstract || '').trim(),
    url: p.url || null,
    pdfUrl: p.openAccessPdf?.url || null,
    doi: p.externalIds?.DOI || null,
    citationCount: typeof p.citationCount === 'number' ? p.citationCount : null,
    rank: i,
  }));
}

// ── Merge + rank ─────────────────────────────────────────────
// Score blends source relevance (earlier rank = better) with citation
// impact so highly-cited, highly-relevant papers float to the top.
function scoreOf(p) {
  const relevance = 1 / (p.rank + 1);
  const impact = p.citationCount ? Math.log10(p.citationCount + 1) / 6 : 0;
  return relevance + impact * 0.5;
}

function dedupe(papers) {
  const seen = new Map();
  for (const p of papers) {
    const key = (p.doi || p.title).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || (p.abstract && !prev.abstract)) seen.set(key, p);
  }
  return [...seen.values()];
}

/**
 * @param {string} query
 * @param {{source?: 'arxiv'|'semanticscholar'|'both', limit?: number}} opts
 */
export async function discover(query, { source = 'both', limit = 10 } = {}) {
  const want = Math.min(Math.max(limit, 1), 25);
  const tasks = [];
  if (source === 'arxiv' || source === 'both') tasks.push(['arxiv', searchArxiv(query, want)]);
  if (source === 'semanticscholar' || source === 'both')
    tasks.push(['semanticscholar', searchSemanticScholar(query, want)]);

  const results = await Promise.allSettled(tasks.map(([, p]) => p));
  const errors = [];
  let papers = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') papers.push(...r.value);
    else errors.push({ source: tasks[i][0], error: r.reason?.message || String(r.reason) });
  });

  papers = dedupe(papers).sort((a, b) => scoreOf(b) - scoreOf(a));
  return { papers: papers.slice(0, want), errors };
}
