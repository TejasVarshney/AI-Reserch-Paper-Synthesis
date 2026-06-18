// prompts.js
// Prompt engineering for the research-paper synthesis engine.
// Each "mode" describes a different scholarly synthesis task. The system
// prompt fixes the persona + output contract; the mode instruction steers
// the structure of the answer.

export const SYNTHESIS_MODES = {
  'literature-review': {
    label: 'Literature Review',
    description: 'A flowing narrative review that situates the papers in a shared scholarly context.',
    instruction: `Write a cohesive **literature review** that synthesizes the provided papers into a single narrative.
- Open with a short framing of the research area and why it matters.
- Group related work thematically (do NOT summarize papers one-by-one).
- Trace how ideas build on, agree with, or contradict each other, citing papers by their title or [P#] label.
- Close with the current state of the field.`,
  },

  'comparative-analysis': {
    label: 'Comparative Analysis',
    description: 'A structured side-by-side comparison of approaches, results, and trade-offs.',
    instruction: `Produce a **comparative analysis** of the papers.
- Begin with a Markdown comparison **table** (columns: Paper, Approach/Method, Dataset/Setting, Key Result, Limitation).
- Follow with prose comparing the methods: where they agree, where they diverge, and the trade-offs each makes.
- Identify which approach is strongest for which scenario.`,
  },

  'thematic-synthesis': {
    label: 'Thematic Synthesis',
    description: 'Extract and organize the cross-cutting themes that span the papers.',
    instruction: `Perform a **thematic synthesis**.
- Identify 3–6 cross-cutting themes that emerge across the papers.
- For each theme: give it a clear heading, explain it, and cite which papers ([P#] / title) contribute to it and how.
- Note any themes where the papers disagree.
- End with a brief reflection on what the dominant themes reveal about the field.`,
  },

  'key-findings': {
    label: 'Key Findings & Contributions',
    description: 'The headline results and contributions of each paper, distilled.',
    instruction: `Distill the **key findings and contributions**.
- For each paper, give a tight bullet list: Problem, Approach, Headline Result, Contribution.
- Keep each paper to ~4 bullets — be precise, quantitative where possible.
- After the per-paper list, add a short "What's new collectively" paragraph tying the contributions together.`,
  },

  'research-gaps': {
    label: 'Research Gaps & Future Directions',
    description: 'Identify what is unanswered and propose where the field should go next.',
    instruction: `Identify **research gaps and future directions**.
- Summarize in 2–3 sentences what the papers collectively establish.
- List the open problems / gaps the papers reveal or leave unaddressed.
- Propose concrete, well-motivated future research directions, each tied to a gap.
- Flag any methodological weaknesses or threats to validity you notice.`,
  },

  'methodology': {
    label: 'Methodology Comparison',
    description: 'Focus narrowly on how the work was done and how rigorous it is.',
    instruction: `Compare the **methodologies** of the papers.
- For each paper: data/sample, method/architecture, evaluation protocol, and metrics.
- Assess methodological rigor and reproducibility.
- Highlight where methods are comparable vs. where comparison is unfair (different datasets, metrics, baselines).
- Recommend the most rigorous methodological practices observed.`,
  },
};

const SYSTEM_PROMPT = `You are a meticulous research synthesis assistant used by scientists and graduate students.
You read scholarly papers (titles, abstracts, excerpts, or full text) and produce rigorous, well-structured syntheses.

Rules:
- Be faithful to the source material. Never invent findings, citations, numbers, or papers that are not present in the input.
- If the provided material is too thin to support a claim, say so explicitly rather than fabricating.
- Refer to papers using their title and a short [P#] label matching the order they were given.
- Write in clear, academic English. Use Markdown (headings, bold, tables, lists) for structure.
- Prefer precision and substance over length. Do not pad.`;

/**
 * Build the messages array for the chat-completions request.
 * @param {Array<{title?: string, content: string}>} papers
 * @param {string} mode  key into SYNTHESIS_MODES
 * @param {string} [customInstructions]
 * @returns {Array<{role: string, content: string}>}
 */
export function buildMessages(papers, mode, customInstructions = '') {
  const modeDef = SYNTHESIS_MODES[mode] || SYNTHESIS_MODES['literature-review'];

  const papersBlock = papers
    .map((p, i) => {
      const title = (p.title && p.title.trim()) || `Untitled paper ${i + 1}`;
      return `### [P${i + 1}] ${title}\n${p.content.trim()}`;
    })
    .join('\n\n---\n\n');

  const extra = customInstructions && customInstructions.trim()
    ? `\n\nAdditional instructions from the user (follow these too):\n${customInstructions.trim()}`
    : '';

  const userPrompt = `You are given ${papers.length} paper(s) below.

TASK: ${modeDef.label}
${modeDef.instruction}${extra}

=== PAPERS ===

${papersBlock}

=== END OF PAPERS ===

Now produce the ${modeDef.label.toLowerCase()} as specified. Output Markdown only.`;

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ];
}
