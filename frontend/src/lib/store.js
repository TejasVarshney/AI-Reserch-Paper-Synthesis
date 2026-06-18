// store.js — bucket persistence in localStorage (the source of truth for now).

const KEY = 'synthesis.buckets.v1';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2));
const now = () => Date.now();

export function loadBuckets() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveAll(buckets) {
  try {
    localStorage.setItem(KEY, JSON.stringify(buckets));
  } catch (err) {
    // Most likely the localStorage quota (full-text PDFs are large).
    console.error('Could not save buckets:', err);
    throw new Error('Storage is full. Remove some papers or buckets.');
  }
  return buckets;
}

export function getBucket(id) {
  return loadBuckets().find((b) => b.id === id) || null;
}

export function createBucket({ name, description = '', question = '' }) {
  const bucket = {
    id: uid(),
    name: name.trim() || 'Untitled bucket',
    description: description.trim(),
    question: question.trim(),
    papers: [],
    messages: [],
    createdAt: now(),
    updatedAt: now(),
  };
  saveAll([bucket, ...loadBuckets()]);
  return bucket;
}

export function updateBucket(id, patch) {
  const buckets = loadBuckets();
  const i = buckets.findIndex((b) => b.id === id);
  if (i === -1) return null;
  buckets[i] = { ...buckets[i], ...patch, updatedAt: now() };
  saveAll(buckets);
  return buckets[i];
}

export function deleteBucket(id) {
  saveAll(loadBuckets().filter((b) => b.id !== id));
}

// ── Papers ───────────────────────────────────────────────────
export function normalizePaper(p) {
  return {
    id: p.id || uid(),
    source: p.source || 'manual',
    title: p.title || 'Untitled paper',
    authors: p.authors || [],
    year: p.year || null,
    venue: p.venue || null,
    url: p.url || null,
    pdfUrl: p.pdfUrl || null,
    doi: p.doi || null,
    abstract: p.abstract || '',
    structured: p.structured || null,
    fullText: p.fullText || '',
    sections: p.sections || null,
    ingested: !!p.ingested,
    addedAt: p.addedAt || now(),
  };
}

export function addPaper(id, paper) {
  const bucket = getBucket(id);
  if (!bucket) return null;
  const next = normalizePaper(paper);
  // de-dupe by id / doi / title
  const dup = bucket.papers.find(
    (x) => x.id === next.id || (next.doi && x.doi === next.doi) ||
      x.title.toLowerCase() === next.title.toLowerCase()
  );
  if (dup) return updateBucket(id, { papers: bucket.papers });
  return updateBucket(id, { papers: [...bucket.papers, next] });
}

export function updatePaper(id, paperId, patch) {
  const bucket = getBucket(id);
  if (!bucket) return null;
  return updateBucket(id, {
    papers: bucket.papers.map((p) => (p.id === paperId ? { ...p, ...patch } : p)),
  });
}

export function removePaper(id, paperId) {
  const bucket = getBucket(id);
  if (!bucket) return null;
  return updateBucket(id, { papers: bucket.papers.filter((p) => p.id !== paperId) });
}

export function setMessages(id, messages) {
  return updateBucket(id, { messages });
}
