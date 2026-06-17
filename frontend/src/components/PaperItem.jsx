import { useState } from 'react';

const SOURCE_LABEL = { arxiv: 'arXiv', semanticscholar: 'S2', upload: 'PDF', manual: 'Manual' };

export default function PaperItem({ index, paper, onRemove, highlighted, refFor }) {
  const [open, setOpen] = useState(false);
  const authors = (paper.authors || []).slice(0, 3).join(', ') + ((paper.authors || []).length > 3 ? ' et al.' : '');
  const s = paper.structured;

  return (
    <div ref={refFor} className={`pitem${highlighted ? ' pitem--hi' : ''}`}>
      <div className="pitem-head">
        <span className="pitem-tag">P{index + 1}</span>
        <button className="pitem-title" onClick={() => setOpen((o) => !o)} title="Show details">
          {paper.title}
        </button>
        <button className="pitem-x" onClick={onRemove} title="Remove" aria-label="Remove paper">×</button>
      </div>
      <div className="pitem-meta">
        <span className={`src src--${paper.source}`}>{SOURCE_LABEL[paper.source] || paper.source}</span>
        {paper.year && <span>{paper.year}</span>}
        {authors && <span className="pitem-authors">{authors}</span>}
        {paper.ingested ? <span className="src src--ok">ingested</span> : paper.abstract ? <span className="dim">abstract</span> : null}
      </div>

      {open && (
        <div className="pitem-body">
          {s && (s.methodology || s.keyFindings || s.limitations || s.conclusion) ? (
            <dl className="fields">
              {s.abstract && <><dt>Abstract</dt><dd>{s.abstract}</dd></>}
              {s.methodology && <><dt>Methodology</dt><dd>{s.methodology}</dd></>}
              {s.keyFindings && <><dt>Key findings</dt><dd>{s.keyFindings}</dd></>}
              {s.limitations && <><dt>Limitations</dt><dd>{s.limitations}</dd></>}
              {s.conclusion && <><dt>Conclusion</dt><dd>{s.conclusion}</dd></>}
            </dl>
          ) : (
            <p className="pitem-abs">{paper.abstract || 'No abstract available.'}</p>
          )}
          {paper.url && (
            <a className="pitem-link" href={paper.url} target="_blank" rel="noreferrer">Open source ↗</a>
          )}
        </div>
      )}
    </div>
  );
}
