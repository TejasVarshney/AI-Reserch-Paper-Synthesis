// server.js
// Express server for the AI Research Paper Synthesis Engine.
// Serves the static frontend and exposes the synthesis API.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';

import { chat, isConfigured, configSummary } from './llm.js';
import { buildMessages, SYNTHESIS_MODES } from './prompts.js';
import { discover } from './discovery.js';
import { ingestText, ask, brief } from './research.js';
import { formatCitations } from './citations.js';

// pdf-parse is CommonJS; load it via require to avoid its debug-mode entry.
const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
// In production the built React app lives in frontend/dist. During
// development the frontend is served by Vite (npm run dev) and proxies here.
const FRONTEND_DIST = join(__dirname, '..', 'frontend', 'dist');
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' })); // buckets can carry full-text papers

// In-memory upload handling for PDF extraction (max 25 MB / file).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ── API ───────────────────────────────────────────────────────

// Health + non-secret config status (drives the UI's status badge).
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, llm: configSummary() });
});

// List available synthesis modes (frontend builds its selector from this).
app.get('/api/modes', (_req, res) => {
  const modes = Object.entries(SYNTHESIS_MODES).map(([id, m]) => ({
    id,
    label: m.label,
    description: m.description,
  }));
  res.json({ modes });
});

// Extract text from an uploaded PDF so it can be dropped into a paper field.
app.post('/api/extract', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded (field name: "file").' });
  }
  try {
    const pdfParse = require('pdf-parse');
    const parsed = await pdfParse(req.file.buffer);
    res.json({
      filename: req.file.originalname,
      pages: parsed.numpages,
      text: (parsed.text || '').trim(),
    });
  } catch (err) {
    res.status(500).json({ error: `Failed to parse PDF: ${err.message}` });
  }
});

// Core endpoint: synthesize a set of papers.
app.post('/api/synthesize', async (req, res) => {
  const { papers, mode, customInstructions } = req.body || {};

  if (!isConfigured()) {
    return res.status(503).json({
      error:
        'The LLM is not configured. Set LLM_ENDPOINT, LLM_MODEL and LLM_API_KEY in backend/.env, then restart the server.',
    });
  }

  if (!Array.isArray(papers) || papers.length === 0) {
    return res.status(400).json({ error: 'Provide at least one paper.' });
  }

  const cleaned = papers
    .map((p) => ({ title: (p?.title || '').trim(), content: (p?.content || '').trim() }))
    .filter((p) => p.content.length > 0);

  if (cleaned.length === 0) {
    return res.status(400).json({ error: 'Every paper is empty. Add some abstract/text.' });
  }

  const modeId = SYNTHESIS_MODES[mode] ? mode : 'literature-review';

  try {
    const messages = buildMessages(cleaned, modeId, customInstructions);
    const result = await chat(messages);
    res.json({
      mode: modeId,
      modeLabel: SYNTHESIS_MODES[modeId].label,
      paperCount: cleaned.length,
      model: result.model,
      usage: result.usage,
      synthesis: result.content,
    });
  } catch (err) {
    console.error('[synthesize] error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Guard for LLM-dependent routes.
function llmReady(res) {
  if (isConfigured()) return true;
  res.status(503).json({
    error: 'The LLM is not configured. Set LLM_ENDPOINT, LLM_MODEL and LLM_API_KEY in backend/.env, then restart.',
  });
  return false;
}

// Paper Discovery — search academic sources for a research question.
app.get('/api/discover', async (req, res) => {
  const query = (req.query.q || '').toString().trim();
  if (!query) return res.status(400).json({ error: 'Provide a query (?q=).' });
  const source = ['arxiv', 'semanticscholar', 'both'].includes(req.query.source)
    ? req.query.source
    : 'both';
  const limit = Number(req.query.limit) || 10;
  try {
    const result = await discover(query, { source, limit });
    res.json(result);
  } catch (err) {
    console.error('[discover]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Document Ingestion — extract structured fields from a PDF or raw text.
app.post('/api/ingest', upload.single('file'), async (req, res) => {
  if (!llmReady(res)) return;
  try {
    let text = (req.body?.text || '').toString();
    let title = (req.body?.title || '').toString();
    let meta = {};
    if (req.file) {
      const pdfParse = require('pdf-parse');
      const parsed = await pdfParse(req.file.buffer);
      text = parsed.text || '';
      title = title || req.file.originalname.replace(/\.pdf$/i, '');
      meta = { filename: req.file.originalname, pages: parsed.numpages };
    }
    if (!text.trim()) return res.status(400).json({ error: 'No text to ingest (upload a PDF or send { text }).' });
    const result = await ingestText(text, { title });
    res.json({ ...meta, ...result, fullText: text.trim() });
  } catch (err) {
    console.error('[ingest]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// RAG Q&A — answer a question grounded in the bucket's papers, with citations.
app.post('/api/ask', async (req, res) => {
  if (!llmReady(res)) return;
  const { papers, question, history } = req.body || {};
  if (!Array.isArray(papers) || !papers.length) return res.status(400).json({ error: 'No papers in this bucket.' });
  if (!question || !question.trim()) return res.status(400).json({ error: 'Provide a question.' });
  try {
    res.json(await ask({ papers, question: question.trim(), history: Array.isArray(history) ? history : [] }));
  } catch (err) {
    console.error('[ask]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Research Brief — structured, grounded brief over the bucket's papers.
app.post('/api/brief', async (req, res) => {
  if (!llmReady(res)) return;
  const { papers, question } = req.body || {};
  if (!Array.isArray(papers) || !papers.length) return res.status(400).json({ error: 'No papers in this bucket.' });
  try {
    res.json(await brief({ papers, question: (question || '').trim() }));
  } catch (err) {
    console.error('[brief]', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Citation export — BibTeX or RIS for a set of papers.
app.post('/api/cite', (req, res) => {
  const { papers, format } = req.body || {};
  if (!Array.isArray(papers) || !papers.length) return res.status(400).json({ error: 'No papers to cite.' });
  const fmt = format === 'ris' ? 'ris' : 'bibtex';
  res.json({ format: fmt, text: formatCitations(papers, fmt) });
});

// ── Static frontend (production build) ────────────────────────
// Only mounted when a build exists; in dev the Vite server handles the UI.
const hasBuild = existsSync(join(FRONTEND_DIST, 'index.html'));
if (hasBuild) {
  app.use(express.static(FRONTEND_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(join(FRONTEND_DIST, 'index.html'));
  });
}

app.listen(PORT, () => {
  const status = isConfigured() ? '✓ configured' : '✗ NOT configured (edit backend/.env)';
  console.log(`\n  AI Research Paper Synthesis Engine`);
  console.log(`  ▸ API:     http://localhost:${PORT}`);
  console.log(`  ▸ LLM:     ${status}`);
  if (isConfigured()) {
    const c = configSummary();
    console.log(`  ▸ Model:   ${c.model}  @  ${c.endpoint}`);
  }
  console.log(
    hasBuild
      ? `  ▸ UI:      served from frontend/dist`
      : `  ▸ UI:      run "npm --prefix frontend run dev" (Vite) — no build found`
  );
  console.log('');
});
