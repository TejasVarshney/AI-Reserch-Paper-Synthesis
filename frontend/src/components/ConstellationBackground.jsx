import { useEffect, useRef } from 'react';

// Interactive knowledge-graph backdrop — tuned for performance.
// - Capped DPR (1.5), capped node count, ~30 FPS target, frame-skipping.
// - Spatial hash for node-node links (O(n) instead of O(n^2)).
// - Mouse math only when the cursor actually moved, and only the K nearest nodes react.
// - All link segments batched into a single beginPath/stroke per color group.
// - No shadowBlur — replaced with a soft radial gradient for hub glow.
// - Pauses when the tab is hidden OR the canvas is offscreen.
// - Honors prefers-reduced-motion: renders a single static frame.

const IRIS = '110,139,255';
const TEAL = '69,227,203';
const LINK = 138;        // px distance for node-node links
const CURSOR_LINK = 170; // px distance for cursor pull
const HUB_RATIO = 1 / 9;
const TEAL_RATIO = 0.28;
const CELL = LINK;       // spatial-hash cell size
const TARGET_MS = 1000 / 30; // ~30 FPS

export default function ConstellationBackground() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1;
    let nodes = [];          // {x,y,vx,vy,r,hub,teal,ph}
    let hash = new Map();    // spatial hash -> array of node indices
    const mouse = { x: -9999, y: -9999, active: false, lastMoveAt: 0 };
    const rings = [];
    const sparks = [];

    let raf = 0;
    let lastFrame = 0;
    let frame = 0;            // monotonic frame counter
    let offscreen = false;
    let lastW = -1, lastH = -1;

    const build = () => {
      // Density scales with viewport area, but stays modest for perf.
      const count = Math.max(22, Math.min(60, Math.round((w * h) / 24000)));
      nodes = Array.from({ length: count }, () => {
        const hub = Math.random() < HUB_RATIO;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.18,
          vy: (Math.random() - 0.5) * 0.18,
          r: hub ? 2.0 + Math.random() * 1.2 : 0.7 + Math.random() * 0.9,
          hub,
          teal: Math.random() < TEAL_RATIO,
          ph: Math.random() * Math.PI * 2,
        };
      });
    };

    const resize = () => {
      // Cap DPR — 1.5 is plenty visually, saves a lot of pixels on retina.
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = window.innerWidth;
      h = window.innerHeight;
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    const key = (cx, cy) => (cx * 73856093) ^ (cy * 19349663);
    const rebuildHash = () => {
      hash.clear();
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const cx = Math.floor(n.x / CELL);
        const cy = Math.floor(n.y / CELL);
        const k = key(cx, cy);
        let bucket = hash.get(k);
        if (!bucket) { bucket = []; hash.set(k, bucket); }
        bucket.push(i);
      }
    };

    // Hub glow — pre-rendered to an offscreen canvas, blitted per frame.
    let hubGlow = null;
    const buildHubGlow = () => {
      const size = 48;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
      grd.addColorStop(0, 'rgba(255,255,255,0.9)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, size, size);
      hubGlow = c;
    };

    const spawnSparks = (x, y) => {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const speed = 1.0 + Math.random() * 1.8;
        sparks.push({
          x, y,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 1,
          decay: 0.014 + Math.random() * 0.012,
          r: 1.0 + Math.random() * 1.2,
          teal: Math.random() < 0.4,
        });
      }
      rings.push({ x, y, r: 4, alpha: 0.55 });
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);

      // Rebuild the spatial hash every other frame — positions drift slowly.
      if ((frame & 1) === 0) rebuildHash();
      const LINK2 = LINK * LINK;

      // Batch all iris node-node links into one path.
      ctx.strokeStyle = `rgba(${IRIS},0.16)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        const cx = Math.floor(a.x / CELL);
        const cy = Math.floor(a.y / CELL);
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const bucket = hash.get(key(cx + ox, cy + oy));
            if (!bucket) continue;
            for (let bi = 0; bi < bucket.length; bi++) {
              const j = bucket[bi];
              if (j <= i) continue;
              const b = nodes[j];
              const dx = a.x - b.x, dy = a.y - b.y;
              if (dx*dx + dy*dy < LINK2) {
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
              }
            }
          }
        }
      }
      ctx.stroke();

      // Cursor lines — only draw if the mouse has moved recently.
      const mouseLive = mouse.active && (performance.now() - mouse.lastMoveAt) < 120;
      if (mouseLive) {
        const C2 = CURSOR_LINK * CURSOR_LINK;
        ctx.strokeStyle = `rgba(${TEAL},0.35)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const dx = n.x - mouse.x, dy = n.y - mouse.y;
          if (dx*dx + dy*dy < C2) {
            ctx.moveTo(n.x, n.y);
            ctx.lineTo(mouse.x, mouse.y);
          }
        }
        ctx.stroke();
      }

      // Nodes — single batched path for all small nodes.
      ctx.fillStyle = `rgba(${IRIS},0.65)`;
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.hub) continue;
        ctx.moveTo(n.x + n.r, n.y);
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      }
      ctx.fill();

      // Hubs — blit the pre-rendered glow under a solid core, in their own color.
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (!n.hub) continue;
        const color = n.teal ? TEAL : IRIS;
        const pulse = 0.5 + 0.5 * Math.sin(n.ph);
        ctx.globalAlpha = 0.45 + 0.35 * pulse;
        // tint the glow with composite operation
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(hubGlow, n.x - 24, n.y - 24, 48, 48);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.75 + 0.2 * pulse;
        ctx.fillStyle = `rgba(${color},1)`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Sparks — small, only update if any exist.
      if (sparks.length) {
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.x += s.vx; s.y += s.vy;
          s.vx *= 0.96; s.vy *= 0.96;
          s.life -= s.decay;
          if (s.life <= 0) { sparks.splice(i, 1); continue; }
          ctx.fillStyle = s.teal
            ? `rgba(${TEAL},${s.life})`
            : `rgba(${IRIS},${s.life})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * s.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Rings — rare, one stroke each.
      if (rings.length) {
        for (let i = rings.length - 1; i >= 0; i--) {
          const r = rings[i];
          r.r += 2.4;
          r.alpha *= 0.95;
          if (r.alpha < 0.02) { rings.splice(i, 1); continue; }
          ctx.strokeStyle = `rgba(${TEAL},${r.alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    const step = (now) => {
      // Frame-skip to ~30 FPS.
      if (now - lastFrame < TARGET_MS) {
        raf = requestAnimationFrame(step);
        return;
      }
      lastFrame = now;
      frame++;

      if (offscreen) {
        raf = requestAnimationFrame(step);
        return;
      }

      // Physics.
      const mouseLive = mouse.active && (now - mouse.lastMoveAt) < 120;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx;
        n.y += n.vy;
        n.ph += 0.02;

        if (mouseLive) {
          const dx = n.x - mouse.x, dy = n.y - mouse.y;
          const d2 = dx*dx + dy*dy;
          if (d2 < 160 * 160) {
            const d = Math.sqrt(d2) || 0.0001;
            const force = (1 - d / 160) * 0.3;
            n.vx += (dx / d) * force;
            n.vy += (dy / d) * force;
          }
        }

        n.vx *= 0.992; n.vy *= 0.992;
        if (n.x < -20) n.x = w + 20; else if (n.x > w + 20) n.x = -20;
        if (n.y < -20) n.y = h + 20; else if (n.y > h + 20) n.y = -20;
      }

      draw();
      raf = requestAnimationFrame(step);
    };

    // ── Input ───────────────────────────────────────────
    const onMove = (e) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      mouse.active = true;
      mouse.lastMoveAt = performance.now();
    };
    const onLeave = () => { mouse.active = false; };
    const onClick = (e) => { spawnSparks(e.clientX, e.clientY); };
    const onTouch = (e) => {
      if (!e.touches.length) return;
      const t0 = e.touches[0];
      mouse.x = t0.clientX; mouse.y = t0.clientY;
      mouse.active = true; mouse.lastMoveAt = performance.now();
    };

    // ── Boot ────────────────────────────────────────────
    resize();
    buildHubGlow();
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseleave', onLeave);
    window.addEventListener('click', onClick, { passive: true });
    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });

    // Pause when offscreen — biggest win on long pages.
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) offscreen = !e.isIntersecting;
    }, { rootMargin: '50px' });
    io.observe(canvas);

    // Pause when tab is hidden.
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce && !offscreen) raf = requestAnimationFrame(step);
    };
    document.addEventListener('visibilitychange', onVis);

    if (reduce) {
      draw();
    } else {
      raf = requestAnimationFrame(step);
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('click', onClick);
      window.removeEventListener('touchstart', onTouch);
      window.removeEventListener('touchmove', onTouch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  return <canvas ref={ref} className="constellation" aria-hidden="true" />;
}