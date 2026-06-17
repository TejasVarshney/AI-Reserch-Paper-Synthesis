import { useEffect, useState } from 'react';

export default function BucketDialog({ open, initial, onSave, onClose }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (open) {
      setName(initial?.name || '');
      setDescription(initial?.description || '');
      setQuestion(initial?.question || '');
    }
  }, [open, initial]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave({ name, description, question });
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-title">{initial ? 'Edit bucket' : 'New bucket'}</h2>
        <p className="modal-note">A bucket holds a set of papers and the conversation about them.</p>
        <form onSubmit={submit}>
          <label className="field">
            <span>Name</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Protein folding methods"
              maxLength={80}
            />
          </label>
          <label className="field">
            <span>Description <em>optional</em></span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this collection is about"
              maxLength={140}
            />
          </label>
          <label className="field">
            <span>Research question <em>optional</em></span>
            <textarea
              rows={2}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="The question you're trying to answer — guides discovery and briefs."
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn primary" disabled={!name.trim()}>
              {initial ? 'Save changes' : 'Create bucket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
