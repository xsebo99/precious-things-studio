import * as THREE from 'three';

// Ashima Arts 3D simplex noise (MIT) — drives the organic drift of each particle.
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

const vertexShader = /* glsl */ `
uniform float uTime;
uniform float uMorph;
uniform vec2 uMouse;
uniform float uMouseForce;
uniform float uAspect;
uniform float uPixelRatio;
uniform float uSize;
uniform float uBeam;
uniform float uBeamSpread;

attribute vec3 aFrom;
attribute vec3 aTo;
attribute float aSeed;
attribute vec3 aColor;

varying vec3 vColor;
varying float vAlpha;

${NOISE}

void main() {
  // Stagger the morph per particle so shapes dissolve rather than snap.
  float delay = aSeed * 0.35;
  float t = clamp((uMorph - delay) / (1.0 - 0.35), 0.0, 1.0);
  t = t * t * (3.0 - 2.0 * t);
  vec3 pos = mix(aFrom, aTo, t);

  // Mid-morph scatter: particles bloom outward then settle.
  float bloom = sin(t * 3.14159265);
  pos += normalize(pos + 0.0001) * bloom * 0.35 * aSeed;

  // Organic drift.
  float n1 = snoise(pos * 0.55 + vec3(uTime * 0.12, 0.0, aSeed * 10.0));
  float n2 = snoise(pos * 0.55 + vec3(0.0, uTime * 0.12, aSeed * 20.0 + 3.0));
  float n3 = snoise(pos * 0.55 + vec3(aSeed * 30.0 + 7.0, 0.0, uTime * 0.12));
  pos += vec3(n1, n2, n3) * 0.09;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);

  // Pointer interaction, computed in screen space so it feels direct.
  vec4 clip = projectionMatrix * mv;
  vec2 ndc = clip.xy / clip.w;
  vec2 d = ndc - uMouse;
  d.x *= uAspect;
  float dist = length(d);

  // Light beam: a horizontal band through the centre that lights what it crosses.
  float beam = uBeam * exp(-ndc.y * ndc.y * 45.0)
    * smoothstep(uBeamSpread, uBeamSpread * 0.55, abs(ndc.x));

  float influence = smoothstep(0.14, 0.0, dist) * uMouseForce;
  vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
  // Push outward plus a slight swirl around the cursor.
  vec2 swirl = vec2(-dir.y, dir.x);
  mv.xy += (dir * 0.32 + swirl * 0.1) * influence;
  mv.z += influence * 0.15;

  gl_Position = projectionMatrix * mv;

  float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 40.0);
  gl_PointSize = uSize * uPixelRatio * (0.55 + aSeed * 0.9) * twinkle * (1.0 + beam * 0.9) * (1.0 / max(-mv.z, 2.0));

  vColor = mix(aColor, vec3(1.0, 0.96, 0.9), influence * 0.7);
  vColor = mix(vColor, vec3(1.0, 0.86, 0.66), beam * 0.8) * (1.0 + beam * 0.8);
  vAlpha = (0.55 + 0.45 * twinkle) * smoothstep(20.0, 6.0, -mv.z) * smoothstep(0.8, 2.5, -mv.z) + influence * 0.4 + beam * 0.6;
}
`;

