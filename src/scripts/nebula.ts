import * as THREE from 'three';

// Nebula Engine: a fully generated, endlessly drifting nebula. The cursor lights and
// stirs the gas; a click fires a bipolar jet of light through the centre.

const fragmentShader = /* glsl */ `
precision highp float;
uniform float uTime;
uniform vec2 uRes;
uniform vec2 uMouse;      // in the same space as uv
uniform float uMouseOn;
uniform float uJet;       // 0..1 intensity envelope
uniform float uJetGrow;   // 0..1 how far the jet has travelled
uniform float uJetAngle;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = r * p * 2.02 + 3.1; a *= 0.5; }
  return v;
}

// Small background stars on a jittered grid.
float starField(vec2 uv, float scale, float density, float t) {
  vec2 g = uv * scale;
  vec2 id = floor(g);
  float h = hash(id);
  if (h < density) return 0.0;
  vec2 pos = vec2(hash(id + 1.7), hash(id + 4.3)) * 0.8 + 0.1;
  float d = length(fract(g) - pos);
  float tw = 0.6 + 0.4 * sin(t * (1.0 + h * 3.0) + h * 50.0);
  return exp(-d * d * 900.0) * tw * (h - density) / (1.0 - density);
}

// Bright stars with Webb's six-point diffraction spikes (plus two short horizontal ones).
vec3 spikeStars(vec2 uv, float t) {
  vec3 col = vec3(0.0);
  float scale = 2.6;
  vec2 base = floor(uv * scale);
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) {
    vec2 id = base + vec2(x, y);
    float h = hash(id + 11.0);
    if (h < 0.72) continue;
    vec2 c = (id + vec2(hash(id + 2.0), hash(id + 5.0)) * 0.8 + 0.1) / scale;
    vec2 v = uv - c;
    float tw = 0.75 + 0.25 * sin(t * (0.8 + h) + h * 30.0);
    float s = 0.0;
    for (int k = 0; k < 3; k++) {
      float a = 1.5708 + float(k) * 1.0472; // 90, 150, 210 degrees
      vec2 rv = mat2(cos(a), -sin(a), sin(a), cos(a)) * v;
      s += exp(-abs(rv.y) * 700.0) * exp(-abs(rv.x) * 15.0);
    }
    s += 0.6 * exp(-abs(v.y) * 900.0) * exp(-abs(v.x) * 28.0);
    float core = exp(-dot(v, v) * 2500.0) + 0.35 * exp(-dot(v, v) * 250.0);
    col += vec3(0.85, 0.92, 1.0) * (s * 0.9 + core) * tw * (h - 0.6) * 2.5;
  }
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;

  // Stir: a soft vortex around the cursor.
  vec2 dm = uv - uMouse;
  float near = exp(-dot(dm, dm) * 7.0) * uMouseOn;
  vec2 q = uv + vec2(-dm.y, dm.x) * near * 0.35;

  // Domain-warped gas.
  vec2 w = vec2(fbm(q * 1.4 + t * 0.03), fbm(q * 1.4 + vec2(5.2, 1.3) - t * 0.025));
  float f = fbm(q * 1.6 + w * 1.3);
  float g = fbm(q * 2.2 - w * 1.1 + vec2(t * 0.02, 0.0));

  // A diagonal glowing lobe through the centre, echoing Herbig-Haro 46/47.
  vec2 r = mat2(0.82, 0.57, -0.57, 0.82) * uv;
  float lobe = exp(-r.y * r.y * 9.0 - r.x * r.x * 1.1);

  vec3 col = vec3(0.008, 0.012, 0.045);
  col += vec3(0.1, 0.28, 0.95) * smoothstep(0.3, 0.9, f);
  col += vec3(1.0, 0.25, 0.45) * smoothstep(0.45, 0.95, g) * (0.5 + lobe * 1.4);
  col += vec3(1.0, 0.6, 0.3) * pow(smoothstep(0.4, 0.95, f * g * 1.8), 2.0) * (0.35 + lobe * 2.4);
  col += vec3(0.5, 0.2, 0.55) * lobe * f * 0.35;

  // Cursor acts as a light source inside the gas.
  float light = exp(-length(dm) * 3.2) * uMouseOn;
  col += col * light * 2.2 + vec3(0.9, 0.55, 0.75) * light * f * 0.12;

  // Jet: thin bright core, widening and fading along its length.
  if (uJet > 0.001) {
    vec2 jv = mat2(cos(uJetAngle), sin(uJetAngle), -sin(uJetAngle), cos(uJetAngle)) * uv;
    float along = abs(jv.x);
    float reach = uJetGrow * 1.6;
    float mask = smoothstep(reach, reach - 0.25, along);
    float width = 0.003 + along * 0.012;
    float beam = exp(-jv.y * jv.y / (width * width)) * mask * exp(-along * 0.8);
    col += (vec3(1.0, 0.85, 0.75) * beam + vec3(1.0, 0.25, 0.3) * beam * 0.6 * (0.5 + f)) * uJet * 1.8;
    col += vec3(1.0, 0.4, 0.45) * exp(-dot(uv, uv) * 30.0) * uJet;
  }

  col += vec3(starField(uv, 90.0, 0.93, t) + starField(uv + 3.7, 45.0, 0.96, t)) * vec3(0.9, 0.95, 1.0);
  col += spikeStars(uv, t);

  col = 1.0 - exp(-col * 1.7);
  col *= 1.0 - 0.35 * dot(uv * 0.8, uv * 0.8);
  gl_FragColor = vec4(col, 1.0);
}
`;

