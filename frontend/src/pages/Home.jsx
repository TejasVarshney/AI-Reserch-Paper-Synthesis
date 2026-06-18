import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ConstellationBackground from '../components/ConstellationBackground.jsx';
import AmbientBackdrop from '../components/AmbientBackdrop.jsx';

const Icon = {
  discover: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
    </svg>
  ),
  ingest: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M12 11v6" /><path d="m9.5 14.5 2.5 2.5 2.5-2.5" />
    </svg>
  ),
  cite: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h10M4 11h16M4 16h12" /><circle cx="19" cy="16" r="2.4" fill="currentColor" stroke="none" />
    </svg>
  ),
  brief: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  ),
  link: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </svg>
  ),
  layers: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 8l10 5 10-5-10-5z" /><path d="M2 14l10 5 10-5" /><path d="M2 11l10 5 10-5" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8" />
    </svg>
  ),
  shield: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6l-8-3z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  minus: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
    </svg>
  ),
};

const FEATURES = [
  { k: 'discover', t: 'Discover', d: 'Search arXiv and Semantic Scholar for a question and pull ranked papers straight into a bucket.' },
  { k: 'ingest', t: 'Ingest PDFs', d: 'Upload a paper — its abstract, methodology, findings, limitations and conclusion become structured fields.' },
  { k: 'cite', t: 'Cited answers', d: 'A retrieval-grounded chat answers only from your sources. Tap any [P#] to jump to the section it came from.' },
  { k: 'brief', t: 'Research briefs', d: 'Generate an executive summary, themed findings, points of consensus, open questions, and what to read next.' },
];

const STEPS = [
  { n: '01', t: 'Collect', d: 'Create a bucket and fill it — search the literature, paste an abstract, or drop in a PDF.' },
  { n: '02', t: 'Ground', d: 'Retrieval pulls the passages that actually answer your question, each tagged with its source.' },
  { n: '03', t: 'Synthesize', d: 'Ask a question or generate a brief. Every claim cites the exact paper and section behind it.' },
];

const USES = [
  { k: 'link', t: 'Literature review', d: 'Move from a research question to a structured, cited survey in one session.' },
  { k: 'layers', t: 'Cross-source synthesis', d: 'Compare methods, datasets, and findings across dozens of papers at once.' },
  { k: 'spark', t: 'Hypothesis scouting', d: 'Ask "what approaches have worked for X?" and get an answer anchored in the literature.' },
  { k: 'shield', t: 'Fact-checking claims', d: 'Drop in a draft paragraph and have the model verify each statement against your sources.' },
];

const FAQS = [
  {
    q: 'Where do my buckets and papers live?',
    a: 'Locally, in your browser. Nothing is uploaded to a server. You can export the full bucket to BibTeX or RIS whenever you want.',
  },
  {
    q: 'Which models can I use?',
    a: 'Anything OpenAI- or Anthropic-compatible. Bring your own API key and the synthesis engine talks to it directly.',
  },
  {
    q: 'How does it know what to cite?',
    a: 'The model is only given the passages retrieved from your papers. It is required to cite each claim, and if the sources do not support an answer it will say so instead of guessing.',
  },
  {
    q: 'Can I add my own papers?',
    a: 'Yes. Paste an abstract, drop in a PDF, or import via DOI. Each paper is broken into structured sections that retrieval can target.',
  },
  {
    q: 'Is this a search engine?',
    a: 'No — it sits on top of one. You bring the question, the engine retrieves the right passages, and the model writes a cited answer you can audit.',
  },
];

function FaqItem({ q, a, open, onToggle }) {
  return (
    <div className={`faq${open ? ' is-open' : ''}`}>
      <button className="faq-q" onClick={onToggle} aria-expanded={open}>
        <span>{q}</span>
        <span className="faq-ic">{open ? Icon.minus : Icon.plus}</span>
      </button>
      <div className="faq-a"><p>{a}</p></div>
    </div>
  );
}

