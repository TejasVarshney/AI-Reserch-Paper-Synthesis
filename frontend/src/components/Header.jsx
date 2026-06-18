import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import StatusBadge from './StatusBadge.jsx';
import { getHealth } from '../lib/api.js';

export default function Header({ crumb, children }) {
  const [status, setStatus] = useState({ state: 'checking', model: null, title: '' });

  useEffect(() => {
    const check = () =>
      getHealth()
        .then(({ llm }) =>
          setStatus(
            llm?.configured
              ? { state: 'ready', model: llm.model, title: `${llm.model} @ ${llm.endpoint}` }
              : { state: 'unconfigured', model: null, title: 'Configure backend/.env' }
          )
        )
        .catch(() => setStatus({ state: 'offline', model: null, title: 'Backend not reachable' }));
    check();
    const t = setInterval(check, 20000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link to="/buckets" className="wordmark" title="All buckets">
          <span className="wordmark-glyph" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
              <g stroke="var(--signal)" strokeWidth="2" strokeLinecap="round">
                <path d="M2 6c8 0 8 10 14 10" />
                <path d="M2 16h14" />
                <path d="M2 26c8 0 8-10 14-10" />
              </g>
              <circle cx="17" cy="16" r="3" fill="var(--signal-2)" />
              <path d="M20 16h10" stroke="var(--signal-2)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </span>
          <span className="wordmark-text">Synthesis Engine</span>
        </Link>
        {crumb && (
          <>
            <span className="crumb-sep" aria-hidden="true">/</span>
            <span className="crumb">{crumb}</span>
          </>
        )}
      </div>
      <div className="topbar-right">
        {children}
        <StatusBadge state={status.state} model={status.model} title={status.title} />
      </div>
    </header>
  );
}
