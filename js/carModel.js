// Fahrzeugdaten und prozedurale 3D-Modelle
import * as THREE from '../vendor/three.module.min.js';
import { makeCanvas, canvasTexture } from './utils.js';

export const CARS = [
  {
    id: 'falke', name: 'Falke GT', desc: 'Ausgewogener Sportwagen – der ideale Einstieg.',
    maxSpeed: 72, accel: 12.5, grip: 1.0, steer: 1.0, mass: 1300, brake: 24, shape: 'gt', color: '#d42a2a',
  },
  {
    id: 'blitz', name: 'Blitz RS', desc: 'Keilförmiger Hochgeschwindigkeitsjäger mit wenig Abtrieb.',
    maxSpeed: 79, accel: 11.6, grip: 0.9, steer: 0.95, mass: 1250, brake: 23, shape: 'wedge', color: '#f2c230',
  },
  {
    id: 'kobra', name: 'Kobra X', desc: 'Kompakter Kraftprotz mit brutaler Beschleunigung.',
    maxSpeed: 70, accel: 14.8, grip: 1.02, steer: 1.08, mass: 1150, brake: 24, shape: 'hatch', color: '#2a8cf2',
  },
  {
    id: 'titan', name: 'Titan V8', desc: 'Schweres Muscle-Car: enorme Spitze, träge in Kurven.',
    maxSpeed: 77, accel: 12.9, grip: 0.86, steer: 0.88, mass: 1650, brake: 21, shape: 'muscle', color: '#26262c',
  },
  {
    id: 'libelle', name: 'Libelle', desc: 'Federleichter Roadster mit messerscharfem Handling.',
    maxSpeed: 67, accel: 13.6, grip: 1.16, steer: 1.15, mass: 950, brake: 26, shape: 'roadster', color: '#2fbf71',
  },
  {
    id: 'phantom', name: 'Phantom LMP', desc: 'Le-Mans-Prototyp mit maximalem Abtrieb. Gewinne die Meisterschaft, um ihn freizuschalten.',
    maxSpeed: 83, accel: 14.6, grip: 1.14, steer: 1.05, mass: 1000, brake: 27, shape: 'proto', color: '#e8e8ee', locked: true,
  },
];

export const PAINTS = ['#d42a2a', '#f2c230', '#2a8cf2', '#26262c', '#2fbf71', '#e8e8ee', '#ff7a1a', '#8e44ff', '#ff3d9a', '#1fd1c9', '#7a8794', '#6b3b1f'];

