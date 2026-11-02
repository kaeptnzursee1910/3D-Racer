// Fahrzeugdaten und detaillierte, prozedural erzeugte 3D-Modelle.
// Karosserie und Kabine werden aus vielen Querschnitten "geloftet" (gerundete Superellipsen),
// Radhäuser, Kotflügelwölbungen, Glas mit Dachholmen, Innenraum, Lichter, Spoiler und Felgen
// werden je Fahrzeugtyp eigens erzeugt.
import * as THREE from '../vendor/three.module.min.js';
import { makeCanvas, canvasTexture, mergeGeometries, mat4, clamp, lerp } from './utils.js';

// ---------------------------------------------------------------------------
// Fahrzeugliste
// maxSpeed [m/s], accel [m/s²], grip/steer [Faktor], mass [kg], brake [m/s²], offroad: Tempo-Faktor abseits
export const CARS = [
  {
    id: 'falke', name: 'Falke GT', cls: 'Gran Turismo', desc: 'Eleganter Fastback-GT. Ausgewogen in allen Disziplinen – der ideale Einstieg.',
    maxSpeed: 72, accel: 12.6, grip: 1.0, steer: 1.0, mass: 1350, brake: 24, offroad: 0.55, engine: 'v6', drive: 'rwd', wf: 0.52, aero: 1.0, hcg: 0.48, color: '#c81d25',
  },
  {
    id: 'blitz', name: 'Blitz RS', cls: 'Supersportwagen', desc: 'Keilförmiger Mittelmotor-Renner mit gewaltiger Spitze, aber nervösem Heck.',
    maxSpeed: 80, accel: 12.0, grip: 0.92, steer: 0.95, mass: 1280, brake: 23, offroad: 0.5, engine: 'v10', drive: 'rwd', wf: 0.42, aero: 1.3, hcg: 0.44, color: '#f2b705',
  },
  {
    id: 'kobra', name: 'Kobra X', cls: 'Hot Hatch', desc: 'Kompakter Kraftzwerg: brutaler Antritt und wieselflink in engen Kurven.',
    maxSpeed: 69, accel: 15.0, grip: 1.04, steer: 1.12, mass: 1180, brake: 24, offroad: 0.6, engine: 'i4', drive: 'fwd', wf: 0.62, aero: 0.9, hcg: 0.52, color: '#1f6fd6',
  },
  {
    id: 'titan', name: 'Titan V8', cls: 'Muscle-Car', desc: 'Schwerer Achtzylinder: enorme Endgeschwindigkeit, träge in Kurven.',
    maxSpeed: 78, accel: 13.0, grip: 0.86, steer: 0.88, mass: 1680, brake: 21, offroad: 0.55, engine: 'v8', drive: 'rwd', wf: 0.56, aero: 0.8, hcg: 0.55, color: '#202228',
  },
  {
    id: 'libelle', name: 'Libelle', cls: 'Roadster', desc: 'Offener Leichtbau-Roadster mit messerscharfem Handling.',
    maxSpeed: 67, accel: 13.8, grip: 1.17, steer: 1.16, mass: 960, brake: 26, offroad: 0.55, engine: 'i4', drive: 'rwd', wf: 0.5, aero: 0.9, hcg: 0.45, color: '#1fa463',
  },
  {
    id: 'sturm', name: 'Sturm 4x4', cls: 'Rallye-Geländewagen', desc: 'Hochbeiniger Allradler: langsamer auf Asphalt, aber kaum zu bremsen abseits der Piste.',
    maxSpeed: 66, accel: 13.0, grip: 0.97, steer: 0.96, mass: 1720, brake: 22, offroad: 0.92, engine: 'v6', drive: 'awd', wf: 0.55, aero: 0.7, hcg: 0.72, color: '#e86a17',
  },
  {
    id: 'volt', name: 'Volt E', cls: 'Elektro-Hypercar', desc: 'Lautloser Elektro-Bolide mit irrwitziger Beschleunigung und tiefem Schwerpunkt.',
    maxSpeed: 74, accel: 16.6, grip: 1.07, steer: 1.02, mass: 1560, brake: 25, offroad: 0.55, engine: 'electric', drive: 'awd', wf: 0.48, aero: 1.2, hcg: 0.42, color: '#e8ecf2',
  },
  {
    id: 'phantom', name: 'Phantom LMP', cls: 'Le-Mans-Prototyp', desc: 'Prototyp mit maximalem Abtrieb. Gewinne eine Meisterschaft, um ihn freizuschalten.',
    maxSpeed: 84, accel: 14.8, grip: 1.15, steer: 1.05, mass: 1000, brake: 27, offroad: 0.5, engine: 'v10', drive: 'rwd', wf: 0.44, aero: 2.0, hcg: 0.38, color: '#111317', locked: true,
  },
];

export const PAINTS = ['#c81d25', '#f2b705', '#1f6fd6', '#202228', '#1fa463', '#e8ecf2', '#e86a17', '#7b3fe4', '#ff3d8b', '#13b5b1', '#8a96a3', '#6b3b1f', '#0e2a5c', '#b8f000'];
export const LIVERIES = [
  { id: 'plain', name: 'Uni' },
  { id: 'stripes', name: 'Rennstreifen' },
  { id: 'side', name: 'Seitenlinie' },
  { id: 'twotone', name: 'Zweifarbig' },
  { id: 'race', name: 'Rennlackierung' },
];

