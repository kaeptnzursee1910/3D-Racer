// KI-Fahrer: folgt der Ideallinie mit eigenem Geschwindigkeitsprofil
import { clamp, wrapAngle, lerp, damp } from './utils.js';

export const DIFFICULTY = {
  easy: { name: 'Leicht', skill: [0.8, 0.87], rubber: 0.09 },
  normal: { name: 'Normal', skill: [0.88, 0.94], rubber: 0.06 },
  hard: { name: 'Schwer', skill: [0.95, 1.0], rubber: 0.035 },
};

export class AIDriver {
  constructor(car, track, skill = 0.92, rand = Math.random) {
    this.car = car;
    this.track = track;
    this.skill = skill;
    this.rand = rand;
    const d = car.def;
    // etwas unter dem Grip-Limit des Fahrzeugs bleiben
    const aLat = 21 * d.grip * 0.9 * (0.9 + skill * 0.1) * (track.def.theme === 'alps' ? 0.93 : 1);
    this.profile = track.speedProfile(aLat, d.brake * 0.62, d.maxSpeed * 1.1);
    this.laneBias = (rand() - 0.5) * 2.2;
    this.avoid = 0;
    this.avoidTarget = 0;
    this.nitroCooldown = 2 + rand() * 4;
    this.mistakeTimer = 5 + rand() * 10;
    this.mistake = 0;
    this.reverseTimer = 0;
  }

  update(dt, cars) {
    const c = this.car, tr = this.track, p = c.proj;
    const N = tr.N;
    const idx = p.idx ?? 0;
    const v = Math.max(c.speed, 0);
    const inp = c.input;

    // Festgefahren → zurücksetzen / rückwärts
    if (c.stuckTime > 2.5) {
      if (c.stuckTime > 5) c.resetToTrack();
      else this.reverseTimer = 1.2;
    }
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      inp.throttle = 0;
      inp.brake = 1;
      inp.steer = -Math.sign(p.lateral || 1) * -1;
      inp.nitro = false;
      return;
    }

    // Ausweichen / Überholen
    let avoidT = 0;
    let slowFor = Infinity;
    for (const o of cars) {
      if (o === c || o.isGhost) continue;
      let rel = o.totalDist - c.totalDist;
      if (rel < -tr.length / 2) rel += tr.length;
      if (rel > tr.length / 2) rel -= tr.length;
      if (rel > 0 && rel < 16 + v * 0.3) {
        const dl = (o.proj.lateral || 0) - (p.lateral || 0);
        if (Math.abs(dl) < 2.8) {
          // Seite mit mehr Platz wählen
          const roomL = tr.halfWidth + (o.proj.lateral || 0);
          const roomR = tr.halfWidth - (o.proj.lateral || 0);
          const side = roomR > roomL ? 1 : -1;
          avoidT = clamp((o.proj.lateral || 0) + side * 3.3 - (tr.line[idx] || 0), -tr.halfWidth, tr.halfWidth);
          if (rel < 9 && o.speed < v) slowFor = Math.min(slowFor, o.speed + 1);
        }
      }
    }
    this.avoidTarget = avoidT;
    this.avoid = damp(this.avoid, this.avoidTarget, 2.5, dt);

    // gelegentliche kleine Fahrfehler (macht das Feld lebendiger)
    this.mistakeTimer -= dt;
    if (this.mistakeTimer < 0) {
      this.mistake = (this.rand() - 0.5) * (1.2 - this.skill) * 6;
      this.mistakeTimer = 6 + this.rand() * 12;
    }
    this.mistake = damp(this.mistake, 0, 0.6, dt);

    // Zielpunkt voraus
    const look = 7 + v * 0.42;
    const li = (idx + Math.round(look / tr.ds)) % N;
    let off = tr.line[li] + this.laneBias * 0.35 + this.avoid + this.mistake;
    off = clamp(off, -tr.halfWidth + 1.4, tr.halfWidth - 1.4);
    const tx = tr.cx[li] + tr.rx[li] * off;
    const tz = tr.cz[li] + tr.rz[li] * off;
    const desired = Math.atan2(tx - c.x, tz - c.z);
    const diff = wrapAngle(desired - c.heading);
    inp.steer = clamp(-diff * 2.6, -1, 1);
    inp.handbrake = false;

    // Geschwindigkeit
    const ahead = Math.round((v * 0.25) / tr.ds) + 1;
    let vT = Infinity;
    for (let k = 0; k <= ahead; k += 2) vT = Math.min(vT, this.profile[(idx + k) % N]);
    vT *= this.skill * c.speedFactor;
    if (Math.abs(diff) > 0.5) vT = Math.min(vT, 18);
    vT = Math.min(vT, slowFor);

    if (v < vT - 1) {
      inp.throttle = 1;
      inp.brake = 0;
    } else if (v < vT + 2) {
      inp.throttle = 0.35;
      inp.brake = 0;
    } else {
      inp.throttle = 0;
      inp.brake = clamp((v - vT) / 6, 0.25, 1);
    }

    // Nitro auf Geraden
    this.nitroCooldown -= dt;
    let straight = true;
    for (let k = 0; k < 60; k += 6) if (this.profile[(idx + k) % N] < c.def.maxSpeed * 0.95) { straight = false; break; }
    if (inp.nitro) {
      if (!straight || c.nitro < 0.05) inp.nitro = false;
    } else if (straight && this.nitroCooldown < 0 && c.nitro > 0.4 && this.rand() < dt * 0.8) {
      inp.nitro = true;
      this.nitroCooldown = 6 + this.rand() * 8;
    }
  }
}
