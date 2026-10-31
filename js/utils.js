import * as THREE from '../vendor/three.module.min.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const damp = (cur, target, lambda, dt) => lerp(cur, target, 1 - Math.exp(-lambda * dt));
export const sign = (v) => (v < 0 ? -1 : 1);

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function dampAngle(cur, target, lambda, dt) {
  return cur + wrapAngle(target - cur) * (1 - Math.exp(-lambda * dt));
}

// Deterministischer Zufallsgenerator
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Wert-Rauschen (2D) mit fbm
export class Noise2D {
  constructor(seed = 1) {
    const r = rng(seed);
    this.p = new Uint8Array(512);
    this.v = new Float32Array(256);
    const perm = [];
    for (let i = 0; i < 256; i++) {
      perm.push(i);
      this.v[i] = r();
    }
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [perm[i], perm[j]] = [perm[j], perm[i]];
    }
    for (let i = 0; i < 512; i++) this.p[i] = perm[i & 255];
  }
  noise(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), w = yf * yf * (3 - 2 * yf);
    const p = this.p, v = this.v;
    const X = xi & 255, Y = yi & 255;
    const a = v[p[p[X] + Y]], b = v[p[p[X + 1] + Y]];
    const c = v[p[p[X] + Y + 1]], d = v[p[p[X + 1] + Y + 1]];
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  }
  fbm(x, y, oct = 4) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise(x * f, y * f);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }
}

export function formatTime(t) {
  if (t == null || !isFinite(t)) return '--:--.---';
  const neg = t < 0;
  t = Math.abs(t);
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const ms = Math.floor((t * 1000) % 1000);
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

export function formatDelta(d) {
  if (d == null || !isFinite(d)) return '';
  const s = d >= 0 ? '+' : '−';
  return `${s}${Math.abs(d).toFixed(2)}`;
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function canvasTexture(canvas, { repeat = true, srgb = true, aniso = 1 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Fügt mehrere Geometrien zu einer nicht-indizierten zusammen. Jedes Teil kann
// eine eigene Farbe (Vertex-Farbe) und Transformation bekommen.
export function mergeGeometries(parts) {
  let count = 0;
  const prepared = parts.map(({ geo, matrix, color }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    count += g.attributes.position.count;
    return { g, color: color ? new THREE.Color(color) : null };
  });
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const { g, color } of prepared) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    const c = color || new THREE.Color(1, 1, 1);
    const ca = g.attributes.color;
    for (let i = 0; i < n; i++) {
      if (ca && !color) {
        col[(o + i) * 3] = ca.getX(i);
        col[(o + i) * 3 + 1] = ca.getY(i);
        col[(o + i) * 3 + 2] = ca.getZ(i);
      } else {
        col[(o + i) * 3] = c.r;
        col[(o + i) * 3 + 1] = c.g;
        col[(o + i) * 3 + 2] = c.b;
      }
    }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

export function mat4(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
    new THREE.Vector3(sx, sy, sz)
  );
  return m;
}

// Weiche, runde Partikeltextur
let _softTex = null;
export function softParticleTexture() {
  if (_softTex) return _softTex;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _softTex = canvasTexture(c, { repeat: false, srgb: false });
  _softTex.userData.shared = true;
  return _softTex;
}

export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        for (const k in m) {
          const v = m[k];
          if (v && v.isTexture && !v.userData.shared) v.dispose();
        }
        m.dispose();
      }
    }
  });
}

export const isTouchDevice = () =>
  'ontouchstart' in window || (navigator.maxTouchPoints || 0) > 0;