export function getCarDef(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

export function carStats(def) {
  const n = (v, a, b) => Math.max(0.05, Math.min(1, (v - a) / (b - a)));
  return {
    speed: n(def.maxSpeed, 60, 85),
    accel: n(def.accel, 10, 17),
    handling: n(def.grip * def.steer, 0.7, 1.38),
    weight: n(def.mass, 800, 1800),
    offroad: n(def.offroad, 0.4, 1),
  };
}

// ---------------------------------------------------------------------------
// Formdaten. Längsposition s: 0 = Heck, 1 = Front. Höhen in Metern über Boden.
const SPECS = {
  falke: {
    L: 4.55, W: 1.96, wr: 0.35, tw: 0.27, fw: 1.42, rw: -1.36, archTop: 0.8, n: 4.2, topK: 0.84, botK: 0.88, mid: 0.42,
    top: [[0, 0.56], [0.03, 0.8], [0.1, 0.9], [0.22, 0.93], [0.5, 0.93], [0.72, 0.87], [0.88, 0.76], [0.96, 0.64], [1, 0.5]],
    bot: [[0, 0.36], [0.04, 0.24], [0.5, 0.2], [0.96, 0.22], [1, 0.3]],
    hw: [[0, 0.84], [0.05, 0.96], [0.2, 1.01], [0.5, 0.96], [0.8, 1.0], [0.95, 0.95], [1, 0.82]],
    fender: [[0, 0], [0.12, 0.02], [0.2, 0.05], [0.32, 0.02], [0.6, 0], [0.8, 0.03], [1, 0]],
    cab: { s0: 0.2, s1: 0.73, roof: [[0.2, null], [0.38, 1.27], [0.52, 1.3], [0.6, 1.24], [0.73, null]], wb: 0.9, wt: 0.68, n: 3.4, roofU: [0.3, 0.72], bU: 0.62 },
    head: { type: 'slim', x: 0.62, y: 0.66, w: 0.42, h: 0.1 }, tail: { type: 'bar', y: 0.78, w: 0.46, h: 0.08 },
    spoiler: 'ducktail', exhaust: 'dual', rim: { style: 'star', spokes: 5, color: '#c9ced6' }, caliper: '#d11a1a',
    extras: ['vents'],
  },
  blitz: {
    L: 4.62, W: 2.04, wr: 0.36, tw: 0.3, fw: 1.5, rw: -1.42, archTop: 0.82, n: 5.2, topK: 0.8, botK: 0.86, mid: 0.4,
    top: [[0, 0.64], [0.03, 0.88], [0.12, 0.98], [0.3, 0.99], [0.52, 0.9], [0.68, 0.8], [0.84, 0.68], [0.95, 0.5], [1, 0.36]],
    bot: [[0, 0.32], [0.04, 0.19], [0.96, 0.16], [1, 0.22]],
    hw: [[0, 0.9], [0.06, 1.0], [0.24, 1.02], [0.45, 0.92], [0.75, 0.97], [0.95, 0.92], [1, 0.78]],
    fender: [[0, 0], [0.1, 0.02], [0.2, 0.12], [0.32, 0.06], [0.5, 0], [0.75, 0.04], [0.84, 0.1], [0.94, 0.02], [1, 0]],
    cab: { s0: 0.3, s1: 0.7, roof: [[0.3, null], [0.42, 1.11], [0.53, 1.13], [0.7, null]], wb: 0.86, wt: 0.62, n: 3.2, roofU: [0.25, 0.62], bU: -1 },
    head: { type: 'led', x: 0.6, y: 0.5, w: 0.48, h: 0.06 }, tail: { type: 'bar', y: 0.82, w: 0.9, h: 0.05, full: true },
    spoiler: 'wing', exhaust: 'quad', rim: { style: 'star', spokes: 10, color: '#1b1c20' }, caliper: '#ffcc00',
    extras: ['intakes', 'vents', 'splitter'],
  },
  kobra: {
    L: 4.12, W: 1.86, wr: 0.34, tw: 0.27, fw: 1.3, rw: -1.26, archTop: 0.82, n: 4.6, topK: 0.86, botK: 0.9, mid: 0.42,
    top: [[0, 0.72], [0.025, 0.98], [0.08, 1.02], [0.6, 1.0], [0.76, 0.92], [0.9, 0.82], [0.97, 0.7], [1, 0.54]],
    bot: [[0, 0.4], [0.04, 0.27], [0.96, 0.25], [1, 0.34]],
    hw: [[0, 0.9], [0.05, 0.99], [0.2, 1.03], [0.5, 0.97], [0.8, 1.02], [0.96, 0.95], [1, 0.85]],
    fender: [[0, 0], [0.2, 0.03], [0.5, 0], [0.82, 0.03], [1, 0]],
    cab: { s0: 0.03, s1: 0.74, roof: [[0.03, null], [0.07, 1.4], [0.2, 1.48], [0.5, 1.49], [0.74, null]], wb: 0.92, wt: 0.74, n: 4, roofU: [0.07, 0.62], bU: 0.6 },
    head: { type: 'slim', x: 0.64, y: 0.82, w: 0.4, h: 0.11 }, tail: { type: 'bar', y: 0.95, w: 0.38, h: 0.12 },
    spoiler: 'roof', exhaust: 'center', rim: { style: 'twin', spokes: 6, color: '#4a4f57' }, caliper: '#1f6fd6',
    extras: ['fog'],
  },
  titan: {
    L: 4.85, W: 2.0, wr: 0.38, tw: 0.3, fw: 1.55, rw: -1.5, archTop: 0.9, n: 7, topK: 0.9, botK: 0.92, mid: 0.45,
    top: [[0, 0.62], [0.02, 0.95], [0.1, 1.0], [0.35, 1.02], [0.65, 1.0], [0.96, 0.95], [1, 0.62]],
    bot: [[0, 0.42], [0.03, 0.3], [0.97, 0.28], [1, 0.42]],
    hw: [[0, 0.92], [0.03, 0.98], [0.12, 1.0], [0.2, 1.03], [0.3, 1.0], [0.5, 0.97], [0.8, 1.0], [0.97, 0.98], [1, 0.92]],
    fender: [[0, 0], [0.2, 0.04], [0.5, 0], [0.8, 0.02], [1, 0]],
    cab: { s0: 0.2, s1: 0.62, roof: [[0.2, null], [0.3, 1.35], [0.47, 1.38], [0.62, null]], wb: 0.88, wt: 0.74, n: 5, roofU: [0.2, 0.62], bU: 0.55 },
    head: { type: 'round2', x: 0.66, y: 0.78, r: 0.085 }, tail: { type: 'split', y: 0.82, w: 0.5, h: 0.1 },
    spoiler: 'lip', exhaust: 'dual', rim: { style: 'dish', spokes: 5, color: '#d8dbe0' }, caliper: '#222',
    extras: ['scoop', 'chrome'],
  },
  libelle: {
    L: 4.0, W: 1.8, wr: 0.33, tw: 0.25, fw: 1.3, rw: -1.25, archTop: 0.76, n: 3.2, topK: 0.82, botK: 0.88, mid: 0.42,
    top: [[0, 0.56], [0.04, 0.78], [0.12, 0.85], [0.4, 0.85], [0.55, 0.84], [0.78, 0.79], [0.93, 0.68], [1, 0.48]],
    bot: [[0, 0.34], [0.04, 0.24], [0.96, 0.22], [1, 0.3]],
    hw: [[0, 0.8], [0.06, 0.96], [0.2, 1.0], [0.45, 0.93], [0.75, 1.0], [0.95, 0.92], [1, 0.76]],
    fender: [[0, 0], [0.12, 0.02], [0.2, 0.08], [0.3, 0.01], [0.6, 0], [0.74, 0.03], [0.83, 0.09], [0.93, 0.03], [1, 0]],
    cab: { s0: 0.585, s1: 0.65, roof: [[0.585, null], [0.6, 1.12], [0.612, 1.13], [0.65, null]], wb: 0.86, wt: 0.84, n: 6, roofU: [2, 2], bU: -1, open: true },
    head: { type: 'round', x: 0.6, y: 0.66, r: 0.1 }, tail: { type: 'round', y: 0.74, r: 0.07 },
    spoiler: 'none', exhaust: 'dual', rim: { style: 'mesh', spokes: 12, color: '#d0d4da' }, caliper: '#d11a1a',
    extras: ['hoops'], openTop: true,
  },
  sturm: {
    L: 4.45, W: 1.98, wr: 0.43, tw: 0.33, fw: 1.38, rw: -1.35, archTop: 1.08, n: 6, topK: 0.88, botK: 0.9, mid: 0.45, clearance: true,
    top: [[0, 0.86], [0.02, 1.1], [0.1, 1.15], [0.66, 1.13], [0.8, 1.1], [0.96, 1.04], [1, 0.86]],
    bot: [[0, 0.58], [0.04, 0.47], [0.96, 0.47], [1, 0.58]],
    hw: [[0, 0.92], [0.03, 0.98], [0.13, 1.04], [0.27, 1.0], [0.7, 1.0], [0.8, 1.04], [0.97, 0.98], [1, 0.92]],
    fender: [[0, 0], [1, 0]],
    cab: { s0: 0.05, s1: 0.7, roof: [[0.05, null], [0.08, 1.7], [0.6, 1.72], [0.7, null]], wb: 0.93, wt: 0.82, n: 6, roofU: [0.05, 0.86], bU: 0.55 },
    head: { type: 'round', x: 0.66, y: 0.96, r: 0.1 }, tail: { type: 'split', y: 1.0, w: 0.22, h: 0.18 },
    spoiler: 'none', exhaust: 'dual', rim: { style: 'dish', spokes: 8, color: '#f2f2f2' }, caliper: '#333',
    extras: ['roofbar', 'rack', 'flaps', 'bullbar', 'snorkel'], chunky: true,
  },
  volt: {
    L: 4.75, W: 2.02, wr: 0.36, tw: 0.29, fw: 1.5, rw: -1.45, archTop: 0.8, n: 3.6, topK: 0.82, botK: 0.86, mid: 0.4,
    top: [[0, 0.74], [0.03, 0.92], [0.12, 0.97], [0.3, 0.96], [0.6, 0.9], [0.8, 0.8], [0.94, 0.66], [1, 0.5]],
    bot: [[0, 0.35], [0.04, 0.2], [0.96, 0.18], [1, 0.28]],
    hw: [[0, 0.86], [0.06, 0.98], [0.25, 1.0], [0.5, 0.95], [0.75, 0.99], [0.95, 0.93], [1, 0.8]],
    fender: [[0, 0], [0.2, 0.05], [0.4, 0], [0.82, 0.04], [1, 0]],
    cab: { s0: 0.17, s1: 0.76, roof: [[0.17, null], [0.33, 1.23], [0.55, 1.25], [0.76, null]], wb: 0.9, wt: 0.66, n: 3, roofU: [2, 2], bU: -1, glassRoof: true },
    head: { type: 'ledbar', y: 0.72, w: 1.5, h: 0.035 }, tail: { type: 'bar', y: 0.86, w: 0.9, h: 0.04, full: true },
    spoiler: 'blade', exhaust: 'none', rim: { style: 'aero', spokes: 5, color: '#e6e9ee' }, caliper: '#13b5b1',
    extras: ['splitter'], electric: true,
  },
  phantom: {
    L: 4.95, W: 2.0, wr: 0.36, tw: 0.31, fw: 1.65, rw: -1.55, archTop: 0.78, n: 5, topK: 0.78, botK: 0.86, mid: 0.4,
    top: [[0, 0.82], [0.05, 0.9], [0.2, 0.88], [0.36, 0.78], [0.55, 0.7], [0.75, 0.62], [0.9, 0.5], [1, 0.3]],
    bot: [[0, 0.3], [0.03, 0.13], [0.97, 0.12], [1, 0.18]],
    hw: [[0, 0.92], [0.08, 1.0], [0.9, 1.0], [1, 0.86]],
    fender: [[0, 0], [0.1, 0.08], [0.19, 0.16], [0.3, 0.08], [0.45, 0], [0.7, 0.05], [0.83, 0.24], [0.93, 0.12], [1, 0]],
    cab: { s0: 0.35, s1: 0.69, roof: [[0.35, null], [0.46, 1.1], [0.56, 1.12], [0.69, null]], wb: 0.52, wt: 0.42, n: 2.6, roofU: [2, 2], bU: -1, canopy: true },
    head: { type: 'led', x: 0.7, y: 0.6, w: 0.34, h: 0.05 }, tail: { type: 'bar', y: 0.9, w: 0.9, h: 0.04, full: true },
    spoiler: 'lmp', exhaust: 'center', rim: { style: 'star', spokes: 6, color: '#18191c' }, caliper: '#d11a1a',
    extras: ['fin', 'splitter'],
  },
};

// ---------------------------------------------------------------------------
// Monotone kubische Interpolation (kein Überschwingen)
export function spline(pts) {
  const n = pts.length;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

function prepare(id) {
  const S = SPECS[id];
  const P = { ...S, id };
  P.top = spline(S.top);
  P.bot0 = spline(S.bot);
  P.hw = spline(S.hw);
  P.fend = spline(S.fender);
  P.sOf = (z) => (z + S.L / 2) / S.L;
  P.zOf = (s) => s * S.L - S.L / 2;
  P.sF = P.sOf(S.fw);
  P.sR = P.sOf(S.rw);
  const wheels = [P.sF, P.sR];
  P.bot = (s) => {
    let b = P.bot0(s);
    for (const sw of wheels) {
      const dz = (s - sw) * S.L;
      const Rz = S.wr + 0.13;
      if (Math.abs(dz) < Rz) {
        const top = Math.min(S.archTop, P.top(sw) - 0.06);
        const b0 = P.bot0(sw);
        const ya = b0 + (top - b0) * Math.sqrt(1 - (dz / Rz) ** 2);
        b = Math.max(b, ya);
      }
    }
    return Math.min(b, P.top(s) - 0.05);
  };
  const c = S.cab;
  P.roof = spline(c.roof.map(([s, y]) => [s, y == null ? P.top(s) - 0.02 : y]));
  P.roofMax = Math.max(...c.roof.map(([s, y]) => y || 0));
  return P;
}
const PREP = {};
const getP = (id) => PREP[id] || (PREP[id] = prepare(id));

const se = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

function bodySection(P, s, a, out) {
  const t = P.top(s), b = P.bot(s), w = (P.hw(s) * P.W) / 2;
  const ym = b + (t - b) * P.mid;
  const c = Math.cos(a), sn = Math.sin(a);
  const e = 2 / P.n;
  if (sn >= 0) {
    out[1] = ym + (t - ym) * se(sn, e) + P.fend(s) * Math.pow(Math.abs(c), 1.5) * Math.min(1, sn * 3);
    out[0] = w * se(c, e) * (1 - (1 - P.topK) * sn * sn);
  } else {
    out[1] = ym - (ym - b) * se(-sn, e);
    out[0] = w * se(c, e) * (1 - (1 - P.botK) * sn * sn);
  }
}

function cabinSection(P, s, a, out) {
  const C = P.cab;
  const base = P.top(s) - 0.03;
  const roof = Math.max(base + 0.004, P.roof(s));
  const wb = ((P.hw(s) * P.W) / 2) * C.wb;
  const c = Math.cos(a), sn = Math.sin(a);
  const e = 2 / C.n;
  if (sn >= 0) {
    out[1] = base + (roof - base) * se(sn, e);
    out[0] = se(c, e) * lerp(wb, wb * C.wt, sn);
  } else {
    out[1] = base - 0.1 * se(-sn, e);
    out[0] = se(c, e) * wb;
  }
}

// Allgemeiner Loft: Ringe entlang z, Index-Gitter mit glatten Normalen
function loft(P, stations, ring, sectionFn, caps = true) {
  const R = ring;
  const pos = [], uv = [];
  const tmp = [0, 0];
  for (const s of stations) {
    const z = P.zOf(s);
    for (let j = 0; j <= R; j++) {
      const a = -Math.PI / 2 + (j / R) * Math.PI * 2;
      sectionFn(P, s, a, tmp);
      pos.push(tmp[0], tmp[1], z);
      uv.push(s, j / R);
    }
  }
  const idx = [];
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j, b = a + 1, c = a + R + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  if (caps) {
    for (const [i, front] of [[0, false], [stations.length - 1, true]]) {
      let cx = 0, cy = 0;
      for (let j = 0; j < R; j++) { cx += pos[(i * (R + 1) + j) * 3]; cy += pos[(i * (R + 1) + j) * 3 + 1]; }
      const ci = pos.length / 3;
      pos.push(cx / R, cy / R, P.zOf(stations[i]));
      uv.push(stations[i], 0.5);
      for (let j = 0; j < R; j++) {
        const p = i * (R + 1) + j;
        if (front) idx.push(ci, p, p + 1);
        else idx.push(ci, p + 1, p);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Kabine: Dreiecke nach Material sortieren (Lack, Glas, Zierleisten)
function cabinGeometry(P) {
  const C = P.cab;
  const N = 34, R = 40;
  const stations = [];
  for (let i = 0; i <= N; i++) stations.push(lerp(C.s0, C.s1, i / N));
  const g = loft(P, stations, R, cabinSection, false);
  const idx = g.index.array;
  const groups = { paint: [], glass: [], trim: [] };
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const u = (i + 0.5) / N;
      const a = -Math.PI / 2 + ((j + 0.5) / R) * Math.PI * 2;
      const sn = Math.sin(a);
      let m = 'glass';
      if (sn < 0.1) m = 'trim';
      else if (!C.open && !C.canopy) {
        const roofU = C.roofU;
        if (!C.glassRoof && sn > 0.64 && u > roofU[0] && u < roofU[1]) m = 'paint';
        else if (sn > 0.5 && sn <= 0.68 && (u >= roofU[1] - 0.02 || u <= roofU[0] + 0.02)) m = 'paint';
        else if (C.bU > 0 && Math.abs(u - C.bU) < 0.022 && sn < 0.66) m = 'trim';
        else if (C.glassRoof && sn > 0.5 && sn <= 0.6) m = 'trim';
      } else if (C.canopy && (Math.abs(u - 0.62) < 0.02 || (sn > 0.4 && sn < 0.48))) m = 'trim';
      const k = (i * R + j) * 6;
      for (let q = 0; q < 6; q++) groups[m].push(idx[k + q]);
    }
  }
  const all = [...groups.paint, ...groups.glass, ...groups.trim];
  g.setIndex(all);
  g.clearGroups();
  g.addGroup(0, groups.paint.length, 0);
  g.addGroup(groups.paint.length, groups.glass.length, 1);
  g.addGroup(groups.paint.length + groups.glass.length, groups.trim.length, 2);
  return g;
}

// ---------------------------------------------------------------------------
// Texturen
function carbonTexture() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.fillStyle = '#121316';
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const lit = (x + y) % 2;
      const grd = g.createLinearGradient(x * 8, y * 8, x * 8 + 8, y * 8 + 8);
      grd.addColorStop(0, lit ? '#2a2c31' : '#17181b');
      grd.addColorStop(1, lit ? '#1a1b1f' : '#24262a');
      g.fillStyle = grd;
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = canvasTexture(c);
  t.repeat.set(4, 4);
  t.userData.shared = true;
  return t;
}
function honeycombTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#26282d';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#050506';
  const r = 7;
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 12; x++) {
      const cx = x * r * 1.75 + (y % 2) * r * 0.87, cy = y * r * 1.5;
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        g.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82);
      }
      g.fill();
    }
  const t = canvasTexture(c);
  t.userData.shared = true;
  return t;
}

function hexToRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function shade(h, f) {
  const [r, g, b] = hexToRgb(h);
  const k = (x) => Math.max(0, Math.min(255, Math.round(f < 1 ? x * f : x + (255 - x) * (f - 1))));
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}
function contrastColor(h) {
  const [r, g, b] = hexToRgb(h);
  return r * 0.3 + g * 0.59 + b * 0.11 > 140 ? '#111318' : '#f4f5f7';
}

export function liveryTexture(id, color, livery = 'plain', number = 7) {
  const P = getP(id);
  const W = 1024, H = 512;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const Y = (v) => (1 - v) * H;
  const X = (s) => s * W;
  const acc = contrastColor(color);
  g.fillStyle = color;
  g.fillRect(0, 0, W, H);
  // leichte Verlaufsschattierung (Lackfarbe dunkler zum Schweller hin)
  for (const [v0, v1] of [[0.08, 0.26], [0.74, 0.92]]) {
    const grd = g.createLinearGradient(0, Y(v0), 0, Y(v1));
    const dark = v0 < 0.5 ? 0 : 1;
    grd.addColorStop(dark, 'rgba(0,0,0,0.22)');
    grd.addColorStop(1 - dark, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, Math.min(Y(v0), Y(v1)), W, Math.abs(Y(v0) - Y(v1)));
  }
  if (livery === 'twotone') {
    g.fillStyle = shade(color, 0.35);
    g.fillRect(0, Y(0.2), W, Y(0.07) - Y(0.2));
    g.fillRect(0, Y(0.93), W, Y(0.8) - Y(0.93));
    g.fillStyle = acc;
    g.fillRect(0, Y(0.205), W, 3);
    g.fillRect(0, Y(0.795) - 3, W, 3);
  }
  if (livery === 'stripes' || livery === 'race') {
    g.fillStyle = livery === 'race' ? shade(color, 0.3) : acc;
    g.fillRect(0, Y(0.545), W, Y(0.515) - Y(0.545));
    g.fillRect(0, Y(0.485), W, Y(0.455) - Y(0.485));
  }
  if (livery === 'side' || livery === 'race') {
    g.fillStyle = livery === 'race' ? acc : shade(color, 0.4);
    const s0 = X(0.06), s1 = X(0.96);
    g.fillRect(s0, Y(0.205), s1 - s0, 10);
    g.fillRect(s0, Y(0.795) - 10, s1 - s0, 10);
    if (livery === 'race') {
      g.fillStyle = shade(color, 0.3);
      g.beginPath();
      g.moveTo(X(0.5), Y(0.12)); g.lineTo(X(0.98), Y(0.12)); g.lineTo(X(0.98), Y(0.2)); g.lineTo(X(0.62), Y(0.2)); g.fill();
      g.beginPath();
      g.moveTo(X(0.5), Y(0.88)); g.lineTo(X(0.98), Y(0.88)); g.lineTo(X(0.98), Y(0.8)); g.lineTo(X(0.62), Y(0.8)); g.fill();
    }
  }
  // Unterboden / Radhäuser / Schweller
  g.fillStyle = '#0b0b0d';
  g.fillRect(0, Y(0.07), W, H - Y(0.07));
  g.fillRect(0, 0, W, Y(0.93));
  g.fillStyle = '#1b1c20';
  g.fillRect(0, Y(0.105), W, Y(0.07) - Y(0.105));
  g.fillRect(0, Y(0.93), W, Y(0.895) - Y(0.93));
  // Spaltmaße: Türen, Haube, Heckklappe
  const C = P.cab;
  const d0 = clamp(C.open ? 0.4 : C.s0 + 0.06, 0.25, 0.6), d1 = clamp(C.open ? 0.6 : Math.min(C.s1 - 0.05, P.sF - 0.12), d0 + 0.12, 0.72);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  for (const [va, vb] of [[0.11, 0.34], [0.66, 0.89]]) {
    for (const s of [d0, d1]) {
      g.beginPath();
      g.moveTo(X(s), Y(va));
      g.lineTo(X(s + 0.01), Y(vb));
      g.stroke();
    }
    // Türgriff
    g.fillStyle = 'rgba(0,0,0,0.45)';
    const vh = va < 0.5 ? 0.31 : 0.69;
    g.fillRect(X(d0 + 0.02), Y(vh) - 3, X(0.045), 6);
  }
  if (!C.open) {
    for (const s of [Math.min(0.97, C.s1 + 0.035), Math.max(0.03, C.s0 - 0.03)]) {
      g.beginPath();
      g.moveTo(X(s), Y(0.37));
      g.lineTo(X(s), Y(0.63));
      g.stroke();
    }
  }
  // Startnummern
  if (livery === 'race' || livery === 'stripes') {
    const num = String(number);
    const sc = (d0 + d1) / 2;
    const r = 36;
    const roundel = (x, y, flipX, flipY) => {
      g.save();
      g.translate(x, y);
      g.scale((flipX ? -1 : 1) * 1.9, flipY ? -1 : 1);
      g.fillStyle = '#f7f7f7';
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 4;
      g.strokeStyle = '#111';
      g.stroke();
      g.fillStyle = '#111';
      g.font = 'italic 900 54px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(num, 0, 3);
      g.restore();
    };
    if (livery === 'race') {
      roundel(X(sc), Y(0.26), true, false);
      roundel(X(sc), Y(0.74), false, true);
      // Sponsor-Schriftzüge
      g.save();
      g.fillStyle = acc;
      g.font = 'italic 900 26px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.translate(X(0.82), Y(0.16));
      g.scale(-1, 1);
      g.fillText('VELOX', 0, 0);
      g.restore();
      g.save();
      g.fillStyle = acc;
      g.font = 'italic 900 26px Arial Black, Arial, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.translate(X(0.82), Y(0.84));
      g.scale(1, -1);
      g.fillText('VELOX', 0, 0);
      g.restore();
    }
  }
  const t = canvasTexture(c, { repeat: false });
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// Räder
const wheelCache = new Map();
function wheelGeometries(P, side) {
  const key = P.id + side;
  if (wheelCache.has(key)) return wheelCache.get(key);
  const wr = P.wr, tw = P.tw;
  const rr = wr * (P.chunky ? 0.6 : 0.68);
  // Reifen als Drehkörper mit gerundeter Flanke
  const prof = [];
  const rIn = rr * 0.98, r1 = wr - 0.035;
  const hw = tw / 2;
  prof.push(new THREE.Vector2(rIn, -hw * 0.92));
  prof.push(new THREE.Vector2(r1 - 0.02, -hw));
  for (let k = 0; k <= 6; k++) {
    const a = -Math.PI / 2 + (k / 6) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r1 + Math.cos(a) * 0.035, -hw + 0.035 + Math.sin(a) * 0.035));
  }
  for (let k = 0; k <= 6; k++) {
    const a = (k / 6) * (Math.PI / 2);
    prof.push(new THREE.Vector2(r1 + Math.cos(a) * 0.035, hw - 0.035 + Math.sin(a) * 0.035));
  }
  prof.push(new THREE.Vector2(r1 - 0.02, hw));
  prof.push(new THREE.Vector2(rIn, hw * 0.92));
  const tire = new THREE.LatheGeometry(prof, 28);
  tire.rotateZ(Math.PI / 2);
  // Stollen beim Geländewagen
  const tireParts = [{ geo: tire, color: '#111113' }];
  if (P.chunky) {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      tireParts.push({ geo: new THREE.BoxGeometry(tw * 0.42, 0.05, 0.07), matrix: mat4((k % 2 ? 1 : -1) * tw * 0.22, Math.cos(a) * (wr - 0.005), Math.sin(a) * (wr - 0.005), a), color: '#151517' });
    }
  }
  // Schriftzug-Ring auf der Flanke
  tireParts.push({ geo: new THREE.TorusGeometry(wr * 0.84, 0.006, 4, 40).rotateY(Math.PI / 2), matrix: mat4(side * hw * 1.0, 0, 0), color: '#3a3a3e' });
  const tireGeo = mergeGeometries(tireParts);

  const rc = P.rim.color;
  const face = side * hw * 0.62;
  const parts = [];
  const barrel = new THREE.CylinderGeometry(rr, rr, tw * 0.86, 28, 1, true).rotateZ(Math.PI / 2);
  parts.push({ geo: barrel, color: shade(rc, 0.55) });
  parts.push({ geo: new THREE.TorusGeometry(rr * 0.98, 0.014, 6, 36).rotateY(Math.PI / 2), matrix: mat4(face, 0, 0), color: rc });
  const st = P.rim.style, ns = P.rim.spokes;
  if (st === 'dish' || st === 'aero') {
    parts.push({ geo: new THREE.CylinderGeometry(rr * 0.95, rr * 0.95, 0.03, 28).rotateZ(Math.PI / 2), matrix: mat4(face - side * 0.01, 0, 0), color: rc });
    if (st === 'dish') {
      for (let k = 0; k < ns; k++) {
        const a = (k / ns) * Math.PI * 2;
        parts.push({ geo: new THREE.CylinderGeometry(rr * 0.17, rr * 0.17, 0.035, 12).rotateZ(Math.PI / 2), matrix: mat4(face + side * 0.002, Math.cos(a) * rr * 0.6, Math.sin(a) * rr * 0.6), color: '#0c0c0e' });
      }
    } else {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        parts.push({ geo: new THREE.BoxGeometry(0.012, rr * 0.55, 0.012), matrix: mat4(face + side * 0.016, Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, a + 0.5), color: shade(rc, 0.6) });
      }
    }
  } else {
    const count = st === 'mesh' ? ns : ns;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const len = rr * 0.86;
      if (st === 'twin') {
        for (const off of [-0.07, 0.07]) {
          parts.push({ geo: new THREE.BoxGeometry(0.035, len, 0.03), matrix: mat4(face, Math.cos(a + off) * len * 0.55, Math.sin(a + off) * len * 0.55, a + off), color: rc });
        }
      } else if (st === 'mesh') {
        for (const tw2 of [-0.35, 0.35]) {
          parts.push({ geo: new THREE.BoxGeometry(0.02, len, 0.018), matrix: mat4(face, Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55, a + tw2), color: rc });
        }
      } else {
        const wdt = ns >= 10 ? 0.028 : 0.055;
        parts.push({ geo: new THREE.BoxGeometry(0.04, len, wdt), matrix: mat4(face, Math.cos(a) * len * 0.55, Math.sin(a) * len * 0.55, a), color: rc });
      }
    }
  }
  // Nabe, Muttern, Zentralverschluss
  parts.push({ geo: new THREE.CylinderGeometry(rr * 0.24, rr * 0.27, 0.06, 16).rotateZ(Math.PI / 2), matrix: mat4(face, 0, 0), color: rc });
  parts.push({ geo: new THREE.CylinderGeometry(rr * 0.1, rr * 0.1, 0.07, 10).rotateZ(Math.PI / 2), matrix: mat4(face + side * 0.01, 0, 0), color: '#e8e8ea' });
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    parts.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6).rotateZ(Math.PI / 2), matrix: mat4(face + side * 0.005, Math.cos(a) * rr * 0.17, Math.sin(a) * rr * 0.17), color: '#9da2aa' });
  }
  const rimGeo = mergeGeometries(parts);

  // Bremse (dreht nicht mit)
  const bparts = [
    { geo: new THREE.CylinderGeometry(rr * 0.82, rr * 0.82, 0.026, 28).rotateZ(Math.PI / 2), matrix: mat4(side * 0.0, 0, 0), color: '#7d8087' },
    { geo: new THREE.CylinderGeometry(rr * 0.3, rr * 0.3, 0.03, 16).rotateZ(Math.PI / 2), matrix: mat4(side * 0.003, 0, 0), color: '#3a3c40' },
    { geo: new THREE.BoxGeometry(0.07, rr * 0.5, 0.14), matrix: mat4(side * 0.03, rr * 0.55, -rr * 0.38, -0.6), color: P.caliper },
  ];
  const brakeGeo = mergeGeometries(bparts);
  const res = { tireGeo, rimGeo, brakeGeo };
  wheelCache.set(key, res);
  return res;
}

