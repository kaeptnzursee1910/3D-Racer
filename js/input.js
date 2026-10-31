// Eingabe: Touch (Wischen / Tasten / Neigen), Tastatur und Gamepad
import { clamp, wrapAngle } from './utils.js';

export class Input {
  constructor() {
    this.keys = new Set();
    this.pointers = new Map();
    this.state = { throttle: 0, brake: 0, steer: 0, handbrake: false, nitro: false };
    this.settings = { steering: 'drag', autoGas: false, sensitivity: 1, invertTilt: false };
    this.onAction = () => {};
    this.enabled = false;
    this.kbSteer = 0;
    this.btnSteer = 0;
    this.dragSteer = 0;
    this.tiltSteer = 0;
    this.tiltTheta = null;
    this.tiltZero = null;
    this.tiltPermission = false;
    this.lastPadButtons = [];
    this.touchLayer = document.getElementById('touch');
    this.knob = document.getElementById('steer-knob');
    this.base = document.getElementById('steer-base');
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      if (!this.enabled) return;
      if (k === 'c') this.onAction('camera');
      if (k === 'escape' || k === 'p') this.onAction('pause');
      if (k === 'r') this.onAction('reset');
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointers.clear();
      this.refreshButtons();
    });

    const layer = this.touchLayer;
    const down = (e) => {
      if (!this.enabled) return;
      const el = e.target.closest('[data-ctl]');
      let ctl = el ? el.dataset.ctl : null;
      if (!ctl && this.settings.steering === 'drag' && e.clientX < window.innerWidth * 0.55) ctl = 'steer';
      if (!ctl) return;
      e.preventDefault();
      if (ctl === 'camera' || ctl === 'pause' || ctl === 'reset') {
        this.onAction(ctl);
        return;
      }
      this.pointers.set(e.pointerId, { ctl, sx: e.clientX, x: e.clientX });
      if (ctl === 'steer') this.showKnob(e.clientX, e.clientY, 0);
      this.refreshButtons();
    };
    const move = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      e.preventDefault();
      p.x = e.clientX;
      if (p.ctl === 'steer') {
        const maxPx = 80 / this.settings.sensitivity;
        if (p.x - p.sx > maxPx) p.sx = p.x - maxPx;
        if (p.sx - p.x > maxPx) p.sx = p.x + maxPx;
        this.showKnob(p.sx, e.clientY, p.x - p.sx);
      } else {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const t = el && el.closest ? el.closest('[data-ctl]') : null;
        const group = (c) => (c === 'gas' || c === 'brake' ? 'pedal' : c === 'left' || c === 'right' ? 'dir' : c);
        if (t && group(t.dataset.ctl) === group(p.ctl) && t.dataset.ctl !== p.ctl) {
          p.ctl = t.dataset.ctl;
          this.refreshButtons();
        }
      }
    };
    const up = (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      if (p.ctl === 'steer') this.hideKnob();
      this.refreshButtons();
    };
    layer.addEventListener('pointerdown', down, { passive: false });
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    layer.addEventListener('contextmenu', (e) => e.preventDefault());

    // Neigungssteuerung über Schwerkraftvektor
    window.addEventListener('devicemotion', (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      this.tiltTheta = Math.atan2(g.x, -g.y);
    });
  }

  async requestTilt() {
    try {
      const DM = window.DeviceMotionEvent;
      if (DM && typeof DM.requestPermission === 'function') {
        const r = await DM.requestPermission();
        this.tiltPermission = r === 'granted';
      } else this.tiltPermission = !!DM;
    } catch (e) {
      this.tiltPermission = false;
    }
    return this.tiltPermission;
  }

  calibrateTilt() {
    this.tiltZero = this.tiltTheta;
  }

  showKnob(x, y, dx) {
    if (!this.knob) return;
    this.base.style.display = this.knob.style.display = 'block';
    this.base.style.transform = `translate(${x - 70}px, ${y - 70}px)`;
    this.knob.style.transform = `translate(${x + dx - 34}px, ${y - 34}px)`;
  }
  hideKnob() {
    if (!this.knob) return;
    this.base.style.display = this.knob.style.display = 'none';
  }

  active(ctl) {
    for (const p of this.pointers.values()) if (p.ctl === ctl) return true;
    return false;
  }

  refreshButtons() {
    const on = new Set([...this.pointers.values()].map((p) => p.ctl));
    this.touchLayer.querySelectorAll('[data-ctl]').forEach((b) => b.classList.toggle('on', on.has(b.dataset.ctl)));
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) {
      this.pointers.clear();
      this.hideKnob();
      this.refreshButtons();
    }
  }

  update(dt) {
    const k = this.keys;
    const s = this.state;
    let throttle = 0, brake = 0, steer = 0, handbrake = false, nitro = false;

    // Tastatur
    const kl = k.has('arrowleft') || k.has('a');
    const kr = k.has('arrowright') || k.has('d');
    const kt = (kr ? 1 : 0) - (kl ? 1 : 0);
    const rate = kt === 0 ? 8 : Math.sign(kt) !== Math.sign(this.kbSteer) && this.kbSteer !== 0 ? 10 : 4.5;
    this.kbSteer += clamp(kt - this.kbSteer, -rate * dt, rate * dt);
    if (k.has('arrowup') || k.has('w')) throttle = 1;
    if (k.has('arrowdown') || k.has('s')) brake = 1;
    if (k.has(' ')) handbrake = true;
    if (k.has('shift') || k.has('n')) nitro = true;
    steer += this.kbSteer;

    // Touch
    if (this.active('gas')) throttle = 1;
    if (this.active('brake')) brake = 1;
    if (this.active('nitro')) nitro = true;
    if (this.active('drift')) handbrake = true;
    const mode = this.settings.steering;
    if (mode === 'buttons') {
      const t = (this.active('right') ? 1 : 0) - (this.active('left') ? 1 : 0);
      const r = t === 0 ? 9 : 5.5 * this.settings.sensitivity;
      this.btnSteer += clamp(t - this.btnSteer, -r * dt, r * dt);
      steer += this.btnSteer;
    } else if (mode === 'drag') {
      let v = 0;
      for (const p of this.pointers.values()) if (p.ctl === 'steer') v = (p.x - p.sx) / (80 / this.settings.sensitivity);
      steer += clamp(v, -1, 1);
    } else if (mode === 'tilt' && this.tiltTheta != null) {
      if (this.tiltZero == null) this.tiltZero = this.tiltTheta;
      const a = wrapAngle(this.tiltTheta - this.tiltZero) * (this.settings.invertTilt ? -1 : 1);
      const maxA = 0.42 / this.settings.sensitivity;
      const dz = 0.03;
      const v = Math.abs(a) < dz ? 0 : (a - Math.sign(a) * dz) / maxA;
      steer += clamp(v, -1, 1);
    }

    // Gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer += (ax - Math.sign(ax) * 0.12) / 0.88;
      const b = gp.buttons;
      const val = (i) => (b[i] ? (typeof b[i] === 'object' ? b[i].value : b[i]) : 0);
      const pressed = (i) => (b[i] ? (typeof b[i] === 'object' ? b[i].pressed : b[i] > 0.5) : false);
      throttle = Math.max(throttle, val(7), pressed(0) ? 1 : 0);
      brake = Math.max(brake, val(6));
      if (pressed(2) || pressed(1)) handbrake = true;
      if (pressed(5) || pressed(4)) nitro = true;
      const prev = this.lastPadButtons;
      if (this.enabled) {
        if (pressed(9) && !prev[9]) this.onAction('pause');
        if (pressed(3) && !prev[3]) this.onAction('camera');
        if (pressed(8) && !prev[8]) this.onAction('reset');
      }
      this.lastPadButtons = b.map((x, i) => pressed(i));
      break;
    }

    if (this.settings.autoGas && brake <= 0) throttle = Math.max(throttle, 1);

    s.throttle = throttle;
    s.brake = brake;
    s.steer = clamp(steer, -1, 1);
    s.handbrake = handbrake;
    s.nitro = nitro;
    return s;
  }
}
