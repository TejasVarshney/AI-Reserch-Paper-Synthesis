import Markdown from './Markdown.jsx';

export default function MessageBubble({ message, onCite }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg--user">
        <div className="msg-body">{message.content}</div>
      </div>
    );
  }

  const { content, citations = [], kind, model, usage } = message;
  return (
    <div className="msg msg--ai">
      {kind === 'brief' && <div className="msg-kind">Research Brief</div>}
      <Markdown onCite={onCite}>{content}</Markdown>

      {citations.length > 0 && (
        <div className="msg-sources">
          <div className="msg-sources-h">Sources</div>
          <div className="cite-list">
            {citations.map((c) => (
              <button
                key={c.marker}
                className="cite-chip"
                onClick={() => onCite?.(c.paperIndex, c.section)}
                title={c.quote || ''}
              >
                <span className="cite-chip-p">P{c.paperIndex}</span>
                <span className="cite-chip-sec">{c.section}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(model || usage) && (
        <div className="msg-foot">
          {model}
          {usage?.total_tokens ? ` · ${usage.total_tokens.toLocaleString()} tokens` : ''}
        </div>
      )}
    </div>
  );
}
