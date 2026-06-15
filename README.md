# 📚 AI Research Paper Synthesis Engine

A research workspace that turns a pile of papers into grounded, **citation-traceable**
answers and briefs. Organize papers into **buckets**, discover sources, ingest PDFs,
then ask questions or generate a structured brief — every claim links back to the
exact paper and section it came from.

- **Frontend:** React (Vite) — a bucket home + a chat-style workspace.
- **Backend:** Node.js + Express — stateless compute (the browser holds the data).
- **LLM:** any OpenAI- **or** Anthropic-compatible endpoint, configured in `.env`.

---

## Features

| Capability | How it works |
|------------|--------------|
| **Buckets** | Create/edit/delete collections of papers. Stored in your browser's **localStorage**. |
| **Paper Discovery** | Search **arXiv** + **Semantic Scholar** for a question; ranked results land in the sidebar. |
| **Document Ingestion** | Upload a PDF → extract **abstract, methodology, key findings, limitations, conclusion** as structured fields. |
| **RAG** | Papers are split into labelled passages and retrieved with **BM25**; the model answers only from retrieved context. |
| **Citation Traceability** | Every claim ends with a `[P# §Section]` marker. No unsourced assertions. Inline chips link back to the source paper. |
| **Research Brief** | Generates: executive summary · key findings by theme · areas of consensus · open questions · recommended next papers. |
| **Citation Export** | One-click **BibTeX** / **RIS** for the whole bucket. |

> The engine is instructed to use *only* your sources and to refuse rather than
> fabricate. If the passages don't support an answer, it says so.

---

## 1. Configure the LLM

All LLM settings live in `backend/.env`:

```bash
cd backend
cp .env.example .env
```

```ini
# Full URL or base URL — the server appends the right path automatically.
LLM_ENDPOINT=https://api.openai.com/v1            # or http://host/api/v1 (Anthropic-style)
LLM_MODEL=gpt-4o-mini                             # or anthropic/claude-opus-4-8
LLM_API_KEY=sk-...                                # bearer / x-api-key
LLM_API_STYLE=auto                                # auto | openai | anthropic
```

`LLM_API_STYLE=auto` infers the wire format from the endpoint/model:
- **openai** → `POST {endpoint}/chat/completions`, `Authorization: Bearer`
- **anthropic** → `POST {endpoint}/messages`, `x-api-key` + `anthropic-version`

Works with OpenAI, OpenRouter, Groq, Ollama, LM Studio, Anthropic-compatible gateways, etc.

## 2. Install & run (development)

Two processes — the API and the Vite dev server:

```bash
# Terminal 1 — backend API on :4000
cd backend && npm install && npm start

# Terminal 2 — frontend on :5173 (proxies /api to :4000)
cd frontend && npm install && npm run dev
```

Open **http://localhost:5173**.

## 3. Production (single server)

```bash
cd frontend && npm install && npm run build   # outputs frontend/dist
cd ../backend && npm install && npm start      # serves dist + API on :4000
```

Open **http://localhost:4000**.

---

## Using it

1. **Create a bucket** on the home page (give it a research question).
2. Open the bucket → **Add papers**:
   - **Discover** — search arXiv / Semantic Scholar and add results.
   - **Paste** — drop in an abstract or full text.
   - **PDF** — upload; it's ingested into structured fields automatically.
3. **Ask** questions in the chat. Answers are grounded in your papers; click any
   `[P#]` chip to jump to its source in the sidebar.
4. **✦ Brief** generates a full, cited research brief.
5. **Cite ▾** exports BibTeX / RIS.

---

## API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET`  | `/api/health` | Status + non-secret LLM config (model, style). |
| `GET`  | `/api/discover?q=&source=&limit=` | Ranked papers from arXiv / Semantic Scholar. |
| `POST` | `/api/ingest` | PDF (`file`) or `{ text }` → structured fields + full text. |
| `POST` | `/api/ask` | `{ papers, question, history }` → grounded answer + citations. |
| `POST` | `/api/brief` | `{ papers, question }` → structured research brief + citations. |
| `POST` | `/api/cite` | `{ papers, format }` → BibTeX / RIS. |
| `POST` | `/api/extract` | Raw PDF → text (no LLM). |

---

## Project structure

```
.
├── backend/
│   ├── server.js        # Express app: API + serves the built frontend
│   ├── llm.js           # OpenAI/Anthropic chat client (reads .env)
│   ├── discovery.js     # arXiv + Semantic Scholar search
│   ├── rag.js           # passage chunking + BM25 retrieval
│   ├── research.js      # ingestion, RAG Q&A, brief generation, citation extraction
│   ├── citations.js     # BibTeX / RIS export
│   └── .env.example
└── frontend/
    ├── src/pages/       # Home (buckets) · Workspace (chat)
    ├── src/components/  # sidebar, chat, paper items, citation chips, …
    └── src/lib/         # api.js (fetch) · store.js (localStorage)
```

## Notes & limits

- **Storage:** buckets live in `localStorage` (per browser). Large full-text PDFs can
  approach the quota; the app warns if storage is full.
- **Semantic Scholar** anonymous search is rate-limited (HTTP 429); arXiv is the reliable
  default. Errors degrade gracefully and are surfaced in the search panel.
- **RAG** is lexical (BM25) — no embedding provider required, so it works with any chat-only
  LLM endpoint.
