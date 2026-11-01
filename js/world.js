// Rennwelt: Szene, Fahrzeuge, Rennablauf, Kollisionen, Effekte
import * as THREE from '../vendor/three.module.min.js';
import { Track } from './track.js';
import { Environment } from './environment.js';
import { Car } from './car.js';
import { AIDriver, DIFFICULTY } from './ai.js';
import { CameraRig } from './camera.js';
import { ParticleSystem, SkidMarks } from './effects.js';
import { getTrackDef } from './tracks.js';
import { CARS, PAINTS, getCarDef } from './carModel.js';
import { clamp, rng, hashString, formatTime, formatDelta, lerp } from './utils.js';

const STEP = 1 / 120;
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const LIVS = ['plain', 'stripes', 'side', 'twotone', 'race'];
const AI_NAMES = ['M. Brandt', 'L. Moreau', 'K. Tanaka', 'S. Rossi', 'A. Novak', 'J. Silva', 'E. Larsen', 'R. Okafor', 'T. Weber', 'N. Ivanova'];

export class World {
  constructor(game, config) {
    this.game = game;
    this.cfg = config;
    this.scene = new THREE.Scene();
    this.camera = game.camera;
    this.rig = new CameraRig(this.camera);
    this.rig.setMode(game.storage.settings.camera || 0);
    this.cars = [];
    this.ais = new Map();
    this.player = null;
    this.phase = 'intro';
    this.phaseTime = 0;
    this.time = 0;
    this.acc = 0;
    this.stepCount = 0;
    this.paused = false;
    this.laps = config.laps || 3;
    this.events = [];
    this.ghostRec = [];
    this.ghostCar = null;
    this.recordLap = null;
    this.delta = null;
    this.focusIdx = 0;
    this.focusTimer = 0;
    this._v = new THREE.Vector3();
    this.lastLights = -1;
  }

