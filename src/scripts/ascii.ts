// ASCII field: a sheet of faint monospace characters on warm paper, shaped by slow drifting noise.
// The pointer gently lifts the characters around it; a click sends out a blue ripple
// and draws a brief asterisk spark in characters at that spot.

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const SYMBOLS = '*+×·•◆=/\\|-';
const GLYPHS = CHARS + SYMBOLS;
const FONT_SIZE = 11; // px
const CELL_W = 7.4;
const CELL_H = 14;
const INK = '#7d8396';
const BLUE = '#3f5fe8';

const HOVER_RADIUS = 190; // px
const HOVER_LIFT = 0.11; // extra opacity right under the pointer
const WAVE_SPEED = 520; // px per second
const WAVE_LIFE = 2.2; // seconds
const SPARK_LIFE = 1.0;
const SPARK_RAYS = 8;
const SPARK_FOLLOW = 0.07; // share of the gap to the pointer a spark closes each frame
const SPARK_SPIN = 1.2;
const MUTATE = 0.004; // share of characters that change each frame
const FIELD_EVERY = 4; // frames between base-field refreshes (it drifts slowly)

// Small value noise — enough to carve soft drifting regions into the field.
function hash(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function noise(x: number, y: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// x/y anchor the ripple; sx/sy is the spark, which trails the pointer and spins as it passes.
type Wave = { x: number; y: number; sx: number; sy: number; born: number; rot: number };

export function initAscii(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let dpr = 1;
  let cols = 0;
  let rows = 0;
  let glyphs = new Uint8Array(0);
  let field = new Float32Array(0); // cached base opacity + noise per cell
  let tick = 0;
  let atlas: HTMLCanvasElement | null = null;
  let running = false;
  let raf = 0;

  // Pointer position eases toward the real one so the glow trails a little.
  const pointer = { x: -9999, y: -9999, tx: -9999, ty: -9999, active: 0, target: 0 };
  const waves: Wave[] = [];

  // One row per colour, one glyph per column; drawn with globalAlpha per cell.
  function buildAtlas() {
    const a = document.createElement('canvas');
    const w = Math.ceil(CELL_W * dpr);
    const h = Math.ceil(CELL_H * dpr);
    a.width = w * GLYPHS.length;
    a.height = h * 2;
    const g = a.getContext('2d')!;
    g.font = `500 ${FONT_SIZE * dpr}px 'DM Mono', ui-monospace, monospace`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    [INK, BLUE].forEach((color, row) => {
      g.fillStyle = color;
      for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i], i * w + w / 2, row * h + h / 2);
    });
    atlas = a;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    cols = Math.ceil(innerWidth / CELL_W);
    rows = Math.ceil(innerHeight / CELL_H);
    glyphs = new Uint8Array(cols * rows);
    for (let i = 0; i < glyphs.length; i++) glyphs[i] = (Math.random() * CHARS.length) | 0;
    field = new Float32Array(cols * rows * 2);
    tick = 0;
    buildAtlas();
  }

  function frame(now: number) {
    raf = running ? requestAnimationFrame(frame) : 0;
    if (!atlas) return;
    const t = now / 1000;

    const vx = (pointer.tx - pointer.x) * 0.12;
    const vy = (pointer.ty - pointer.y) * 0.12;
    pointer.x += vx;
    pointer.y += vy;
    pointer.active += (pointer.target - pointer.active) * 0.05;

    if (!reducedMotion) {
      const n = Math.ceil(glyphs.length * MUTATE);
      for (let i = 0; i < n; i++) glyphs[(Math.random() * glyphs.length) | 0] = (Math.random() * CHARS.length) | 0;
    }

    while (waves.length && t - waves[0].born > Math.max(WAVE_LIFE, SPARK_LIFE)) waves.shift();

    // Sparks drift after the pointer, and motion sweeping past them turns their rays.
    for (const w of waves) {
      const dx = w.sx - pointer.x;
      const dy = w.sy - pointer.y;
      const pull = SPARK_FOLLOW * pointer.active;
      w.sx -= dx * pull;
      w.sy -= dy * pull;
      w.rot += ((dx * vy - dy * vx) / (dx * dx + dy * dy + 2500)) * SPARK_SPIN;
    }

    ctx!.setTransform(1, 0, 0, 1, 0, 0);
    ctx!.clearRect(0, 0, canvas.width, canvas.height);

    const gw = Math.ceil(CELL_W * dpr);
    const gh = Math.ceil(CELL_H * dpr);
    const hoverR2 = HOVER_RADIUS * HOVER_RADIUS;

    // Base field: two octaves of drifting noise carve faint, soft-edged regions.
    if (tick++ % FIELD_EVERY === 0) {
      const drift = reducedMotion ? 0 : t * 0.035;
      for (let r = 0; r < rows; r++) {
        const ny = (r * CELL_H + CELL_H / 2) / 520;
        for (let c = 0; c < cols; c++) {
          const nx = (c * CELL_W + CELL_W / 2) / 520;
          const n = noise(nx + drift, ny - drift * 0.6) * 0.65 + noise(nx * 2.3 - drift, ny * 2.3 + 4) * 0.35;
          const i = (r * cols + c) * 2;
          field[i] = smoothstep(0.36, 0.78, n) * 0.1;
          field[i + 1] = n;
        }
      }
    }
    const lit = pointer.active > 0.01;

    for (let r = 0; r < rows; r++) {
      const y = r * CELL_H + CELL_H / 2;
      for (let c = 0; c < cols; c++) {
        const x = c * CELL_W + CELL_W / 2;

        const i = r * cols + c;
        let alpha = field[i * 2];

        // Gentle lift around the pointer, stronger where the field is already dense.
        if (lit) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < hoverR2 * 3) alpha += Math.exp(-d2 / hoverR2) * HOVER_LIFT * pointer.active * (0.25 + field[i * 2 + 1]);
        }

        // Blue: expanding ripple rings plus a short-lived asterisk spark.
        let blue = 0;
        let symbol = false;
        for (const w of waves) {
          const age = t - w.born;
          const ex = x - w.x;
          const ey = y - w.y;
          const d = Math.sqrt(ex * ex + ey * ey);

          if (age < WAVE_LIFE) {
            const life = 1 - age / WAVE_LIFE;
            const radius = age * WAVE_SPEED;
            const ring = Math.exp(-(((d - radius) / 26) ** 2)) * life * life;
            const echo = Math.exp(-(((d - radius * 0.62) / 18) ** 2)) * life * life * 0.45;
            blue = Math.max(blue, ring, echo);
          }

          if (age < SPARK_LIFE) {
            const sx = x - w.sx;
            const sy = y - w.sy;
            const d = Math.sqrt(sx * sx + sy * sy);
            const grow = smoothstep(0, 0.28, age);
            const fade = 1 - smoothstep(SPARK_LIFE * 0.3, SPARK_LIFE, age);
            const len = 34 + grow * 92;
            if (d < len) {
              const step = (Math.PI * 2) / SPARK_RAYS;
              let a = Math.atan2(sy, sx) - w.rot - age * 0.35;
              a -= Math.round(a / step) * step;
              const width = 2 + 9 * (1 - d / len);
              const ray = Math.exp(-(((d * Math.sin(Math.abs(a))) / width) ** 2));
              const core = Math.exp(-((d / 16) ** 2));
              const s = Math.max(ray, core) * fade;
              if (s > 0.35) symbol = true;
              blue = Math.max(blue, s);
            }
          }
        }

        if (blue > 0.08) {
          // Ink fades out as blue takes the cell over.
          const g = symbol ? CHARS.length + (glyphs[i] % SYMBOLS.length) : glyphs[i];
          const ba = Math.min(0.92, blue * 0.95);
          const ia = alpha * (1 - blue);
          if (ia > 0.006) {
            ctx!.globalAlpha = ia;
            ctx!.drawImage(atlas, glyphs[i] * gw, 0, gw, gh, Math.round(c * CELL_W * dpr), Math.round(r * CELL_H * dpr), gw, gh);
          }
          ctx!.globalAlpha = ba;
          ctx!.drawImage(atlas, g * gw, gh, gw, gh, Math.round(c * CELL_W * dpr), Math.round(r * CELL_H * dpr), gw, gh);
        } else if (alpha > 0.008) {
          ctx!.globalAlpha = Math.min(alpha, 0.45);
          ctx!.drawImage(atlas, glyphs[i] * gw, 0, gw, gh, Math.round(c * CELL_W * dpr), Math.round(r * CELL_H * dpr), gw, gh);
        }
      }
    }
    ctx!.globalAlpha = 1;
  }

  function onMove(e: PointerEvent) {
    if (!running) return;
    if (pointer.target === 0) {
      // Start the glow where the pointer is instead of sliding in from a corner.
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    }
    pointer.tx = e.clientX;
    pointer.ty = e.clientY;
    pointer.target = 1;
  }

  function onDown(e: PointerEvent) {
    if (!running || (e.target instanceof Element && e.target.closest('a, button'))) return;
    waves.push({ x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, born: performance.now() / 1000, rot: Math.random() * Math.PI });
    if (waves.length > 6) waves.shift();
  }

  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerdown', onDown, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => (pointer.target = 0));
  window.addEventListener('resize', () => running && resize());

  // DM Mono comes from Google Fonts — redraw the atlas once it's in.
  document.fonts?.load(`500 ${FONT_SIZE}px 'DM Mono'`).then(() => cols && buildAtlas()).catch(() => {});

  return {
    resume() {
      if (running) return;
      running = true;
      resize();
      raf = requestAnimationFrame(frame);
    },
    pause() {
      running = false;
      cancelAnimationFrame(raf);
      raf = 0;
      waves.length = 0;
    },
  };
}