// ---------------------------------------------------------------------------
const shared = {};
function sharedMats() {
  if (shared.tire) return shared;
  shared.tire = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  shared.rim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.9, side: THREE.DoubleSide });
  shared.brake = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.7 });
  shared.carbon = new THREE.MeshStandardMaterial({ color: '#ffffff', map: carbonTexture(), roughness: 0.35, metalness: 0.4 });
  shared.trim = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.5 });
  shared.glass = new THREE.MeshStandardMaterial({ color: '#0a1018', roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.62, envMapIntensity: 1.6 });
  shared.windowTrim = new THREE.MeshStandardMaterial({ color: '#0c0d10', roughness: 0.4, metalness: 0.4 });
  shared.chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, metalness: 1 });
  shared.head = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#fff4dc', emissiveIntensity: 2.2, roughness: 0.1 });
  shared.interior = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1 });
  shared.grille = new THREE.MeshStandardMaterial({ map: honeycombTexture(), roughness: 0.5, metalness: 0.4 });
  for (const k in shared) shared[k].userData.shared = true;
  return shared;
}

// Strahl auf die Karosserie: liefert Punkt + Normale
function hitBody(mesh, origin, dir) {
  const rc = new THREE.Raycaster(origin, dir.clone().normalize(), 0, 10);
  const h = rc.intersectObject(mesh, false)[0];
  if (!h) return null;
  const n = h.face.normal.clone();
  return { p: h.point, n };
}

