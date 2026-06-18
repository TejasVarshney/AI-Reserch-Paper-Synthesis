import { useRef, useState } from 'react';
import { discover } from '../lib/api.js';
import { useToast } from './ToastProvider.jsx';

const TABS = [
  ['search', 'Discover'],
  ['paste', 'Paste'],
  ['pdf', 'PDF'],
];

export default function AddPapers({ defaultQuery = '', existing, onAdd, onUploadPdf, uploading }) {
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState(defaultQuery);
  const [source, setSource] = useState('both');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [errors, setErrors] = useState([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const fileRef = useRef(null);
  const flash = useToast();

  const has = (p) =>
    existing.some((x) => x.id === p.id || (p.doi && x.doi === p.doi) || x.title.toLowerCase() === p.title.toLowerCase());

  const runSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setErrors([]);
    try {
      const data = await discover(query.trim(), { source, limit: 12 });
      setResults(data.papers || []);
      setErrors(data.errors || []);
      if (!data.papers?.length) flash('No papers found.', true);
    } catch (err) {
      flash(err.message, true);
    } finally {
      setSearching(false);
    }
  };

  const addPaste = () => {
    if (!text.trim()) return;
    onAdd({ source: 'manual', title: title.trim() || 'Pasted paper', abstract: text.trim() });
    setTitle('');
    setText('');
    flash('Paper added.');
  };

  return (
    <div className="addp">
      <div className="addp-tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={`addp-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <div className="addp-pane">
          <form className="addp-search" onSubmit={runSearch}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search arXiv / Semantic Scholar…"
            />
            <button className="btn primary sm" disabled={searching || !query.trim()}>
              {searching ? '…' : 'Search'}
            </button>
          </form>
          <div className="addp-sources">
            {['both', 'arxiv', 'semanticscholar'].map((s) => (
              <label key={s} className={`radio${source === s ? ' on' : ''}`}>
                <input type="radio" name="src" checked={source === s} onChange={() => setSource(s)} />
                {s === 'both' ? 'Both' : s === 'arxiv' ? 'arXiv' : 'Semantic Scholar'}
              </label>
            ))}
          </div>
          {errors.map((e) => (
            <p key={e.source} className="addp-warn">{e.source}: {e.error.includes('429') ? 'rate-limited, try again shortly' : e.error}</p>
          ))}
          <div className="addp-results">
            {results.map((p) => (
              <div key={p.id} className="hit">
                <div className="hit-main">
                  <div className="hit-title">{p.title}</div>
                  <div className="hit-meta">
                    <span className={`src src--${p.source}`}>{p.source === 'arxiv' ? 'arXiv' : 'S2'}</span>
                    {p.year && <span>{p.year}</span>}
                    {typeof p.citationCount === 'number' && <span>{p.citationCount} cites</span>}
                    {p.authors?.[0] && <span className="hit-auth">{p.authors[0]}{p.authors.length > 1 ? ' et al.' : ''}</span>}
                  </div>
                </div>
                <button className="mini add" disabled={has(p)} onClick={() => onAdd(p)}>
                  {has(p) ? '✓' : '＋'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'paste' && (
        <div className="addp-pane">
          <input
            className="addp-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
          />
          <textarea
            className="addp-textarea"
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste an abstract or full text…"
          />
          <button className="btn primary sm" disabled={!text.trim()} onClick={addPaste}>Add paper</button>
        </div>
      )}

      {tab === 'pdf' && (
        <div className="addp-pane">
          <button
            className="addp-drop"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Ingesting…' : '↑ Choose a PDF — it will be ingested into structured fields'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              if (e.target.files[0]) onUploadPdf(e.target.files[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}
