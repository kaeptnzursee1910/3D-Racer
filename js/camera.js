// Kamerasteuerung: Verfolger, Motorhaube, TV-Kamera, Intro-Flug
import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, dampAngle, lerp, smoothstep } from './utils.js';

export const CAM_MODES = [
  { id: 'chase', name: 'Verfolger', dist: 6.6, height: 2.3, look: 1.15, fov: 64 },
  { id: 'far', name: 'Weit', dist: 10.5, height: 3.8, look: 1.3, fov: 60 },
  { id: 'hood', name: 'Motorhaube', hood: true, fov: 72 },
];

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 0;
    this.yaw = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.fov = 64;
    this.tv = { pos: new THREE.Vector3(), timer: 0, along: 0 };
    this.intro = 0;
    this._v = new THREE.Vector3();
    this.initialized = false;
  }

  setMode(i) {
    this.mode = ((i % CAM_MODES.length) + CAM_MODES.length) % CAM_MODES.length;
  }
  cycle() {
    this.setMode(this.mode + 1);
    return CAM_MODES[this.mode];
  }

  addShake(a) {
    this.shake = Math.min(1.2, this.shake + a);
  }

  snap(car) {
    this.yaw = car.heading;
    this.initialized = false;
    this.updateChase(1 / 60, car, true);
  }

  updateChase(dt, car, snap = false) {
    const m = CAM_MODES[this.mode];
    const cam = this.camera;
    const speed = Math.abs(car.speed);
    if (m.hood) {
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const h = car.model.dims;
      const rollQ = car.mesh.quaternion;
      this._v.set(0, 1.12 + car.susp, 0.35).applyQuaternion(rollQ).add(car.mesh.position);
      cam.position.copy(this._v);
      this.look.set(car.x + fx * 30, car.y + 0.9, car.z + fz * 30);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      // leichte Neigung mitnehmen
      cam.rotateZ(car.bodyRoll * 0.6);
      this.fov = damp(this.fov, m.fov + speed * 0.14 + (car.nitroActive ? 8 : 0), 4, dt);
    } else {
      // Blickrichtung: Mischung aus Ausrichtung und Bewegungsrichtung
      let target = car.heading;
      if (speed > 3) {
        const velH = Math.atan2(car.vx, car.vz);
        const fwd = car.speed >= 0 ? velH : velH + Math.PI;
        target = car.heading + clamp(((fwd - car.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -0.6, 0.6) * 0.45;
      }
      this.yaw = snap ? target : dampAngle(this.yaw, target, 4.5 + speed * 0.04, dt);
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      const dist = m.dist + speed * 0.022 + (car.nitroActive ? 0.8 : 0);
      const tx = car.x - fx * dist, tz = car.z - fz * dist;
      let ty = car.y + m.height + speed * 0.006;
      const tr = car.track;
      const lift = tr ? tr.project(tx, tz, car.trackIdx, this._proj || (this._proj = {})).y + 1.2 : ty;
      ty = Math.max(ty, lift);
      if (snap || !this.initialized) {
        this.pos.set(tx, ty, tz);
        this.initialized = true;
      } else {
        const k = 1 - Math.exp(-14 * dt);
        this.pos.x = lerp(this.pos.x, tx, k);
        this.pos.z = lerp(this.pos.z, tz, k);
        this.pos.y = lerp(this.pos.y, ty, 1 - Math.exp(-8 * dt));
      }
      cam.position.copy(this.pos);
      this.look.set(car.x + fx * 4, car.y + m.look, car.z + fz * 4);
      cam.up.set(0, 1, 0);
      cam.lookAt(this.look);
      this.fov = damp(this.fov, m.fov + speed * 0.17 + (car.nitroActive ? 9 : 0), 3, dt);
    }
    this.applyShake(dt, speed, car);
  }

  applyShake(dt, speed, car) {
    const cam = this.camera;
    let s = this.shake;
    if (car && car.offroad) s += clamp(speed / 40, 0, 0.25);
    if (car && car.nitroActive) s += 0.06;
    if (s > 0.001) {
      cam.position.x += (Math.random() - 0.5) * s * 0.25;
      cam.position.y += (Math.random() - 0.5) * s * 0.2;
      cam.position.z += (Math.random() - 0.5) * s * 0.25;
    }
    this.shake = damp(this.shake, 0, 5, dt);
    if (Math.abs(cam.fov - this.fov) > 0.05) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
  }

  // Kameraflug um das Fahrzeug vor dem Start (t: 0..1)
  updateIntro(dt, car, t) {
    const cam = this.camera;
    const a = car.heading + Math.PI * (1 - smoothstep(0, 1, t)) * 1.1 + 0.0;
    const dist = lerp(9, CAM_MODES[this.mode].dist || 6.6, smoothstep(0.5, 1, t));
    const h = lerp(1.6, CAM_MODES[this.mode].height || 2.3, t);
    cam.position.set(car.x - Math.sin(a) * dist, car.y + h, car.z - Math.cos(a) * dist);
    cam.up.set(0, 1, 0);
    cam.lookAt(car.x, car.y + 0.9, car.z);
    this.fov = 58;
    cam.fov = 58;
    cam.updateProjectionMatrix();
    this.yaw = car.heading;
    this.pos.copy(cam.position);
    this.initialized = true;
  }

  // Fernsehkamera am Streckenrand: steht fest und schwenkt mit
  updateTV(dt, car, track) {
    const cam = this.camera;
    const tv = this.tv;
    tv.timer -= dt;
    const d = Math.hypot(tv.pos.x - car.x, tv.pos.z - car.z);
    if (tv.timer <= 0 || d > 75) {
      const ahead = 40 + Math.random() * 30;
      const along = car.proj.along + ahead;
      const side = Math.random() < 0.5 ? -1 : 1;
      const p = track.pointAt(along, side * (track.wallDist + 4 + Math.random() * 6));
      tv.pos.set(p.x, p.y + 2.5 + Math.random() * 5, p.z);
      tv.timer = 6 + Math.random() * 3;
      this.look.set(car.x, car.y + 0.8, car.z);
    }
    cam.position.copy(tv.pos);
    this.look.x = damp(this.look.x, car.x, 6, dt);
    this.look.y = damp(this.look.y, car.y + 0.8, 6, dt);
    this.look.z = damp(this.look.z, car.z, 6, dt);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.look);
    const zoom = clamp(55 - d * 0.5, 22, 55);
    this.fov = damp(this.fov, zoom, 2, dt);
    cam.fov = this.fov;
    cam.updateProjectionMatrix();
  }

  // Langsame Umkreisung (Zielansicht)
  updateOrbit(dt, car, time) {
    const cam = this.camera;
    const a = time * 0.25;
    cam.position.set(car.x + Math.sin(a) * 9, car.y + 3, car.z + Math.cos(a) * 9);
    cam.up.set(0, 1, 0);
    cam.lookAt(car.x, car.y + 0.8, car.z);
    if (cam.fov !== 55) {
      cam.fov = 55;
      cam.updateProjectionMatrix();
    }
  }
}
