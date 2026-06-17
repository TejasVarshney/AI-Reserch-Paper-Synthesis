import { useEffect, useRef, useState } from 'react';

// Ticks a number from 0 -> target when the element scrolls into view.
// Honors prefers-reduced-motion: jumps to the final value.
export default function CountUp({ to, duration = 1200, prefix = '', suffix = '', decimals = 0 }) {
  const ref = useRef(null);
  const [val, setVal] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const run = () => {
      if (reduce) { setVal(to); return; }
      const start = performance.now();
      const tick = (now) => {
        const p = Math.min(1, (now - start) / duration);
        // ease-out cubic
        const e = 1 - Math.pow(1 - p, 3);
        setVal(to * e);
        if (p < 1) requestAnimationFrame(tick);
        else setVal(to);
      };
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) { run(); io.disconnect(); }
      }
    }, { threshold: 0.4 });
    io.observe(el);

    return () => io.disconnect();
  }, [to, duration]);

  const display = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toLocaleString();
  return <span ref={ref}>{prefix}{display}{suffix}</span>;
}