// Synthetisierter Sound: Motor, Reifen, Wind, Effekte und prozedurale Musik (WebAudio)
import { clamp } from './utils.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.sfxVol = 0.8;
    this.musicVol = 0.5;
    this.music = null;
  }

  // Muss innerhalb einer Nutzer-Geste aufgerufen werden (iOS)
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (navigator.audioSession) {
          try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignorieren */ }
        }
        this.ctx = new AC();
        this.setup();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      // stiller Puffer zum Entsperren
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.connect(this.ctx.destination);
      s.start(0);
      this.enabled = true;
    } catch (e) {
      console.warn('Audio nicht verfügbar', e);
    }
  }

  setup() {
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVol * 0.55;
    this.musicBus.connect(this.master);

    // Rauschpuffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.engine = this.createEngineVoice(1);
    this.engine2 = this.createEngineVoice(0.5);

    // Reifenquietschen
    this.tire = this.loopNoise('bandpass', 1500, 3.5);
    // Wind
    this.wind = this.loopNoise('lowpass', 600, 0.7);
    // Schleifen an der Mauer
    this.scrape = this.loopNoise('bandpass', 3000, 1.5);
    // Nitro-Fauchen
    this.boost = this.loopNoise('highpass', 900, 0.6);
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.55, this.ctx.currentTime, 0.05);
  }

  loopNoise(type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    src.start();
    return { src, f, g };
  }

  createEngineVoice(level) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    f.Q.value = 2.5;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    shaper.curve = curve;
    const g1 = ctx.createGain(); g1.gain.value = 0.3;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    const g3 = ctx.createGain(); g3.gain.value = 0.5;
    const out = ctx.createGain();
    out.gain.value = 0;
    let pan = null;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      out.connect(pan);
      pan.connect(this.sfx);
    } else out.connect(this.sfx);
    o1.connect(g1); o2.connect(g2); o3.connect(g3);
    g1.connect(shaper); g2.connect(shaper);
    shaper.connect(f);
    g3.connect(f);
    f.connect(out);
    o1.start(); o2.start(); o3.start();
    return { o1, o2, o3, f, out, pan, level };
  }

  setEngine(v, rpm, throttle, vol, panV = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const base = 38 + rpm * 150;
    v.o1.frequency.setTargetAtTime(base, t, 0.03);
    v.o2.frequency.setTargetAtTime(base * 0.5 * 1.006, t, 0.03);
    v.o3.frequency.setTargetAtTime(base * 0.5, t, 0.03);
    v.f.frequency.setTargetAtTime(300 + rpm * 1400 + throttle * 1600, t, 0.05);
    v.out.gain.setTargetAtTime(vol * v.level * (0.22 + throttle * 0.2 + rpm * 0.1), t, 0.05);
    if (v.pan) v.pan.pan.setTargetAtTime(clamp(panV, -1, 1), t, 0.05);
  }

  setLoop(l, gain, freq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    l.g.gain.setTargetAtTime(gain, t, 0.06);
    if (freq) l.f.frequency.setTargetAtTime(freq, t, 0.08);
  }

  update(player, near, listener) {
    if (!this.ctx || !this.enabled) return;
    if (!player) {
      this.silence();
      return;
    }
    const sp = Math.abs(player.speed);
    this.setEngine(this.engine, player.rpm, player.input.throttle, 1);
    this.setLoop(this.tire, clamp((player.slip - 0.25) * 0.6 + (player.drifting ? 0.18 : 0), 0, 0.35) * clamp(sp / 8, 0, 1), 1300 + player.slip * 600);
    this.setLoop(this.wind, clamp(sp / 80, 0, 1) * 0.35, 400 + sp * 12);
    this.setLoop(this.scrape, player.scraping && sp > 4 ? 0.25 : 0);
    this.setLoop(this.boost, player.nitroActive ? 0.32 : 0, 1200);
    if (near) {
      const dx = near.car.x - listener.x, dz = near.car.z - listener.z;
      const d = Math.hypot(dx, dz);
      const vol = clamp(1 - d / 45, 0, 1) * 0.8;
      // seitliche Position relativ zur Kamera
      const panV = clamp((dx * listener.rx + dz * listener.rz) / 15, -1, 1);
      this.setEngine(this.engine2, near.car.rpm, near.car.input.throttle, vol, panV);
    } else this.setEngine(this.engine2, 0.2, 0, 0);
  }

  silence() {
    if (!this.ctx) return;
    this.setEngine(this.engine, 0.2, 0, 0);
    this.setEngine(this.engine2, 0.2, 0, 0);
    for (const l of [this.tire, this.wind, this.scrape, this.boost]) this.setLoop(l, 0);
  }

  // ----- Einzel-Effekte --------------------------------------------------
  beep(freq = 660, dur = 0.18, vol = 0.35, type = 'square') {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  click() {
    this.beep(1200, 0.05, 0.12, 'triangle');
  }

  crash(power) {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = clamp(power / 20, 0.15, 1);
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900 + p * 1800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7 * p, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + p * 0.3);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + 0.8);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.6 * p, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g2);
    g2.connect(this.sfx);
    o.start(t);
    o.stop(t + 0.35);
  }

  whoosh() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t);
    g.gain.linearRampToValueAtTime(0.4, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfx);
    s.start(t);
    s.stop(t + 0.8);
  }

  fanfare(good = true) {
    if (!this.ctx || !this.enabled) return;
    const notes = good ? [523, 659, 784, 1047] : [440, 415, 392];
    notes.forEach((n, i) => setTimeout(() => this.beep(n, 0.25, 0.25, 'triangle'), i * 140));
  }

  // ----- Musik ----------------------------------------------------------
  startMusic(cfg) {
    if (!this.ctx) return;
    this.stopMusic();
    this.music = new MusicSequencer(this.ctx, this.musicBus, this.noiseBuf, cfg);
    this.music.start();
  }
  stopMusic() {
    if (this.music) {
      this.music.stop();
      this.music = null;
    }
  }
  setMusicIntensity(v) {
    if (this.music) this.music.intensity = v;
  }
}