function orient(n) {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
}

function placeOn(list, geo, hit, offset, color, extraRot) {
  if (!hit) return;
  const q = orient(hit.n);
  if (extraRot) q.multiply(extraRot);
  const m = new THREE.Matrix4().compose(hit.p.clone().addScaledVector(hit.n, offset), q, new THREE.Vector3(1, 1, 1));
  list.push({ geo, matrix: m, color });
}

// Statische Detailteile je Fahrzeugtyp (gecacht)
const detailCache = new Map();
function detailGeometries(P, bodyMesh) {
  if (detailCache.has(P.id)) return detailCache.get(P.id);
  const L = P.L, W = P.W, hL = L / 2;
  const trim = [], chrome = [], head = [], tail = [], interior = [], carbon = [];
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // --- Scheinwerfer ---
  const H = P.head;
  const sFront = 0.985;
  if (H.type === 'ledbar') {
    const hit = hitBody(bodyMesh, V(0, H.y, hL + 1), V(0, -0.15, -1));
    const g = new THREE.BoxGeometry(H.w, H.h, 0.03);
    placeOn(head, g, hit, 0.008, '#dff8ff');
    for (const sx of [-1, 1]) {
      const h2 = hitBody(bodyMesh, V(sx * W * 0.36, H.y - 0.05, hL + 1), V(0, -0.15, -1));
      placeOn(trim, new THREE.BoxGeometry(0.34, 0.11, 0.03), h2, 0.004, '#0d0f12');
      placeOn(head, new THREE.BoxGeometry(0.22, 0.03, 0.02), h2, 0.02, '#ffffff');
    }
  } else {
    for (const sx of [-1, 1]) {
      const x = sx * H.x * W * 0.5;
      const hit = hitBody(bodyMesh, V(x, H.y, hL + 1), V(0, -0.12, -1));
      if (H.type === 'round' || H.type === 'round2') {
        const xs = H.type === 'round2' ? [x - sx * 0.12, x + sx * 0.08] : [x];
        for (const xx of xs) {
          const h2 = hitBody(bodyMesh, V(xx, H.y, hL + 1), V(0, -0.12, -1));
          placeOn(chrome, new THREE.TorusGeometry(H.r, 0.014, 6, 20), h2, 0.01, '#e0e0e0');
          placeOn(trim, new THREE.CylinderGeometry(H.r, H.r, 0.06, 20).rotateX(Math.PI / 2), h2, -0.01, '#0e0f12');
          placeOn(head, new THREE.SphereGeometry(H.r * 0.88, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).scale(1, 1, 0.35), h2, 0.0, '#fffaf0');
        }
      } else {
        const wdt = H.w, hh = H.h;
        placeOn(trim, new THREE.BoxGeometry(wdt + 0.04, hh + 0.04, 0.05), hit, -0.005, '#0e1013');
        const lens = new THREE.CapsuleGeometry(hh / 2, wdt - hh, 4, 10).rotateZ(Math.PI / 2).scale(1, 1, 0.3);
        placeOn(head, lens, hit, 0.012, '#fffaf0');
        // Tagfahrlicht-Streifen
        placeOn(head, new THREE.BoxGeometry(wdt * 0.9, 0.012, 0.012), hit && { p: hit.p.clone().add(V(0, -hh * 0.75, 0)), n: hit.n }, 0.02, '#dff3ff');
      }
    }
  }
  // Grill + Frontsplitter
  {
    const by = P.bot(sFront);
    const hit = hitBody(bodyMesh, V(0, by + 0.14, hL + 1), V(0, 0, -1));
    if (hit) {
      const gg = new THREE.PlaneGeometry(W * (P.id === 'titan' ? 0.7 : 0.48), P.id === 'titan' ? 0.2 : 0.13);
      detailGrille = { geo: gg, matrix: new THREE.Matrix4().compose(hit.p.clone().addScaledVector(hit.n, 0.012), orient(hit.n), V(1, 1, 1)) };
    }
    if (P.extras.includes('splitter') || P.id === 'falke' || P.id === 'kobra') {
      carbon.push({ geo: new THREE.BoxGeometry(W * 0.86, 0.03, 0.22), matrix: mat4(0, P.bot0(0.99) + 0.01, hL - 0.05) });
    }
  }
  // Nebelscheinwerfer
  if (P.extras.includes('fog')) {
    for (const sx of [-1, 1]) {
      const hit = hitBody(bodyMesh, V(sx * W * 0.34, P.bot(0.99) + 0.12, hL + 1), V(0, 0, -1));
      placeOn(head, new THREE.CylinderGeometry(0.05, 0.05, 0.03, 14).rotateX(Math.PI / 2), hit, 0.01, '#fff6d8');
    }
  }

  // --- Rückleuchten ---
  const T = P.tail;
  if (T.full) {
    const hit = hitBody(bodyMesh, V(0, T.y, -hL - 1), V(0, -0.1, 1));
    placeOn(tail, new THREE.BoxGeometry(W * T.w, T.h, 0.03), hit, 0.006, '#b0000a');
  } else {
    for (const sx of [-1, 1]) {
      const x = sx * W * 0.32;
      const hit = hitBody(bodyMesh, V(x, T.y, -hL - 1), V(0, -0.1, 1));
      if (T.type === 'round') {
        for (const xx of [x, x - sx * 0.17]) {
          const h2 = hitBody(bodyMesh, V(xx, T.y, -hL - 1), V(0, -0.1, 1));
          placeOn(tail, new THREE.CylinderGeometry(T.r, T.r, 0.03, 16).rotateX(Math.PI / 2), h2, 0.008, '#b0000a');
          placeOn(chrome, new THREE.TorusGeometry(T.r, 0.01, 6, 16), h2, 0.01, '#d8d8d8');
        }
      } else {
        placeOn(trim, new THREE.BoxGeometry(T.w + 0.03, T.h + 0.03, 0.04), hit, -0.004, '#120708');
        placeOn(tail, new THREE.BoxGeometry(T.w, T.h, 0.03), hit, 0.008, '#b0000a');
        if (T.type === 'split') placeOn(head, new THREE.BoxGeometry(T.w * 0.3, T.h * 0.5, 0.03), hit, 0.012, '#ffffff');
      }
    }
  }
  // Heckdiffusor
  {
    const y0 = P.bot0(0.01);
    carbon.push({ geo: new THREE.BoxGeometry(W * 0.74, 0.1, 0.36), matrix: mat4(0, y0 + 0.02, -hL + 0.16) });
    for (let k = -3; k <= 3; k++) carbon.push({ geo: new THREE.BoxGeometry(0.015, 0.09, 0.3), matrix: mat4(k * W * 0.1, y0 + 0.05, -hL + 0.12) });
  }
  // Auspuff
  const exh = [];
  const ey = P.bot0(0.01) + 0.07;
  const ex = { dual: [-0.55, 0.55], quad: [-0.16, -0.05, 0.05, 0.16], center: [-0.08, 0.08], none: [] }[P.exhaust] || [];
  const ew = P.exhaust === 'quad' ? 0.045 : 0.055;
  for (const x of ex) {
    const xx = Math.abs(x) > 0.3 ? x * W * 0.5 : x * W;
    chrome.push({ geo: new THREE.CylinderGeometry(ew, ew, 0.2, 14, 1, true).rotateX(Math.PI / 2), matrix: mat4(xx, ey, -hL + 0.02), color: '#cfd2d6' });
    trim.push({ geo: new THREE.CylinderGeometry(ew * 0.82, ew * 0.82, 0.02, 12).rotateX(Math.PI / 2), matrix: mat4(xx, ey, -hL + 0.06), color: '#050505' });
    exh.push(V(xx, ey, -hL - 0.08));
  }
  // Außenspiegel
  const C = P.cab;
  if (!C.open && !C.canopy) {
    const sm = Math.min(C.s1 - 0.07, 0.95);
    const zz = P.zOf(sm), yy = P.top(sm) + 0.05;
    const bx = ((P.hw(sm) * W) / 2) * P.topK;
    for (const sx of [-1, 1]) {
      trim.push({ geo: new THREE.BoxGeometry(0.13, 0.025, 0.05), matrix: mat4(sx * (bx + 0.02), yy, zz), color: '#121316' });
      detailMirrors.push({ geo: new THREE.SphereGeometry(0.085, 14, 8).scale(1.05, 0.62, 0.55), matrix: mat4(sx * (bx + 0.1), yy + 0.03, zz - 0.02) });
      trim.push({ geo: new THREE.BoxGeometry(0.012, 0.07, 0.11), matrix: mat4(sx * (bx + 0.1), yy + 0.03, zz - 0.06), color: '#2a3340' });
    }
  }
  // Spoiler / Flügel
  const rearTop = P.top(0.04);
  if (P.spoiler === 'wing' || P.spoiler === 'lmp' || P.spoiler === 'blade') {
    const chord = P.spoiler === 'lmp' ? 0.42 : P.spoiler === 'blade' ? 0.22 : 0.34;
    const span = W * (P.spoiler === 'lmp' ? 1.0 : P.spoiler === 'blade' ? 0.86 : 0.92);
    const h = P.spoiler === 'lmp' ? 0.38 : P.spoiler === 'blade' ? 0.06 : 0.3;
    const sh = new THREE.Shape();
    sh.moveTo(0, 0);
    sh.quadraticCurveTo(chord * 0.4, 0.05, chord, 0.012);
    sh.lineTo(chord, -0.004);
    sh.quadraticCurveTo(chord * 0.45, 0.012, 0, -0.012);
    const wing = new THREE.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 8 });
    wing.translate(-chord / 2, 0, -span / 2);
    wing.rotateY(Math.PI / 2);
    const wz = -hL + 0.25;
    const target = P.spoiler === 'blade' ? trimPaint : carbon;
    target.push({ geo: wing, matrix: mat4(0, rearTop + h, wz, -0.1) });
    if (P.spoiler !== 'blade') {
      for (const sx of [-1, 1]) {
        carbon.push({ geo: new THREE.BoxGeometry(0.02, 0.24, chord + 0.12), matrix: mat4(sx * span / 2, rearTop + h + 0.02, wz) });
        carbon.push({ geo: new THREE.BoxGeometry(0.03, h + 0.04, 0.12), matrix: mat4(sx * span * 0.28, rearTop + h / 2, wz + 0.03) });
      }
    }
  } else if (P.spoiler === 'ducktail' || P.spoiler === 'lip') {
    trimPaint.push({ geo: new THREE.BoxGeometry(W * 0.82, 0.05, P.spoiler === 'lip' ? 0.14 : 0.24), matrix: mat4(0, P.top(0.03) + 0.02, -hL + 0.14, -0.2) });
  } else if (P.spoiler === 'roof') {
    const s = C.s0 + 0.02;
    trimPaint.push({ geo: new THREE.BoxGeometry(W * 0.74, 0.04, 0.3), matrix: mat4(0, P.roof(C.s0 + 0.06) + 0.03, P.zOf(s) - 0.05, -0.12) });
  }
  // Extras
  if (P.extras.includes('fin')) {
    const fs = new THREE.Shape();
    fs.moveTo(-0.75, 0); fs.lineTo(0.75, 0); fs.lineTo(-0.35, 0.36); fs.lineTo(-0.75, 0.36);
    const fin = new THREE.ExtrudeGeometry(fs, { depth: 0.025, bevelEnabled: false });
    fin.translate(0, 0, -0.0125);
    fin.rotateY(-Math.PI / 2);
    trimPaint.push({ geo: fin, matrix: mat4(0, P.top(0.3) - 0.04, P.zOf(0.22)) });
  }
  if (P.extras.includes('scoop')) {
    const sc = new THREE.Shape();
    sc.moveTo(-0.38, 0); sc.lineTo(0.38, 0); sc.lineTo(0.38, 0.03); sc.lineTo(-0.2, 0.09); sc.lineTo(-0.38, 0.09);
    const scoop = new THREE.ExtrudeGeometry(sc, { depth: 0.5, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
    scoop.translate(0, 0, -0.25);
    scoop.rotateY(-Math.PI / 2);
    trimPaint.push({ geo: scoop, matrix: mat4(0, P.top(0.86) - 0.03, P.zOf(0.86)) });
    trim.push({ geo: new THREE.BoxGeometry(0.42, 0.06, 0.02), matrix: mat4(0, P.top(0.86) + 0.03, P.zOf(0.86) + 0.21), color: '#050506' });
  }
  if (P.extras.includes('vents')) {
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      const hit = hitBody(bodyMesh, V(sx * W * 0.22, P.top(0.86) + 1, P.zOf(0.86) - k * 0.07), V(0, -1, 0));
      placeOn(trim, new THREE.BoxGeometry(0.3, 0.025, 0.01), hit, 0.002, '#060607');
    }
  }
  if (P.extras.includes('intakes')) {
    for (const sx of [-1, 1]) {
      const hit = hitBody(bodyMesh, V(sx * (W + 1), 0.55, P.zOf(0.33)), V(-sx, 0, 0));
      placeOn(trim, new THREE.BoxGeometry(0.5, 0.2, 0.04), hit, 0.0, '#060607');
      placeOn(carbon, new THREE.BoxGeometry(0.52, 0.03, 0.06), hit && { p: hit.p.clone().add(V(0, 0.11, 0)), n: hit.n }, 0.01);
    }
  }
  if (P.extras.includes('hoops')) {
    for (const sx of [-0.36, 0.36]) chrome.push({ geo: new THREE.TorusGeometry(0.2, 0.025, 8, 16, Math.PI), matrix: mat4(sx, P.top(0.45), P.zOf(0.45)), color: '#d8d8da' });
  }
  if (P.extras.includes('roofbar')) {
    const y = P.roofMax + 0.06, z = P.zOf(C.s1 - 0.12);
    trim.push({ geo: new THREE.BoxGeometry(W * 0.75, 0.12, 0.16), matrix: mat4(0, y + 0.05, z), color: '#101114' });
    for (let k = 0; k < 4; k++) head.push({ geo: new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14).rotateX(Math.PI / 2), matrix: mat4((k - 1.5) * 0.3, y + 0.05, z + 0.08), color: '#fff6dc' });
  }
  if (P.extras.includes('rack')) {
    const y = P.roofMax + 0.04;
    for (const sx of [-1, 1]) trim.push({ geo: new THREE.BoxGeometry(0.04, 0.04, 1.6), matrix: mat4(sx * W * 0.38, y, P.zOf(0.35)), color: '#1a1b1e' });
    for (let k = 0; k < 4; k++) trim.push({ geo: new THREE.BoxGeometry(W * 0.76, 0.03, 0.04), matrix: mat4(0, y + 0.02, P.zOf(0.12 + k * 0.12)), color: '#1a1b1e' });
  }
  if (P.extras.includes('flaps')) {
    for (const sw of [P.sF - 0.075, P.sR - 0.075]) for (const sx of [-1, 1]) trim.push({ geo: new THREE.BoxGeometry(0.3, 0.32, 0.015), matrix: mat4(sx * (W / 2 - 0.2), P.bot0(sw) + 0.02, P.zOf(sw)), color: '#0c0c0e' });
  }
  if (P.extras.includes('bullbar')) {
    const z = hL + 0.12, y0 = P.bot0(0.99);
    for (const sx of [-1, 1]) chrome.push({ geo: new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), matrix: mat4(sx * 0.42, y0 + 0.3, z), color: '#202125' });
    chrome.push({ geo: new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8).rotateZ(Math.PI / 2), matrix: mat4(0, y0 + 0.56, z), color: '#202125' });
    chrome.push({ geo: new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8).rotateZ(Math.PI / 2), matrix: mat4(0, y0 + 0.2, z), color: '#202125' });
  }
  if (P.extras.includes('snorkel')) {
    const z = P.zOf(C.s1 - 0.04);
    trim.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, P.roofMax - P.top(0.8), 10), matrix: mat4(W / 2 - 0.02, (P.roofMax + P.top(0.8)) / 2, z), color: '#121316' });
    trim.push({ geo: new THREE.BoxGeometry(0.12, 0.1, 0.18), matrix: mat4(W / 2 - 0.02, P.roofMax, z + 0.04), color: '#121316' });
  }
  if (P.extras.includes('chrome')) {
    for (const sx of [-1, 1]) chrome.push({ geo: new THREE.BoxGeometry(0.02, 0.02, L * 0.62), matrix: mat4(sx * (W / 2 + 0.002), P.top(0.5) - 0.12, 0), color: '#e8e8ea' });
  }
  // Seitenschweller
  for (const sx of [-1, 1]) {
    const z0 = P.zOf(P.sR + 0.1), z1 = P.zOf(P.sF - 0.1);
    const y = P.bot0(0.5) + 0.02;
    carbon.push({ geo: new THREE.BoxGeometry(0.05, 0.04, z1 - z0), matrix: mat4(sx * ((P.hw(0.5) * W) / 2 - 0.1), y, (z0 + z1) / 2) });
  }

  // --- Innenraum + Fahrer ---
  {
    const sD = C.open ? 0.47 : lerp(C.s0, C.s1, C.canopy ? 0.42 : 0.45);
    const zD = P.zOf(sD);
    const roofH = C.open ? 1.28 : P.roof(sD) - 0.05;
    const headC = roofH - 0.15;
    const seatY = Math.max(P.bot0(0.5) + 0.12, headC - 0.78);
    const xD = C.canopy ? 0 : 0.36;
    const seatsX = C.canopy ? [0] : [xD, -xD];
    for (const x of seatsX) {
      interior.push({ geo: new THREE.BoxGeometry(0.46, 0.12, 0.5), matrix: mat4(x, seatY + 0.06, zD + 0.1), color: '#1c1d22' });
      interior.push({ geo: new THREE.BoxGeometry(0.46, 0.62, 0.12), matrix: mat4(x, seatY + 0.36, zD - 0.16, -0.18), color: '#1f2026' });
      interior.push({ geo: new THREE.BoxGeometry(0.06, 0.5, 0.1), matrix: mat4(x - 0.21, seatY + 0.36, zD - 0.12, -0.18), color: '#b3121c' });
      interior.push({ geo: new THREE.BoxGeometry(0.06, 0.5, 0.1), matrix: mat4(x + 0.21, seatY + 0.36, zD - 0.12, -0.18), color: '#b3121c' });
    }
    // Armaturenbrett + Lenkrad
    const zDash = zD + 0.62;
    interior.push({ geo: new THREE.BoxGeometry(C.canopy ? 0.6 : W * 0.78, 0.16, 0.34), matrix: mat4(0, seatY + 0.44, zDash), color: '#16171b' });
    interior.push({ geo: new THREE.TorusGeometry(0.15, 0.022, 6, 18), matrix: mat4(xD, seatY + 0.5, zDash - 0.22, -0.35), color: '#0e0e10' });
    interior.push({ geo: new THREE.BoxGeometry(0.2, 0.06, 0.02), matrix: mat4(xD, seatY + 0.58, zDash - 0.16, -0.35), color: '#3fa9ff' });
    // Fahrer: Oberkörper, Arme, Helm mit Visier
    interior.push({ geo: new THREE.BoxGeometry(0.4, 0.5, 0.24), matrix: mat4(xD, seatY + 0.42, zD - 0.02, -0.15), color: '#1e3a8a' });
    for (const sx of [-1, 1]) interior.push({ geo: new THREE.BoxGeometry(0.08, 0.08, 0.42), matrix: mat4(xD + sx * 0.17, seatY + 0.5, zD + 0.2, -0.25), color: '#1e3a8a' });
    interior.push({ geo: new THREE.SphereGeometry(0.135, 16, 12), matrix: mat4(xD, headC, zD + 0.02), color: '#f2f2f2' });
    interior.push({ geo: new THREE.SphereGeometry(0.137, 16, 8, -0.9, 1.8, 1.1, 0.75), matrix: mat4(xD, headC, zD + 0.02), color: '#0a0d14' });
  }

  const res = {
    trim: trim.length ? mergeGeometries(trim) : null,
    chrome: chrome.length ? mergeGeometries(chrome) : null,
    head: head.length ? mergeGeometries(head) : null,
    tail: tail.length ? mergeGeometries(tail) : null,
    interior: mergeGeometries(interior),
    carbon: carbon.length ? mergeGeometries(carbon) : null,
    paintParts: trimPaint.length ? mergeGeometries(trimPaint) : null,
    mirrors: detailMirrors.length ? mergeGeometries(detailMirrors) : null,
    grille: detailGrille,
    exhausts: exh,
  };
  trimPaint.length = 0;
  detailMirrors.length = 0;
  detailGrille = null;
  detailCache.set(P.id, res);
  return res;
}
// Zwischenspeicher während detailGeometries (lackierte Anbauteile, Spiegel, Grill)
const trimPaint = [];
const detailMirrors = [];
let detailGrille = null;

