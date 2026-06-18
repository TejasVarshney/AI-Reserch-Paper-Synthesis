import { useEffect, useMemo, useState } from 'react';
import Markdown from './Markdown.jsx';

// Future 9: side-by-side brief comparison modal. Renders two briefs in a
// two-column layout with metadata headers (version, paper count, when).
// Below the split view we compute a rough per-paragraph diff highlighting
// lines that exist only on one side.

function splitParagraphs(md) {
  return (md || '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

// Cheap textual fingerprint for a paragraph: lowercase, collapse
// whitespace, drop punctuation. Used to match likely-equal paragraphs
// across the two briefs.
function fp(s) {
  return (s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[\s\W_]+/g, '')
    .slice(0, 1200);
}

function classify(parasA, parasB) {
  const fpsB = parasB.map(fp);
  const usedB = new Set();
  const rows = [];
  parasA.forEach((a) => {
    const f = fp(a);
    let hit = -1;
    if (f) {
      hit = fpsB.findIndex((fb, i) => !usedB.has(i) && fb === f);
    }
    if (hit >= 0) {
      usedB.add(hit);
      rows.push({ kind: 'same', a, b: parasB[hit] });
    } else {
      rows.push({ kind: 'only-a', a, b: null });
    }
  });
  parasB.forEach((b, i) => {
    if (usedB.has(i)) return;
    rows.push({ kind: 'only-b', a: null, b });
  });
  return rows;
}

function fmtMeta(m) {
  if (!m) return '';
  const parts = [];
  if (m.version) parts.push(`v${m.version}`);
  if (m.paperCount) parts.push(`${m.paperCount} paper${m.paperCount === 1 ? '' : 's'}`);
  if (m.ts) parts.push(new Date(m.ts).toLocaleString());
  return parts.join(' · ');
}

export default function CompareBriefs({ open, a, b, onClose, onSwap }) {
  const [mode, setMode] = useState('side'); // 'side' | 'diff'
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const parasA = useMemo(() => splitParagraphs(a?.content), [a]);
  const parasB = useMemo(() => splitParagraphs(b?.content), [b]);
  const rows = useMemo(() => classify(parasA, parasB), [parasA, parasB]);
  const same = rows.filter((r) => r.kind === 'same').length;
  const onlyA = rows.filter((r) => r.kind === 'only-a').length;
  const onlyB = rows.filter((r) => r.kind === 'only-b').length;

  if (!open || !a || !b) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal--compare"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="compare-head">
          <div>
            <h2 className="modal-title">Compare briefs</h2>
            <p className="modal-note">Side-by-side view of two briefs from this bucket.</p>
          </div>
          <div className="compare-tools">
            <div className="compare-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={mode === 'side'}
                className={`mini${mode === 'side' ? ' mini--on' : ''}`}
                onClick={() => setMode('side')}
              >Side-by-side</button>
              <button
                role="tab"
                aria-selected={mode === 'diff'}
                className={`mini${mode === 'diff' ? ' mini--on' : ''}`}
                onClick={() => setMode('diff')}
              >Diff ({onlyA + onlyB})</button>
            </div>
            <button className="mini" onClick={onSwap} title="Swap left and right">⇄ Swap</button>
            <button className="btn ghost sm" onClick={onClose}>Close</button>
          </div>
        </div>

        <div className="compare-meta">
          <div className="compare-meta-side">
            <span className="compare-meta-tag">A</span>
            <span className="compare-meta-text">{fmtMeta(a) || '—'}</span>
          </div>
          <div className="compare-meta-side">
            <span className="compare-meta-tag">B</span>
            <span className="compare-meta-text">{fmtMeta(b) || '—'}</span>
          </div>
        </div>

        {mode === 'side' ? (
          <div className="compare-split">
            <div className="compare-pane">
              <Markdown>{a.content}</Markdown>
            </div>
            <div className="compare-pane">
              <Markdown>{b.content}</Markdown>
            </div>
          </div>
        ) : (
          <div className="compare-diff">
            <div className="compare-diff-summary">
              {same} shared paragraph{same === 1 ? '' : 's'} · {onlyA} only in A · {onlyB} only in B
            </div>
            {rows.map((r, i) => (
              <div key={i} className={`compare-row compare-row--${r.kind}`}>
                <div className="compare-row-side">
                  {r.a ? <Markdown>{r.a}</Markdown> : <span className="compare-row-empty">—</span>}
                </div>
                <div className="compare-row-side">
                  {r.b ? <Markdown>{r.b}</Markdown> : <span className="compare-row-empty">—</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
