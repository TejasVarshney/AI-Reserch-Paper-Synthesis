// Layered ambient backdrop: aurora blobs + drifting sparkles.
// Sits behind the constellation canvas. Pure CSS, no JS cost.
// All motion respects prefers-reduced-motion via the global media query in styles.css.

export default function AmbientBackdrop() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-aurora ambient-aurora--a" />
      <div className="ambient-aurora ambient-aurora--b" />
      <div className="ambient-aurora ambient-aurora--c" />
      <div className="ambient-sparks" />
    </div>
  );
}