const bodyCache = new Map();
function bodyGeometries(P) {
  if (bodyCache.has(P.id)) return bodyCache.get(P.id);
  const st = [];
  const N = 84;
  for (let i = 0; i <= N; i++) st.push(i / N);
  const body = loft(P, st, 48, bodySection, true);
  const cabin = cabinGeometry(P);
  const res = { body, cabin };
  bodyCache.set(P.id, res);
  return res;
}

// ---------------------------------------------------------------------------
export function buildCarModel(def, color, opts = {}) {
  const P = getP(def.shape || def.id);
  const M = sharedMats();
  const livery = opts.livery || 'plain';
  const map = liveryTexture(P.id, color, livery, opts.number ?? 7);
  const paint = opts.physical
    ? new THREE.MeshPhysicalMaterial({ map, metalness: 0.62, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.2, normalMap: flakeTexture(), normalScale: new THREE.Vector2(0.09, 0.09) })
    : new THREE.MeshStandardMaterial({ map, metalness: 0.6, roughness: 0.28, envMapIntensity: 1.1 });
  const blurMat = new THREE.MeshBasicMaterial({ map: wheelBlurTexture(), transparent: true, opacity: 0, depthWrite: false, color: P.rim.color });
  const plainPaint = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
  const tailMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: '#e00008', emissiveIntensity: 0.7, roughness: 0.2 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const { body: bodyGeo, cabin: cabinGeo } = bodyGeometries(P);
  const bodyMesh = new THREE.Mesh(bodyGeo, paint);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  body.add(bodyMesh);
  bodyMesh.updateMatrixWorld(true);
  const D = detailGeometries(P, bodyMesh);

  const cabinMats = [paint, M.glass, M.windowTrim];
  if (P.cab.glassRoof) cabinMats[0] = M.glass;
  const cab = new THREE.Mesh(cabinGeo, cabinMats);
  cab.castShadow = true;
  cab.renderOrder = 2;
  body.add(cab);

  const add = (geo, mat, shadow = true) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    body.add(m);
    return m;
  };
  add(D.interior, M.interior, false);
  add(D.trim, M.trim);
  add(D.chrome, M.chrome);
  add(D.carbon, M.carbon);
  add(D.head, M.head, false);
  add(D.tail, tailMat, false);
  add(D.paintParts, plainPaint);
  add(D.mirrors, plainPaint);
  if (D.grille) {
    const g = new THREE.Mesh(D.grille.geo, M.grille);
    g.applyMatrix4(D.grille.matrix);
    body.add(g);
  }

  // Räder
  const wheels = [];
  for (const [z, front] of [[P.fw, true], [P.rw, false]]) {
    for (const sx of [-1, 1]) {
      const wg = wheelGeometries(P, sx);
      const pivot = new THREE.Group();
      pivot.position.set(sx * (P.W / 2 - P.tw / 2 - 0.04), P.wr, z);
      const spin = new THREE.Group();
      pivot.add(spin);
      const t = new THREE.Mesh(wg.tireGeo, M.tire);
      t.castShadow = true;
      spin.add(t);
      spin.add(new THREE.Mesh(wg.rimGeo, M.rim));
      // Bewegungsunschärfe der Felge bei hohem Tempo
      const blur = new THREE.Mesh(new THREE.CircleGeometry(P.wr * 0.7, 24).rotateY(sx * Math.PI / 2), blurMat);
      blur.position.x = sx * (P.tw * 0.36);
      blur.renderOrder = 3;
      pivot.add(blur);
      pivot.add(new THREE.Mesh(wg.brakeGeo, M.brake));
      root.add(pivot);
      wheels.push({ pivot, spin, front, side: sx, z });
    }
  }

  // Schattenfleck (für Qualitätsstufe ohne Echtzeitschatten und als Kontaktschatten)
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(P.W * 1.3, P.L * 1.12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: opts.shadowStrong ? 0.8 : 0.5, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  );
  sh.position.y = 0.04;
  sh.renderOrder = 1;
  root.add(sh);

  return {
    root, body, wheels, paint, tail: tailMat, exhausts: D.exhausts, blurMat, glassMat: M.glass,
    dims: { L: P.L, W: P.W, wr: P.wr, fw: P.fw, rw: P.rw, roof: P.roofMax },
    dispose() {
      map.dispose();
      paint.dispose();
      plainPaint.dispose();
      tailMat.dispose();
      blurMat.dispose();
      sh.geometry.dispose();
      sh.material.dispose();
    },
  };
}

