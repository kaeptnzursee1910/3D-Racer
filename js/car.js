// Arcade-Fahrphysik + visuelle Aktualisierung eines Fahrzeugs
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, wrapAngle, sign, lerp } from './utils.js';
import { buildCarModel } from './carModel.js';

const G = 9.81;
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
  }

  update(dt, active = true) {
    const d = this.def;
    const inp = active ? this.input : { throttle: 0, brake: 1, steer: 0, handbrake: false, nitro: false };
    const tr = this.track;
    const p = this.proj;

    let fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    let rx = -fz, rz = fx;
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    const speedAbs = Math.hypot(this.vx, this.vz);

    const absLat = Math.abs(p.lateral || 0);
    this.offroad = absLat > tr.halfWidth + 0.6;
    const offF = d.offroad ?? 0.55;
    const gripMul = (this.offroad ? 0.6 + (offF - 0.5) * 0.8 : 1) * (tr.def.theme === 'alps' ? 0.93 : 1);

    // Nitro
    const wantsNitro = inp.nitro && this.nitro > 0.01 && vF > 4;
    this.nitroActive = wantsNitro;
    if (wantsNitro) this.nitro = Math.max(0, this.nitro - dt / 3.6);
    else this.nitro = Math.min(1, this.nitro + dt * 0.012);

    const maxSpeed = d.maxSpeed * (this.nitroActive ? 1.2 : 1) * (this.offroad ? offF : 1) * this.speedFactor;

    // Längsdynamik
    let acc = 0;
    this.braking = false;
    if (inp.throttle > 0) {
      if (vF < -0.5) {
        acc += d.brake * inp.throttle;
      } else {
        const r = clamp(vF / maxSpeed, 0, 1.5);
        const engine = d.accel * 0.72 * Math.max(0, 1 - r * r) * (1 + 0.25 * Math.max(0, 1 - r * 3));
        acc += inp.throttle * engine;
      }
    }
    if (this.nitroActive) acc += 7.5 * (1 - clamp(vF / maxSpeed, 0, 1));
    if (inp.brake > 0) {
      if (vF > 0.8) {
        acc -= d.brake * inp.brake * (this.drifting ? 0.15 : 1);
        this.braking = true;
      } else if (inp.throttle <= 0) {
        if (vF > -13) acc -= 7 * inp.brake;
      }
    }
    if (vF > maxSpeed) acc -= (vF - maxSpeed) * 1.4;
    // Roll- und Luftwiderstand
    acc -= sign(vF) * (0.35 + 0.00022 * vF * vF) * (Math.abs(vF) > 0.05 ? 1 : 0);
    if (inp.throttle <= 0 && !this.nitroActive) acc -= sign(vF) * 1.2 * clamp(Math.abs(vF), 0, 1);
    if (this.offroad) acc -= sign(vF) * 2.5 * (1 - (offF - 0.5) * 1.8) * clamp(Math.abs(vF) / 10, 0, 1);
    if (inp.handbrake) acc -= sign(vF) * 5 * clamp(Math.abs(vF) / 5, 0, 1);
    // Steigung
    const slopeAlong = (p.slope || 0) * (fx * p.tx + fz * p.tz);
    acc -= G * slopeAlong * 0.75;

    const vFold = vF;
    vF += acc * dt;
    if (this.braking && vFold > 0 && vF < 0) vF = 0;
    if (inp.throttle > 0 && vFold < 0 && vF > 0 && inp.brake <= 0) vF = Math.max(vF, 0);

    // Drift-Logik
    const steerIn = clamp(inp.steer, -1, 1);
    const canDrift = vF > 14;
    if (!this.drifting && canDrift && Math.abs(steerIn) > 0.35 && (inp.handbrake || (inp.brake > 0.4 && inp.throttle > 0.4))) {
      this.drifting = true;
      this.driftDir = sign(steerIn);
      this.driftTime = 0;
    }
    if (this.drifting) {
      this.driftTime += dt;
      const slipAngle = Math.abs(Math.atan2(vR, Math.max(1, Math.abs(vF))));
      if (vF < 9 || (Math.abs(steerIn) < 0.12 && slipAngle < 0.12) || (sign(steerIn) !== this.driftDir && Math.abs(steerIn) > 0.5 && slipAngle < 0.2)) {
        this.drifting = false;
      }
    }

    // Lenkung
    this.steer = damp(this.steer, steerIn, this.isPlayer ? 12 : 9, dt);
    const maxSteer = (0.6 / (1 + Math.abs(vF) * 0.05)) * d.steer;
    let yawTarget = -(vF / WHEELBASE) * Math.tan(this.steer * maxSteer);
    const aLat = 21 * d.grip * gripMul;
    let yawMax = aLat / Math.max(Math.abs(vF), 3);
    if (this.drifting) yawMax *= 1.75;
    yawTarget = clamp(yawTarget, -yawMax, yawMax);
    if (this.drifting) yawTarget += -this.driftDir * 0.25 * clamp(vF / 30, 0, 1);
    this.yawRate = damp(this.yawRate, yawTarget, this.drifting ? 5 : 10, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);

    // Geschwindigkeit in neues Fahrzeug-Koordinatensystem übertragen
    const wvx = fx * vF + rx * vR, wvz = fz * vF + rz * vR;
    fx = Math.sin(this.heading);
    fz = Math.cos(this.heading);
    rx = -fz;
    rz = fx;
    vF = wvx * fx + wvz * fz;
    vR = wvx * rx + wvz * rz;

    const latGrip = this.drifting ? 1.6 : 9 * d.grip * gripMul;
    const vRnew = vR * Math.exp(-latGrip * dt);
    const lost = Math.abs(vR) - Math.abs(vRnew);
    if (this.drifting && vF > 0) vF += lost * 0.55;
    vR = vRnew;
    this.slip = clamp(Math.abs(vR) / 6, 0, 1);

    if (this.drifting) {
      this.nitro = Math.min(1, this.nitro + dt * 0.16 * clamp(Math.abs(vR) / 4, 0, 1));
    }

    this.vx = fx * vF + rx * vR;
    this.vz = fz * vF + rz * vR;
    this.speed = vF;
    this.latSpeed = vR;

    // Beschleunigungen für Karosseriebewegung
    this.longAcc = lerp(this.longAcc, (vF - this.prevVF) / dt, 0.2);
    this.latAcc = lerp(this.latAcc, -this.yawRate * vF, 0.2);
    this.prevVF = vF;

    // Integration
    this.x += this.vx * dt;
    this.z += this.vz * dt;

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
