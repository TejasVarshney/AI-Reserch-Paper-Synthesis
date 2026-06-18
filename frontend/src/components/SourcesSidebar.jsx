import { useState } from 'react';
import AddPapers from './AddPapers.jsx';
import PaperItem from './PaperItem.jsx';

export default function SourcesSidebar({
  papers, defaultQuery, onAdd, onUploadPdf, onRemove, uploading,
  highlightId, registerRef, onExport,
}) {
  const [adding, setAdding] = useState(papers.length === 0);

  return (
    <aside className="sources">
      <div className="sources-head">
        <h2>Sources <span className="count">{papers.length}</span></h2>
        <div className="sources-tools">
          {papers.length > 0 && (
            <div className="export">
              <button className="mini" title="Export citations">Cite ▾</button>
              <div className="export-menu">
                <button onClick={() => onExport('bibtex')}>BibTeX</button>
                <button onClick={() => onExport('ris')}>RIS</button>
              </div>
            </div>
          )}
          <button className="mini primary" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Done' : '＋ Add'}
          </button>
        </div>
      </div>

      {adding && (
        <AddPapers
          defaultQuery={defaultQuery}
          existing={papers}
          onAdd={onAdd}
          onUploadPdf={onUploadPdf}
          uploading={uploading}
        />
      )}

      <div className="sources-list">
        {papers.length === 0 ? (
          <p className="sources-empty">No papers yet. Search, paste, or upload a PDF above.</p>
        ) : (
          papers.map((p, i) => (
            <PaperItem
              key={p.id}
              index={i}
              paper={p}
              onRemove={() => onRemove(p.id)}
              highlighted={highlightId === p.id}
              refFor={(el) => registerRef(p.id, el)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
