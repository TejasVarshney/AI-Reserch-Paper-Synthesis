import { useState } from 'react';
import Header from '../components/Header.jsx';
import BucketCard from '../components/BucketCard.jsx';
import BucketDialog from '../components/BucketDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useToast } from '../components/ToastProvider.jsx';
import { loadBuckets, createBucket, updateBucket, deleteBucket } from '../lib/store.js';

export default function Buckets() {
  const [buckets, setBuckets] = useState(() => loadBuckets());
  const [dialog, setDialog] = useState({ open: false, editing: null });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const flash = useToast();

  const refresh = () => setBuckets(loadBuckets());

  const save = ({ name, description, question }) => {
    if (dialog.editing) {
      updateBucket(dialog.editing.id, { name: name.trim(), description, question });
      flash('Bucket updated.');
    } else {
      createBucket({ name, description, question });
      flash('Bucket created.');
    }
    setDialog({ open: false, editing: null });
    refresh();
  };

  const executeDelete = () => {
    if (!confirmDelete) return;
    deleteBucket(confirmDelete.id);
    flash('Bucket deleted.');
    setConfirmDelete(null);
    refresh();
  };

  return (
    <div className="shell">
      <Header crumb="Buckets">
        <button className="btn primary sm" onClick={() => setDialog({ open: true, editing: null })}>
          ＋ New bucket
        </button>
      </Header>

      <div className="buckets-intro">
        <p className="eyebrow">Your workspace</p>
        <h1 className="buckets-h1">Buckets</h1>
        <p className="buckets-lead">
          Each bucket is a focused collection of papers and the conversation about them.
          Open one to discover sources, ingest PDFs, and ask cited questions.
        </p>
      </div>

      {buckets.length === 0 ? (
        <div className="home-empty">
          <h3>No buckets yet</h3>
          <p>Create your first bucket to start collecting and querying papers.</p>
          <button className="btn primary" onClick={() => setDialog({ open: true, editing: null })}>
            ＋ Create a bucket
          </button>
        </div>
      ) : (
        <>
          <div className="section-head">
            <h2>All buckets</h2>
            <span className="count">{buckets.length}</span>
          </div>
          <div className="bucket-grid">
            {buckets.map((b) => (
              <BucketCard
                key={b.id}
                bucket={b}
                onEdit={(bk) => setDialog({ open: true, editing: bk })}
                onDelete={(bk) => setConfirmDelete(bk)}
              />
            ))}
          </div>
        </>
      )}

      <footer className="foot">
        Buckets are stored locally in your browser. Faithful to your sources — the engine never invents findings or citations.
      </footer>

      <BucketDialog
        open={dialog.open}
        initial={dialog.editing}
        onSave={save}
        onClose={() => setDialog({ open: false, editing: null })}
      />
      
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete bucket?"
        description={confirmDelete ? `Delete “${confirmDelete.name}” and its ${confirmDelete.papers.length} paper(s)? This can't be undone.` : ''}
        confirmText="Delete bucket"
        danger={true}
        onConfirm={executeDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
