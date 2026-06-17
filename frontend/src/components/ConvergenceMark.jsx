// The signature element: N "source" lines enter from the left and converge
// into a single "synthesis" line on the right. It draws itself in on load.
// This visualizes the product's whole thesis — many papers, one reading.

const NODE_X = 760;
const NODE_Y = 110;

// y-positions where each source line enters on the left edge.
const SOURCE_Y = [16, 48, 80, 110, 140, 172, 204];

function sourcePath(y) {
  // Smooth cubic from the left edge into the convergence node.
  const c1x = 240;
  const c2x = 560;
  return `M0 ${y} C ${c1x} ${y}, ${c2x} ${NODE_Y}, ${NODE_X} ${NODE_Y}`;
}

export default function ConvergenceMark({ active = SOURCE_Y.length }) {
  return (
    <svg
      className="weave"
      viewBox="0 0 1200 220"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="weaveGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--signal)" stopOpacity="0.15" />
          <stop offset="55%" stopColor="var(--signal)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--signal-2)" />
        </linearGradient>
        <radialGradient id="nodeGlow">
          <stop offset="0%" stopColor="var(--signal-2)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--signal-2)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* incoming source lines */}
      {SOURCE_Y.map((y, i) => (
        <path
          key={y}
          className="weave-line"
          d={sourcePath(y)}
          pathLength="1"
          stroke="url(#weaveGrad)"
          style={{
            animationDelay: `${0.15 + i * 0.09}s`,
            opacity: i < active ? 1 : 0.18,
          }}
        />
      ))}

      {/* convergence node */}
      <circle cx={NODE_X} cy={NODE_Y} r="34" fill="url(#nodeGlow)" />
      <circle className="weave-node" cx={NODE_X} cy={NODE_Y} r="5.5" fill="var(--signal-2)" />

      {/* the single synthesized output line */}
      <path
        className="weave-out"
        d={`M${NODE_X} ${NODE_Y} L 1200 ${NODE_Y}`}
        pathLength="1"
        stroke="var(--signal-2)"
      />
    </svg>
  );
}
