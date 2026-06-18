// embeddings.js
// Lightweight client for an embedding endpoint. Defaults to a local Ollama
// server (http://localhost:11434) using `nomic-embed-text`; both are
// overridable via env (EMBEDDINGS_URL, EMBEDDINGS_MODEL).
//
// We expose a single async `embed(text)` function with a small in-process
// cache keyed by a stable hash of the input. The cache survives for the
// lifetime of the Node process — long enough to amortize per-paper
// embedding cost across multiple queries in a session.
//
// We also expose `embeddingsAvailable()` which the RAG layer uses to
// decide whether to attempt semantic scoring at all.

import { createHash } from 'node:crypto';

// ── Config ────────────────────────────────────────────────────
// If EMBEDDINGS_URL is set, we use the OpenAI-compatible /v1/embeddings
// shape (Ollama's /v1/embeddings, OpenAI, Voyage, etc.). If unset and
// OLLAMA_HOST is reachable on the default port, we fall back to
// /api/embeddings (the legacy Ollama endpoint).
const EMB_URL = process.env.EMBEDDINGS_URL || 'http://localhost:11434';
const EMB_MODEL = process.env.EMBEDDINGS_MODEL || 'nomic-embed-text';
// Weights for the hybrid retriever. Default: 60% BM25 + 40% semantic.
const WEIGHT_BM25 = Number(process.env.RAG_WEIGHT_BM25 ?? 0.6);
const WEIGHT_SEM = Number(process.env.RAG_WEIGHT_SEM ?? 0.4);

let warned = false;
let available = null; // null = not yet probed; true/false after probe

// Cache: { key: { vec: number[], dim: number } }
const cache = new Map();
const MAX_CACHE = 5000; // cap to bound memory; truncate when exceeded

function hashKey(text) {
  return createHash('sha1').update(text).digest('hex').slice(0, 24);
}

function l2norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  return Math.sqrt(s) || 1;
}

function normalize(v) {
  const n = l2norm(v);
  if (n === 1) return v;
  const out = new Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/**
 * Probe the embedding endpoint with a tiny request. Caches the result for
 * the process lifetime. Returns true if a usable response was returned.
 */
export async function embeddingsAvailable() {
  if (available !== null) return available;
  try {
    const v = await rawEmbed('ping');
    available = Array.isArray(v) && v.length > 0;
  } catch {
    available = false;
  }
  return available;
}

/**
 * Reset the cached "is the endpoint up?" probe. Mostly useful for tests.
 */
export function resetProbe() {
  available = null;
}

/**
 * Embed a single string. Cached. Returns a Float32-like array (plain
 * number[]). Throws on transport / HTTP error so the caller can fall back.
 */
export async function embed(text) {
  const key = hashKey(text);
  const hit = cache.get(key);
  if (hit) return hit.vec;
  const vec = normalize(await rawEmbed(text));
  if (cache.size > MAX_CACHE) {
    // Drop ~25% of the cache (oldest entries) when it gets too big.
    const drop = Math.floor(MAX_CACHE * 0.25);
    const it = cache.keys();
    for (let i = 0; i < drop; i++) cache.delete(it.next().value);
  }
  cache.set(key, { vec, dim: vec.length });
  return vec;
}

/**
 * Embed many strings. Sequential (most local endpoints don't benefit from
 * parallelism and we want to populate the cache deterministically).
 */
export async function embedAll(texts) {
  const out = new Array(texts.length);
  for (let i = 0; i < texts.length; i++) {
    out[i] = await embed(texts[i]);
  }
  return out;
}

/**
 * Cosine similarity between two unit vectors. We assume both are already
 * L2-normalized (embed() does that), so it's just a dot product.
 */
export function cosine(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// ── Wire layer ────────────────────────────────────────────────
async function rawEmbed(input) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    // Prefer the OpenAI-style /v1/embeddings endpoint.
    const url = `${EMB_URL.replace(/\/+$/, '')}/v1/embeddings`;
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMB_MODEL, input }),
        signal: ctl.signal,
      });
    } catch {
      // Fall back to the legacy Ollama endpoint.
      res = await fetch(`${EMB_URL.replace(/\/+$/, '')}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMB_MODEL, prompt: input }),
        signal: ctl.signal,
      });
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      throw new Error(`embeddings ${res.status}: ${detail}`);
    }
    const data = await res.json();
    const vec = data?.data?.[0]?.embedding || data?.embedding;
    if (!Array.isArray(vec)) throw new Error('embeddings: malformed response');
    return vec.map((x) => Number(x));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Log a single warning the first time we attempt an embedding call and it
 * fails. Avoids spamming the console when BM25 fallback is doing fine.
 */
export function warnOnce(msg) {
  if (warned) return;
  warned = true;
  console.warn(`[embeddings] ${msg}`);
}

// Public knobs for the RAG layer.
export const WEIGHTS = { bm25: WEIGHT_BM25, semantic: WEIGHT_SEM };