export function getCarDef(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

export function carStats(def) {
  const n = (v, a, b) => Math.max(0.05, Math.min(1, (v - a) / (b - a)));
  return {
    speed: n(def.maxSpeed, 60, 85),
    accel: n(def.accel, 10, 15.5),
    handling: n(def.grip * def.steer, 0.7, 1.35),
    weight: n(def.mass, 800, 1750),
  };
}

const SHAPES = {
  gt: {
    L: 4.5, W: 1.95, yb: 0.25, fw: 1.4, rw: -1.38, wr: 0.36,
    top: [[2.25, 0.45], [2.2, 0.62], [1.5, 0.84], [0.95, 0.92], [-1.3, 0.95], [-2.05, 0.92], [-2.25, 0.75], [-2.25, 0.4]],
    cabin: [[-1.35, 0.9], [-0.7, 1.3], [0.3, 1.3], [1.0, 0.9]], spoiler: 'wing',
  },
  wedge: {
    L: 4.6, W: 2.0, yb: 0.22, fw: 1.45, rw: -1.42, wr: 0.36,
    top: [[2.3, 0.35], [2.25, 0.5], [1.45, 0.83], [1.1, 0.86], [-1.3, 0.9], [-2.2, 0.95], [-2.3, 0.75], [-2.3, 0.38]],
    cabin: [[-1.25, 0.86], [-0.6, 1.16], [0.15, 1.16], [1.15, 0.84]], spoiler: 'wing',
  },
  hatch: {
    L: 4.0, W: 1.85, yb: 0.28, fw: 1.28, rw: -1.25, wr: 0.34,
    top: [[2.0, 0.5], [1.95, 0.72], [1.3, 0.9], [0.85, 1.0], [-1.7, 1.02], [-2.0, 0.98], [-2.0, 0.45]],
    cabin: [[-1.95, 0.98], [-1.75, 1.45], [0.1, 1.5], [0.85, 0.98]], spoiler: 'roof',
  },
  muscle: {
    L: 4.8, W: 2.0, yb: 0.28, fw: 1.55, rw: -1.5, wr: 0.38,
    top: [[2.4, 0.5], [2.38, 0.82], [1.6, 0.93], [0.85, 1.0], [-1.2, 1.02], [-2.3, 1.0], [-2.4, 0.9], [-2.4, 0.45]],
    cabin: [[-1.2, 1.0], [-0.55, 1.38], [0.25, 1.38], [0.85, 1.0]], spoiler: 'lip', scoop: true,
  },
  roadster: {
    L: 4.0, W: 1.8, yb: 0.25, fw: 1.3, rw: -1.25, wr: 0.33,
    top: [[2.0, 0.42], [1.95, 0.6], [1.3, 0.8], [0.4, 0.86], [-1.5, 0.88], [-1.95, 0.86], [-2.0, 0.45]],
    cabin: [[0.12, 0.85], [0.02, 1.14], [0.12, 1.14], [0.48, 0.85]], open: true,
  },
  proto: {
    L: 4.9, W: 2.0, yb: 0.15, fw: 1.62, rw: -1.55, wr: 0.36,
    top: [[2.45, 0.3], [2.35, 0.5], [1.6, 0.84], [1.15, 0.8], [-1.6, 0.88], [-2.4, 0.92], [-2.45, 0.6], [-2.45, 0.3]],
    cabin: [[-0.6, 0.8], [-0.15, 1.1], [0.45, 1.1], [1.15, 0.78]], spoiler: 'big', fin: true,
  },
};

function topAt(top, x) {
  for (let i = 0; i < top.length - 1; i++) {
    const [x0, y0] = top[i], [x1, y1] = top[i + 1];
    if ((x <= x0 && x >= x1) || (x >= x0 && x <= x1)) {
      const t = (x - x0) / (x1 - x0 || 1);
      return y0 + (y1 - y0) * t;
    }
  }
  return 1;
}

function extrudeSide(shape, width, bevel = 0.06) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 10,
  });
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

const geoCache = new Map();
function shapeGeometries(id) {
  if (geoCache.has(id)) return geoCache.get(id);
  const S = SHAPES[id];
  const hL = S.L / 2;
  const s = new THREE.Shape();
  const top = S.top;
  const aRf = Math.min(S.wr + 0.06, topAt(top, S.fw) - S.wr - 0.05);
  const aRr = Math.min(S.wr + 0.06, topAt(top, S.rw) - S.wr - 0.05);
  const last = top[top.length - 1];
  s.moveTo(last[0], last[1]);
  s.lineTo(-hL + 0.08, S.yb);
  s.lineTo(S.rw - aRr, S.yb);
  s.absarc(S.rw, S.wr, aRr, Math.PI, 0, true);
  s.lineTo(S.rw + aRr, S.yb);
  s.lineTo(S.fw - aRf, S.yb);
  s.absarc(S.fw, S.wr, aRf, Math.PI, 0, true);
  s.lineTo(S.fw + aRf, S.yb);
  s.lineTo(hL - 0.1, S.yb);
  for (let i = 0; i < top.length - 1; i++) s.lineTo(top[i][0], top[i][1]);
  const body = extrudeSide(s, S.W, 0.09);

  const c = S.cabin;
  const cs = new THREE.Shape();
  cs.moveTo(c[0][0], c[0][1] - 0.04);
  cs.lineTo(c[3][0], c[3][1] - 0.04);
  cs.lineTo(c[2][0], c[2][1]);
  cs.lineTo(c[1][0], c[1][1]);
  cs.lineTo(c[0][0], c[0][1] - 0.04);
  const cabinW = S.open ? S.W * 0.8 : S.W * 0.8;
  const cabin = S.open ? extrudeSide(cs, S.W * 0.78, 0.02) : extrudeSide(cs, cabinW, 0.07);
  const res = { body, cabin, S, cabinW };
  geoCache.set(id, res);
  return res;
}

