// Arcade-Fahrphysik + visuelle Aktualisierung eines Fahrzeugs
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, wrapAngle, sign, lerp } from './utils.js';
import { buildCarModel } from './carModel.js';

const G = 9.81;
const BRAKE_INPUT = { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false };
const WHEELBASE = 2.7;

export class Car {
  constructor(def, color, track, opts = {}) {
    this.def = def;
    this.color = color;
    this.track = track;
    this.name = opts.name || def.name;
    this.isPlayer = !!opts.isPlayer;
    this.isGhost = !!opts.ghost;
    this.model = buildCarModel(def, color, { physical: opts.physical, livery: opts.livery, number: opts.number, shadowStrong: !opts.shadows });
    this.mesh = this.model.root;
    if (opts.night) this.addNightLights(opts.player);

    this.x = 0; this.z = 0; this.y = 0;
    this.heading = 0;
    this.vx = 0; this.vz = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.speed = 0; // vorzeichenbehaftete Vorwärtsgeschwindigkeit
    this.latSpeed = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.nitro = 0.35;
    this.nitroActive = false;
    this.drifting = false;
    this.driftTime = 0;
    this.slip = 0;
    this.offroad = false;
    this.speedFactor = 1;
    this.proj = {};
    this.trackIdx = -1;

    // Rennfortschritt
    this.totalDist = 0;
    this.lastAlong = 0;
    this.maxLapFloor = -1;
    this.lapsDone = 0;
    this.lapStart = 0;
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = Infinity;
    this.position = 1;
    this.wrongWay = 0;
    this.stuckTime = 0;

    // Visuelles
    this.bodyRoll = 0; this.bodyPitch = 0; this.rollV = 0; this.pitchV = 0;
    this.susp = 0; this.suspV = 0;
    this.wheelSpin = 0;
    this.prevVF = 0; this.prevVR = 0;
    this.axF = 0;
    this.assist = 0.6;
    this.longAcc = 0; this.latAcc = 0;
    this.events = []; // Kollisionen etc. für Effekte/Sound
    this.braking = false;
    this.gear = 1;
    this.rpm = 0;
  }

