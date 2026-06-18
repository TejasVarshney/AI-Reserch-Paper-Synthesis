// API client. In dev, Vite's /api proxy forwards to the local backend.
// In production, VITE_API_URL points at the deployed backend (e.g. Render).
// If VITE_API_URL is unset, paths are relative (single-origin deploy).

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function asJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const postJson = (url, body) =>
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(asJson);

export function getHealth() {
  return fetch(`${API_BASE}/api/health`).then(asJson);
}

// Paper discovery
export function discover(query, { source = 'both', limit = 10 } = {}) {
  const qs = new URLSearchParams({ q: query, source, limit: String(limit) });
  return fetch(`${API_BASE}/api/discover?${qs}`).then(asJson);
}

// Raw PDF text extraction (no LLM)
export function extractPdf(file) {
  const fd = new FormData();
  fd.append('file', file);
  return fetch(`${API_BASE}/api/extract`, { method: 'POST', body: fd }).then(asJson);
}

// Structured ingestion — PDF file or raw text → structured fields
export function ingestFile(file, title = '') {
  const fd = new FormData();
  fd.append('file', file);
  if (title) fd.append('title', title);
  return fetch(`${API_BASE}/api/ingest`, { method: 'POST', body: fd }).then(asJson);
}

export function ingestText(text, title = '') {
  return postJson(`${API_BASE}/api/ingest`, { text, title });
}

// RAG Q&A with citations
export function ask({ papers, question, history }) {
  return postJson(`${API_BASE}/api/ask`, { papers, question, history });
}

// Research brief
export function brief({ papers, question }) {
  return postJson(`${API_BASE}/api/brief`, { papers, question });
}

// Citation export
export function cite({ papers, format }) {
  return postJson(`${API_BASE}/api/cite`, { papers, format });
}