let shadowTex = null;
function blobShadowTexture() {
  if (shadowTex) return shadowTex;
  const c = makeCanvas(64, 128);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 64, 4, 32, 64, 60);
  grd.addColorStop(0, 'rgba(0,0,0,0.75)');
  grd.addColorStop(0.6, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.save();
  g.scale(1, 1);
  g.fillRect(0, 0, 64, 128);
  g.restore();
  shadowTex = canvasTexture(c, { repeat: false, srgb: false });
  shadowTex.userData.shared = true;
  return shadowTex;
}

const shared = {};
function sharedMats() {
  if (shared.tire) return shared;
  shared.tire = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.92, metalness: 0 });
  shared.rim = new THREE.MeshStandardMaterial({ color: '#c8ccd4', roughness: 0.25, metalness: 0.95 });
  shared.dark = new THREE.MeshStandardMaterial({ color: '#16171a', roughness: 0.6, metalness: 0.3 });
  shared.glass = new THREE.MeshStandardMaterial({ color: '#0a0f16', roughness: 0.06, metalness: 0.9 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: '#dddddd', roughness: 0.15, metalness: 1 });
  shared.head = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff3d1', emissiveIntensity: 1.4 });
  return shared;
}

export function buildCarModel(def, color, opts = {}) {
  const { body: bodyGeo, cabin: cabinGeo, S, cabinW } = shapeGeometries(def.shape);
  const M = sharedMats();
  const paint = opts.physical
    ? new THREE.MeshPhysicalMaterial({ color, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 })
    : new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 });
  const accentColor = opts.accent || null;
  const tail = new THREE.MeshStandardMaterial({ color: '#330000', emissive: '#ff1a1a', emissiveIntensity: 0.6 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hL = S.L / 2;

  const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  add(bodyGeo, paint);
  const cabin = add(cabinGeo, M.glass, 0, -0.01, 0);
  const c = S.cabin;
  if (!S.open) {
    const roofLen = c[2][0] - c[1][0] + 0.12;
    const roof = add(new THREE.BoxGeometry(cabinW - 0.06, 0.06, roofLen), accentColor ? new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.5, roughness: 0.3 }) : paint, 0, c[1][1] + 0.01, (c[2][0] + c[1][0]) / 2);
    roof.castShadow = true;
  } else {
    // offener Roadster: Sitze und Überrollbügel
    for (const sx of [-0.42, 0.42]) {
      add(new THREE.BoxGeometry(0.5, 0.55, 0.15), M.dark, sx, 0.95, -0.55);
      add(new THREE.BoxGeometry(0.5, 0.12, 0.55), M.dark, sx, 0.72, -0.25);
      const hoop = add(new THREE.TorusGeometry(0.22, 0.04, 6, 12, Math.PI), M.chrome, sx, 1.08, -0.7);
      hoop.rotation.y = 0;
    }
    add(new THREE.BoxGeometry(S.W * 0.62, 0.08, 0.45), M.dark, 0, 0.84, 0.15);
  }

  // Lichter
  const fy = S.top[1][1] - 0.09;
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.42, 0.11, 0.06), M.head, sx * (S.W / 2 - 0.36), fy, hL - 0.02);
    const ry = S.top[S.top.length - 2][1] - 0.12;
    add(new THREE.BoxGeometry(0.5, 0.11, 0.06), tail, sx * (S.W / 2 - 0.36), ry, -hL + 0.02);
  }
  // Grill
  add(new THREE.BoxGeometry(S.W * 0.48, 0.14, 0.05), M.dark, 0, S.yb + 0.16, hL - 0.04);
  // Diffusor
  add(new THREE.BoxGeometry(S.W * 0.7, 0.1, 0.3), M.dark, 0, S.yb + 0.04, -hL + 0.2);
  // Auspuff
  const exhausts = [];
  for (const sx of [-0.42, 0.42]) {
    const e = add(new THREE.CylinderGeometry(0.065, 0.065, 0.22, 10), M.chrome, sx, S.yb + 0.1, -hL + 0.02);
    e.rotation.x = Math.PI / 2;
    exhausts.push(new THREE.Vector3(sx, S.yb + 0.1, -hL - 0.1));
  }
  // Spiegel
  for (const sx of [-1, 1]) {
    if (S.open) break;
    add(new THREE.BoxGeometry(0.16, 0.1, 0.18), paint, sx * (cabinW / 2 + 0.1), c[3][1] + 0.08, c[3][0] - 0.2);
  }
  // Spoiler
  const rearTop = topAt(S.top, -hL + 0.3);
  if (S.spoiler === 'wing' || S.spoiler === 'big') {
    const hgt = S.spoiler === 'big' ? 0.5 : 0.28;
    const wing = add(new THREE.BoxGeometry(S.W * (S.spoiler === 'big' ? 1.0 : 0.88), 0.05, 0.38), accentColor ? new THREE.MeshStandardMaterial({ color: accentColor }) : M.dark, 0, rearTop + hgt, -hL + 0.28);
    wing.rotation.x = -0.12;
    for (const sx of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.05, hgt, 0.14), M.dark, sx, rearTop + hgt / 2, -hL + 0.3);
    if (S.spoiler === 'big') for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.3, 0.5), M.dark, sx * S.W * 0.5, rearTop + hgt, -hL + 0.28);
  } else if (S.spoiler === 'roof') {
    add(new THREE.BoxGeometry(cabinW * 0.95, 0.05, 0.28), paint, 0, c[1][1] + 0.03, c[1][0] - 0.06);
  } else if (S.spoiler === 'lip') {
    add(new THREE.BoxGeometry(S.W * 0.8, 0.07, 0.12), M.dark, 0, rearTop + 0.04, -hL + 0.1);
  }
  if (S.fin) add(new THREE.BoxGeometry(0.04, 0.32, 1.4), paint, 0, topAt(S.top, -1.2) + 0.15, -1.3);
  if (S.scoop) add(new THREE.BoxGeometry(0.6, 0.12, 0.8), M.dark, 0, topAt(S.top, 1.2) + 0.05, 1.2);

  // Räder
  const wheels = [];
  const tireGeo = new THREE.CylinderGeometry(S.wr, S.wr, 0.3, 20).rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(S.wr * 0.62, S.wr * 0.62, 0.315, 14).rotateZ(Math.PI / 2);
  const spokeGeo = new THREE.BoxGeometry(0.33, S.wr * 1.1, 0.07);
  for (const [z, front] of [[S.fw, true], [S.rw, false]]) {
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * (S.W / 2 - 0.2), S.wr, z);
      const spin = new THREE.Group();
      pivot.add(spin);
      const t = new THREE.Mesh(tireGeo, M.tire);
      t.castShadow = true;
      spin.add(t);
      spin.add(new THREE.Mesh(rimGeo, M.rim));
      for (let k = 0; k < 3; k++) {
        const sp = new THREE.Mesh(spokeGeo, M.rim);
        sp.rotation.x = (k * Math.PI) / 3;
        spin.add(sp);
      }
      root.add(pivot);
      wheels.push({ pivot, spin, front, side: sx, z });
    }
  }

  // Schattenfleck
  const sh = new THREE.Mesh(
    new THREE.PlaneGeometry(S.W * 1.25, S.L * 1.12).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false, opacity: opts.shadowStrong ? 0.85 : 0.55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })
  );
  sh.position.y = 0.04;
  sh.renderOrder = 1;
  root.add(sh);

  return { root, body, wheels, paint, tail, exhausts, dims: { L: S.L, W: S.W, wr: S.wr, fw: S.fw, rw: S.rw }, cabin };
}