export default function Home() {
  const [openFaq, setOpenFaq] = useState(0);

  // Mouse-tracked glow on feature cards — delegated, single listener.
  useEffect(() => {
    const onMove = (e) => {
      const card = e.target.closest && e.target.closest('.feat');
      if (!card) return;
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
      card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
    };
    document.addEventListener('mousemove', onMove);
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  return (
    <div className="landing">
      <AmbientBackdrop />
      <ConstellationBackground />

      <div className="landing-inner">
        <nav className="land-nav">
          <span className="wordmark">
            <span className="wordmark-glyph" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="18" height="18" fill="none">
                <g stroke="var(--signal)" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 6c8 0 8 10 14 10" /><path d="M2 16h14" /><path d="M2 26c8 0 8-10 14-10" />
                </g>
                <circle cx="17" cy="16" r="3" fill="var(--signal-2)" />
                <path d="M20 16h10" stroke="var(--signal-2)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            <span className="wordmark-text">Synthesis Engine</span>
          </span>
          <div className="land-nav-r">
            <a href="#features" className="land-nav-link">Features</a>
            <a href="#how" className="land-nav-link">How it works</a>
            <a href="#faq" className="land-nav-link">FAQ</a>
            <Link to="/buckets" className="btn primary sm">Open buckets →</Link>
          </div>
        </nav>

        <header className="land-hero">
          <p className="eyebrow"><span className="eyebrow-dot" /> Grounded research synthesis</p>
          <h1 className="land-title">Many papers in.<br /><em>One cited answer</em> out.</h1>
          <p className="land-sub">
            Organize sources into buckets, discover more from arXiv and Semantic Scholar, then ask
            questions or generate a brief — grounded only in your papers, with every claim linked to
            the exact section it came from.
          </p>
          <div className="land-cta">
            <Link to="/buckets" className="btn primary lg">Open your buckets →</Link>
            <a href="#how" className="btn ghost lg">See how it works</a>
          </div>
          <p className="land-trust">arXiv · Semantic Scholar · PDF ingestion · BibTeX &amp; RIS export</p>
          <a href="#features" className="land-scroll-cue" aria-label="Scroll to features">
            <span className="land-scroll-line" />
          </a>
        </header>

        <section className="land-features" id="features">
          {FEATURES.map((f, i) => (
            <article className="feat" key={f.k} style={{ animationDelay: `${0.1 + i * 0.08}s` }}>
              <span className="feat-icon">{Icon[f.k]}</span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </section>

        <section className="land-proof">
          <div className="proof-card">
            <p className="proof-claim">
              Learned models reach 92% GDT on CASP14, roughly 100× faster than physics-based
              methods <span className="cite">P1</span>.
            </p>
            <div className="proof-sources">
              <span className="proof-label">Sources</span>
              <span className="cite-chip"><span className="cite-chip-p">P1</span><span className="cite-chip-sec">Key Findings</span></span>
              <span className="cite-chip"><span className="cite-chip-p">P1</span><span className="cite-chip-sec">Methodology</span></span>
            </div>
          </div>
          <div className="proof-copy">
            <p className="eyebrow">No claim without a source</p>
            <h2>Traceable by design.</h2>
            <p>
              The model is given only the passages retrieved from your papers and is required to
              cite each statement. If the sources don't support an answer, it says so instead of
              guessing. Export the whole bucket to BibTeX or RIS in a click.
            </p>
          </div>
        </section>

        <section className="land-how" id="how">
          <div className="section-head">
            <h2>How it works</h2>
            <p className="section-sub">Three steps from a research question to a cited answer.</p>
          </div>
          <div className="pipe">
            {STEPS.map((s, i) => (
              <article className="pstep" key={s.n} style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                <span className="pstep-no">{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
                {i < STEPS.length - 1 && <span className="pstep-arrow" aria-hidden="true">→</span>}
              </article>
            ))}
          </div>
          <div className="land-end">
            <Link to="/buckets" className="btn primary lg">Start a bucket →</Link>
          </div>
        </section>

        <section className="land-uses">
          <div className="section-head">
            <h2>What you can do with it</h2>
          </div>
          <div className="uses-grid">
            {USES.map((u) => (
              <article className="use" key={u.k}>
                <span className="use-icon">{Icon[u.k]}</span>
                <h3>{u.t}</h3>
                <p>{u.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="land-faq" id="faq">
          <div className="section-head">
            <h2>Frequently asked</h2>
          </div>
          <div className="faq-list">
            {FAQS.map((f, i) => (
              <FaqItem
                key={f.q}
                q={f.q}
                a={f.a}
                open={openFaq === i}
                onToggle={() => setOpenFaq(openFaq === i ? -1 : i)}
              />
            ))}
          </div>
        </section>

        <section className="land-cta-band">
          <div className="cta-band">
            <div>
              <h2>Ready to read 20 papers in 20 minutes?</h2>
              <p>Open your buckets, drop in a question, and let the engine trace every claim back to the page it came from.</p>
            </div>
            <Link to="/buckets" className="btn primary lg">Open buckets →</Link>
          </div>
        </section>

        <footer className="foot">
          <span className="foot-l">
            <span className="foot-glyph" aria-hidden="true">
              <svg viewBox="0 0 32 32" width="14" height="14" fill="none">
                <g stroke="var(--signal)" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 6c8 0 8 10 14 10" /><path d="M2 16h14" /><path d="M2 26c8 0 8-10 14-10" />
                </g>
                <circle cx="17" cy="16" r="3" fill="var(--signal-2)" />
                <path d="M20 16h10" stroke="var(--signal-2)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </span>
            Synthesis Engine
          </span>
          <span className="foot-r">
            Runs on any OpenAI- or Anthropic-compatible model · Buckets stored locally in your browser.
          </span>
        </footer>
      </div>
    </div>
  );
}