  build() {
    const g = this.game;
    const q = g.qualityPreset();
    const def = getTrackDef(this.cfg.trackId);
    this.track = new Track(def);
    this.env = new Environment(g.renderer, this.scene, this.track, q);
    this.env.build();
    this.recordLap = g.storage.record(def.id).lap || null;

    const night = !!this.env.theme.night;
    const mode = this.cfg.mode;
    const r = rng(hashString(def.id + (this.cfg.seed || Date.now())));
    const diff = DIFFICULTY[this.cfg.difficulty] || DIFFICULTY.normal;

    // Gegner
    const nOpp = mode === 'trial' ? 0 : mode === 'attract' ? 7 : this.cfg.opponents;
    const usedColors = new Set([this.cfg.color]);
    const pool = CARS.filter((c) => !c.locked || this.cfg.difficulty === 'hard');
    const opp = [];
    const names = [...AI_NAMES].sort(() => r() - 0.5);
    for (let i = 0; i < nOpp; i++) {
      const cdef = pool[Math.floor(r() * pool.length)];
      let color = PAINTS[Math.floor(r() * PAINTS.length)];
      for (let k = 0; k < 12 && usedColors.has(color); k++) color = PAINTS[Math.floor(r() * PAINTS.length)];
      usedColors.add(color);
      const t = nOpp > 1 ? i / (nOpp - 1) : 0.5;
      const skill = mode === 'attract' ? 0.9 + r() * 0.06 : lerp(diff.skill[1], diff.skill[0], t) + (r() - 0.5) * 0.01;
      opp.push({ cdef, color, skill, name: names[i % names.length], livery: LIVS[Math.floor(r() * LIVS.length)], number: 2 + Math.floor(r() * 97) });
    }
    if (mode === 'online') {
      // Feld kommt vollständig vom Gastgeber (gleiche Reihenfolge auf allen Geräten)
      opp.length = 0;
      this.cfg.entrants.forEach((e, k) => {
        const isMe = e.id === this.cfg.localId;
        const car = new Car(getCarDef(e.carId), e.color, this.track, { name: e.name, isPlayer: isMe, player: isMe, physical: q.physical, night, shadows: q.shadows, livery: e.livery, number: e.number });
        car.netIdx = k;
        car.entrantId = e.id;
        car.human = !e.ai;
        this.addCar(car, k);
        if (isMe) {
          this.player = car;
          car.nitro = 0.5;
        } else if (e.ai && this.cfg.isHost) {
          this.ais.set(car, new AIDriver(car, this.track, e.skill, r));
        } else {
          car.remote = true;
        }
      });
    }
    if (this.cfg.roster) {
      opp.length = 0;
      for (const o of this.cfg.roster) opp.push({ cdef: getCarDef(o.carId), color: o.color, skill: o.skill, name: o.name, livery: o.livery, number: o.number });
    }
    opp.sort((a, b) => b.skill - a.skill);
    let slot = 0;
    for (const o of opp) {
      const car = new Car(o.cdef, o.color, this.track, { name: o.name, physical: q.physical, night, shadows: q.shadows, livery: o.livery, number: o.number });
      this.addCar(car, slot++);
      this.ais.set(car, new AIDriver(car, this.track, o.skill, r));
    }
    if (mode !== 'attract' && mode !== 'online') {
      const pdef = getCarDef(this.cfg.carId);
      const car = new Car(pdef, this.cfg.color, this.track, { name: g.storage.settings.playerName || 'Du', isPlayer: true, physical: q.physical, night, player: true, shadows: q.shadows, livery: this.cfg.livery, number: 1 });
      this.addCar(car, slot++);
      this.player = car;
      car.nitro = 0.5;
    }

    // Geist im Zeitfahren
    if (mode === 'trial') {
      const gh = g.storage.ghost(def.id);
      if (gh && gh.frames && gh.frames.length > 10) {
        this.ghostData = gh;
        this.createGhostCar();
      }
    }

    // Effekte
    this.smoke = new ParticleSystem(this.scene, q.level === 0 ? 300 : 700, false);
    this.fx = new ParticleSystem(this.scene, q.level === 0 ? 250 : 500, true);
    this.skid = new SkidMarks(this.scene, q.level === 0 ? 600 : 1500);
    const th = this.track.def.theme;
    this.smokeColor = th === 'canyon' ? '#c9976d' : th === 'alps' ? '#f4f8ff' : th === 'city' ? '#8a8a99' : '#d8d2cc';
    this.dustColor = th === 'canyon' ? '#b9784a' : th === 'alps' ? '#ffffff' : th === 'city' ? '#555' : '#9a8a60';

    this.focus = this.player || this.cars[0];
    if (mode === 'attract') {
      this.phase = 'race';
      // Fahrzeuge bereits verteilt auf der Strecke
      this.cars.forEach((c, i) => {
        const along = (this.track.length * i) / this.cars.length;
        c.placeAt(along, (i % 2 ? 1 : -1) * 2);
        c.totalDist = along;
        c.maxLapFloor = 0;
        c.speed = 0;
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
        c.vx = fx * 30;
        c.vz = fz * 30;
      });
      this.rig.tv.timer = 0;
    } else {
      this.env.setStartLights(0);
      this.rig.updateIntro(0, this.focus, 0);
      if (mode === 'online') this.phase = 'wait';
    }
  }

  get online() {
    return this.cfg.mode === 'online';
  }

  addCar(car, slot) {
    const s = this.track.gridSlot(slot);
    car.placeAt(s.along, s.lateral);
    car.totalDist = s.along - this.track.length;
    car.maxLapFloor = -1;
    car.grid = slot;
    car.position = slot + 1;
    this.scene.add(car.mesh);
    this.cars.push(car);
  }