// Kleiner Synthwave-Sequenzer
class MusicSequencer {
  constructor(ctx, out, noise, cfg = {}) {
    this.ctx = ctx;
    this.out = out;
    this.noise = noise;
    this.root = cfg.root ?? 57;
    this.bpm = cfg.bpm ?? 120;
    this.step = 0;
    this.intensity = 1;
    this.timer = null;
    this.nextTime = 0;
    // Akkordfolge (Halbtöne relativ zum Grundton, Moll)
    this.prog = [
      [0, 3, 7], [-4, 0, 3], [-7, -3, 0], [-2, 2, 5],
    ];
    this.bassPat = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1];
    this.arpPat = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    this.delay.connect(fb);
    fb.connect(this.delay);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;
    this.delay.connect(wet);
    wet.connect(out);
    this.wet = wet;
  }
  freq(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }
  start() {
    this.nextTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }
  stop() {
    clearInterval(this.timer);
    this.timer = null;
    try { this.wet.disconnect(); } catch (e) { /* */ }
  }
  schedule() {
    const spb = 60 / this.bpm / 4; // 16tel
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime, spb);
      this.nextTime += spb;
      this.step = (this.step + 1) % 256;
    }
  }
  playStep(step, t, spb) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const chord = this.prog[bar];
    const section = Math.floor(step / 64) % 4; // Variation
    // Kick
    if (s16 % 4 === 0) this.kick(t);
    // Snare
    if (s16 === 4 || s16 === 12) this.snare(t);
    // Hi-Hat
    if (s16 % 2 === 1 || (section > 1 && s16 % 2 === 0)) this.hat(t, s16 % 4 === 2 ? 0.05 : 0.08);
    // Bass
    if (this.bassPat[s16]) {
      const n = this.root - 24 + chord[0] + (s16 === 14 ? 12 : 0);
      this.synth(t, this.freq(n), spb * 0.9, 'sawtooth', 0.16, 500 + section * 200);
    }
    // Arpeggio
    if (section !== 0 || bar > 1) {
      const n = this.root + chord[this.arpPat[s16]] + (s16 >= 8 ? 12 : 0);
      this.synth(t, this.freq(n), spb * 0.8, 'square', 0.045, 2400, true);
    }
    // Flächen
    if (s16 === 0) {
      for (const c of chord) this.pad(t, this.freq(this.root - 12 + c), spb * 16);
    }
    // Lead-Melodie in späteren Abschnitten
    if (section >= 2 && (s16 === 0 || s16 === 6 || s16 === 10)) {
      const n = this.root + 12 + chord[(s16 / 2) % 3 | 0];
      this.synth(t, this.freq(n), spb * 3, 'triangle', 0.08, 3000, true);
    }
  }
  env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  kick(t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.28, 0.75);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + 0.32);
  }
  snare(t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    this.env(g, t, 0.002, 0.18, 0.32);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 0.22);
  }
  hat(t, v) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    this.env(g, t, 0.001, 0.05, v);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t, Math.random() * 1.5);
    s.stop(t + 0.07);
  }
  synth(t, freq, dur, type, vol, cutoff, toDelay = false) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.3), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.005, dur, vol);
    o.connect(f);
    f.connect(g);
    g.connect(this.out);
    if (toDelay) g.connect(this.delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  pad(t, freq, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    f.connect(g);
    g.connect(this.out);
    for (const det of [-8, 8]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}
