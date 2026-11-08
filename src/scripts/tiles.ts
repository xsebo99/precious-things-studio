// Telescope Tiles: a Webb photo assembles itself from tiles like incoming observations.
// Hovering lifts a tile; every few seconds one flips over to a different region of sky.

export type SkyImage = { src: string; width: number; height: number };

const FLIP_EVERY = 2600;

type Tile = {
  el: HTMLElement;
  inner: HTMLElement;
  faces: [HTMLElement, HTMLElement];
  front: 0 | 1;
  image: number;
  col: number;
  row: number;
  busy: boolean;
};

export function initTiles(root: HTMLElement, images: SkyImage[]) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const grid = document.createElement('div');
  grid.className = 'tiles__grid';
  root.append(grid);

  for (const img of images) new Image().src = img.src;

  let tiles: Tile[] = [];
  let cols = 0;
  let rows = 0;

  // Paint one face with the slice of `image` that falls under this tile,
  // as if the image covered the whole grid.
  function paint(face: HTMLElement, tile: Tile, image: number) {
    const { width: iw, height: ih, src } = images[image];
    const W = grid.clientWidth;
    const H = grid.clientHeight;
    const s = Math.max(W / iw, H / ih);
    const ox = (W - iw * s) / 2;
    const oy = (H - ih * s) / 2;
    face.style.backgroundImage = `url(${src})`;
    face.style.backgroundSize = `${iw * s}px ${ih * s}px`;
    face.style.backgroundPosition = `${ox - tile.el.offsetLeft}px ${oy - tile.el.offsetTop}px`;
  }

  function build() {
    const portrait = window.innerWidth < window.innerHeight;
    const nextCols = portrait ? 3 : 6;
    const nextRows = portrait ? 6 : 4;
    if (nextCols !== cols || nextRows !== rows || tiles.length === 0) {
      cols = nextCols;
      rows = nextRows;
      grid.style.setProperty('--cols', String(cols));
      grid.style.setProperty('--rows', String(rows));
      grid.replaceChildren();
      tiles = [];
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const el = document.createElement('div');
          el.className = 'tile';
          // Each "exposure" is a touch brighter or darker than its neighbours.
          el.style.setProperty('--b', (0.82 + Math.random() * 0.26).toFixed(2));
          const inner = document.createElement('div');
          inner.className = 'tile__inner';
          const a = document.createElement('div');
          const b = document.createElement('div');
          a.className = 'tile__face';
          b.className = 'tile__face tile__face--back';
          inner.append(a, b);
          el.append(inner);
          grid.append(el);
          tiles.push({ el, inner, faces: [a, b], front: 0, image: 0, col, row, busy: false });
        }
      }
    }
    for (const t of tiles) paint(t.faces[t.front], t, t.image);
  }

  function assemble() {
    if (reducedMotion) return;
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    for (const t of tiles) {
      const dist = Math.hypot(t.col - cx, t.row - cy);
      t.el.animate(
        [
          {
            opacity: 0,
            transform: `translate(${(Math.random() - 0.5) * 80}px, ${(Math.random() - 0.5) * 80}px) scale(0.86)`,
          },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 900, delay: dist * 120 + Math.random() * 120, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'backwards' },
      );
    }
  }

  function flipRandom() {
    const candidates = tiles.filter((t) => !t.busy && !t.el.matches(':hover'));
    const t = candidates[Math.floor(Math.random() * candidates.length)];
    if (!t) return;
    let next = Math.floor(Math.random() * (images.length - 1));
    if (next >= t.image) next++;
    const back = (1 - t.front) as 0 | 1;
    paint(t.faces[back], t, next);
    t.busy = true;
    t.front = back;
    t.image = next;
    t.el.classList.toggle('is-flipped', back === 1);
    setTimeout(() => (t.busy = false), 1000);
  }

  let timer = 0;
  let running = false;
  window.addEventListener('resize', () => running && build());

  return {
    resume() {
      if (running) return;
      running = true;
      build();
      assemble();
      if (!reducedMotion) timer = window.setInterval(flipRandom, FLIP_EVERY);
    },
    pause() {
      running = false;
      clearInterval(timer);
    },
  };
}
