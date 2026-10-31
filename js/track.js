// Strecke: Abtastung der Kurve, Abfragen (Projektion), Ideallinie und Geometrie.
import * as THREE from '../vendor/three.module.min.js';
import { clamp, lerp, wrapAngle } from './utils.js';

function smoothArray(arr, radius, passes = 1) {
  const N = arr.length;
  let src = arr;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let o = -radius; o <= radius; o++) s += src[(i + o + N) % N];
      out[i] = s / (radius * 2 + 1);
    }
    src = out;
  }
  return src;
}

export class Track {
  constructor(def) {
    this.def = def;
    const sc = def.scale || 1;
    this.halfWidth = def.width / 2;
    this.wallDist = this.halfWidth + (def.runoff ?? 4);
    const pts = def.points.map((p) => new THREE.Vector3(p[0] * sc, p[2] || 0, p[1] * sc));
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const approx = curve.getLength();
    const N = Math.max(300, Math.round(approx / 2));
    const sp = curve.getSpacedPoints(N);
    sp.pop();
    this.N = N;

    const cx = (this.cx = new Float32Array(N));
    const cyRaw = new Float32Array(N);
    const cz = (this.cz = new Float32Array(N));
    for (let i = 0; i < N; i++) {
      cx[i] = sp[i].x;
      cyRaw[i] = sp[i].y;
      cz[i] = sp[i].z;
    }
    const cy = (this.cy = smoothArray(cyRaw, 6, 2));
    const tx = (this.tx = new Float32Array(N));
    const tz = (this.tz = new Float32Array(N));
    const rx = (this.rx = new Float32Array(N));
    const rz = (this.rz = new Float32Array(N));
    const dist = (this.dist = new Float32Array(N));
    const slope = (this.slope = new Float32Array(N));
    const theta = new Float32Array(N);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      let dx = cx[b] - cx[a], dz = cz[b] - cz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      tx[i] = dx;
      tz[i] = dz;
      rx[i] = -dz;
      rz[i] = dx;
      theta[i] = Math.atan2(dx, dz);
      slope[i] = (cy[b] - cy[a]) / l;
      dist[i] = acc;
      const n = (i + 1) % N;
      acc += Math.hypot(cx[n] - cx[i], cz[n] - cz[i]);
    }
    this.length = acc;
    this.ds = acc / N;

