import { useEffect } from 'react';

export default function ConfirmDialog({ open, title, description, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="modal-title">{title}</h2>
        {description && <p className="modal-note">{description}</p>}
        <div className="modal-actions" style={{ marginTop: '24px' }}>
          <button type="button" className="btn ghost" onClick={onClose}>{cancelText}</button>
          <button 
            type="button" 
            className={`btn ${danger ? 'danger' : 'primary'}`} 
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
