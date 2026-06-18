import { useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import SourcesSidebar from '../components/SourcesSidebar.jsx';
import ChatPanel from '../components/ChatPanel.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import * as store from '../lib/store.js';
import * as api from '../lib/api.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'm-' + Math.random().toString(36).slice(2));

// Strip heavy fields before sending papers to the backend per request.
const forApi = (p) => ({
  id: p.id, title: p.title, authors: p.authors, year: p.year, venue: p.venue,
  url: p.url, doi: p.doi, source: p.source,
  abstract: p.abstract, structured: p.structured, fullText: p.fullText, sections: p.sections,
});

export default function Workspace() {
  const { id } = useParams();
  const flash = useToast();
  const [bucket, setBucket] = useState(() => store.getBucket(id));
  const [busy, setBusy] = useState(false);
  const [briefBusy, setBriefBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [confirmClearChat, setConfirmClearChat] = useState(false);
  const [confirmRemovePaper, setConfirmRemovePaper] = useState(null);
  const paperRefs = useRef({});
  const hlTimer = useRef(null);

  const reload = () => setBucket(store.getBucket(id));

  if (!bucket) {
    return (
      <div className="shell">
        <Header />
        <div className="home-empty">
          <h3>Bucket not found</h3>
          <p>It may have been deleted.</p>
          <Link className="btn primary" to="/">← Back to buckets</Link>
        </div>
      </div>
    );
  }

  const papers = bucket.papers;
  const messages = bucket.messages || [];
  const registerRef = (pid, el) => { paperRefs.current[pid] = el; };

  // ── sources ──────────────────────────────────────────────
  const addPaper = (p) => { store.addPaper(id, p); reload(); };
  const executeRemovePaper = () => {
    if (!confirmRemovePaper) return;
    store.removePaper(id, confirmRemovePaper.id);
    setConfirmRemovePaper(null);
    reload();
  };

  const uploadPdf = async (file) => {
    setUploading(true);
    flash(`Ingesting “${file.name}”…`);
    try {
      const data = await api.ingestFile(file, file.name.replace(/\.pdf$/i, ''));
      store.addPaper(id, {
        source: 'upload',
        title: data.title || file.name.replace(/\.pdf$/i, ''),
        authors: data.authors ? data.authors.split(/,\s*/) : [],
        year: data.year || null,
        abstract: data.structured?.abstract || '',
        structured: data.structured,
        fullText: data.fullText,
        ingested: true,
      });
      reload();
      flash(`Ingested “${file.name}” (${data.pages || '?'} pages).`);
    } catch (err) {
      flash(err.message, true);
    } finally {
      setUploading(false);
    }
  };

  // ── citation jump ────────────────────────────────────────
  const onCite = (paperIndex, section) => {
    const p = papers[paperIndex - 1];
    if (!p) return;
    const el = paperRefs.current[p.id];
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(p.id);
    clearTimeout(hlTimer.current);
    hlTimer.current = setTimeout(() => setHighlightId(null), 2200);
  };

  // ── chat ─────────────────────────────────────────────────
  const persist = (msgs) => { store.setMessages(id, msgs); reload(); };

  const send = async (question) => {
    if (busy || !papers.length) return;
    const userMsg = { id: uid(), role: 'user', content: question, ts: Date.now() };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    const next = [...messages, userMsg];
    persist(next);
    setBusy(true);
    try {
      const data = await api.ask({ papers: papers.map(forApi), question, history });
      persist([
        ...next,
        { id: uid(), role: 'assistant', content: data.answer, citations: data.citations, passages: data.passages, model: data.model, usage: data.usage, ts: Date.now() },
      ]);
    } catch (err) {
      persist([...next, { id: uid(), role: 'assistant', content: `⚠️ ${err.message}`, ts: Date.now() }]);
      flash(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const generateBrief = async () => {
    if (briefBusy || !papers.length) return;
    setBriefBusy(true);
    flash('Generating research brief…');
    try {
      const data = await api.brief({ papers: papers.map(forApi), question: bucket.question || '' });
      persist([
        ...messages,
        { id: uid(), role: 'assistant', kind: 'brief', content: data.brief, citations: data.citations, passages: data.passages, model: data.model, usage: data.usage, ts: Date.now() },
      ]);
    } catch (err) {
      flash(err.message, true);
    } finally {
      setBriefBusy(false);
    }
  };

  // ── export ───────────────────────────────────────────────
  const exportCitations = async (format) => {
    try {
      const data = await api.cite({ papers: papers.map(forApi), format });
      const ext = format === 'ris' ? 'ris' : 'bib';
      const blob = new Blob([data.text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bucket.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      flash(`Exported ${papers.length} citation${papers.length === 1 ? '' : 's'} as ${format.toUpperCase()}.`);
    } catch (err) {
      flash(err.message, true);
    }
  };

  return (
    <div className="shell shell--work">
      <Header crumb={bucket.name}>
        {messages.length > 0 && (
          <button className="btn ghost sm" onClick={() => setConfirmClearChat(true)}>
            Clear chat
          </button>
        )}
      </Header>

      <div className="work">
        <SourcesSidebar
          papers={papers}
          defaultQuery={bucket.question || bucket.name}
          onAdd={addPaper}
          onUploadPdf={uploadPdf}
          onRemove={(pid) => setConfirmRemovePaper(papers.find((p) => p.id === pid))}
          uploading={uploading}
          highlightId={highlightId}
          registerRef={registerRef}
          onExport={exportCitations}
        />
        <ChatPanel
          messages={messages}
          onSend={send}
          onCite={onCite}
          onBrief={generateBrief}
          busy={busy}
          briefBusy={briefBusy}
          hasPapers={papers.length > 0}
        />
      </div>

      <ConfirmDialog
        open={confirmClearChat}
        title="Clear conversation?"
        description="Are you sure you want to clear this conversation? This will permanently remove all messages."
        confirmText="Clear chat"
        danger={true}
        onConfirm={() => persist([])}
        onClose={() => setConfirmClearChat(false)}
      />

      <ConfirmDialog
        open={!!confirmRemovePaper}
        title="Remove paper?"
        description={`Remove “${confirmRemovePaper?.title}” from this bucket?`}
        confirmText="Remove paper"
        danger={true}
        onConfirm={executeRemovePaper}
        onClose={() => setConfirmRemovePaper(null)}
      />
    </div>
  );
}