    // Krümmung (vorzeichenbehaftet, >0 = Linkskurve)
    const k = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 2 + N) % N, b = (i + 2) % N;
      k[i] = wrapAngle(theta[b] - theta[a]) / (this.ds * 4);
    }
    this.k = smoothArray(k, 4, 2);
    const bank = new Float32Array(N);
    for (let i = 0; i < N; i++) bank[i] = clamp(this.k[i] * 26, -0.075, 0.075);
    this.bank = smoothArray(bank, 10, 2);

    this.computeRacingLine();
    this.computeBarriers();
    this.buildGrid();
    this._tmp = {};
  }

  // ----- Abfragen --------------------------------------------------------
  project(x, z, hint = -1, out = {}) {
    const N = this.N, cx = this.cx, cz = this.cz;
    let best = 0, bd = Infinity;
    if (hint >= 0) {
      for (let o = -12; o <= 28; o++) {
        const i = (hint + o + N) % N;
        const dx = x - cx[i], dz = z - cz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (hint < 0 || bd > (this.wallDist * 2.5) ** 2) {
      bd = Infinity;
      for (let i = 0; i < N; i++) {
        const dx = x - cx[i], dz = z - cz[i];
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    let i0 = best, i1 = (best + 1) % N;
    let sx = cx[i1] - cx[i0], sz = cz[i1] - cz[i0];
    let sl2 = sx * sx + sz * sz || 1;
    let t = ((x - cx[i0]) * sx + (z - cz[i0]) * sz) / sl2;
    if (t < 0) {
      i1 = i0;
      i0 = (best - 1 + N) % N;
      sx = cx[i1] - cx[i0];
      sz = cz[i1] - cz[i0];
      sl2 = sx * sx + sz * sz || 1;
      t = ((x - cx[i0]) * sx + (z - cz[i0]) * sz) / sl2;
    }
    t = clamp(t, 0, 1);
    const px = cx[i0] + sx * t, pz = cz[i0] + sz * t;
    let rX = lerp(this.rx[i0], this.rx[i1], t), rZ = lerp(this.rz[i0], this.rz[i1], t);
    const rl = Math.hypot(rX, rZ) || 1;
    rX /= rl;
    rZ /= rl;
    const lateral = (x - px) * rX + (z - pz) * rZ;
    const bank = lerp(this.bank[i0], this.bank[i1], t);
    const cyv = lerp(this.cy[i0], this.cy[i1], t);
    const latC = clamp(lateral, -this.wallDist, this.wallDist);
    out.idx = t > 0.5 ? i1 : i0;
    out.i0 = i0;
    out.t = t;
    out.lateral = lateral;
    out.along = this.dist[i0] + Math.sqrt(sl2) * t;
    if (out.along >= this.length) out.along -= this.length;
    out.cx = px;
    out.cz = pz;
    out.cy = cyv;
    out.y = cyv + latC * bank;
    out.rx = rX;
    out.rz = rZ;
    out.tx = rZ;
    out.tz = -rX;
    out.bank = bank;
    out.slope = lerp(this.slope[i0], this.slope[i1], t);
    return out;
  }

  idxAt(along) {
    const L = this.length;
    along = ((along % L) + L) % L;
    let i = Math.floor((along / L) * this.N) % this.N;
    while (i < this.N - 1 && this.dist[i + 1] <= along) i++;
    while (i > 0 && this.dist[i] > along) i--;
    return i;
  }

  // Weltposition für (Strecke-Distanz, seitlicher Versatz)
  pointAt(along, lateral = 0, out = {}) {
    const i = this.idxAt(along);
    const n = (i + 1) % this.N;
    const L = this.length;
    const a = ((along % L) + L) % L;
    const segL = (n === 0 ? L : this.dist[n]) - this.dist[i];
    const t = clamp((a - this.dist[i]) / (segL || 1), 0, 1);
    const cx = lerp(this.cx[i], this.cx[n], t), cz = lerp(this.cz[i], this.cz[n], t);
    const rX = lerp(this.rx[i], this.rx[n], t), rZ = lerp(this.rz[i], this.rz[n], t);
    const bank = lerp(this.bank[i], this.bank[n], t);
    out.x = cx + rX * lateral;
    out.z = cz + rZ * lateral;
    out.y = lerp(this.cy[i], this.cy[n], t) + lateral * bank;
    out.heading = Math.atan2(rZ, -rX);
    out.idx = i;
    return out;
  }

  // Startaufstellung: Position i (0 = Pole)
  gridSlot(i) {
    return { along: this.length - 12 - i * 8, lateral: (i % 2 ? 1 : -1) * this.halfWidth * 0.4 };
  }

  // ----- Reifenstapel an Kurvenaußenseiten (verringern den Platz bis zur Mauer)
  computeBarriers() {
    const N = this.N;
    this.barrierL = new Float32Array(N);
    this.barrierR = new Float32Array(N);
    if (this.def.tires === false) return;
    const thr = 1 / 95;
    for (let i = 0; i < N; i++) {
      let kk = 0;
      for (let o = -8; o <= 22; o++) {
        const v = this.k[(i + o + N) % N];
        if (Math.abs(v) > Math.abs(kk)) kk = v;
      }
      // Linkskurve (k > 0): außen ist rechts
      if (Math.abs(kk) > thr) {
        if (kk > 0) this.barrierR[i] = 0.8;
        else this.barrierL[i] = 0.8;
      }
    }
    // Startbereich frei halten
    for (let o = -40; o < 40; o++) {
      const i = (o + N) % N;
      this.barrierL[i] = this.barrierR[i] = 0;
    }
  }
  barrierAt(idx, side) {
    return side > 0 ? this.barrierR[idx] : this.barrierL[idx];
  }

  // Querschnitt-Profil entlang eines Streckenabschnitts ziehen (für Bauwerke)
  sweep(i0, count, profile, { uScale = 4, vScale = 8, yFollowBank = true } = {}) {
    const N = this.N, P = profile.length;
    const pos = [], uv = [], idx = [];
    const plen = [0];
    for (let k = 1; k < P; k++) plen.push(plen[k - 1] + Math.hypot(profile[k][0] - profile[k - 1][0], profile[k][1] - profile[k - 1][1]));
    for (let j = 0; j <= count; j++) {
      const i = (((i0 + j) % N) + N) % N;
      const d = j * this.ds;
      for (let k = 0; k < P; k++) {
        const [lat, h] = profile[k];
        const b = yFollowBank ? clamp(lat, -this.wallDist, this.wallDist) * this.bank[i] : 0;
        pos.push(this.cx[i] + this.rx[i] * lat, this.cy[i] + b + h, this.cz[i] + this.rz[i] * lat);
        uv.push(plen[k] / uScale, d / vScale);
      }
    }
    for (let j = 0; j < count; j++)
      for (let k = 0; k < P - 1; k++) {
        const a = j * P + k, b = a + 1, c = a + P, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Abschnitt mit der geringsten Krümmung im Bereich [from, to] (Anteil der Runde)
  findStraight(lengthM, from, to, avoid = []) {
    const N = this.N, w = Math.round(lengthM / this.ds);
    let best = -1, bv = Infinity;
    for (let i = Math.floor(from * N); i < Math.floor(to * N); i += 3) {
      if (avoid.some(([a, b]) => i + w > a && i < b)) continue;
      let m = 0;
      for (let o = 0; o < w; o += 2) m = Math.max(m, Math.abs(this.k[(i + o) % N]));
      if (m < bv) { bv = m; best = i; }
    }
    return { i0: best, count: w, maxK: bv };
  }

  // ----- Ideallinie ------------------------------------------------------
  computeRacingLine() {
    const N = this.N, cx = this.cx, cz = this.cz, rx = this.rx, rz = this.rz;
    const maxOff = this.halfWidth - 1.8;
    const o = new Float32Array(N);
    const passes = [[26, 80], [14, 80], [7, 80], [3, 40]];
    for (const [K, iters] of passes) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < N; i++) {
          const a = (i - K + N) % N, b = (i + K) % N;
          const mx = (cx[a] + rx[a] * o[a] + cx[b] + rx[b] * o[b]) * 0.5;
          const mz = (cz[a] + rz[a] * o[a] + cz[b] + rz[b] * o[b]) * 0.5;
          const px = cx[i] + rx[i] * o[i], pz = cz[i] + rz[i] * o[i];
          const d = (mx - px) * rx[i] + (mz - pz) * rz[i];
          o[i] = clamp(o[i] + d * 0.55, -maxOff, maxOff);
        }
      }
    }
    this.line = smoothArray(o, 2, 1);
    const lk = new Float32Array(N);
    const P = (j) => {
      j = (j + N) % N;
      return [cx[j] + rx[j] * this.line[j], cz[j] + rz[j] * this.line[j]];
    };
    for (let i = 0; i < N; i++) {
      const [ax, az] = P(i - 4), [bx, bz] = P(i), [qx, qz] = P(i + 4);
      const a = Math.hypot(bx - ax, bz - az), b = Math.hypot(qx - bx, qz - bz), c = Math.hypot(qx - ax, qz - az);
      const cross = Math.abs((bx - ax) * (qz - az) - (bz - az) * (qx - ax));
      lk[i] = (2 * cross) / Math.max(a * b * c, 1e-6);
    }
    this.lineK = smoothArray(lk, 3, 1);
  }

  speedProfile(aLat, aBrake, vMax) {
    const N = this.N;
    const v = new Float32Array(N);
    for (let i = 0; i < N; i++) v[i] = Math.min(vMax, Math.sqrt(aLat / Math.max(this.lineK[i], 1e-5)));
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const n = (i + 1) % N;
        const dsl = Math.max(0.5, this.ds * (1 - this.slope[i] * 2));
        v[i] = Math.min(v[i], Math.sqrt(v[n] * v[n] + 2 * aBrake * dsl));
      }
    }
    return v;
  }

  // ----- Räumliches Gitter für Abstandsabfragen --------------------------
  buildGrid() {
    this.cell = 16;
    this.grid = new Map();
    for (let i = 0; i < this.N; i++) {
      const key = this._key(Math.floor(this.cx[i] / this.cell), Math.floor(this.cz[i] / this.cell));
      let arr = this.grid.get(key);
      if (!arr) this.grid.set(key, (arr = []));
      arr.push(i);
    }
  }
  _key(ix, iz) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }
  // Nächster Streckenpunkt im Umkreis maxDist (sonst d = Infinity)
  nearest(x, z, maxDist = 64, out = this._tmp) {
    const cs = this.cell;
    const r = Math.ceil(maxDist / cs);
    const ix = Math.floor(x / cs), iz = Math.floor(z / cs);
    let bd = Infinity, bi = -1;
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) {
        const arr = this.grid.get(this._key(ix + a, iz + b));
        if (!arr) continue;
        for (let k = 0; k < arr.length; k++) {
          const i = arr[k];
          const dx = x - this.cx[i], dz = z - this.cz[i];
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; bi = i; }
        }
      }
    out.idx = bi;
    out.d = Math.sqrt(bd);
    if (bi >= 0) {
      out.lateral = (x - this.cx[bi]) * this.rx[bi] + (z - this.cz[bi]) * this.rz[bi];
      out.y = this.cy[bi] + clamp(out.lateral, -this.wallDist, this.wallDist) * this.bank[bi];
    }
    return out;
  }

  bounds() {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < this.N; i++) {
      minX = Math.min(minX, this.cx[i]);
      maxX = Math.max(maxX, this.cx[i]);
      minZ = Math.min(minZ, this.cz[i]);
      maxZ = Math.max(maxZ, this.cz[i]);
    }
    return { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
  }

  // ----- Geometrie -------------------------------------------------------
  // Erzeugt einen Streifen entlang der Strecke zwischen zwei seitlichen Abständen.
  _strip(latA, latB, yOffA, yOffB, uvFn, { flip = false } = {}) {
    const N = this.N;
    const pos = new Float32Array((N + 1) * 2 * 3);
    const uv = new Float32Array((N + 1) * 2 * 2);
    for (let j = 0; j <= N; j++) {
      const i = j % N;
      const d = j === N ? this.length : this.dist[i];
      const lats = [latA, latB], yo = [yOffA, yOffB];
      for (let s = 0; s < 2; s++) {
        const lat = typeof lats[s] === 'function' ? lats[s](i) : lats[s];
        const o = (j * 2 + s) * 3;
        pos[o] = this.cx[i] + this.rx[i] * lat;
        pos[o + 1] = this.cy[i] + lat * this.bank[i] + yo[s];
        pos[o + 2] = this.cz[i] + this.rz[i] * lat;
        const [u, v] = uvFn(s, d, lat);
        uv[(j * 2 + s) * 2] = u;
        uv[(j * 2 + s) * 2 + 1] = v;
      }
    }
    const idx = [];
    for (let j = 0; j < N; j++) {
      const a = j * 2, b = j * 2 + 1, c = (j + 1) * 2, d = (j + 1) * 2 + 1;
      if (!flip) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  buildMeshes(mats, opts = {}) {
    const group = new THREE.Group();
    const hw = this.halfWidth, wd = this.wallDist;

    // Fahrbahn
    const road = new THREE.Mesh(
      this._strip(-hw, hw, 0, 0, (s, d) => [s, d / 24]),
      mats.road
    );
    road.receiveShadow = true;
    group.add(road);

    // Seitenstreifen (Gras/Sand/Schnee)
    for (const side of [-1, 1]) {
      const a = side < 0 ? -wd - 0.6 : hw - 0.05;
      const b = side < 0 ? -hw + 0.05 : wd + 0.6;
      const sh = new THREE.Mesh(
        this._strip(a, b, -0.04, -0.04, (s, d, lat) => [lat / 5, d / 5]),
        mats.shoulder
      );
      sh.receiveShadow = true;
      group.add(sh);
    }

    // Randsteine (nur in Kurven)
    group.add(this._buildCurbs(mats.curb));

    // Mauern / Leitplanken
    for (const side of [-1, 1]) {
      const inner = side * wd, outer = side * (wd + 0.45);
      const flip = side > 0;
      const face = this._strip(inner, inner, -2.6, 1.05, (s, d) => [d / 16, s === 0 ? -2.32 : 1], { flip: !flip });
      // Innenseite: ein Streifen mit identischem lateral aber verschiedenen Höhen
      const wallIn = new THREE.Mesh(face, mats.wall);
      wallIn.receiveShadow = true;
      wallIn.castShadow = !!opts.wallShadows;
      group.add(wallIn);
      const top = new THREE.Mesh(this._strip(inner, outer, 1.05, 1.05, (s, d) => [d / 16, 0.98], { flip: side < 0 }), mats.wallTop);
      group.add(top);
      const out = new THREE.Mesh(this._strip(outer, outer, -2.6, 1.05, (s, d) => [d / 16, s === 0 ? -2.32 : 1], { flip }), mats.wall);
      group.add(out);
      if (mats.neon) {
        const neon = new THREE.Mesh(this._strip(inner * 0.999, inner * 0.999, 0.75, 0.95, (s, d) => [d / 30, s], { flip: side < 0 }), mats.neon);
        group.add(neon);
      }
    }

    // Start-/Ziellinie
    const sl = this._patch(0, 2.2, -hw, hw, 0.02);
    const start = new THREE.Mesh(sl, mats.startLine);
    group.add(start);

    // Startplätze
    const gm = [];
    for (let i = 0; i < 8; i++) {
      const s = this.gridSlot(i);
      gm.push(this._patchGeo(s.along + 2.6, 0.35, s.lateral - 1.4, s.lateral + 1.4, 0.02));
    }
    for (const g of gm) group.add(new THREE.Mesh(g, mats.gridMark));

    return group;
  }

  // Rechteckiger Flicken auf der Fahrbahn
  _patchGeo(along, len, latA, latB, yOff) {
    const segs = 4;
    const pos = [], uv = [], idx = [];
    const p = {};
    for (let j = 0; j <= segs; j++) {
      const a = along + (len * j) / segs - len / 2;
      for (let s = 0; s < 2; s++) {
        const lat = s ? latB : latA;
        this.pointAt(a, lat, p);
        pos.push(p.x, p.y + yOff, p.z);
        uv.push(s, j / segs);
      }
    }
    for (let j = 0; j < segs; j++) {
      const a = j * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  _patch(along, len, latA, latB, yOff) {
    return this._patchGeo(along + len / 2, len, latA, latB, yOff);
  }

  _buildCurbs(mat) {
    const N = this.N, hw = this.halfWidth;
    const pos = [], col = [];
    const red = new THREE.Color(mat.userData.colorA || '#d8262b');
    const white = new THREE.Color(mat.userData.colorB || '#f2f2f2');
    const profile = [
      [-0.55, 0.012],
      [0.25, 0.07],
      [1.0, 0.02],
    ];
    const thr = 1 / 210;
    for (const side of [-1, 1]) {
      for (let i = 0; i < N; i++) {
        const n = (i + 1) % N;
        const kk = Math.max(Math.abs(this.k[i]), Math.abs(this.k[n]));
        if (kk < thr) continue;
        const c = Math.floor(i / 2) % 2 ? red : white;
        for (let p = 0; p < profile.length - 1; p++) {
          const v = [];
          for (const [ii, pp] of [[i, p], [n, p], [i, p + 1], [n, p + 1]]) {
            const lat = side * (hw + profile[pp][0]);
            v.push([
              this.cx[ii] + this.rx[ii] * lat,
              this.cy[ii] + lat * this.bank[ii] + profile[pp][1],
              this.cz[ii] + this.rz[ii] * lat,
            ]);
          }
          const tris = side > 0 ? [0, 2, 1, 2, 3, 1] : [0, 1, 2, 2, 1, 3];
          for (const t of tris) {
            pos.push(...v[t]);
            col.push(c.r, c.g, c.b);
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    return m;
  }

  // Punkte für Minikarte (normiert)
  minimapPoints(step = 4) {
    const b = this.bounds();
    const w = b.maxX - b.minX, h = b.maxZ - b.minZ;
    const s = Math.max(w, h);
    const pts = [];
    for (let i = 0; i < this.N; i += step) pts.push([(this.cx[i] - b.cx) / s, (this.cz[i] - b.cz) / s]);
    return { pts, bounds: b, scale: s };
  }
}