const JET_DURATION = 2.4;

export function initNebula(canvas: HTMLCanvasElement) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const uniforms = {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2() },
    uMouse: { value: new THREE.Vector2(0, 0) },
    uMouseOn: { value: 0 },
    uJet: { value: 0 },
    uJetGrow: { value: 0 },
    uJetAngle: { value: 0.6 },
  };
  scene.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ uniforms, fragmentShader, vertexShader: 'void main(){gl_Position=vec4(position,1.0);}' }),
    ),
  );

  // The shader is heavy, so cap the pixel budget (~1.6 MP) and let CSS upscale.
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio, Math.sqrt(1.6e6 / (w * h)));
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    renderer.getDrawingBufferSize(uniforms.uRes.value);
  }

  const mouseTarget = new THREE.Vector2();
  let mouseOnTarget = 0;
  function toUv(x: number, y: number) {
    const h = window.innerHeight;
    return new THREE.Vector2((x - window.innerWidth / 2) / h, (h / 2 - y) / h);
  }
  window.addEventListener(
    'pointermove',
    (e) => {
      mouseTarget.copy(toUv(e.clientX, e.clientY));
      mouseOnTarget = 1;
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => (mouseOnTarget = 0));

  let jetStart = -Infinity;
  let running = false;
  let raf = 0;
  let last = performance.now();
  let time = 0;

  window.addEventListener('click', (e) => {
    if (!running || (e.target as Element | null)?.closest('a, button')) return;
    jetStart = time;
    uniforms.uJetAngle.value = 0.35 + Math.random() * 0.6;
  });

  function tick(now: number) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    time += dt * (reducedMotion ? 0.3 : 1);
    uniforms.uTime.value = time;
    uniforms.uMouse.value.lerp(mouseTarget, 0.08);
    uniforms.uMouseOn.value += (mouseOnTarget - uniforms.uMouseOn.value) * 0.05;

    const jt = (time - jetStart) / JET_DURATION;
    if (jt >= 0 && jt <= 1) {
      uniforms.uJetGrow.value = 1 - Math.pow(1 - Math.min(jt / 0.45, 1), 3);
      uniforms.uJet.value = jt < 0.1 ? jt / 0.1 : Math.pow(1 - (jt - 0.1) / 0.9, 1.6);
    } else {
      uniforms.uJet.value = 0;
    }

    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', () => running && resize());

  return {
    resume() {
      if (running) return;
      running = true;
      resize();
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },
    pause() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}