let shadowTex = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = makeCanvas(64, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 64, 6, 32, 64, 62);
  grd.addColorStop(0, 'rgba(0,0,0,0.8)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 128);
  shadowTex = canvasTexture(c, { repeat: false, srgb: false });
  shadowTex.userData.shared = true;
  return shadowTex;
}

// feine Normal-Störung für Metallic-Flakes unter dem Klarlack
let flakeTex = null;
function flakeTexture() {
  if (flakeTex) return flakeTex;
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.6;
    img.data[i * 4] = 128 + Math.cos(a) * r * 127;
    img.data[i * 4 + 1] = 128 + Math.sin(a) * r * 127;
    img.data[i * 4 + 2] = 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  flakeTex = canvasTexture(c, { srgb: false });
  flakeTex.repeat.set(48, 24);
  flakeTex.userData.shared = true;
  return flakeTex;
}

// radial verwischte Felge (für hohe Raddrehzahl)
let blurTex = null;
function wheelBlurTexture() {
  if (blurTex) return blurTex;
  const S = 128;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grd.addColorStop(0, 'rgba(230,230,235,0.95)');
  grd.addColorStop(0.25, 'rgba(120,120,128,0.85)');
  grd.addColorStop(0.7, 'rgba(200,200,206,0.7)');
  grd.addColorStop(0.92, 'rgba(90,90,96,0.8)');
  grd.addColorStop(1, 'rgba(90,90,96,0)');
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 64, 0, Math.PI * 2);
  g.fill();
  blurTex = canvasTexture(c, { repeat: false });
  blurTex.userData.shared = true;
  return blurTex;
}
