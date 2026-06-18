import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header.jsx';
import Markdown from '../components/Markdown.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { loadBuckets } from '../lib/store.js';
import usePageTitle from '../hooks/usePageTitle.js';

const SYNTHESIS_MODES = [
  { id: 'comparative-analysis', label: 'Comparative Analysis' },
  { id: 'literature-review', label: 'Literature Review' },
  { id: 'thematic-synthesis', label: 'Thematic Synthesis' },
  { id: 'key-findings', label: 'Key Findings' },
  { id: 'research-gaps', label: 'Research Gaps & Future Directions' },
  { id: 'methodology', label: 'Methodology Comparison' },
];

// Future 6: multi-bucket synthesis. The user picks 2+ buckets, optionally
// a research question + mode, and the backend returns a unified
// synthesis. The result is read-only — there's no chat history to persist.
export default function Synthesize() {
  const [buckets, setBuckets] = useState(() => loadBuckets());
  const [selected, setSelected] = useState(() => new Set());
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState('comparative-analysis');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [streamed, setStreamed] = useState('');
  const flash = useToast();
  usePageTitle('Multi-bucket synthesis');

  useEffect(() => {
    // Re-load in case the user came from a bucket view that mutated the
    // store while this page was mounting.
    setBuckets(loadBuckets());
  }, []);

  const eligible = useMemo(
    () => buckets.filter((b) => (b.papers || []).length > 0),
    [buckets]
  );

  const toggle = (id) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
    setStreamed('');
  };

  const selectedBuckets = useMemo(
    () => eligible.filter((b) => selected.has(b.id)),
    [eligible, selected]
  );
  const totalPapers = selectedBuckets.reduce((n, b) => n + (b.papers?.length || 0), 0);

  const run = async () => {
    if (selectedBuckets.length < 2) {
      flash('Pick at least two buckets to synthesize across.', true);
      return;
    }
    setBusy(true);
    setResult(null);
    setStreamed('');
    try {
      // Use the streaming endpoint for parity with the single-bucket
      // workspace — the user sees content arrive token-by-token.
      const res = await fetch('/api/multi-synthesize-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buckets: selectedBuckets.map((b) => ({ name: b.name, papers: b.papers })),
          question,
          mode,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let full = '';
      let final = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) {
          const dataLines = frame
            .split(/\r?\n/)
            .filter((l) => l.startsWith('data:'))
            .map((l) => l.slice(5).trim());
          if (!dataLines.length) continue;
          const data = dataLines.join('\n');
          if (data === '[DONE]') continue;
          let ev;
          try { ev = JSON.parse(data); } catch { continue; }
          if (ev.event === 'delta' && ev.delta) {
            full += ev.delta;
            setStreamed(full);
          } else if (ev.event === 'done') {
            final = ev;
          }
        }
      }
      setResult(final || { synthesis: full, answer: full, mode, modeLabel: SYNTHESIS_MODES.find((m) => m.id === mode)?.label });
    } catch (err) {
      flash(err.message, true);
    } finally {
      setBusy(false);
    }
  };

  const exportMarkdown = () => {
    const text = (result?.synthesis || result?.answer || streamed || '').trim();
    if (!text) return;
    const md = `# Multi-bucket synthesis\n\nQuestion: ${question || '(none)'}\n\nMode: ${result?.modeLabel || mode}\n\nBuckets: ${selectedBuckets.map((b) => b.name).join(', ')}\n\n---\n\n${text}`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multi-synthesis-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="shell">
      <Header crumb="Multi-bucket synthesis">
        <Link to="/buckets" className="btn ghost sm">← All buckets</Link>
      </Header>

      <div className="multi">
        <p className="eyebrow">Cross-collection</p>
        <h1 className="multi-h1">Synthesize across buckets</h1>
        <p className="multi-lead">
          Pull papers from multiple buckets into one grounded brief. Useful when tracking a
          topic across time, sub-fields, or related projects.
        </p>

        <div className="multi-grid">
          <div className="multi-pane">
            <h2 className="multi-h2">1 · Pick buckets</h2>
            {eligible.length < 2 ? (
              <p className="multi-warn">You need at least two non-empty buckets. Add papers to a second bucket first.</p>
            ) : (
              <ul className="multi-list">
                {eligible.map((b) => {
                  const on = selected.has(b.id);
                  return (
                    <li key={b.id}>
                      <label className={`multi-row${on ? ' multi-row--on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(b.id)}
                        />
                        <span className="multi-row-main">
                          <span className="multi-row-name">{b.name}</span>
                          {b.question && <span className="multi-row-q">“{b.question}”</span>}
                        </span>
                        <span className="multi-row-count">{b.papers.length} paper{b.papers.length === 1 ? '' : 's'}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            <h2 className="multi-h2">2 · Question &amp; mode</h2>
            <label className="field">
              <span>Research question <em>optional</em></span>
              <textarea
                rows={2}
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="What should the cross-bucket synthesis focus on?"
                maxLength={500}
              />
            </label>
            <label className="field">
              <span>Synthesis mode</span>
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="multi-select">
                {SYNTHESIS_MODES.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>

            <div className="multi-summary">
              {selectedBuckets.length} bucket{selectedBuckets.length === 1 ? '' : 's'} · {totalPapers} paper{totalPapers === 1 ? '' : 's'}
            </div>
            <button
              className="btn primary lg"
              disabled={busy || selectedBuckets.length < 2}
              onClick={run}
            >
              {busy ? 'Synthesizing…' : '✦ Synthesize'}
            </button>
          </div>

          <div className="multi-pane multi-pane--out">
            <div className="multi-out-head">
              <h2 className="multi-h2">Result</h2>
              {(result || streamed) && (
                <button className="btn ghost sm" onClick={exportMarkdown}>⤓ Markdown</button>
              )}
            </div>
            {result || streamed ? (
              <div className="multi-out-body">
                {result?.model && (
                  <div className="msg-foot">{result.model}{result?.usage?.total_tokens ? ` · ${result.usage.total_tokens.toLocaleString()} tokens` : ''}</div>
                )}
                <Markdown>{result?.synthesis || result?.answer || streamed}</Markdown>
                {busy && <span className="msg-stream-caret" aria-hidden="true" />}
              </div>
            ) : (
              <p className="multi-empty">Pick at least two buckets and hit <em>Synthesize</em>.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
