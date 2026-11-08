// Split-flap board: the studio name, rotating world clocks and a ticking local clock.
// Each cell flips through the drum one character at a time, like an airport departures board.

const WIDE = 22; // content width on roomy screens: "PRECIOUS THINGS STUDIO" fills it exactly
const MAX_CELL = 58; // px — preferred cell width on large screens
const MIN_CELL = 22;
const ASPECT = 0.74; // cell width / height
const GAP = 3;
const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:.-+/&';
const DIGITS = '0123456789';
const STEP = 70; // ms per character flip
const CITY_EVERY = 12000;

// [name, airport code for narrow screens, time zone]
const CITY_SETS: [string, string, string][][] = [
  [
    ['NEW YORK', 'NYC', 'America/New_York'],
    ['LONDON', 'LON', 'Europe/London'],
    ['TOKYO', 'TYO', 'Asia/Tokyo'],
  ],
  [
    ['PARIS', 'PAR', 'Europe/Paris'],
    ['DUBAI', 'DXB', 'Asia/Dubai'],
    ['SYDNEY', 'SYD', 'Australia/Sydney'],
  ],
  [
    ['LOS ANGELES', 'LAX', 'America/Los_Angeles'],
    ['BERLIN', 'BER', 'Europe/Berlin'],
    ['SINGAPORE', 'SIN', 'Asia/Singapore'],
  ],
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Flap {
  el: HTMLElement;
  private top: HTMLElement;
  private bottom: HTMLElement;
  private leafTop: HTMLElement;
  private leafBottom: HTMLElement;
  char = ' ';
  private target = ' ';
  private spinning = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'flap';
    this.el.innerHTML =
      '<div class="flap__half flap__top"><span></span></div>' +
      '<div class="flap__half flap__bottom"><span></span></div>' +
      '<div class="flap__half flap__top flap__leaf flap__leaf--top"><span></span></div>' +
      '<div class="flap__half flap__bottom flap__leaf flap__leaf--bottom"><span></span></div>';
    [this.top, this.bottom, this.leafTop, this.leafBottom] = [...this.el.children] as HTMLElement[];
    parent.append(this.el);
  }

  private show(half: HTMLElement, c: string) {
    half.firstElementChild!.textContent = c;
  }

  setNow(c: string) {
    this.char = this.target = c;
    this.show(this.top, c);
    this.show(this.bottom, c);
    this.leafTop.style.visibility = this.leafBottom.style.visibility = 'hidden';
  }

  // Next character on the drum. Digit-to-digit changes stay on the digit ring so clocks tick quickly.
  private nextOf(c: string) {
    if (DIGITS.includes(c) && DIGITS.includes(this.target)) return DIGITS[(DIGITS.indexOf(c) + 1) % 10];
    return DRUM[(DRUM.indexOf(c) + 1) % DRUM.length];
  }

  private async flipOnce(next: string, ms: number) {
    const old = this.char;
    this.show(this.top, next);
    this.show(this.leafTop, old);
    this.show(this.leafBottom, next);
    this.leafTop.style.visibility = 'visible';
    this.leafTop.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], {
      duration: ms / 2,
      easing: 'ease-in',
      fill: 'forwards',
    });
    await sleep(ms / 2);
    this.leafTop.style.visibility = 'hidden';
    this.leafBottom.style.visibility = 'visible';
    this.leafBottom.animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], {
      duration: ms / 2,
      easing: 'ease-out',
      fill: 'forwards',
    });
    await sleep(ms / 2);
    this.show(this.bottom, next);
    this.leafBottom.style.visibility = 'hidden';
    this.char = next;
  }

  // One quick full revolution of the drum, landing back on the same character.
  async spin() {
    if (this.spinning || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.spinning = true;
    for (let i = 0; i < DRUM.length; i++) await this.flipOnce(DRUM[(DRUM.indexOf(this.char) + 1) % DRUM.length], 26);
    while (this.char !== this.target) await this.flipOnce(this.nextOf(this.char), STEP);
    this.spinning = false;
  }

  async set(target: string, delay = 0) {
    target = DRUM.includes(target) ? target : ' ';
    this.target = target;
    if (this.spinning) return; // the running loop picks up the new target
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return this.setNow(target);
    this.spinning = true;
    if (delay) await sleep(delay);
    while (this.char !== this.target) await this.flipOnce(this.nextOf(this.char), STEP);
    this.spinning = false;
  }
}

function pad(width: number, left: string, right = '') {
  return (left + ' '.repeat(width)).slice(0, width - right.length) + right;
}

function time(zone: string | undefined, seconds = false) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    hour12: false,
  }).format(new Date());
}

