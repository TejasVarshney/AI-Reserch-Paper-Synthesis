// Shows whether the backend + LLM are reachable/configured.
// state: 'checking' | 'ready' | 'unconfigured' | 'offline'

const COPY = {
  checking: { tone: 'checking', label: 'Connecting' },
  ready: { tone: 'ready', label: null }, // label replaced by model name
  unconfigured: { tone: 'warn', label: 'No model configured' },
  offline: { tone: 'down', label: 'Backend offline' },
};

export default function StatusBadge({ state, model, title }) {
  const { tone, label } = COPY[state] || COPY.checking;
  return (
    <div className={`status status--${tone}`} title={title}>
      <span className="status-dot" />
      <span className="status-text">
        {state === 'ready' ? model || 'Model ready' : label}
      </span>
    </div>
  );
}
