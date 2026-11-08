// Cursor image trail: drops an image every SPACING px of pointer travel,
// cycling through `sources`; each one pops in, lingers briefly, then sinks away.
const SPACING = 90;
const MAX_ON_SCREEN = 14;
const LINGER = 520;

const HIDDEN = 'inset(100%)';

// `reveal` (optional) is an overlay clipped to the union of the visible images,
// e.g. a white copy of the text so it flips colour wherever a photo sits beneath it.
export function initTrail(layer: HTMLElement, sources: string[], reveal?: HTMLElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let enabled = false;
  let next = 0;
  let last: { x: number; y: number } | null = null;
  let raf = 0;

  // Outline every image as its transformed quad (rotation + scale included)
  // and clip the overlay to all of them at once.
  function updateReveal() {
    raf = 0;
    if (!reveal) return;
    let path = '';
    for (const img of layer.children as HTMLCollectionOf<HTMLElement>) {
      const style = getComputedStyle(img);
      if (Number(style.opacity) < 0.5) continue;
      const m = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
      const w = img.offsetWidth;
      const h = img.offsetHeight;
      const cx = img.offsetLeft + w / 2;
      const cy = img.offsetTop + h / 2;
      const corners = [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].map(([x, y]) => {
        const p = m.transformPoint({ x, y });
        return `${(p.x + cx).toFixed(1)} ${(p.y + cy).toFixed(1)}`;
      });
      path += `M${corners[0]} L${corners[1]} L${corners[2]} L${corners[3]} Z `;
    }
    reveal.style.clipPath = path ? `path('${path.trim()}')` : HIDDEN;
    if (layer.childElementCount > 0) raf = requestAnimationFrame(updateReveal);
  }

  function watchReveal() {
    if (reveal && !raf) raf = requestAnimationFrame(updateReveal);
  }

  // Warm the cache so the first pass doesn't flash empty frames.
  for (const src of sources) new Image().src = src;

  function spawn(x: number, y: number) {
    const img = document.createElement('img');
    img.src = sources[next];
    img.alt = '';
    img.draggable = false;
    img.className = 'trail__img';
    img.style.left = `${x}px`;
    img.style.top = `${y}px`;
    next = (next + 1) % sources.length;

    while (layer.childElementCount >= MAX_ON_SCREEN) layer.firstElementChild?.remove();
    layer.append(img);
    watchReveal();

    const tilt = (Math.random() - 0.5) * 14;
    const base = `translate(-50%, -50%) rotate(${tilt}deg)`;
    img
      .animate(
        [
          { opacity: 0, transform: `${base} scale(0.55)` },
          { opacity: 1, transform: `${base} scale(1)` },
        ],
        { duration: 320, easing: 'cubic-bezier(0.2, 0.9, 0.2, 1.15)', fill: 'forwards' },
      )
      .finished.then(() => new Promise((r) => setTimeout(r, LINGER)))
      .then(() =>
        img.animate(
          [
            { opacity: 1, transform: `${base} scale(1)` },
            { opacity: 0, transform: `${base} translateY(40px) scale(0.8)` },
          ],
          { duration: 520, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' },
        ).finished,
      )
      .then(() => img.remove())
      .catch(() => img.remove());
  }

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!enabled || reducedMotion || e.pointerType === 'touch') return;
      if (!last) {
        last = { x: e.clientX, y: e.clientY };
        return;
      }
      if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < SPACING) return;
      last = { x: e.clientX, y: e.clientY };
      spawn(e.clientX, e.clientY);
    },
    { passive: true },
  );

  return {
    setEnabled(on: boolean) {
      enabled = on;
      last = null;
      if (!on) {
        layer.replaceChildren();
        if (reveal) reveal.style.clipPath = HIDDEN;
      }
    },
  };
}
