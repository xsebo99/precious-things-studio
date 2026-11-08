// Deep Field Mosaic: one Webb photo cut into slightly misaligned panels (a hand-stitched
// band), with twinkling diffraction-spike stars and an occasional red lens flare.

const PANELS = 7;
const PATCHES = 3;
const STARS = 16;
const OVERHANG = 0.25; // fraction of band height the photo extends above and below

type Panel = { el: HTMLElement; img: HTMLElement; x: number; y: number; w: number; h: number; dx: number; dy: number; rot: number; depth: number };
type Star = { x: number; y: number; size: number; phase: number; speed: number };

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function initMosaic(root: HTMLElement, image: string) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const band = document.createElement('div');
  band.className = 'mosaic__band';
  const stars = document.createElement('canvas');
  stars.className = 'mosaic__stars';
  const flare = document.createElement('div');
  flare.className = 'mosaic__flare';
  flare.innerHTML = '<i></i><i></i><b></b>';
  root.append(band);

  // Vertical slices of random width, plus a few small patches on the edges.
  const panels: Panel[] = [];
  const widths = Array.from({ length: PANELS }, () => rand(0.8, 1.4));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = 0;
  const addPanel = (px: number, py: number, pw: number, ph: number, depth: number) => {
    const el = document.createElement('div');
    el.className = 'mosaic__panel';
    const img = document.createElement('div');
    img.className = 'mosaic__img';
    img.style.backgroundImage = `url(${image})`;
    el.append(img);
    band.append(el);
    panels.push({ el, img, x: px, y: py, w: pw, h: ph, dx: rand(-6, 6), dy: rand(-8, 8), rot: rand(-0.9, 0.9), depth });
  };
  for (const w of widths) {
    const pw = w / total;
    const top = rand(-0.04, 0.05);
    const bottom = rand(-0.04, 0.05);
    addPanel(x, top, pw + 0.004, 1 - top - bottom, rand(0.3, 1));
    x += pw;
  }
  for (let i = 0; i < PATCHES; i++) {
    const pw = rand(0.06, 0.12);
    const ph = rand(0.18, 0.32);
    const onTop = i % 2 === 0;
    addPanel(rand(0.05, 0.85), onTop ? -ph * 0.55 : 1 - ph * 0.45, pw, ph, rand(0.6, 1.2));
  }
  band.append(stars, flare);

  const starList: Star[] = Array.from({ length: STARS }, (_, i) => ({
    x: rand(0.04, 0.96),
    y: rand(0.08, 0.92),
    size: i < 4 ? rand(0.9, 1.3) : rand(0.25, 0.6),
    phase: rand(0, Math.PI * 2),
    speed: rand(0.6, 1.6),
  }));

  let bandW = 0;
  let bandH = 0;
  function layout() {
    bandW = band.clientWidth;
    bandH = band.clientHeight;
    for (const p of panels) {
      Object.assign(p.el.style, {
        left: `${p.x * bandW}px`,
        top: `${p.y * bandH}px`,
        width: `${p.w * bandW}px`,
        height: `${p.h * bandH}px`,
      });
      // Every panel holds the same copy of the photo, offset so the slices line up.
      // The copy overhangs the band so patches sticking out past its edges still show sky.
      Object.assign(p.img.style, {
        width: `${bandW}px`,
        height: `${bandH * (1 + 2 * OVERHANG)}px`,
        left: `${-p.x * bandW}px`,
        top: `${-(p.y + OVERHANG) * bandH}px`,
      });
    }
    const dpr = Math.min(window.devicePixelRatio, 2);
    stars.width = Math.round(bandW * dpr);
    stars.height = Math.round(bandH * dpr);
    stars.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Webb's signature: six long spikes (vertical + two diagonals) and two short horizontal ones.
  const ctx = stars.getContext('2d')!;
  function drawStar(s: Star, t: number) {
    const tw = reducedMotion ? 1 : 0.7 + 0.3 * Math.sin(t * s.speed + s.phase);
    const cx = s.x * bandW;
    const cy = s.y * bandH;
    const len = s.size * Math.min(bandH, 260) * 0.42 * tw;
    const spike = (angle: number, l: number, width: number) => {
      const dx = Math.cos(angle) * l;
      const dy = Math.sin(angle) * l;
      const g = ctx.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
      g.addColorStop(0, 'rgba(190,215,255,0)');
      g.addColorStop(0.5, `rgba(235,242,255,${0.85 * tw})`);
      g.addColorStop(1, 'rgba(190,215,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
    };
    for (const a of [90, 30, 150]) spike((a * Math.PI) / 180, len, 1.1 * s.size + 0.3);
    spike(0, len * 0.35, 0.8 * s.size + 0.2);
    const r = 10 * s.size * tw;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, 'rgba(255,255,255,0.95)');
    glow.addColorStop(0.25, 'rgba(210,225,255,0.5)');
    glow.addColorStop(1, 'rgba(160,190,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Pointer parallax: panels sit at different depths, so the seams shift as you move.
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    'pointermove',
    (e) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  function fireFlare() {
    if (reducedMotion) return;
    flare.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -50%) scaleX(0.2)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scaleX(1)', offset: 0.25 },
        { opacity: 0, transform: 'translate(-50%, -50%) scaleX(1.15)' },
      ],
      { duration: 2200, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' },
    );
  }

  let raf = 0;
  let running = false;
  let flareTimer = 0;
  const start = performance.now();

  function tick(now: number) {
    const t = (now - start) / 1000;
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    for (const p of panels) {
      const mx = p.dx + mouse.x * p.depth * 16;
      const my = p.dy + mouse.y * p.depth * 10;
      p.el.style.transform = `translate(${mx.toFixed(2)}px, ${my.toFixed(2)}px) rotate(${p.rot}deg)`;
    }
    ctx.clearRect(0, 0, bandW, bandH);
    ctx.globalCompositeOperation = 'lighter';
    for (const s of starList) drawStar(s, t);
    ctx.globalCompositeOperation = 'source-over';
    raf = requestAnimationFrame(tick);
  }

  function scheduleFlare() {
    flareTimer = window.setTimeout(() => {
      fireFlare();
      scheduleFlare();
    }, rand(7000, 11000));
  }

  window.addEventListener('resize', () => running && layout());

  return {
    resume() {
      if (running) return;
      running = true;
      layout();
      raf = requestAnimationFrame(tick);
      flareTimer = window.setTimeout(() => {
        fireFlare();
        scheduleFlare();
      }, 1200);
    },
    pause() {
      running = false;
      cancelAnimationFrame(raf);
      clearTimeout(flareTimer);
    },
  };
}