function dateLine() {
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${parts.weekday} ${parts.day} ${parts.month}`.toUpperCase();
}

export function initFlipboard(root: HTMLElement) {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const board = document.createElement('div');
  board.className = 'board';
  const grid = document.createElement('div');
  grid.className = 'board__grid';
  board.append(grid);
  root.append(board);

  let cols = 0;
  let rows = 0;
  let flaps: Flap[][] = [];
  let byEl = new Map<HTMLElement, Flap>();
  let citySet = 0;
  let scrambleUntil = 0;

  // The text block: one long row per item when there's room, stacked and abbreviated when narrow.
  function lines(): string[] {
    const cities = CITY_SETS[citySet];
    if (cols >= WIDE) {
      return [
        'PRECIOUS THINGS STUDIO',
        '',
        ...cities.map(([name, , zone]) => pad(WIDE, name, time(zone))),
        '',
        pad(WIDE, dateLine(), time(undefined, true)),
      ].map((l) => pad(WIDE, l));
    }
    const w = Math.min(cols, 11);
    return ['PRECIOUS', 'THINGS', 'STUDIO', '', ...cities.map(([, code, zone]) => pad(w, code, time(zone))), '', dateLine(), time(undefined, true)].map((l) =>
      pad(w, l),
    );
  }

  // What every cell should show: the block centred on the board, blank everywhere else.
  function layout() {
    const block = lines();
    const r0 = Math.floor((rows - block.length) / 2);
    const c0 = Math.floor((cols - block[0].length) / 2);
    return { block, r0, c0 };
  }

  // Fill the screen: as many cells as fit, then let the grid stretch them to the edges.
  function build() {
    const w = root.clientWidth;
    const h = root.clientHeight;
    const cellW = Math.max(MIN_CELL, Math.min(MAX_CELL, w / (WIDE + 4)));
    const nextCols = Math.max(1, Math.floor((w + GAP) / (cellW + GAP)));
    const nextRows = Math.max(1, Math.floor((h + GAP) / (cellW / ASPECT + GAP)));
    const cellH = (h - GAP * (nextRows - 1)) / nextRows;
    const realW = (w - GAP * (nextCols - 1)) / nextCols;
    grid.style.setProperty('--font', `${Math.min(realW * 0.98, cellH * 0.72)}px`);
    if (nextCols === cols && nextRows === rows) return false;

    cols = nextCols;
    rows = nextRows;
    grid.style.setProperty('--cols', String(cols));
    grid.style.setProperty('--rows', String(rows));
    grid.replaceChildren();
    flaps = Array.from({ length: rows }, () => Array.from({ length: cols }, () => new Flap(grid)));
    // Darker and lighter cells alternate in blocks, like worn modules on a real board.
    flaps.forEach((row, r) => row.forEach((f, c) => Math.floor(c / 3 + r) % 2 && f.el.classList.add('flap--alt')));
    byEl = new Map(flaps.flat().map((f) => [f.el, f]));
    return true;
  }

  function render(stagger = false) {
    if (Date.now() < scrambleUntil) return;
    const { block, r0, c0 } = layout();
    flaps.forEach((row, r) =>
      row.forEach((flap, c) => {
        const ch = block[r - r0]?.[c - c0] ?? ' ';
        if (flap.char !== ch) flap.set(ch, stagger ? Math.max(0, (c - c0) * 25 + (r - r0) * 60) : 0);
      }),
    );
  }

  function showNow() {
    const { block, r0, c0 } = layout();
    flaps.forEach((row, r) => row.forEach((flap, c) => flap.setNow(block[r - r0]?.[c - c0] ?? ' ')));
  }

  // Hovering a cell kicks it round the drum once.
  grid.addEventListener('pointerover', (e) => {
    const flap = byEl.get((e.target as Element).closest('.flap') as HTMLElement);
    if (flap && Date.now() >= scrambleUntil) flap.spin();
  });

  // Clicking scrambles the text block (plus a margin), then it settles back.
  board.addEventListener('click', () => {
    const { block, r0, c0 } = layout();
    scrambleUntil = Date.now() + 900;
    flaps.forEach((row, r) =>
      row.forEach((f, c) => {
        if (r >= r0 - 1 && r <= r0 + block.length && c >= c0 - 1 && c <= c0 + block[0].length) {
          f.set(DRUM[1 + Math.floor(Math.random() * (DRUM.length - 1))]);
        }
      }),
    );
    setTimeout(() => render(true), 950);
  });

  let tick = 0;
  let rotate = 0;
  let idle = 0;
  let running = false;

  window.addEventListener('resize', () => {
    if (running && build()) showNow();
  });

  return {
    resume() {
      if (running) return;
      running = true;
      build();
      for (const f of flaps.flat()) f.setNow(' ');
      render(true);
      tick = window.setInterval(() => render(), 1000);
      rotate = window.setInterval(() => {
        citySet = (citySet + 1) % CITY_SETS.length;
        render();
      }, CITY_EVERY);
      // Now and then an idle cell somewhere on the board spins, like a board that's alive.
      if (!reducedMotion) {
        idle = window.setInterval(() => {
          const row = flaps[Math.floor(Math.random() * rows)];
          row?.[Math.floor(Math.random() * cols)]?.spin();
        }, 1800);
      }
    },
    pause() {
      running = false;
      clearInterval(tick);
      clearInterval(rotate);
      clearInterval(idle);
    },
  };
}