const fragmentShader = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float core = smoothstep(0.5, 0.0, r);
  float glow = pow(core, 2.2);
  gl_FragColor = vec4(vColor * (glow * 1.4), glow * vAlpha);
}
`;

type Shape = (i: number, n: number, rand: () => number) => [number, number, number];

const TAU = Math.PI * 2;

// Fibonacci sphere with a soft shell — the "core".
const sphere: Shape = (i, n, rand) => {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  const radius = 2.1 + (rand() - 0.5) * 0.18;
  return [Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius];
};

// Spiral galaxy.
const galaxy: Shape = (_i, _n, rand) => {
  const arms = 3;
  const arm = Math.floor(rand() * arms);
  const radius = Math.pow(rand(), 0.7) * 3.4;
  const angle = (arm / arms) * TAU + radius * 1.35;
  const spread = 0.35 * (1 - radius / 4.2) + 0.05;
  const g = () => (rand() - 0.5) * 2 * Math.pow(rand(), 2);
  return [
    Math.cos(angle) * radius + g() * spread * 2,
    g() * spread + 0.7,
    Math.sin(angle) * radius + g() * spread * 2,
  ];
};

// (2,3) torus knot.
const knot: Shape = (_i, _n, rand) => {
  const t = rand() * TAU;
  const p = 2, q = 3;
  const r = 1.25 + 0.55 * Math.cos(q * t);
  const cx = r * Math.cos(p * t);
  const cy = 0.55 * Math.sin(q * t) * 1.6;
  const cz = r * Math.sin(p * t);
  const tube = 0.22 * Math.sqrt(rand());
  const a = rand() * TAU;
  const b = rand() * TAU;
  return [cx + Math.cos(a) * Math.sin(b) * tube, cy + Math.cos(b) * tube, cz + Math.sin(a) * Math.sin(b) * tube];
};

// Landscapes are sampled on a disc so they read as floating dioramas while they turn.
const LAND_RADIUS = 3.4;
function discPoint(rand: () => number, radius = LAND_RADIUS): [number, number] {
  const r = radius * Math.sqrt(rand());
  const a = rand() * TAU;
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// Keep sampling until `accept` passes — biases density without extra geometry.
function sampleWhere<T>(rand: () => number, make: () => T, weight: (v: T) => number): T {
  let v = make();
  for (let tries = 0; tries < 24 && rand() > weight(v); tries++) v = make();
  return v;
}

// Mountain range: a few soft peaks with faint ridge lines.
const PEAKS: [number, number, number, number][] = [
  // x, z, height, width
  [0.2, -0.4, 2.2, 0.85],
  [-1.6, 0.3, 1.35, 0.75],
  [1.7, 0.7, 1.45, 0.7],
  [-0.6, 1.6, 0.95, 0.65],
  [1.1, -1.9, 1.0, 0.7],
  [-2.2, -1.4, 0.8, 0.8],
];
function mountainHeight(x: number, z: number) {
  let h = 0;
  for (const [px, pz, ph, pw] of PEAKS) {
    const d = Math.hypot(x - px, z - pz);
    h += ph * Math.exp(-d / (pw * 0.55));
  }
  const ridge = 1 - Math.abs(Math.sin(x * 2.1 + z * 1.3));
  return h + ridge * 0.12 * Math.min(h, 1);
}
const mountains: Shape = (_i, _n, rand) =>
  sampleWhere(
    rand,
    () => {
      const [x, z] = discPoint(rand);
      return [x, mountainHeight(x, z) - 0.05, z] as [number, number, number];
    },
    // Favour the slopes so peaks read clearly against the valley floor.
    ([, y]) => 0.25 + 0.75 * Math.min((y + 0.05) / 1.1, 1),
  );

// Open ocean: layered Gerstner swells with brighter crests.
const SWELLS: [number, number, number, number][] = [
  // direction, wavelength, amplitude, steepness
  [0, 2.4, 0.34, 0.85],
  [0.7, 1.35, 0.15, 0.6],
  [-0.9, 0.8, 0.06, 0.5],
];
const ocean: Shape = (_i, _n, rand) =>
  sampleWhere(
    rand,
    () => {
      const [x0, z0] = discPoint(rand);
      let x = x0, y = 0, z = z0;
      for (const [dir, len, amp, q] of SWELLS) {
        const dx = Math.cos(dir), dz = Math.sin(dir);
        const k = TAU / len;
        const phase = k * (dx * x0 + dz * z0);
        x -= q * amp * dx * Math.sin(phase);
        z -= q * amp * dz * Math.sin(phase);
        y += amp * Math.cos(phase);
      }
      return [x, y + 0.6, z] as [number, number, number];
    },
    ([, y]) => 0.35 + 0.65 * Math.min(Math.max((y - 0.6 + 0.45) / 0.9, 0), 1),
  );

// Forest: tiered conifers on gently rolling ground.
const groundHeight = (x: number, z: number) => 0.18 * Math.sin(x * 0.9) + 0.15 * Math.cos(z * 1.1 + x * 0.3) - 0.1;
const TREES: { x: number; z: number; h: number }[] = (() => {
  const rand = mulberry32(2024);
  const trees: { x: number; z: number; h: number }[] = [];
  for (let attempt = 0; attempt < 400 && trees.length < 26; attempt++) {
    const [x, z] = discPoint(rand, 3.0);
    if (trees.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > 0.7 * 0.7)) {
      trees.push({ x, z, h: 0.8 + rand() * 0.9 });
    }
  }
  return trees;
})();
const TREE_WEIGHTS = (() => {
  let sum = 0;
  return TREES.map((t) => (sum += t.h * t.h));
})();
const forest: Shape = (_i, _n, rand) => {
  const roll = rand();
  if (roll < 0.22) {
    const [x, z] = discPoint(rand);
    return [x, groundHeight(x, z) + (rand() - 0.5) * 0.03, z];
  }
  // Bigger trees get proportionally more particles.
  const pick = rand() * TREE_WEIGHTS[TREE_WEIGHTS.length - 1];
  const tree = TREES[TREE_WEIGHTS.findIndex((w) => w >= pick)];
  const base = groundHeight(tree.x, tree.z);
  const a = rand() * TAU;
  if (roll < 0.26) {
    const y = rand() * tree.h * 0.22;
    return [tree.x + Math.cos(a) * 0.04, base + y, tree.z + Math.sin(a) * 0.04];
  }
  const tier = Math.floor(rand() * 3);
  const bottom = tree.h * (0.18 + tier * 0.24);
  const f = 1 - Math.sqrt(rand()); // even density over the cone surface
  const r = tree.h * 0.32 * (1 - tier * 0.22) * (1 - f) * (0.85 + rand() * 0.15);
  return [tree.x + Math.cos(a) * r, base + bottom + f * tree.h * 0.42, tree.z + Math.sin(a) * r];
};

const SHAPES = [sphere, mountains, galaxy, ocean, forest, knot];

// Pearl, champagne gold, soft lilac, cool silver.
const PALETTE = ['#f4ede4', '#e8c99b', '#b9a7e8', '#9fc2e0', '#ffffff'].map((c) => new THREE.Color(c));

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildShape(index: number, n: number): Float32Array {
  const rand = mulberry32(1000 + index * 7919);
  const out = new Float32Array(n * 3);
  const fn = SHAPES[index];
  for (let i = 0; i < n; i++) {
    const [x, y, z] = fn(i, n, rand);
    out[i * 3] = x;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  return out;
}

export function initParticles(canvas: HTMLCanvasElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
  const COUNT = isSmall ? 8000 : 18000;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const shapes = SHAPES.map((_, i) => buildShape(i, COUNT));

  const seeds = new Float32Array(COUNT);
  const colors = new Float32Array(COUNT * 3);
  const rand = mulberry32(42);
  for (let i = 0; i < COUNT; i++) {
    seeds[i] = rand();
    const c = PALETTE[Math.floor(Math.pow(rand(), 1.6) * PALETTE.length)];
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  // `?shape=N` opens on a specific formation — handy while tweaking shapes.
  const requested = Number(new URLSearchParams(location.search).get('shape'));
  const initial = Number.isInteger(requested) && requested >= 0 && requested < SHAPES.length ? requested : 0;

  const geometry = new THREE.BufferGeometry();
  const from = new Float32Array(shapes[initial]);
  const to = new Float32Array(shapes[initial]);
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(shapes[initial]), 3));
  geometry.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
  geometry.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

  const uniforms = {
    uTime: { value: 0 },
    uMorph: { value: 1 },
    uMouse: { value: new THREE.Vector2(10, 10) },
    uMouseForce: { value: 0 },
    uAspect: { value: 1 },
    uPixelRatio: { value: pixelRatio },
    uSize: { value: isSmall ? 48 : 62 },
    uBeam: { value: 0 },
    uBeamSpread: { value: 0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  // Overall size of the formation.
  points.scale.setScalar(1.6);
  scene.add(points);

  // ---- Morphing ----
  let current = initial;
  let morphStart = -Infinity;
  const MORPH_DURATION = 2.6;
  const AUTO_INTERVAL = 9;
  let lastMorphAt = 0;

  function morphTo(next: number, now: number) {
    // Freeze wherever particles are right now so interruptions stay smooth.
    const m = uniforms.uMorph.value;
    for (let i = 0; i < COUNT; i++) {
      const delay = seeds[i] * 0.35;
      let t = Math.min(Math.max((m - delay) / 0.65, 0), 1);
      t = t * t * (3 - 2 * t);
      for (let k = 0; k < 3; k++) {
        const idx = i * 3 + k;
        from[idx] = from[idx] + (to[idx] - from[idx]) * t;
      }
    }
    to.set(shapes[next]);
    geometry.attributes.aFrom.needsUpdate = true;
    geometry.attributes.aTo.needsUpdate = true;
    current = next;
    morphStart = now;
    lastMorphAt = now;
    uniforms.uMorph.value = 0;
    beamStart = now;
  }

  // ---- Light beam ----
  // Fires with every shape transition (see morphTo); exposes --beam / --beam-spread on <html> for the CSS layers.
  const BEAM_DURATION = 3.6;
  const root = document.documentElement.style;
  let beamStart = -Infinity;

  function updateBeam(now: number) {
    const t = (now - beamStart) / BEAM_DURATION;
    if (t < 0 || t > 1) {
      if (uniforms.uBeam.value !== 0) {
        uniforms.uBeam.value = 0;
        root.setProperty('--beam', '0');
      }
      return;
    }
    // Quick ignition, long soft decay; the beam stretches out from the centre.
    const env = t < 0.12 ? 1 - Math.pow(1 - t / 0.12, 3) : Math.pow(1 - (t - 0.12) / 0.88, 1.8);
    const spread = 1 - Math.pow(1 - Math.min(t / 0.5, 1), 3);
    uniforms.uBeam.value = env;
    uniforms.uBeamSpread.value = spread * 1.25;
    root.setProperty('--beam', env.toFixed(4));
    root.setProperty('--beam-spread', spread.toFixed(4));
  }

  // ---- Pointer ----
  const mouseTarget = new THREE.Vector2(10, 10);
  let pointerActive = false;
  let forceTarget = 0;
  const tilt = new THREE.Vector2();

  function onPointerMove(e: PointerEvent) {
    mouseTarget.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    if (!pointerActive) uniforms.uMouse.value.copy(mouseTarget);
    pointerActive = true;
    forceTarget = 1;
  }
  function onPointerLeave() {
    pointerActive = false;
    forceTarget = 0;
  }
  let clickPulse = 0;
  function onClick(e: MouseEvent) {
    // Clicking a link or button shouldn't also reshape the particles.
    if (paused || (e.target as Element | null)?.closest('a, button')) return;
    clickPulse = 1;
    morphTo((current + 1) % SHAPES.length, clock.elapsed());
  }

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerdown', onPointerMove, { passive: true });
  document.addEventListener('pointerleave', onPointerLeave);
  window.addEventListener('blur', onPointerLeave);
  window.addEventListener('click', onClick);

  // ---- Resize ----
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back on portrait screens so shapes still fit.
    camera.position.z = w / h < 1 ? 8 / Math.max(w / h, 0.55) : 8;
    camera.updateProjectionMatrix();
    uniforms.uAspect.value = w / h;
  }
  resize();
  window.addEventListener('resize', resize);

  // ---- Loop ----
  // Simple pausable clock (seconds).
  let elapsedBefore = 0;
  let startedAt = performance.now();
  const clock = {
    elapsed: () => elapsedBefore + (performance.now() - startedAt) / 1000,
    stop() { elapsedBefore = this.elapsed(); },
    start() { startedAt = performance.now(); },
  };
  const speed = reducedMotion ? 0.3 : 1;
  let raf = 0;
  let running = true;
  let paused = false; // set while another design is showing

  function tick() {
    const now = clock.elapsed();
    uniforms.uTime.value = now * speed;

    if (uniforms.uMorph.value < 1) {
      uniforms.uMorph.value = Math.min((now - morphStart) / MORPH_DURATION, 1);
    }
    if (!reducedMotion && now - lastMorphAt > AUTO_INTERVAL) {
      morphTo((current + 1) % SHAPES.length, now);
    }

    updateBeam(now);

    uniforms.uMouse.value.lerp(mouseTarget, 0.12);
    clickPulse *= 0.93;
    uniforms.uMouseForce.value += (forceTarget + clickPulse * 1.5 - uniforms.uMouseForce.value) * 0.08;

    // Gentle parallax toward the pointer.
    const tx = pointerActive ? mouseTarget.x : 0;
    const ty = pointerActive ? mouseTarget.y : 0;
    tilt.x += (ty * 0.25 - tilt.x) * 0.04;
    tilt.y += (tx * 0.35 - tilt.y) * 0.04;
    points.rotation.x = 0.35 + tilt.x;
    points.rotation.y = now * 0.08 * speed + tilt.y;

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    clock.stop();
  }
  function start() {
    if (running || paused || document.hidden) return;
    running = true;
    clock.start();
    tick();
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));

  tick();
  requestAnimationFrame(() => canvas.classList.add('is-ready'));

  return {
    pause() {
      paused = true;
      stop();
    },
    resume() {
      paused = false;
      start();
    },
  };
}
