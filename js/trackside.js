// Streckendetails: Reifenstapel, Kiesbetten, Fangzäune, Bremspunkt-Tafeln, Boxengasse,
// Brücken, Tunnel, Lawinengalerie, Felsbögen, Hochstraße, Skilift, Gras …
import * as THREE from '../vendor/three.module.min.js';
import { mergeGeometries, mat4, rng, makeCanvas, canvasTexture, clamp, Noise2D } from './utils.js';
import * as TX from './textures.js';

// ---------------------------------------------------------------------------
// Texturen
function gravelTexture() {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#b9a98a';
  g.fillRect(0, 0, 128, 128);
  const r = rng(12);
  for (let i = 0; i < 1600; i++) {
    const v = 130 + r() * 90;
    g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.78})`;
    g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2);
  }
  return canvasTexture(c);
}
function fenceTexture() {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(200,205,210,1)';
  g.lineWidth = 2;
  for (let k = -64; k < 128; k += 16) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke();
    g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke();
  }
  const t = canvasTexture(c);
  return t;
}
function boardTexture(text) {
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#111';
  g.lineWidth = 8;
  g.strokeRect(4, 4, 120, 120);
  g.fillStyle = '#111';
  g.font = '900 54px Arial Black, Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 64, 68);
  return canvasTexture(c, { repeat: false });
}
function garageTexture(night) {
  const W = 1024, H = 256;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#d9dde3';
  g.fillRect(0, 0, W, H);
  const teams = ['#c81d25', '#1f6fd6', '#f2b705', '#1fa463', '#7b3fe4', '#e86a17', '#13b5b1', '#202228'];
  const r = rng(3);
  for (let i = 0; i < 8; i++) {
    const x = i * 128 + 10;
    const col = teams[i];
    g.fillStyle = col;
    g.fillRect(x - 6, 20, 120, 36);
    g.fillStyle = '#fff';
    g.font = 'italic 900 22px Arial Black, Arial';
    g.textAlign = 'center';
    g.fillText(['FALKE', 'AZUR', 'SOL', 'VERDE', 'NOVA', 'BRAND', 'AQUA', 'NOIR'][i], x + 54, 46);
    const open = r() < 0.6;
    if (open) {
      const grd = g.createLinearGradient(0, 70, 0, 250);
      grd.addColorStop(0, night ? '#fff3cf' : '#e9edf2');
      grd.addColorStop(1, '#6b7280');
      g.fillStyle = grd;
      g.fillRect(x, 70, 108, 186);
      g.fillStyle = col;
      g.fillRect(x + 20, 190, 70, 30);
      g.fillStyle = '#111';
      g.fillRect(x + 25, 215, 14, 14);
      g.fillRect(x + 72, 215, 14, 14);
    } else {
      g.fillStyle = '#9aa1ab';
      g.fillRect(x, 70, 108, 186);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 76; y < 256; y += 10) g.fillRect(x, y, 108, 2);
    }
  }
  return canvasTexture(c, { repeat: false });
}
function grassTexture(dry) {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  const r = rng(dry ? 8 : 9);
  for (let i = 0; i < 26; i++) {
    const x = 6 + r() * 52;
    const h = 30 + r() * 32;
    const v = dry ? `rgb(${170 + r() * 50},${140 + r() * 40},${80 + r() * 30})` : `rgb(${50 + r() * 40},${110 + r() * 60},${30 + r() * 30})`;
    g.strokeStyle = v;
    g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, 64);
    g.quadraticCurveTo(x + (r() - 0.5) * 10, 64 - h * 0.6, x + (r() - 0.5) * 18, 64 - h);
    g.stroke();
  }
  return canvasTexture(c, { repeat: false });
}

// ---------------------------------------------------------------------------
function runs(N, pred) {
  // zusammenhängende Bereiche [i0, count] in denen pred(i) gilt (mit Umlauf)
  const out = [];
  let i = 0;
  while (i < N) {
    if (!pred(i)) { i++; continue; }
    let j = i;
    while (j < N && pred(j)) j++;
    out.push([i, j - i]);
    i = j;
  }
  return out;
}

export function buildTrackside(env) {
  const tr = env.track;
  const th = env.themeId;
  const q = env.q;
  const root = new THREE.Group();
  env.root.add(root);
  const ctx = { env, tr, th, q, root, used: [], features: [] };
  tireBarriers(ctx);
  gravelTraps(ctx);
  if (th !== 'city') catchFences(ctx);
  distanceBoards(ctx);
  pitComplex(ctx);
  cornerGrandstands(ctx);
  if (th === 'coast') { tunnel(ctx, 'rock'); harbor(ctx); sponsorBridge(ctx); }
  if (th === 'canyon') { rockArches(ctx); powerPoles(ctx); sponsorBridge(ctx); }
  if (th === 'city') { overpass(ctx); tunnel(ctx, 'city'); }
  if (th === 'alps') { gallery(ctx); skiLift(ctx); reflectorPosts(ctx); sponsorBridge(ctx); }
  if ((th === 'coast' || th === 'canyon') && q.level >= 1) grass(ctx);
  return ctx;
}

function addMesh(ctx, geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast && ctx.q.shadows;
  m.receiveShadow = receive && ctx.q.shadows;
  ctx.root.add(m);
  return m;
}

// --- Reifenstapel ------------------------------------------------------------
function tireBarriers(ctx) {
  const { tr, env } = ctx;
  if (tr.def.tires === false) return;
  const list = [];
  const r = rng(77);
  const p = {};
  for (const side of [-1, 1]) {
    const arr = side > 0 ? tr.barrierR : tr.barrierL;
    for (let i = 0; i < tr.N; i++) {
      if (!arr[i]) continue;
      const along = tr.dist[i];
      for (let k = 0; k < 2; k++) {
        tr.pointAt(along + k * 1.0, side * (tr.wallDist - 0.38), p);
        const top = r() < 0.12;
        for (let t = 0; t < 3; t++) {
          list.push({ x: p.x, y: p.y + 0.12 + t * 0.27, z: p.z, ry: r() * 3, color: t === 2 && top ? '#e8e8e8' : t === 2 && r() < 0.1 ? '#c81d25' : '#151517' });
        }
      }
    }
  }
  const geo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12, 1, false);
  env.instanced(geo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), list, { shadow: false });
  // Förderband-Abdeckung (blau/rot) vor den Reifen
  const belts = [];
  for (const side of [-1, 1]) {
    const arr = side > 0 ? tr.barrierR : tr.barrierL;
    for (const [i0, count] of runs(tr.N, (i) => arr[i] > 0)) {
      belts.push({ geo: tr.sweep(i0, count, [[side * (tr.wallDist - 0.76), -0.1], [side * (tr.wallDist - 0.76), 0.85]], { uScale: 1, vScale: 6 }) });
    }
  }
  if (belts.length) {
    const tex = TX.wallTexture(ctx.th === 'alps' ? 'bluewhite' : 'stripes', 4);
    addMesh(ctx, mergeGeometries(belts), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }), { cast: false });
  }
}

// --- Kiesbetten ---------------------------------------------------------------
function gravelTraps(ctx) {
  const { tr, th } = ctx;
  if (th === 'city') return;
  const geos = [];
  for (const side of [-1, 1]) {
    for (const [i0, count] of runs(tr.N, (i) => (side > 0 ? tr.k[i] > 1 / 140 : tr.k[i] < -1 / 140))) {
      if (count < 6) continue;
      const a = side * (tr.halfWidth + 1.5), b = side * (tr.wallDist - 0.05);
      geos.push({ geo: tr.sweep(i0 - 4, count + 12, side > 0 ? [[a, -0.025], [b, -0.025]] : [[b, -0.025], [a, -0.025]], { uScale: 3, vScale: 3 }) });
    }
  }
  if (!geos.length) return;
  const col = th === 'alps' ? '#cfd6de' : th === 'canyon' ? '#c9a27a' : '#ffffff';
  addMesh(ctx, mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: gravelTexture(), color: col, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), { cast: false });
}

// --- Fangzäune ----------------------------------------------------------------
function catchFences(ctx) {
  const { tr, env } = ctx;
  const geos = [];
  const posts = [];
  const p = {};
  for (const side of [-1, 1]) {
    const pred = (i) => {
      for (let o = -10; o <= 30; o += 5) {
        const kk = tr.k[(i + o + tr.N) % tr.N];
        if (side > 0 ? kk > 1 / 160 : kk < -1 / 160) return true;
      }
      return i < 50 || i > tr.N - 90;
    };
    for (const [i0, count] of runs(tr.N, pred)) {
      if (count < 8) continue;
      const lat = side * (tr.wallDist + 0.22);
      geos.push({ geo: tr.sweep(i0, count, [[lat, 1.05], [lat, 3.6]], { uScale: 1.2, vScale: 1.2 }) });
      for (let j = 0; j < count; j += 3) {
        tr.pointAt(tr.dist[(i0 + j) % tr.N], lat, p);
        posts.push({ x: p.x, y: p.y + 1.8, z: p.z });
      }
    }
  }
  if (!geos.length) return;
  const tex = fenceTexture();
  addMesh(ctx, mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, depthWrite: true }), { cast: false, receive: false });
  env.instanced(new THREE.CylinderGeometry(0.05, 0.05, 3.6, 5), new THREE.MeshLambertMaterial({ color: '#9aa0a8' }), posts, { shadow: false });
}

// --- Bremspunkt-Tafeln ----------------------------------------------------------
function brakingZones(tr) {
  const v = tr.speedProfile(19, 15, 75);
  const N = tr.N;
  const zones = [];
  for (let i = 0; i < N; i++) {
    const a = v[(i - 1 + N) % N], b = v[i], c = v[(i + 1) % N];
    if (b <= a && b < c) {
      // Startpunkt der Verzögerung
      let j = i, drop = 0;
      for (let o = 1; o < 200; o++) {
        const vv = v[(i - o + N) % N];
        if (vv - b > drop) { drop = vv - b; j = (i - o + N) % N; }
        if (vv >= 74.9) break;
      }
      if (drop > 14) zones.push({ apex: i, start: j, drop, k: tr.k[i] });
    }
  }
  zones.sort((a, b) => b.drop - a.drop);
  const out = [];
  for (const z of zones) if (!out.some((o) => Math.abs(o.apex - z.apex) < 60)) out.push(z);
  return out.slice(0, 7);
}

function distanceBoards(ctx) {
  const { tr } = ctx;
  const zones = brakingZones(tr);
  ctx.zones = zones;
  const mats = { 150: null, 100: null, 50: null };
  for (const k in mats) mats[k] = new THREE.MeshLambertMaterial({ map: boardTexture(k) });
  const postMat = new THREE.MeshLambertMaterial({ color: '#555b63' });
  const p = {};
  for (const z of zones) {
    const side = z.k > 0 ? 1 : -1; // außen
    const startAlong = tr.dist[z.start] + 40;
    for (const d of [150, 100, 50]) {
      tr.pointAt(startAlong + (150 - d) * 0.9, side * (tr.wallDist + 1.4), p);
      const g = new THREE.Group();
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), mats[d]);
      b.position.y = 2.6;
      g.add(b);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 0.12), postMat);
      post.position.set(0, 1.1, -0.08);
      g.add(post);
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading + Math.PI; // Fahrern zugewandt
      ctx.root.add(g);
    }
  }
}

// --- Boxengasse mit Garagen und Kontrollturm -----------------------------------------
function pitComplex(ctx) {
  const { tr, env, th } = ctx;
  const night = th === 'city';
  const side = 1;
  const p = {};
  const garTex = garageTexture(night);
  const wall = new THREE.MeshLambertMaterial({ color: night ? '#3a3f4a' : '#c9ced6' });
  const roof = new THREE.MeshStandardMaterial({ color: '#2b2f38', metalness: 0.5, roughness: 0.5 });
  const facade = new THREE.MeshLambertMaterial({ map: garTex, emissive: night ? '#ffffff' : '#000000', emissiveMap: night ? garTex : null, emissiveIntensity: night ? 0.5 : 0 });
  const glass = new THREE.MeshStandardMaterial({ color: '#203040', metalness: 0.8, roughness: 0.1, emissive: night ? '#5b7cff' : '#000', emissiveIntensity: night ? 0.4 : 0 });
  // Boxengassen-Asphalt
  const i0 = tr.idxAt(-170), count = Math.round(210 / tr.ds);
  const asphalt = new THREE.MeshLambertMaterial({ color: night ? '#2a2b31' : '#55565c' });
  addMesh(ctx, tr.sweep(i0, count, [[side * (tr.wallDist + 0.5), -0.05], [side * (tr.wallDist + 13), -0.05]]), asphalt, { cast: false });
  // weiße Linie
  addMesh(ctx, tr.sweep(i0, count, [[side * (tr.wallDist + 6.6), -0.03], [side * (tr.wallDist + 6.9), -0.03]]), new THREE.MeshBasicMaterial({ color: '#eeeeee' }), { cast: false, receive: false });
  // Garagen in 30-m-Segmenten (folgen leichten Krümmungen)
  const segL = 30;
  for (let a = -165; a < 30; a += segL) {
    tr.pointAt(a + segL / 2, side * (tr.wallDist + 13 + 7), p);
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(segL + 0.2, 7, 14), [wall, wall, roof, wall, wall, facade]);
    box.position.y = 3.5;
    // Fassade zeigt zur Strecke: lokale -z-Seite → Material-Index 5
    g.add(box);
    const over = new THREE.Mesh(new THREE.BoxGeometry(segL + 0.2, 0.3, 4), roof);
    over.position.set(0, 7.1, -8.5);
    g.add(over);
    g.position.set(p.x, p.y - 0.05, p.z);
    g.rotation.y = p.heading - Math.PI / 2;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = ctx.q.shadows; o.receiveShadow = ctx.q.shadows; } });
    ctx.root.add(g);
  }
  // Kontrollturm
  tr.pointAt(45, side * (tr.wallDist + 18), p);
  const tower = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(10, 16, 10), wall);
  base.position.y = 8;
  tower.add(base);
  const glassBand = new THREE.Mesh(new THREE.BoxGeometry(12, 3.4, 12), glass);
  glassBand.position.y = 17.6;
  tower.add(glassBand);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(13, 0.6, 13), roof);
  cap.position.y = 19.6;
  tower.add(cap);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: TX.bannerTexture('VELOX'), fog: true }));
  sign.position.set(0, 12, -5.05);
  sign.rotation.y = Math.PI;
  tower.add(sign);
  tower.position.set(p.x, p.y, p.z);
  tower.rotation.y = p.heading - Math.PI / 2;
  tower.traverse((o) => { if (o.isMesh) o.castShadow = ctx.q.shadows; });
  ctx.root.add(tower);
  // Fahnenmasten
  const flags = [];
  const fc = ['#c81d25', '#ffffff', '#1f6fd6', '#f2b705', '#1fa463'];
  for (let k = 0; k < 10; k++) {
    tr.pointAt(-160 + k * 20, side * (tr.wallDist + 27.5), p);
    flags.push({ x: p.x, y: p.y + 6, z: p.z, color: '#cfd3d9' });
  }
  env.instanced(new THREE.CylinderGeometry(0.08, 0.1, 12, 6), new THREE.MeshLambertMaterial({ color: '#ffffff' }), flags, { shadow: false });
  const fl = flags.map((f, k) => ({ x: f.x, y: f.y + 4.6, z: f.z, ry: p.heading, color: fc[k % fc.length], sx: 1.8, sy: 1.1, sz: 0.04 }));
  env.instanced(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0, 0), new THREE.MeshLambertMaterial({ color: '#ffffff', side: THREE.DoubleSide }), fl, { shadow: false });
  ctx.used.push([i0, i0 + count]);
}

// --- Zusätzliche Tribünen an den größten Bremszonen ----------------------------------
function cornerGrandstands(ctx) {
  const { tr, env } = ctx;
  const zones = (ctx.zones || []).slice(0, 2);
  const p = {};
  for (const z of zones) {
    const side = z.k > 0 ? 1 : -1;
    const gs = env.buildGrandstand(40);
    tr.pointAt(tr.dist[z.apex] - 30, side * (tr.wallDist + 12), p);
    gs.position.set(p.x, p.y - 0.6, p.z);
    gs.rotation.y = side > 0 ? p.heading + Math.PI / 2 : p.heading - Math.PI / 2;
    ctx.root.add(gs);
  }
}

// --- Sponsorbrücke über die Strecke --------------------------------------------------
function sponsorBridge(ctx) {
  const { tr } = ctx;
  const s = tr.findStraight(60, 0.12, 0.35, ctx.used);
  if (s.i0 < 0) return;
  const i = (s.i0 + Math.round(s.count / 2)) % tr.N;
  const p = tr.pointAt(tr.dist[i], 0);
  const g = new THREE.Group();
  const span = tr.wallDist * 2 + 6;
  const metal = new THREE.MeshStandardMaterial({ color: '#d7dbe1', metalness: 0.6, roughness: 0.35 });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 1.2, 3.2), metal);
  deck.position.y = 7.4;
  g.add(deck);
  const ad = new THREE.MeshBasicMaterial({ map: TX.adTexture(ctx.th.length), fog: true });
  for (const sz of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(span - 1, 1.4), ad);
    b.position.set(0, 7.4, sz * 1.62);
    if (sz < 0) b.rotation.y = Math.PI;
    g.add(b);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(span, 1.1, 0.08), metal);
    rail.position.set(0, 8.55, sz * 1.5);
    g.add(rail);
  }
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 8, 3), metal);
    leg.position.set(sx * (span / 2 - 0.6), 3.8, 0);
    g.add(leg);
    const stair = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 8), metal);
    stair.position.set(sx * (span / 2 + 0.9), 3.8, 0);
    stair.rotation.x = 0.85;
    g.add(stair);
  }
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.heading;
  g.traverse((o) => { if (o.isMesh) o.castShadow = ctx.q.shadows; });
  ctx.root.add(g);
  ctx.used.push([s.i0, s.i0 + s.count]);
  ctx.features.push(['bruecke', i]);
}

// --- Tunnel (Fels an der Küste / Unterführung in der Stadt) ---------------------------
function tunnel(ctx, kind) {
  const { tr, env } = ctx;
  const len = kind === 'rock' ? 150 : 120;
  const s = tr.findStraight(len, 0.5, 0.85, ctx.used);
  if (s.i0 < 0) return;
  ctx.used.push([s.i0 - 20, s.i0 + s.count + 20]);
  const W = tr.wallDist + 0.6;
  const H = 7.2;
  const inner = [];
  // Innenprofil: Seitenwände + Gewölbe
  inner.push([-W, -0.6], [-W, 4.4]);
  for (let k = 1; k < 8; k++) {
    const a = Math.PI - (k / 8) * Math.PI;
    inner.push([Math.cos(a) * W, 4.4 + Math.sin(a) * (H - 4.4)]);
  }
  inner.push([W, 4.4], [W, -0.6]);
  const night = kind === 'city';
  const wallMat = new THREE.MeshLambertMaterial({ map: TX.wallTexture('concrete', 4), color: night ? '#9aa3b0' : '#c8c2b8', side: THREE.DoubleSide });
  const tg = tr.sweep(s.i0, s.count, inner, { uScale: 8, vScale: 16 });
  addMesh(ctx, tg, wallMat, { cast: true });
  // Lichtbänder an der Decke + Lichtflecken
  const lights = [];
  for (const lat of [-W * 0.45, W * 0.45]) lights.push({ geo: tr.sweep(s.i0, s.count, [[lat - 0.25, H - 0.35], [lat + 0.25, H - 0.35]]) });
  addMesh(ctx, mergeGeometries(lights), new THREE.MeshBasicMaterial({ color: night ? '#ffd49a' : '#fff1d0', side: THREE.DoubleSide, fog: true }), { cast: false, receive: false });
  const p = {};
  const glow = [];
  for (let j = 0; j < s.count; j += 6) {
    tr.pointAt(tr.dist[(s.i0 + j) % tr.N], 0, p);
    glow.push(p.x, p.y + 0.06, p.z);
  }
  // Außenhülle
  if (kind === 'rock') {
    const outer = [[-W - 30, -6]];
    const nz = new Noise2D(5);
    for (let k = 0; k <= 10; k++) {
      const x = -W - 22 + (k / 10) * (2 * W + 44);
      outer.push([x, H + 4 + Math.sin((k / 10) * Math.PI) * 14 + nz.noise(k, 1) * 5]);
    }
    outer.push([W + 30, -6]);
    const rg = tr.sweep(s.i0 - 2, s.count + 4, outer, { uScale: 10, vScale: 10 });
    const rp = rg.attributes.position;
    for (let i = 0; i < rp.count; i++) rp.setY(i, rp.getY(i) + (nz.noise(rp.getX(i) * 0.08, rp.getZ(i) * 0.08) - 0.5) * 4);
    rg.computeVertexNormals();
    addMesh(ctx, rg.toNonIndexed(), new THREE.MeshLambertMaterial({ color: '#8d7f72', flatShading: true, side: THREE.DoubleSide }));
    // Portale
    for (const j of [0, s.count]) {
      const i = (s.i0 + j) % tr.N;
      tr.pointAt(tr.dist[i], 0, p);
      const portal = new THREE.Mesh(new THREE.TorusGeometry(W + 0.6, 0.9, 6, 16, Math.PI), new THREE.MeshLambertMaterial({ color: '#b5aca0' }));
      portal.scale.set(1, (H - 2) / (W + 0.6), 1);
      portal.position.set(p.x, p.y + 4.4 - 2, p.z);
      portal.rotation.y = p.heading;
      ctx.root.add(portal);
    }
  } else {
    // Stadt: Betondecke mit Gebäudeblock darauf
    const top = [[-W - 1, H + 0.2], [-W - 1, H + 1.4], [W + 1, H + 1.4], [W + 1, H + 0.2]];
    addMesh(ctx, tr.sweep(s.i0, s.count, top, { uScale: 8, vScale: 8 }), new THREE.MeshLambertMaterial({ color: '#4a4f5a', side: THREE.DoubleSide }));
    const mid = (s.i0 + Math.round(s.count / 2)) % tr.N;
    tr.pointAt(tr.dist[mid], 0, p);
    const blk = new THREE.Mesh(new THREE.BoxGeometry(2 * W + 8, 40, s.count * tr.ds * 0.8), new THREE.MeshLambertMaterial({ map: TX.windowTexture(9), emissive: '#ffffff', emissiveMap: TX.windowTexture(9), emissiveIntensity: 0.8, color: '#4a5060' }));
    blk.material.map.repeat.set(3, 5);
    blk.material.emissiveMap.repeat.set(3, 5);
    blk.position.set(p.x, p.y + H + 1.4 + 20, p.z);
    blk.rotation.y = p.heading;
    ctx.root.add(blk);
  }
  env.addGlowPoints(glow, night ? '#ffc070' : '#c8b490', night ? 9 : 3);
  ctx.tunnel = { i0: s.i0, count: s.count };
  ctx.features.push(['tunnel', s.i0]);
}

// --- Lawinengalerie ----------------------------------------------------------------
function gallery(ctx) {
  const { tr, env } = ctx;
  const s = tr.findStraight(140, 0.45, 0.85, ctx.used);
  if (s.i0 < 0) return;
  ctx.used.push([s.i0 - 20, s.i0 + s.count + 20]);
  const W = tr.wallDist + 0.6;
  // Bergseite: die Seite, auf der das Gelände höher liegt
  const mid = (s.i0 + Math.round(s.count / 2)) % tr.N;
  const pl = tr.pointAt(tr.dist[mid], -W - 30), pr = tr.pointAt(tr.dist[mid], W + 30);
  const mside = env.baseHeight(pl.x, pl.z) > env.baseHeight(pr.x, pr.z) ? -1 : 1;
  const conc = new THREE.MeshLambertMaterial({ map: TX.wallTexture('concrete', 4), color: '#cfd3d8', side: THREE.DoubleSide });
  const H = 6.8;
  addMesh(ctx, tr.sweep(s.i0, s.count, [[mside * W, -1], [mside * W, H]], { uScale: 8, vScale: 16 }), conc);
  addMesh(ctx, tr.sweep(s.i0, s.count, [[-W - 1.2, H], [-W - 1.2, H + 1.0], [W + 1.2, H + 1.0], [W + 1.2, H]], { uScale: 8, vScale: 8 }), new THREE.MeshLambertMaterial({ color: '#b9bec5', side: THREE.DoubleSide }));
  // Schnee auf dem Dach
  addMesh(ctx, tr.sweep(s.i0, s.count, [[-W - 1.3, H + 1.0], [-W, H + 1.6], [W, H + 1.6], [W + 1.3, H + 1.0]], { uScale: 8, vScale: 8 }), new THREE.MeshLambertMaterial({ color: '#f6f9fc', side: THREE.DoubleSide }));
  // Pfeiler auf der Talseite
  const posts = [];
  const p = {};
  for (let j = 0; j <= s.count; j += 4) {
    tr.pointAt(tr.dist[(s.i0 + j) % tr.N], -mside * (W + 0.4), p);
    posts.push({ x: p.x, y: p.y + H / 2 - 0.5, z: p.z, ry: p.heading });
  }
  env.instanced(new THREE.BoxGeometry(0.8, H + 1, 1.2), new THREE.MeshLambertMaterial({ color: '#c4c9cf' }), posts);
  // Lampen unter dem Dach
  const glow = [];
  for (let j = 0; j < s.count; j += 8) {
    tr.pointAt(tr.dist[(s.i0 + j) % tr.N], 0, p);
    glow.push(p.x, p.y + H - 0.4, p.z);
  }
  env.addGlowPoints(glow, '#fff0c8', 2.2);
  ctx.features.push(['galerie', s.i0]);
}

// --- Felsbögen im Canyon -------------------------------------------------------------
function rockArches(ctx) {
  const { tr } = ctx;
  const nz = new Noise2D(13);
  const mat = new THREE.MeshLambertMaterial({ color: '#a8532e', flatShading: true });
  for (const [from, to] of [[0.3, 0.5], [0.62, 0.85]]) {
    const s = tr.findStraight(40, from, to, ctx.used);
    if (s.i0 < 0) continue;
    ctx.used.push([s.i0 - 10, s.i0 + s.count + 10]);
    const i = (s.i0 + Math.round(s.count / 2)) % tr.N;
    const p = tr.pointAt(tr.dist[i], 0);
    const R = tr.wallDist + 9;
    const g = new THREE.TorusGeometry(R, 6.5, 9, 28, Math.PI);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const n = nz.noise(x * 0.15 + 3, y * 0.15) * 3.2 + nz.noise(x * 0.5, z * 0.5) * 1.2;
      const l = Math.hypot(x, y) || 1;
      pos.setXYZ(k, x + (x / l) * n * 0.6, y + (y / l) * n * 0.6, z * 1.25 + (n - 1.5) * 0.8);
    }
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    const m = new THREE.Mesh(ng, mat);
    m.scale.set(1, 1.15, 1);
    m.position.set(p.x, p.y - 3, p.z);
    m.rotation.y = p.heading;
    m.castShadow = ctx.q.shadows;
    m.receiveShadow = ctx.q.shadows;
    ctx.root.add(m);
    ctx.features.push(['felsbogen', i]);
  }
}

function powerPoles(ctx) {
  const { tr, env } = ctx;
  const poles = [];
  const p = {};
  for (let a = 0; a < tr.length; a += 55) {
    tr.pointAt(a, -(tr.wallDist + 9), p);
    poles.push({ x: p.x, y: p.y, z: p.z, ry: p.heading });
  }
  const geo = mergeGeometries([
    { geo: new THREE.CylinderGeometry(0.16, 0.22, 10, 6), matrix: mat4(0, 5, 0), color: '#6b4a2f' },
    { geo: new THREE.BoxGeometry(2.6, 0.18, 0.18), matrix: mat4(0, 9.3, 0), color: '#6b4a2f' },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), matrix: mat4(-1.1, 9.55, 0), color: '#d8d8d8' },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.3, 5), matrix: mat4(1.1, 9.55, 0), color: '#d8d8d8' },
  ]);
  env.instanced(geo, new THREE.MeshLambertMaterial({ vertexColors: true }), poles);
}

// --- Hochstraße mit Verkehr (Stadt) ---------------------------------------------------
function overpass(ctx) {
  const { tr, env } = ctx;
  const s = tr.findStraight(50, 0.15, 0.45, ctx.used);
  if (s.i0 < 0) return;
  ctx.used.push([s.i0, s.i0 + s.count]);
  const i = (s.i0 + Math.round(s.count / 2)) % tr.N;
  ctx.features.push(['hochstrasse', i]);
  const p = tr.pointAt(tr.dist[i], 0);
  const g = new THREE.Group();
  const len = 260;
  const conc = new THREE.MeshLambertMaterial({ color: '#6c717c' });
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 1.6, 16), conc);
  deck.position.y = 10.5;
  g.add(deck);
  const strip = new THREE.MeshBasicMaterial({ map: TX.neonStripTexture(), fog: true });
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(len, 1.0, 0.3), conc);
    rail.position.set(0, 11.8, sz * 7.9);
    g.add(rail);
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.25), strip);
    neon.position.set(0, 10.1, sz * 8.02);
    if (sz < 0) neon.rotation.y = Math.PI;
    g.add(neon);
  }
  for (let k = -3; k <= 3; k++) {
    const x = k * 36;
    if (Math.abs(x) < tr.wallDist + 4) continue;
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 10.5, 10), conc);
    pil.position.set(x, 5.2, 0);
    g.add(pil);
  }
  for (const sx of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(2.2, 10.5, 12), conc);
    pil.position.set(sx * (tr.wallDist + 3.2), 5.2, 0);
    g.add(pil);
  }
  // Verkehr: Lichter-Paare, die über die Brücke fahren
  const n = 10;
  const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 1.4, 1.9), new THREE.MeshLambertMaterial({ color: '#ffffff' }), n);
  const cols = ['#d0d4da', '#202228', '#c81d25', '#1f6fd6', '#f2f2f2', '#6b7280'];
  for (let k = 0; k < n; k++) cars.setColorAt(k, new THREE.Color(cols[k % cols.length]));
  g.add(cars);
  const lightPts = new Float32Array(n * 2 * 3);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.BufferAttribute(lightPts, 3));
  const lp = new THREE.Points(lg, new THREE.PointsMaterial({ color: '#fff2cc', size: 1.6, map: env.softTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  lp.frustumCulled = false;
  g.add(lp);
  const lanes = [];
  const r = rng(4);
  for (let k = 0; k < n; k++) lanes.push({ lane: k % 2 ? 1 : -1, x: (r() - 0.5) * len, v: 14 + r() * 8 });
  const m4 = new THREE.Matrix4();
  env.updatables.push((dt) => {
    lanes.forEach((c, k) => {
      c.x += c.lane * c.v * dt;
      if (c.x > len / 2) c.x -= len;
      if (c.x < -len / 2) c.x += len;
      const z = c.lane * 3.5;
      m4.makeTranslation(c.x, 12.0, z);
      cars.setMatrixAt(k, m4);
      lightPts[k * 6] = c.x + c.lane * 2.2; lightPts[k * 6 + 1] = 12.0; lightPts[k * 6 + 2] = z - 0.6;
      lightPts[k * 6 + 3] = c.x + c.lane * 2.2; lightPts[k * 6 + 4] = 12.0; lightPts[k * 6 + 5] = z + 0.6;
    });
    cars.instanceMatrix.needsUpdate = true;
    lg.attributes.position.needsUpdate = true;
  });
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.heading + 0.25;
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  ctx.root.add(g);
}

// --- Skilift (Alpen) -----------------------------------------------------------------
function skiLift(ctx) {
  const { env } = ctx;
  const b = env.bounds;
  const start = [b.cx - 120, b.cz - 60], end = [b.cx + 250, b.cz - 650];
  const n = 8;
  const towers = [];
  const cable = [];
  const steel = new THREE.MeshLambertMaterial({ color: '#7d848e' });
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const x = start[0] + (end[0] - start[0]) * t, z = start[1] + (end[1] - start[1]) * t;
    const tn = env.track.nearest(x, z, 30);
    if (tn.d < env.track.wallDist + 6) continue;
    const y = env.heightAt(x, z);
    towers.push({ x, y, z, ry: Math.atan2(end[0] - start[0], end[1] - start[1]) });
    cable.push(new THREE.Vector3(x, y + 13.5, z));
  }
  if (towers.length < 2) return;
  const tg = mergeGeometries([
    { geo: new THREE.BoxGeometry(0.6, 14, 0.6), matrix: mat4(0, 7, 0), color: '#7d848e' },
    { geo: new THREE.BoxGeometry(6, 0.4, 0.6), matrix: mat4(0, 13.6, 0), color: '#7d848e' },
  ]);
  env.instanced(tg, new THREE.MeshLambertMaterial({ vertexColors: true }), towers);
  for (const off of [-2.6, 2.6]) {
    const pts = cable.map((v) => v.clone().add(new THREE.Vector3(Math.cos(towers[0].ry) * off, 0, -Math.sin(towers[0].ry) * off)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.05, 4), steel);
    ctx.root.add(tube);
    // Sessel
    const chairs = [];
    for (let k = 0; k < 18; k++) {
      const v = curve.getPointAt(k / 18);
      chairs.push({ x: v.x, y: v.y - 1.6, z: v.z, ry: towers[0].ry, color: '#c81d25' });
    }
    env.instanced(mergeGeometries([
      { geo: new THREE.BoxGeometry(0.05, 1.6, 0.05), matrix: mat4(0, 0.8, 0) },
      { geo: new THREE.BoxGeometry(1.6, 0.12, 0.6), matrix: mat4(0, 0, 0) },
      { geo: new THREE.BoxGeometry(1.6, 0.6, 0.1), matrix: mat4(0, 0.3, -0.3) },
    ]), new THREE.MeshLambertMaterial({ vertexColors: true, color: '#ffffff' }), chairs, { shadow: false });
  }
}

function reflectorPosts(ctx) {
  const { tr, env } = ctx;
  const posts = [];
  const p = {};
  for (let a = 0; a < tr.length; a += 25) {
    for (const side of [-1, 1]) {
      tr.pointAt(a, side * (tr.halfWidth + 1.0), p);
      posts.push({ x: p.x, y: p.y + 0.5, z: p.z, ry: p.heading });
    }
  }
  env.instanced(mergeGeometries([
    { geo: new THREE.BoxGeometry(0.12, 1.0, 0.12), color: '#f4f4f4' },
    { geo: new THREE.BoxGeometry(0.13, 0.12, 0.13), matrix: mat4(0, 0.3, 0), color: '#151515' },
    { geo: new THREE.BoxGeometry(0.14, 0.08, 0.02), matrix: mat4(0, 0.3, 0.07), color: '#ff8a00' },
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }), posts, { shadow: false });
}

// --- Hafen mit Steg und Booten (Küste) -------------------------------------------------
function harbor(ctx) {
  const { env } = ctx;
  const b = env.bounds;
  const x0 = b.cx - 250, z0 = b.maxZ + 90;
  const wood = new THREE.MeshLambertMaterial({ color: '#7a5a3a' });
  for (let k = 0; k < 3; k++) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, 70), wood);
    pier.position.set(x0 + k * 45, 0.6, z0 + 35);
    ctx.root.add(pier);
    for (let j = 0; j < 8; j++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 6), wood);
      post.position.set(x0 + k * 45 + (j % 2 ? 2 : -2), -0.6, z0 + 5 + j * 9);
      ctx.root.add(post);
    }
  }
  const hull = mergeGeometries([
    { geo: new THREE.CylinderGeometry(1.6, 1.0, 1.2, 8, 1).scale(1, 1, 3.4), matrix: mat4(0, 0.2, 0), color: '#f4f4f4' },
    { geo: new THREE.BoxGeometry(1.8, 1.1, 2.6), matrix: mat4(0, 1.2, -0.6), color: '#e6e9ee' },
    { geo: new THREE.BoxGeometry(1.7, 0.4, 2.5), matrix: mat4(0, 1.6, -0.6), color: '#1f6fd6' },
  ]);
  const boats = [];
  const r = rng(6);
  for (let k = 0; k < 10; k++) boats.push({ x: x0 + Math.floor(k / 2) * 45 * 0.5 + (k % 2 ? 6 : -6) + 4, y: -0.1, z: z0 + 15 + r() * 45, ry: r() * 0.2, s: 0.9 + r() * 0.4 });
  env.instanced(hull, new THREE.MeshLambertMaterial({ vertexColors: true }), boats, { shadow: false });
  // Sonnenschirme am Strand
  const umb = [];
  env.scatter(Math.round(60 * ctx.q.sceneryMul), 18, 160, 51, (x, y, z, d, rr) => {
    if (y < 0.3 || y > 2.5) return false;
    umb.push({ x, y, z, ry: rr() * 6, color: ['#ff3d8b', '#13b5b1', '#f2b705', '#ffffff', '#1f6fd6'][Math.floor(rr() * 5)] });
  });
  env.instanced(mergeGeometries([
    { geo: new THREE.CylinderGeometry(0.04, 0.04, 2.4, 5), matrix: mat4(0, 1.2, 0), color: '#eeeeee' },
    { geo: new THREE.ConeGeometry(1.4, 0.6, 8), matrix: mat4(0, 2.5, 0) },
  ]), new THREE.MeshLambertMaterial({ vertexColors: true }), umb, { shadow: false });
}

// --- Grasbüschel -------------------------------------------------------------------
function grass(ctx) {
  const { env, th } = ctx;
  const dry = th === 'canyon';
  const tex = grassTexture(dry);
  const g1 = new THREE.PlaneGeometry(1.4, 0.9).translate(0, 0.45, 0);
  const g2 = g1.clone().rotateY(Math.PI / 2);
  const geo = mergeGeometries([{ geo: g1 }, { geo: g2 }]);
  const list = [];
  env.scatter(Math.round((ctx.q.level >= 2 ? 3200 : 1600) * ctx.q.sceneryMul), ctx.tr.wallDist + 1.5, 40, 61, (x, y, z, d, r) => {
    if (th === 'coast' && y < 1) return false;
    const s = 0.7 + r() * 0.9;
    list.push({ x, y: y - 0.05, z, ry: r() * 3, s, color: '#ffffff' });
  });
  env.instanced(geo, new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, transparent: false }), list, { shadow: false });
}