  // ---------------------------------------------------------------------
  update(dt) {
    if (this.paused) return;
    dt = Math.min(dt, 0.1);
    this.phaseTime += dt;
    const hud = this.game.hud;
    const audio = this.game.audio;

    if (this.phase === 'intro' && this.phaseTime > 3.0) {
      this.setPhase('countdown');
    }
    if (this.phase === 'countdown') {
      const n = Math.min(5, Math.floor(this.phaseTime / 0.7));
      if (n !== this.lastLights && this.phaseTime < 3.5 + this.goDelay) {
        this.lastLights = n;
        this.env.setStartLights(n);
        this.game.setHudLights(n, false);
        if (n > 0) audio.beep(440, 0.16, 0.3);
      }
      if (this.phaseTime >= 3.5 + (this.goDelay || 0)) {
        this.env.setStartLights(0, true);
        this.game.setHudLights(5, true);
        audio.beep(880, 0.5, 0.4);
        hud.message('LOS!', 1.0, 'go');
        this.setPhase('race');
        for (const c of this.cars) c.lapStart = 0;
        // Raketenstart, wenn Gas im richtigen Moment
        if (this.player && this.player.input.throttle > 0 && this.player.rpm > 0.5 && this.player.rpm < 0.85) {
          this.player.speed = 8;
          this.player.vx = Math.sin(this.player.heading) * 8;
          this.player.vz = Math.cos(this.player.heading) * 8;
          hud.sub('PERFEKTER START!', 1.6, 'good');
          audio.whoosh();
        }
      }
    }
    if (this.phase === 'race' && this.phaseTime > 1.2) this.game.setHudLights(-1);
    if (this.phase === 'wait' && Math.floor(this.phaseTime * 2) !== this._waitMsg) {
      this._waitMsg = Math.floor(this.phaseTime * 2);
      if (this._waitMsg % 4 === 0) hud.sub('WARTE AUF MITSPIELER …', 2);
    }
    if (this.phase === 'finish' && this.phaseTime > 6 && !this.resultsShown && !this.online) {
      this.resultsShown = true;
      this.game.onRaceComplete(this.results());
    }

    // Spieler-Eingabe
    if (this.player) {
      const s = this.game.input.state;
      const pi = this.player.input;
      if (this.phase === 'finish' || this.player.finished) {
        // Autopilot
      } else if (this.menuOpen) {
        pi.throttle = 0; pi.brake = 1; pi.steer = 0; pi.handbrake = false; pi.nitro = false;
      } else {
        pi.throttle = s.throttle;
        pi.brake = s.brake;
        pi.steer = s.steer;
        pi.handbrake = s.handbrake;
        pi.nitro = s.nitro;
      }
    }

    // Ferngesteuerte Autos (Mitspieler / KI des Gastgebers) nachführen
    if (this.online) {
      const now = performance.now();
      for (const c of this.cars) if (c.remote) c.applyNet(now);
    }

    // Physik mit festem Zeitschritt
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 10) {
      this.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 10) this.acc = 0;

    // Visuelles
    for (const c of this.cars) c.updateVisual(dt);
    this.updateGhost();
    this.updateEffects(dt);
    this.updateCamera(dt);
    this.env.update(dt, this.camera, this.focus);
    const H = this.game.renderer.domElement.height;
    this.smoke.update(dt, this.camera, H);
    this.fx.update(dt, this.camera, H);

    // Audio
    if (this.player && this.phase !== 'intro') {
      let near = null, nd = Infinity;
      for (const c of this.cars) {
        if (c === this.player) continue;
        const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
        if (d < nd) { nd = d; near = c; }
      }
      const cam = this.camera;
      const rx = -Math.cos(this.rig.yaw), rz = Math.sin(this.rig.yaw);
      audio.update(this.player, near ? { car: near } : null, { x: cam.position.x, z: cam.position.z, rx, rz });
    } else audio.silence();

