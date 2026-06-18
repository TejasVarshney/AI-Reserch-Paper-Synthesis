import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Header from '../components/Header.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import * as api from '../lib/api.js';
import * as store from '../lib/store.js';
import usePageTitle from '../hooks/usePageTitle.js';

// Future 8: import a shared bucket. The URL pattern /share/:id hits the
// server's /api/share/:id endpoint, which returns the published blob.
// We then create a new local bucket in the user's localStorage and route
// them to it.
export default function Share() {
  const { id } = useParams();
  const [blob, setBlob] = useState(null);
  const [err, setErr] = useState(null);
  const navigate = useNavigate();
  const flash = useToast();
  const ranRef = useRef(false);
  usePageTitle('Shared bucket');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getSharedBucket(id);
        if (cancelled) return;
        setBlob(data);
      } catch (e) {
        if (cancelled) return;
        setErr(e.message || 'Could not load the shared bucket.');
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const importIt = () => {
    if (!blob) return;
    const created = store.createBucket({
      name: blob.bucket?.name || 'Imported share',
      description: blob.bucket?.description || '',
      question: blob.bucket?.question || '',
    });
    const papers = Array.isArray(blob.papers) ? blob.papers : [];
    for (const p of papers) {
      const stripped = { ...p };
      if (stripped.id) delete stripped.id; // freshen id to avoid collisions
      store.addPaper(created.id, stripped);
    }
    if (Array.isArray(blob.messages) && blob.messages.length) {
      store.setMessages(created.id, blob.messages);
    }
    flash(`Imported “${blob.bucket?.name || 'bucket'}” (${papers.length} paper${papers.length === 1 ? '' : 's'}).`);
    navigate(`/bucket/${created.id}`);
  };

  const importAndAuto = () => {
    if (ranRef.current) return;
    ranRef.current = true;
    importIt();
  };

  return (
    <div className="shell">
      <Header crumb="Shared bucket" />
      <div className="home-empty">
        {err ? (
          <>
            <h3>Could not load this share</h3>
            <p>{err}</p>
            <p className="dim">Share links are stored in memory on the server and may have been cleared on restart.</p>
            <Link className="btn primary" to="/buckets">← Back to buckets</Link>
          </>
        ) : !blob ? (
          <>
            <h3>Loading shared bucket…</h3>
            <p>Fetching from the server.</p>
          </>
        ) : (
          <>
            <h3>{blob.bucket?.name || 'Shared bucket'}</h3>
            {blob.bucket?.description && <p>{blob.bucket.description}</p>}
            {blob.bucket?.question && <p className="dim">“{blob.bucket.question}”</p>}
            <p>{(blob.papers || []).length} paper{(blob.papers || []).length === 1 ? '' : 's'} · {(blob.messages || []).length} message{(blob.messages || []).length === 1 ? '' : 's'}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button className="btn primary" onClick={importIt}>Import to my buckets</button>
              <button className="btn ghost" onClick={importAndAuto} title="Import and jump straight to the new bucket">
                Import &amp; open
              </button>
              <Link className="btn ghost" to="/buckets">Cancel</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