  addNightLights(isPlayer) {
    const tex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(0.3, 'rgba(255,255,255,0.4)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      return t;
    })();
    const d = this.model.dims;
    const mk = (color, size, x, y, z) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.set(size, size, size);
      s.position.set(x, y, z);
      this.model.body.add(s);
      return s;
    };
    for (const sx of [-1, 1]) {
      mk('#fff2cc', 1.6, sx * (d.W / 2 - 0.36), 0.55, d.L / 2 + 0.1);
      this.tailGlow = this.tailGlow || [];
      this.tailGlow.push(mk('#ff2020', 1.0, sx * (d.W / 2 - 0.36), 0.75, -d.L / 2 - 0.1));
    }
    if (isPlayer) {
      const sl = new THREE.SpotLight('#fff1d6', 60, 70, 0.55, 0.5, 1.2);
      sl.position.set(0, 0.8, d.L / 2);
      sl.target.position.set(0, -1.5, d.L / 2 + 18);
      this.model.body.add(sl);
      this.model.body.add(sl.target);
      this.headlight = sl;
      const fill = new THREE.PointLight('#9fb0ff', 14, 16, 1.4);
      fill.position.set(0, 4.5, -2.5);
      this.model.body.add(fill);
    }
  }

  placeAt(along, lateral) {
    const p = this.track.pointAt(along, lateral);
    this.x = p.x;
    this.z = p.z;
    this.y = p.y;
    this.heading = p.heading;
    this.vx = this.vz = 0;
    this.yawRate = 0;
    this.speed = 0;
    this.trackIdx = -1;
    this.track.project(this.x, this.z, -1, this.proj);
    this.trackIdx = this.proj.idx;
    this.lastAlong = this.proj.along;
    this.updateVisual(0);
  }

  // Zurücksetzen auf die Strecke (z. B. wenn festgefahren)
  resetToTrack() {
    const p = this.proj;
    const lat = clamp(p.lateral, -this.track.halfWidth * 0.5, this.track.halfWidth * 0.5);
    const pt = this.track.pointAt(p.along + 2, lat);
    this.x = pt.x;
    this.z = pt.z;
    this.heading = pt.heading;
    this.vx = this.vz = 0;
    this.yawRate = 0;
    this.speed = 0;
    this.drifting = false;
    this.stuckTime = 0;
    this.wrongWay = 0;
    this.steer = 0;
    this.axF = 0;
    this.track.project(this.x, this.z, -1, this.proj);
    this.trackIdx = this.proj.idx;
  }

  update(dt, active = true) {
    // zwei Unterschritte für eine stabile Reifenphysik
    const h = dt / 2;
    this.integrate(h, active);
    this.integrate(h, active);
    this.postStep(dt, active);
  }

  // Dynamisches Einspurmodell (ISO: x vorwärts, y links, Gierrate positiv = Linkskurve)
  integrate(dt, active) {
    const d = this.def;
    const inp = active ? this.input : BRAKE_INPUT;
    const tr = this.track;
    const p = this.proj;
    const m = d.mass;
    const L = WHEELBASE;
    const b = L * (d.wf ?? 0.52); // Schwerpunkt → Hinterachse
    const a = L - b; // Schwerpunkt → Vorderachse
    const Iz = m * a * b * 1.1;
    const hcg = d.hcg ?? 0.5;

    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const lx = fz, lz = -fx; // lokales links
    let vx = this.vx * fx + this.vz * fz;
    let vy = this.vx * lx + this.vz * lz;
    let r = this.yawRate;
    const v = Math.hypot(vx, vy);

    // Untergrund: Seitenstreifen kostet nur wenig Grip und Tempo
    const absLat = Math.abs(p.lateral || 0);
    this.offroad = absLat > tr.halfWidth + 0.6;
    const offSkill = clamp(((d.offroad ?? 0.55) - 0.5) / 0.45, 0, 1);
    const surf = this.offroad ? 0.86 + offSkill * 0.12 : 1;
    const mu = 1.18 * d.grip * surf * (tr.def.theme === 'alps' ? 0.93 : 1);

    // Nitro
    const wantsNitro = inp.nitro && this.nitro > 0.01 && vx > 4;
    this.nitroActive = wantsNitro;
    if (wantsNitro) this.nitro = Math.max(0, this.nitro - dt / 3.6);
    else this.nitro = Math.min(1, this.nitro + dt * 0.012);
    const maxSpeed = d.maxSpeed * (this.nitroActive ? 1.2 : 1) * this.speedFactor;

    // Radlasten mit Abtrieb und Gewichtsverlagerung
    const down = m * 0.00068 * (d.aero ?? 1) * v * v;
    const shift = clamp((m * this.axF * hcg) / L, -m * G * 0.35, m * G * 0.35);
    const Fzf = Math.max(m * G * 0.12, (m * G * b) / L + down * 0.48 - shift);
    const Fzr = Math.max(m * G * 0.12, (m * G * a) / L + down * 0.52 + shift);

    // Lenkung: geschwindigkeitsabhängiger Einschlag, Gegenlenkhilfe
    const assist = this.assist ?? 0.6;
    const steerIn = clamp(inp.steer, -1, 1);
    this.steer = damp(this.steer, steerIn, this.isPlayer ? 9 : 8, dt);
    const dMax = (0.58 / (1 + Math.abs(vx) / 16)) * d.steer;
    const beta = Math.abs(vx) > 3 ? Math.atan2(vy, Math.abs(vx)) : 0;
    let delta = -this.steer * dMax;
    if (!inp.handbrake) delta += beta * 0.55 * assist * (1 - Math.abs(steerIn) * 0.5);
    delta = clamp(delta, -0.62, 0.62);

    // Längskräfte
    let Fdrive = 0;
    const rr = clamp(vx / maxSpeed, 0, 1.5);
    this.braking = false;
    let Fbrake = 0;
    if (inp.throttle > 0) {
      if (vx < -0.5) Fbrake = m * d.brake * 0.6 * inp.throttle;
      else Fdrive = m * inp.throttle * d.accel * 0.72 * Math.max(0, 1 - rr * rr) * (1 + 0.25 * Math.max(0, 1 - rr * 3));
    }
    if (this.nitroActive) Fdrive += m * 7.5 * Math.max(0, 1 - rr);
    if (inp.brake > 0) {
      if (vx > 0.8) {
        Fbrake += m * d.brake * inp.brake;
        this.braking = true;
      } else if (inp.throttle <= 0 && vx > -13) Fdrive -= m * 7 * inp.brake;
    }
    // Antriebsverteilung
    const dt0 = d.drive || 'rwd';
    const rearShare = dt0 === 'fwd' ? 0 : dt0 === 'awd' ? 0.6 : 1;
    let Fxr = Fdrive * rearShare, Fxf = Fdrive * (1 - rearShare);
    // Bremse 65 % vorne / 35 % hinten, ABS-artig auf Reibung begrenzt
    const bs = -Math.sign(vx || 1);
    Fxf += bs * Math.min(Fbrake * 0.65, mu * Fzf * 0.95);
    Fxr += bs * Math.min(Fbrake * 0.35, mu * Fzr * 0.95);
    let rearMu = mu;
    if (inp.handbrake && Math.abs(vx) > 1) {
      Fxr += bs * mu * Fzr * 0.5;
      rearMu = mu * 0.6;
    }
    if (this.drifting && inp.throttle > 0.3 && !inp.handbrake) rearMu = mu * 0.86;
    // Traktions-/Bremskontrolle (Teil der Fahrhilfe): lässt Seitenführung übrig
    const lateralNeed = clamp(Math.abs(this.steer) * 1.4 + Math.abs(beta) * 6, 0, 1);
    const tcK = 1 - 0.42 * assist * lateralNeed;
    if (!inp.handbrake && !this.drifting) {
      if (Fxr > 0) Fxr = Math.min(Fxr, rearMu * Fzr * tcK);
      if (Fxf > 0) Fxf = Math.min(Fxf, mu * Fzf * tcK);
    }
    if (Fbrake > 0) {
      Fxf = Math.sign(Fxf) * Math.min(Math.abs(Fxf), mu * Fzf * (1 - 0.25 * assist));
      Fxr = Math.sign(Fxr) * Math.min(Math.abs(Fxr), rearMu * Fzr * (1 - 0.25 * assist));
    }
    // Traktion begrenzen (durchdrehende Räder)
    const capF = mu * Fzf, capR = rearMu * Fzr;
    let spin = 0;
    if (Math.abs(Fxf) > capF) { spin = Math.max(spin, Math.abs(Fxf) / capF - 1); Fxf = Math.sign(Fxf) * capF; }
    if (Math.abs(Fxr) > capR) { spin = Math.max(spin, Math.abs(Fxr) / capR - 1); Fxr = Math.sign(Fxr) * capR; }

    // Schräglaufwinkel und Seitenkräfte (vereinfachtes Pacejka-Modell)
    const vxs = Math.max(Math.abs(vx), 6);
    const sgn = vx >= 0 ? 1 : -1;
    const af = Math.atan2(vy + a * r, vxs) - delta * sgn;
    const ar = Math.atan2(vy - b * r, vxs);
    const tire = (alpha, Fz, muAx, B, Fx) => {
      const cap = Math.sqrt(Math.max(0, (muAx * Fz) ** 2 - Fx * Fx));
      return -cap * Math.sin(1.3 * Math.atan(B * alpha));
    };
    // bei sehr niedrigem Tempo übernimmt das kinematische Modell (keine künstliche Reifenreibung)
    const kb = clamp((v - 2) / 5, 0, 1);
    const Fyf = tire(af, Fzf, mu, 20, Fxf) * kb;
    const Fyr = tire(ar, Fzr, rearMu, 17, Fxr) * kb;

    // Widerstände
    let Fres = m * (0.32 + 0.00022 * vx * vx) * Math.sign(vx) * (Math.abs(vx) > 0.05 ? 1 : 0);
    if (inp.throttle <= 0 && !this.nitroActive) Fres += m * 1.0 * Math.sign(vx) * clamp(Math.abs(vx), 0, 1);
    if (this.offroad) Fres += m * (0.5 + 0.0004 * vx * vx) * (1 - offSkill * 0.8) * Math.sign(vx) * clamp(Math.abs(vx) / 5, 0, 1);
    if (vx > maxSpeed) Fres += m * (vx - maxSpeed) * 1.2;
    const slopeAlong = (p.slope || 0) * (fx * (p.tx || 0) + fz * (p.tz || 0));
    Fres += m * G * slopeAlong * 0.8;

    const cd = Math.cos(delta), sd = Math.sin(delta);
    const Fx = Fxr + Fxf * cd - Fyf * sd - Fres;
    const Fy = Fyr + Fxf * sd + Fyf * cd;
    let Mz = a * (Fyf * cd + Fxf * sd) - b * Fyr;

    // Stabilitätshilfe: Gierrate sanft Richtung Lenkwunsch dämpfen (abschaltbar)
    if (assist > 0 && !inp.handbrake && !(this.drifting && inp.throttle > 0.3)) {
      const rTarget = clamp((vx * Math.tan(delta)) / L, -(mu * G * 1.1) / Math.max(v, 3), (mu * G * 1.1) / Math.max(v, 3));
      Mz += (rTarget - r) * Iz * 3.2 * assist;
    }

    // Drift-Begrenzer: hält den Driftwinkel kontrollierbar (ca. 25–40°)
    if (this.drifting && assist > 0) {
      const limit = 0.36 + (1 - assist) * 0.35;
      const excess = beta - clamp(beta, -limit, limit);
      Mz += Iz * (excess * 22 + beta * 1.2 * assist);
      if (Math.abs(beta) > limit) Mz += -Iz * r * 1.5;
    }

    let dvx = Fx / m + vy * r;
    let dvy = Fy / m - vx * r;
    const dr = Mz / Iz;
    const vxOld = vx;
    vx += dvx * dt;
    vy += dvy * dt;
    r += dr * dt;
    // beim Bremsen nicht rückwärts rollen
    if (this.braking && vxOld > 0 && vx < 0) vx = 0;

    // Niedriges Tempo: kinematisches Modell überblenden (stabil beim Anfahren/Rangieren)
    if (kb < 1) {
      const rKin = (vx * Math.tan(delta)) / L;
      r = lerp(rKin, r, kb);
      vy *= lerp(0.6, 1, kb);
    }

    this.heading = wrapAngle(this.heading + r * dt);
    this.yawRate = r;
    const nfx = Math.sin(this.heading), nfz = Math.cos(this.heading);
    this.vx = nfx * vx + nfz * vy;
    this.vz = nfz * vx - nfx * vy;
    this.speed = vx;
    this.latSpeed = -vy;
    this.axF = lerp(this.axF || 0, dvx - vy * r, 0.08);

    // Drift-Zustand (für Rauch, Nitro, Anzeige)
    const slipAng = Math.abs(Math.atan2(vy, Math.max(1, Math.abs(vx))));
    const trigger = Math.abs(steerIn) > 0.35 && vx > 14 && (inp.handbrake || (inp.brake > 0.4 && inp.throttle > 0.4));
    if (!this.drifting && (trigger || (slipAng > 0.2 && vx > 14))) {
      this.drifting = true;
      this.driftDir = sign(steerIn || -vy);
      this.driftTime = 0;
    }
    if (this.drifting) {
      this.driftTime += dt;
      if (vx < 9 || (slipAng < 0.07 && this.driftTime > 0.3)) this.drifting = false;
      this.nitro = Math.min(1, this.nitro + dt * 0.16 * clamp(slipAng * 4, 0, 1));
    }
    this.slip = clamp(Math.max((Math.abs(ar) - 0.09) / 0.15, (Math.abs(af) - 0.11) / 0.18, spin * 2), 0, 1);

    // Beschleunigungen für Karosseriebewegung (rechts positiv)
    this.longAcc = lerp(this.longAcc, dvx - vy * r, 0.1);
    this.latAcc = lerp(this.latAcc, -(Fy / m), 0.1);
    this.prevVF = vx;

    this.x += this.vx * dt;
    this.z += this.vz * dt;
  }

  postStep(dt, active) {
    const d = this.def;
    const inp = active ? this.input : BRAKE_INPUT;
    const tr = this.track;
    const p = this.proj;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const vF = this.speed;
    const speedAbs = Math.hypot(this.vx, this.vz);

    // Strecke
    tr.project(this.x, this.z, this.trackIdx, p);
    this.trackIdx = p.idx;
    const limit = tr.wallDist - 1.05 - tr.barrierAt(p.i0, Math.sign(p.lateral) || 1);
    if (Math.abs(p.lateral) > limit) {
      const s = sign(p.lateral);
      const pen = Math.abs(p.lateral) - limit;
      this.x -= p.rx * s * pen;
      this.z -= p.rz * s * pen;
      const vn = (this.vx * p.rx + this.vz * p.rz) * s;
      if (vn > 0) {
        this.vx -= p.rx * s * vn * 1.35;
        this.vz -= p.rz * s * vn * 1.35;
        const along = this.vx * p.tx + this.vz * p.tz;
        const fric = clamp(0.04 + vn * 0.02, 0, 0.5);
        this.vx -= p.tx * along * fric;
        this.vz -= p.tz * along * fric;
        // Ausrichtung zur Wand
        const th = Math.atan2(p.tx, p.tz);
        const facing = Math.cos(wrapAngle(this.heading - th)) >= 0 ? th : th + Math.PI;
        this.heading = wrapAngle(this.heading + wrapAngle(facing - this.heading) * clamp(vn * 0.03, 0.05, 0.4));
        this.yawRate *= 0.4;
        if (vn > 1.5) this.events.push({ type: 'wall', power: vn, x: this.x + p.rx * s * 1.0, y: this.y + 0.5, z: this.z + p.rz * s * 1.0 });
        if (vn > 6) this.drifting = false;
      }
      this.scraping = true;
    } else this.scraping = false;
    this.y = p.y;

    // Fortschritt
    const L = tr.length;
    let dA = p.along - this.lastAlong;
    if (dA < -L / 2) dA += L;
    if (dA > L / 2) dA -= L;
    this.totalDist += dA;
    this.lastAlong = p.along;

    // Falschfahrer-Erkennung
    const dirDot = fx * p.tx + fz * p.tz;
    if (dirDot < -0.4 && speedAbs > 4) this.wrongWay += dt;
    else this.wrongWay = Math.max(0, this.wrongWay - dt * 2);

    // Festgefahren?
    if (active && Math.abs(vF) < 1.5 && (inp.throttle > 0 || inp.brake > 0)) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt);

    // Getriebe / Drehzahl (für Sound + HUD)
    const ratios = [0, 0.16, 0.3, 0.45, 0.6, 0.77, 1.0];
    const fr = clamp(Math.abs(vF) / (d.maxSpeed * 1.02), 0, 1.15);
    let gear = 1;
    while (gear < 6 && fr > ratios[gear]) gear++;
    const lo = ratios[gear - 1], hi = ratios[gear];
    this.gear = vF < -0.5 ? -1 : gear;
    const targetRpm = clamp((fr - lo) / (hi - lo), 0, 1.1) * 0.75 + 0.22 + (inp.throttle > 0 ? 0.05 : 0);
    this.rpm = damp(this.rpm, Math.abs(vF) < 0.5 ? 0.15 + inp.throttle * 0.6 : targetRpm, 12, dt);
  }

  updateVisual(dt) {
    const p = this.proj;
    const m = this.mesh;
    m.position.set(this.x, this.y, this.z);
    // Fahrbahnneigung relativ zum Fahrzeug
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const gx = (p.tx || 0) * (p.slope || 0) + (p.rx || 0) * (p.bank || 0);
    const gz = (p.tz || 0) * (p.slope || 0) + (p.rz || 0) * (p.bank || 0);
    const pitch = -Math.atan(gx * fx + gz * fz);
    const roll = -Math.atan(gx * -fz + gz * fx);
    m.rotation.set(pitch, this.heading, roll, 'YXZ');

    if (dt > 0) {
      // Feder-Dämpfer für Karosseriebewegung
      const tRoll = clamp(-this.latAcc * 0.0065, -0.09, 0.09);
      const tPitch = clamp(-this.longAcc * 0.0045, -0.06, 0.06);
      this.rollV += ((tRoll - this.bodyRoll) * 120 - this.rollV * 14) * dt;
      this.pitchV += ((tPitch - this.bodyPitch) * 120 - this.pitchV * 14) * dt;
      this.bodyRoll += this.rollV * dt;
      this.bodyPitch += this.pitchV * dt;
      // Holpern abseits der Strecke
      let bump = 0;
      if (this.offroad && Math.abs(this.speed) > 2) bump = (Math.random() - 0.5) * 0.05 * clamp(Math.abs(this.speed) / 20, 0, 1);
      this.suspV += ((bump - this.susp) * 200 - this.suspV * 18) * dt;
      this.susp += this.suspV * dt;
      this.wheelSpin += (this.speed / this.model.dims.wr) * dt;
      if (this.drifting && this.input.throttle > 0) this.wheelSpin += dt * 12;
    }
    const b = this.model.body;
    b.rotation.set(this.bodyPitch, 0, this.bodyRoll, 'YXZ');
    b.position.y = this.susp;
    for (const w of this.model.wheels) {
      w.spin.rotation.x = this.wheelSpin;
      if (w.front) w.pivot.rotation.y = -this.steer * 0.5;
    }
    const brakeOn = this.braking || (this.input.brake > 0 && this.speed > 0.5);
    this.model.tail.emissiveIntensity = brakeOn ? 2.4 : 0.6;
    if (this.tailGlow) for (const s of this.tailGlow) s.scale.setScalar(brakeOn ? 1.8 : 1.0);
  }

  // ----- Netzwerk ---------------------------------------------------------
  // Kompakter Zustand (ganzzahlig, ~45 Byte als JSON):
  // [Index, x dm, y dm, z dm, Richtung mrad, vx dm/s, vz dm/s, Lenkung %, Flags, Distanz dm, Runden, Drehzahl %]
  packState(idx) {
    const f = (this.nitroActive ? 1 : 0) | (this.braking ? 2 : 0) | (this.drifting ? 4 : 0) | (this.finished ? 8 : 0) | (this.input.throttle > 0 ? 16 : 0);
    return [idx, Math.round(this.x * 10), Math.round(this.y * 10), Math.round(this.z * 10), Math.round(this.heading * 1000),
      Math.round(this.vx * 10), Math.round(this.vz * 10), Math.round(this.steer * 100), f, Math.round(this.totalDist * 10), this.lapsDone, Math.round(this.rpm * 100)];
  }

  pushNet(a, now) {
    if (!this.netBuf) this.netBuf = [];
    this.lastPack = a;
    this.netBuf.push({ t: now, x: a[1] / 10, y: a[2] / 10, z: a[3] / 10, h: a[4] / 1000, vx: a[5] / 10, vz: a[6] / 10, st: a[7] / 100, f: a[8], d: a[9] / 10, l: a[10], rpm: a[11] / 100 });
    if (this.netBuf.length > 10) this.netBuf.shift();
  }

  // Ferngesteuertes Auto: 110 ms in der Vergangenheit zwischen zwei Paketen interpolieren
  applyNet(now) {
    const buf = this.netBuf;
    if (!buf || !buf.length) return;
    const rt = now - 110;
    let a = buf[0], b = null;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i].t <= rt && buf[i + 1].t >= rt) { a = buf[i]; b = buf[i + 1]; break; }
    }
    let x, z, h, d, vx, vz;
    if (b) {
      const t = (rt - a.t) / Math.max(1, b.t - a.t);
      x = a.x + (b.x - a.x) * t;
      z = a.z + (b.z - a.z) * t;
      h = a.h + wrapAngle(b.h - a.h) * t;
      d = a.d + (b.d - a.d) * t;
      vx = a.vx + (b.vx - a.vx) * t;
      vz = a.vz + (b.vz - a.vz) * t;
      a = b;
    } else {
      // keine neueren Daten: kurz mit der letzten Geschwindigkeit weiterrechnen
      a = buf[buf.length - 1];
      const dt = clamp((rt - a.t) / 1000, 0, 0.3);
      x = a.x + a.vx * dt;
      z = a.z + a.vz * dt;
      h = a.h;
      d = a.d + Math.hypot(a.vx, a.vz) * dt;
      vx = a.vx;
      vz = a.vz;
    }
    // Sprünge (z. B. Zurücksetzen) sofort übernehmen, sonst weich nachführen
    const jump = Math.hypot(x - this.x, z - this.z) > 15;
    const k = jump ? 1 : 0.6;
    this.x += (x - this.x) * k;
    this.z += (z - this.z) * k;
    this.heading = wrapAngle(this.heading + wrapAngle(h - this.heading) * k);
    this.vx = vx;
    this.vz = vz;
    this.totalDist = d;
    this.lapsDone = a.l;
    this.rpm = a.rpm;
    this.steer = a.st;
    this.nitroActive = !!(a.f & 1);
    this.braking = !!(a.f & 2);
    this.drifting = !!(a.f & 4);
    if (a.f & 8) this.finished = true;
    this.input.throttle = a.f & 16 ? 1 : 0;
    this.input.brake = this.braking ? 1 : 0;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    this.speed = vx * fx + vz * fz;
    this.latSpeed = vx * -fz + vz * fx;
    this.slip = this.drifting ? 0.8 : clamp(Math.abs(this.latSpeed) / 6, 0, 1);
    this.track.project(this.x, this.z, this.trackIdx, this.proj);
    this.trackIdx = this.proj.idx;
    this.lastAlong = this.proj.along;
    this.y = this.proj.y;
    this.offroad = Math.abs(this.proj.lateral) > this.track.halfWidth + 0.6;
  }

  // Weltposition eines lokalen Punktes am Fahrzeug
  localToWorld(v, out) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    // lokales +x = links (cos h, -sin h)
    out.set(this.x + v.x * fz + v.z * fx, this.y + v.y, this.z - v.x * fx + v.z * fz);
    return out;
  }

  // Position der Hinterräder (für Reifenspuren/Rauch)
  rearWheelWorld(side, out) {
    const d = this.model.dims;
    return this.localToWorld({ x: side * (d.W / 2 - 0.2), y: 0, z: d.rw }, out);
  }
}
