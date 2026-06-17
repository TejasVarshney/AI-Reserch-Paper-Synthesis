import { Link } from 'react-router-dom';

function ago(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export default function BucketCard({ bucket, onEdit, onDelete }) {
  const count = bucket.papers.length;
  const ingested = bucket.papers.filter((p) => p.ingested).length;

  return (
    <Link to={`/bucket/${bucket.id}`} className="bucket">
      <div className="bucket-top">
        <span className="bucket-spine" aria-hidden="true" />
        <div className="bucket-actions" onClick={(e) => e.preventDefault()}>
          <button className="mini" title="Edit" onClick={() => onEdit(bucket)}>Edit</button>
          <button className="mini danger" title="Delete" onClick={() => onDelete(bucket)}>Delete</button>
        </div>
      </div>
      <h3 className="bucket-name">{bucket.name}</h3>
      {bucket.description && <p className="bucket-desc">{bucket.description}</p>}
      {bucket.question && <p className="bucket-q">“{bucket.question}”</p>}
      <div className="bucket-foot">
        <span className="pill">{count} paper{count === 1 ? '' : 's'}</span>
        {ingested > 0 && <span className="pill pill--ok">{ingested} ingested</span>}
        <span className="bucket-time">{ago(bucket.updatedAt)}</span>
      </div>
    </Link>
  );
}
