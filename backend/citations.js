// citations.js
// Export paper metadata to standard citation formats (BibTeX, RIS).

function authorsList(authors) {
  if (Array.isArray(authors)) return authors;
  if (typeof authors === 'string' && authors.trim()) return authors.split(/,|;| and /).map((a) => a.trim());
  return [];
}

function citeKey(paper, i) {
  const first = authorsList(paper.authors)[0] || 'anon';
  const last = first.split(/\s+/).pop().replace(/[^A-Za-z]/g, '') || 'anon';
  const word = (paper.title || 'paper').split(/\s+/).find((w) => w.length > 3) || 'ref';
  return `${last}${paper.year || ''}${word.replace(/[^A-Za-z]/g, '')}`.toLowerCase() || `ref${i + 1}`;
}

function bibtex(paper, i) {
  const key = citeKey(paper, i);
  const fields = [
    ['title', paper.title],
    ['author', authorsList(paper.authors).join(' and ')],
    ['year', paper.year],
    ['journal', paper.venue],
    ['doi', paper.doi],
    ['url', paper.url],
    ['abstract', paper.abstract ? String(paper.abstract).replace(/\s+/g, ' ').slice(0, 600) : ''],
  ].filter(([, v]) => v);
  const body = fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n');
  const type = paper.source === 'arxiv' ? 'misc' : 'article';
  return `@${type}{${key},\n${body}\n}`;
}

function ris(paper) {
  const lines = ['TY  - JOUR'];
  for (const a of authorsList(paper.authors)) lines.push(`AU  - ${a}`);
  if (paper.title) lines.push(`TI  - ${paper.title}`);
  if (paper.year) lines.push(`PY  - ${paper.year}`);
  if (paper.venue) lines.push(`JO  - ${paper.venue}`);
  if (paper.doi) lines.push(`DO  - ${paper.doi}`);
  if (paper.url) lines.push(`UR  - ${paper.url}`);
  if (paper.abstract) lines.push(`AB  - ${String(paper.abstract).replace(/\s+/g, ' ').slice(0, 600)}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

export function formatCitations(papers, format = 'bibtex') {
  const list = Array.isArray(papers) ? papers : [];
  if (format === 'ris') return list.map(ris).join('\n\n');
  return list.map(bibtex).join('\n\n');
}