    if (this.player && this.phase !== 'intro' && this.phase !== 'wait') hud.update(dt, this);
    if (this.online && this.game.mp) this.game.mp.tick(dt, this);
  }

  setPhase(p) {
    this.phase = p;
    this.phaseTime = 0;
    if (p === 'countdown') {
      this.goDelay = this.fixedGoDelay ?? 0.2 + Math.random() * 0.8;
      this.lastLights = -1;
      this.game.onCountdown();
    }
    if (p === 'race') this.game.onRaceStart();
  }

  step(h) {
    const racing = this.phase === 'race' || this.phase === 'finish';
    this.stepCount++;
    const aiTick = this.stepCount % 2 === 0;
    for (const [car, ai] of this.ais) {
      if (aiTick && racing) ai.update(h * 2, this.cars);
    }
    if (this.player && racing && (this.player.finished || this.phase === 'finish')) {
      if (!this.ais.has(this.player)) this.ais.set(this.player, new AIDriver(this.player, this.track, 0.86));
    }
    // Gummiband
    if (this.player && this.cfg.mode !== 'trial' && !this.online) {
      const diff = DIFFICULTY[this.cfg.difficulty] || DIFFICULTY.normal;
      for (const c of this.cars) {
        if (c === this.player) continue;
        const gap = c.totalDist - this.player.totalDist;
        c.speedFactor = 1 - clamp(gap / 260, -1, 1) * diff.rubber;
      }
    }
    for (const c of this.cars) {
      if (c.remote) continue;
      if (!racing) {
        // Motor hochdrehen in der Startaufstellung
        const thr = c === this.player ? this.player.input.throttle : this.phase === 'countdown' && this.phaseTime > 2.5 ? 0.6 : 0;
        c.rpm = lerp(c.rpm, 0.15 + thr * 0.7, 0.05);
        c.input.throttle = thr;
        continue;
      }
      c.update(h, true);
    }
    if (racing) {
      this.collide();
      this.raceLogic();
      if (this.phase === 'race' || this.phase === 'finish') this.time += h;
      if (this.player && !this.player.finished && this.cfg.mode !== 'attract') this.recordGhost();
    }
  }

  collide() {
    const cars = this.cars;
    const R = 1.08;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (a.remote && b.remote) continue;
        const dx0 = b.x - a.x, dz0 = b.z - a.z;
        if (dx0 * dx0 + dz0 * dz0 > 36) continue;
        const afx = Math.sin(a.heading), afz = Math.cos(a.heading);
        const bfx = Math.sin(b.heading), bfz = Math.cos(b.heading);
        for (const sa of [-1.15, 1.15]) {
          for (const sb of [-1.15, 1.15]) {
            const ax = a.x + afx * sa, az = a.z + afz * sa;
            const bx = b.x + bfx * sb, bz = b.z + bfz * sb;
            let dx = bx - ax, dz = bz - az;
            const d2 = dx * dx + dz * dz;
            if (d2 >= 4 * R * R || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d, nz = dz / d;
            const pen = 2 * R - d;
            // ferngesteuerte Autos gelten als unbeweglich (ihr Gerät berechnet die eigene Reaktion)
            const ma = a.remote ? 1e9 : a.def.mass, mb = b.remote ? 1e9 : b.def.mass;
            const wa = mb / (ma + mb), wb = ma / (ma + mb);
            a.x -= nx * pen * wa;
            a.z -= nz * pen * wa;
            b.x += nx * pen * wb;
            b.z += nz * pen * wb;
            const rvx = b.vx - a.vx, rvz = b.vz - a.vz;
            const vn = rvx * nx + rvz * nz;
            if (vn < 0) {
              const e = 0.25;
              const jImp = (-(1 + e) * vn) / (1 / ma + 1 / mb);
              a.vx -= (jImp / ma) * nx;
              a.vz -= (jImp / ma) * nz;
              b.vx += (jImp / mb) * nx;
              b.vz += (jImp / mb) * nz;
              // Drehimpuls durch außermittigen Stoß
              const ta = sa * (afx * nz - afz * nx);
              const tb = sb * (bfx * nz - bfz * nx);
              a.yawRate += ta * (jImp / ma) * 0.12;
              b.yawRate -= tb * (jImp / mb) * 0.12;
              if (-vn > 2) {
                const ev = { type: 'car', power: -vn, x: (ax + bx) / 2, y: (a.y + b.y) / 2 + 0.6, z: (az + bz) / 2, a, b };
                this.events.push(ev);
              }
            }
          }
        }
      }
    }
  }

  raceLogic() {
    const L = this.track.length;
    for (const c of this.cars) {
      if (c.remote) continue;
      const lf = Math.floor(c.totalDist / L);
      if (lf > c.maxLapFloor) {
        c.maxLapFloor = lf;
        if (lf >= 1 && !c.finished) {
          const lt = this.time - c.lapStart;
          c.lapTimes.push(lt);
          c.lapStart = this.time;
          c.lapsDone = lf;
          const wasBest = lt < c.bestLap;
          if (wasBest) c.bestLap = lt;
          if (c === this.player) this.onPlayerLap(lt, wasBest);
          if (lf >= this.laps && this.cfg.mode !== 'attract') {
            c.finished = true;
            c.finishTime = this.time;
            if (c === this.player) this.onPlayerFinish();
            if (this.online && this.game.mp) this.game.mp.carFinished(c);
          }
        }
      }
    }
    // Positionen
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalDist - a.totalDist;
    });
    sorted.forEach((c, i) => (c.position = i + 1));
    if (this.phase === 'finish' && !this.online && this.cars.every((c) => c.finished) && !this.resultsShown && this.phaseTime > 2.5) {
      this.resultsShown = true;
      this.game.onRaceComplete(this.results());
    }
  }

  onPlayerLap(lt, wasBest) {
    const hud = this.game.hud;
    const st = this.game.storage;
    const def = this.track.def;
    const isRecord = st.submitLap(def.id, lt, this.player.def.id);
    if (isRecord) this.recordLap = lt;
    // Geist speichern
    if (this.ghostRec.length > 10) {
      const old = st.ghost(def.id);
      if (!old || lt < old.time) {
        st.setGhost(def.id, { car: this.player.def.id, color: this.player.color, time: lt, frames: this.ghostRec });
        if (this.cfg.mode === 'trial') {
          this.ghostData = st.ghost(def.id);
          if (!this.ghostCar) this.createGhostCar();
        }
      }
    }
    this.ghostRec = [];
    const remaining = this.laps - this.player.lapsDone;
    if (isRecord) {
      hud.message('NEUER REKORD!', 2, 'record');
      this.game.audio.fanfare(true);
    } else if (remaining === 1 && this.cfg.mode !== 'trial') {
      hud.message('LETZTE RUNDE!', 2, 'last');
      this.game.audio.beep(990, 0.3, 0.3, 'triangle');
    }
    const prevBest = this.player.lapTimes.length > 1 ? Math.min(...this.player.lapTimes.slice(0, -1)) : null;
    hud.sub(`RUNDE ${formatTime(lt)}${prevBest ? '  ' + formatDelta(lt - prevBest) : ''}`, 2.4, wasBest ? 'good' : '');
  }

  createGhostCar() {
    const gh = this.ghostData;
    const gc = new Car(getCarDef(gh.car), gh.color || '#88ccff', this.track, { ghost: true });
    gc.mesh.traverse((o) => {
      if (o.isMesh) {
        const ghostify = (m) => {
          const c = m.clone();
          c.transparent = true;
          c.opacity = 0.3;
          c.depthWrite = false;
          return c;
        };
        o.material = Array.isArray(o.material) ? o.material.map(ghostify) : ghostify(o.material);
        o.castShadow = false;
      }
    });
    gc.mesh.visible = false;
    this.scene.add(gc.mesh);
    this.ghostCar = gc;
  }

  onPlayerFinish() {
    const p = this.player;
    this.setPhase('finish');
    this.ais.set(p, new AIDriver(p, this.track, 0.86));
    const hud = this.game.hud;
    if (this.cfg.mode === 'trial') hud.message('ZEITFAHREN BEENDET', 3, 'finish');
    else {
      const pos = p.position;
      hud.message(pos === 1 ? 'SIEG!' : `PLATZ ${pos}`, 3.5, pos === 1 ? 'win' : 'finish');
      this.game.audio.fanfare(pos <= 3);
    }
    this.game.storage.submitRace(this.track.def.id, p.finishTime, p.def.id, this.laps);
    this.game.input.setEnabled(false);
  }

  recordGhost() {
    const p = this.player;
    if (this.phase !== 'race') return;
    const lt = this.time - p.lapStart;
    const last = this.ghostRec[this.ghostRec.length - 1];
    if (!last || lt - last[0] >= 0.1) {
      const d = p.totalDist - p.lapsDone * this.track.length;
      this.ghostRec.push([+lt.toFixed(2), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.heading.toFixed(3), +d.toFixed(1)]);
    }
  }

  updateGhost() {
    const gc = this.ghostCar;
    const gd = this.ghostData;
    if (!gc || !gd || !this.player) return;
    const fr = gd.frames;
    const lt = this.time - this.player.lapStart;
    if (this.phase !== 'race' || lt > fr[fr.length - 1][0]) {
      gc.mesh.visible = false;
      gc.visible = false;
      this.delta = null;
      return;
    }
    // Binärsuche nach Zeit
    let lo = 0, hi = fr.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (fr[m][0] <= lt) lo = m;
      else hi = m;
    }
    const a = fr[lo], b = fr[hi];
    const t = clamp((lt - a[0]) / Math.max(0.001, b[0] - a[0]), 0, 1);
    gc.x = lerp(a[1], b[1], t);
    gc.y = lerp(a[2], b[2], t);
    gc.z = lerp(a[3], b[3], t);
    let dh = b[4] - a[4];
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    gc.heading = a[4] + dh * t;
    gc.mesh.position.set(gc.x, gc.y, gc.z);
    gc.mesh.rotation.set(0, gc.heading, 0);
    const near = Math.hypot(gc.x - this.player.x, gc.z - this.player.z);
    gc.mesh.visible = near > 3;
    gc.visible = true;
    // Delta über Streckendistanz
    const pd = this.player.totalDist - this.player.lapsDone * this.track.length;
    if (pd > 5) {
      let l2 = 0, h2 = fr.length - 1;
      while (h2 - l2 > 1) {
        const m = (l2 + h2) >> 1;
        if (fr[m][5] <= pd) l2 = m;
        else h2 = m;
      }
      const fa = fr[l2], fb = fr[h2];
      const tt = clamp((pd - fa[5]) / Math.max(0.01, fb[5] - fa[5]), 0, 1);
      const gt = lerp(fa[0], fb[0], tt);
      this.delta = lt - gt;
    } else this.delta = null;
  }

  updateEffects(dt) {
    const cam = this.camera.position;
    const tmp = this._v;
    const audio = this.game.audio;
    for (const c of this.cars) {
      const near = Math.hypot(c.x - cam.x, c.z - cam.z) < 140;
      const sp = Math.abs(c.speed);
      // Reifenspuren + Rauch
      const sliding = (c.slip > 0.42 || c.drifting || (c.braking && sp > 18 && c.input.brake > 0.8)) && sp > 4;
      for (const side of [-1, 1]) {
        c.rearWheelWorld(side, tmp);
        const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
        const key = c.grid * 2 + (side > 0 ? 1 : 0);
        this.skid.add(key, tmp.x, c.y, tmp.z, -fz, fx, sliding && !c.offroad ? clamp(c.slip + 0.4, 0, 1) : 0);
        if (!near) continue;
        if (sliding && Math.random() < 0.7) {
          this.smoke.emit(tmp.x, c.y + 0.25, tmp.z, (Math.random() - 0.5) * 2 + c.vx * 0.15, 0.6 + Math.random(), (Math.random() - 0.5) * 2 + c.vz * 0.15, 1.2 + Math.random() * 0.8, 0.8, 3.8, 0.4, this.smokeColor, -0.3, 1.2);
        }
        if (c.offroad && sp > 6 && Math.random() < 0.6) {
          this.smoke.emit(tmp.x, c.y + 0.2, tmp.z, c.vx * 0.25 + (Math.random() - 0.5) * 3, 1 + Math.random() * 2, c.vz * 0.25 + (Math.random() - 0.5) * 3, 0.9, 0.6, 3, 0.5, this.dustColor, 2, 1.5);
        }
      }
      // Nitro-Flammen
      if (c.nitroActive && near) {
        for (const e of c.model.exhausts) {
          c.localToWorld(e, tmp);
          const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
          for (let k = 0; k < 2; k++) {
            this.fx.emit(tmp.x, tmp.y, tmp.z, c.vx - fx * 6 + (Math.random() - 0.5), (Math.random() - 0.5), c.vz - fz * 6 + (Math.random() - 0.5), 0.12 + Math.random() * 0.08, 0.7, 0.15, 0.9, k ? '#5fb8ff' : '#ff9a3c', 0, 3);
          }
        }
      }
      // Ereignisse
      for (const ev of c.events) {
        this.handleEvent(ev, c);
      }
      c.events.length = 0;
    }
    for (const ev of this.events) this.handleEvent(ev);
    this.events.length = 0;

    // Drift-Anzeige beim Spieler
    const p = this.player;
    if (p && p.drifting && p.driftTime > 0.6 && this.phase === 'race') {
      if (!this._driftShown) {
        this._driftShown = true;
        this.game.hud.sub('DRIFT! NITRO +', 1.2, 'drift');
      }
    } else this._driftShown = false;
    if (p && p.nitroActive && !this._nitroWas) audio.whoosh();
    if (p) this._nitroWas = p.nitroActive;
  }

  handleEvent(ev, car) {
    const audio = this.game.audio;
    const n = Math.min(24, Math.floor(ev.power * 1.5));
    for (let i = 0; i < n; i++) {
      this.fx.emit(ev.x, ev.y, ev.z, (Math.random() - 0.5) * 10, Math.random() * 6, (Math.random() - 0.5) * 10, 0.3 + Math.random() * 0.4, 0.35, 0.1, 1, Math.random() < 0.5 ? '#ffd27a' : '#ff8a3c', 14, 0.5);
    }
    const involvesPlayer = this.player && (car === this.player || ev.a === this.player || ev.b === this.player);
    if (involvesPlayer) {
      audio.crash(ev.power);
      this.rig.addShake(Math.min(1, ev.power / 14));
      if (navigator.vibrate) navigator.vibrate(Math.min(80, ev.power * 4));
    } else if (this.player) {
      const d = Math.hypot(ev.x - this.player.x, ev.z - this.player.z);
      if (d < 40) audio.crash(ev.power * (1 - d / 40) * 0.6);
    }
  }

  updateCamera(dt) {
    const f = this.focus;
    if (this.cfg.mode === 'attract') {
      this.focusTimer -= dt;
      if (this.focusTimer <= 0) {
        this.focusTimer = 12;
        this.focusIdx = (this.focusIdx + 1) % this.cars.length;
        this.focus = this.cars[this.focusIdx];
        this.rig.tv.timer = 0;
      }
      this.rig.updateTV(dt, this.focus, this.track);
      return;
    }
    if (this.phase === 'wait') {
      this.rig.updateIntro(dt, f, 0);
    } else if (this.phase === 'intro') {
      this.rig.updateIntro(dt, f, clamp(this.phaseTime / 3.0, 0, 1));
      if (this.phaseTime > 2.95) this.rig.snap(f);
    } else if (this.phase === 'finish') {
      if (this.phaseTime < 3) this.rig.updateOrbit(dt, f, this.phaseTime);
      else this.rig.updateTV(dt, f, this.track);
    } else {
      this.rig.updateChase(dt, f);
    }
  }

  results() {
    const L = this.track.length;
    const out = this.cars.map((c) => {
      let time = c.finishTime;
      let estimated = false;
      if (!c.finished) {
        const remaining = this.laps * L - c.totalDist;
        const avg = Math.max(20, c.totalDist / Math.max(1, this.time));
        time = this.time + remaining / avg;
        estimated = true;
      }
      return { id: c.entrantId, name: c.name, carName: c.def.name, color: c.color, time, estimated, bestLap: isFinite(c.bestLap) ? c.bestLap : null, isPlayer: c === this.player };
    });
    out.sort((a, b) => a.time - b.time);
    out.forEach((r, i) => (r.pos = i + 1));
    return out;
  }

  resetPlayer() {
    if (!this.player || this.phase !== 'race' || this.player.finished) return;
    this.player.resetToTrack();
    this.game.hud.sub('ZURÜCKGESETZT', 1);
  }

  dispose() {
    this.env.dispose();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) m.dispose();
      }
    });
    this.scene.clear();
  }
}
