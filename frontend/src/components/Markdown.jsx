import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Turn [P# §Section] markers into markdown links we can intercept, so each
// citation renders as a clickable chip that points back to its source paper.
function linkifyCitations(md) {
  return (md || '').replace(
    /\[P(\d+)\s*§\s*([^\]]+)\]/g,
    (_, n, section) => `[P${n}](cite:${n}::${section.trim()})`
  );
}

export default function Markdown({ children, onCite }) {
  const components = {
    table: ({ node, ...props }) => (
      <div className="table-wrap">
        <table {...props} />
      </div>
    ),
    a: ({ node, href, children: kids, ...props }) => {
      if (href && href.startsWith('cite:')) {
        const [n, section] = href.slice(5).split('::');
        return (
          <button
            type="button"
            className="cite"
            title={`P${n} · ${section}`}
            onClick={() => onCite?.(Number(n), section)}
          >
            P{n}
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" {...props}>
          {kids}
        </a>
      );
    },
  };

  // Keep react-markdown's URL sanitizing, but let our own cite: scheme through.
  const urlTransform = (url) => (url.startsWith('cite:') ? url : defaultUrlTransform(url));

  return (
    <div className="doc">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={urlTransform}>
        {linkifyCitations(children)}
      </ReactMarkdown>
    </div>
  );
}
