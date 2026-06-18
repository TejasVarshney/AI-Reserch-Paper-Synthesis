export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="footer-left">
        <span className="footer-brand">Synthesis Engine</span>
        <span className="footer-sep">/</span>
        <span className="footer-copy">© {year}</span>
      </div>

      <div className="footer-right">
        <span className="footer-label">Contributors</span>
        <span className="footer-contributors">
          Tejas Varshney · Ojas Maheshwari · Hardik Jumnani ·
          Samarth Deshpandey · Krishna
        </span>
      </div>
    </footer>
  );
}
