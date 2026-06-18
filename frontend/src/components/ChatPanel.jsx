import { useEffect, useRef, useState } from 'react';
import MessageBubble from './MessageBubble.jsx';

const SUGGESTIONS = [
  'Summarize the key findings across these papers.',
  'Where do the papers agree and disagree?',
  'What are the main limitations?',
  'What methods do they use?',
];

export default function ChatPanel({ messages, onSend, onCite, onBrief, busy, hasPapers, briefBusy }) {
  const [text, setText] = useState('');
  const scrollRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  const send = () => {
    const q = text.trim();
    if (!q || busy || !hasPapers) return;
    setText('');
    onSend(q);
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <section className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !busy ? (
          <div className="chat-empty">
            <p className="chat-empty-lead">Ask anything about the papers in this bucket.</p>
            <p className="chat-empty-note">
              Answers are grounded only in your sources, and every claim links back to the
              paper and section it came from.
            </p>
            {hasPapers ? (
              <div className="suggest">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="suggest-chip" onClick={() => onSend(s)}>{s}</button>
                ))}
                <button className="suggest-chip brief" onClick={onBrief}>✦ Generate a research brief</button>
              </div>
            ) : (
              <p className="chat-empty-warn">Add at least one paper from the sources panel to begin.</p>
            )}
          </div>
        ) : (
          <>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onCite={onCite} />
            ))}
            {busy && (
              <div className="msg msg--ai">
                <div className="thinking"><span /><span /><span /> grounding the answer in your sources…</div>
              </div>
            )}
            <div ref={endRef} />
          </>
        )}
      </div>

      <div className="composer">
        <button
          className="composer-brief"
          onClick={onBrief}
          disabled={!hasPapers || busy || briefBusy}
          title="Generate a structured, cited research brief"
        >
          {briefBusy ? '…' : '✦ Brief'}
        </button>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={hasPapers ? 'Ask a question about these papers…' : 'Add papers to start asking…'}
          disabled={!hasPapers || busy}
        />
        <button className="composer-send" onClick={send} disabled={!text.trim() || busy || !hasPapers}>
          ↑
        </button>
      </div>
    </section>
  );
}
