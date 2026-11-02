// VELOX – Hauptprogramm: Renderer, Spielschleife, Menüs
import * as THREE from '../vendor/three.module.min.js';
import { World, POINTS } from './world.js';
import { Storage } from './storage.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { Showroom } from './showroom.js';
import { PostFX } from './postfx.js';
import { Multiplayer } from './multiplayer.js';
import { Net } from './net.js';
import { TRACKS, getTrackDef } from './tracks.js';
import { Track } from './track.js';
import { CARS, PAINTS, LIVERIES, getCarDef, carStats } from './carModel.js';
import { DIFFICULTY } from './ai.js';
import { CAM_MODES } from './camera.js';
import { formatTime, isTouchDevice, rng, clamp } from './utils.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const QUALITY = {
  low: { level: 0, bloom: false, pixelRatio: 1, shadows: false, shadowSize: 512, shadowRange: 40, terrainSeg: 110, sceneryMul: 0.45, physical: false },
  medium: { level: 1, bloom: true, reflect: [128, 8], pixelRatio: 1.5, shadows: true, shadowSize: 1024, shadowRange: 45, terrainSeg: 150, sceneryMul: 0.75, physical: false },
  high: { level: 2, bloom: true, reflect: [256, 3], pixelRatio: 2, shadows: true, shadowSize: 2048, shadowRange: 60, terrainSeg: 200, sceneryMul: 1, physical: true },
};

class Game {
  constructor() {
    this.storage = new Storage();
    this.touch = isTouchDevice();
    const canvas = $('#gl');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(64, 1, 0.3, 3200);
    this.audio = new AudioEngine();
    this.input = new Input();
    this.postfx = new PostFX(this.renderer);
    this.hud = new HUD();
    this.input.onAction = (a) => this.onAction(a);
    this.world = null;
    this.showroom = null;
    this.screen = 'title';
    this.state = 'menu';
    this.dynScale = 1;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.fps = 60;
    this.last = performance.now();
    this.trackCache = new Map();
    this.flow = { mode: 'quick' };
    this.champ = null;
    this.carIdx = Math.max(0, CARS.findIndex((c) => c.id === this.storage.selection.car));
    this.rotateDismissed = false;

    this.applySettings();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && Net.isHost && Net.peer) Net.keepAlive(Net.peer);
      if (document.hidden && this.state === 'race' && this.world && !this.world.paused && !this.world.online) this.pause(true);
    });
    // iOS: Zoom-Gesten und Doppeltipp unterbinden
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (!e.target.closest('.panel-screen, .modal')) e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.toast('Grafikkontext verloren – Seite wird neu geladen');
      setTimeout(() => location.reload(), 1500);
    });

    this.bindUI();
    this.mp = new Multiplayer(this);
    this.pendingInvite = Multiplayer.parseInvite((u, pw) => Net.setKey(u, pw));
    this.bindMenuKeys();
    this.startAttract();
    this.show('title');
    requestAnimationFrame((t) => this.loop(t));
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // ---------------------------------------------------------------------
  qualityPreset() {
    const q = this.storage.settings.quality;
    const base = QUALITY[q] || (this.touch ? QUALITY.medium : QUALITY.high);
    return { ...base };
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const q = this.qualityPreset();
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(Math.max(0.6, dpr * this.dynScale));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.postfx.setup(q.bloom && this.bloomOk !== false, q.level);
    this.postfx.resize();
    this.hud.resize();
    const portrait = h > w;
    $('#rotate-hint').classList.toggle('hidden', !(this.touch && portrait && !this.rotateDismissed));
  }

  applySettings() {
    const s = this.storage.settings;
    Object.assign(this.input.settings, { steering: s.steering, autoGas: s.autoGas, sensitivity: s.sensitivity, invertTilt: s.invertTilt });
    this.audio.setVolumes(s.sfxVol, s.musicVol);
    this.hud.units = s.units;
    const t = $('#touch');
    t.classList.remove('mode-drag', 'mode-buttons', 'mode-tilt');
    t.classList.add('mode-' + s.steering);
    t.classList.toggle('no-touch', !this.touch);
  }

  // ---------------------------------------------------------------------
  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.input.update(dt);

    if (this.screen === 'garage' && this.showroom) {
      this.showroom.update(dt);
      this.renderer.toneMappingExposure = 1.0;
      this.postfx.setBloom(0.45, 0.85, 0.5);
      this.postfx.render(this.showroom.scene, this.camera);
    } else if (this.world) {
      this.world.update(dt);
      const th = this.world.env.theme;
      this.renderer.toneMappingExposure = th.exposure;
      this.postfx.setBloom(th.bloom[0], th.bloom[1], th.bloom[2]);
      this.postfx.render(this.world.scene, this.camera);
    }

    // FPS / adaptive Auflösung
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 1.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      if (this.storage.settings.quality === 'auto' && this.state === 'race') {
        const old = this.dynScale;
        if (this.fps < 45) {
          if (this.dynScale <= 0.6 && this.bloomOk !== false && this.fps < 38) this.bloomOk = false;
          this.dynScale = Math.max(0.6, this.dynScale - 0.1);
        }
        else if (this.fps > 57) this.dynScale = Math.min(1, this.dynScale + 0.05);
        if (old !== this.dynScale) this.resize();
      }
    }
    this.hud.fps(this.fps, this.storage.settings.showFps && this.state === 'race');
  }

  // ---------------------------------------------------------------------
  show(id) {
    this.screen = id;
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    const el = $('#screen-' + id);
    if (el) el.classList.remove('hidden');
    this.kbFocus = -1;
    $$('.kb-focus').forEach((e) => e.classList.remove('kb-focus'));
    if (id === 'main') this.renderMainStats();
    if (id === 'tracks') this.renderTracks();
    if (id === 'garage') this.renderGarage();
    if (id === 'settings') this.renderSettings();
    if (id === 'records') this.renderRecords();
    if (id === 'champ') this.renderChamp();
  }

  toast(msg, ms = 2200) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('show'), ms);
  }

  bindUI() {
    $('#screen-title').addEventListener('pointerup', () => this.leaveTitle());

    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.audio.click();
      this.act(b.dataset.act, b);
    });

    // Stepper
    $$('.stepper').forEach((st) => {
      const [minus, plus] = st.querySelectorAll('button');
      const key = st.dataset.opt;
      const lim = { laps: [1, 9], opponents: [0, 7] }[key];
      const upd = (d) => {
        const sel = this.storage.selection;
        sel[key] = clamp((sel[key] ?? 3) + d, lim[0], lim[1]);
        this.storage.save();
        st.querySelector('span').textContent = sel[key];
        this.audio.click();
      };
      minus.addEventListener('click', () => upd(-1));
      plus.addEventListener('click', () => upd(1));
    });
    // Segmente (Auswahl)
    $$('.seg[data-opt]').forEach((sg) => {
      sg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        const key = sg.dataset.opt;
        if (key === 'champDifficulty') this.storage.selection.champDifficulty = b.dataset.v;
        else this.storage.selection[key] = b.dataset.v;
        this.storage.save();
        this.syncSeg(sg, b.dataset.v);
        this.audio.click();
      });
    });
    // Einstellungen
    $$('[data-set]').forEach((el) => {
      const key = el.dataset.set;
      if (el.classList.contains('seg')) {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          let v = b.dataset.v;
          if (v === 'true' || v === 'false') v = v === 'true';
          this.storage.settings[key] = v;
          if (key === 'steering' && v === 'tilt') {
            const ok = await this.input.requestTilt();
            this.toast(ok ? 'Neigungssteuerung aktiv – Gerät beim Start gerade halten' : 'Bewegungssensor nicht verfügbar');
          }
          this.storage.save();
          this.applySettings();
          this.syncSeg(el, String(v));
          this.audio.click();
          if (key === 'quality') this.resize();
        });
      } else {
        el.addEventListener('input', () => {
          const v = el.type === 'range' ? parseFloat(el.value) : el.value.slice(0, 12);
          this.storage.settings[key] = v;
          this.storage.save();
          this.applySettings();
        });
      }
    });

    // Garage: Drehen per Ziehen
    const gs = $('#screen-garage');
    let drag = null;
    gs.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      drag = e.clientX;
    });
    window.addEventListener('pointermove', (e) => {
      if (drag != null && this.showroom) {
        this.showroom.rotateBy(e.clientX - drag);
        drag = e.clientX;
      }
    });
    window.addEventListener('pointerup', () => (drag = null));
  }

  syncSeg(sg, v) {
    sg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  }

  leaveTitle() {
    if (this.screen !== 'title') return;
    this.audio.unlock();
    this.audio.setVolumes(this.storage.settings.sfxVol, this.storage.settings.musicVol);
    this.audio.startMusic({ root: 57, bpm: 104 });
    if (this.storage.settings.steering === 'tilt') this.input.requestTilt();
    this.show('main');
    if (this.pendingInvite) {
      this.mp.showStart(this.pendingInvite);
      this.pendingInvite = null;
    }
  }

  // Menütasten (Tastatur)
  bindMenuKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      const k = e.key;
      if (this.screen === 'title') {
        if (k === 'Enter' || k === ' ') this.leaveTitle();
        return;
      }
      if (this.screen === 'race') return; // Fahrsteuerung übernimmt die Spiel-Eingabe
      const scr = this.screen;
      // Pause/Fortsetzen übernimmt die Spiel-Eingabe (Esc / P)
      if (this.state === 'race' && scr === 'pause' && (k === 'Escape' || k === 'p' || k === 'P')) return;
      if (k === 'Escape' || k === 'Backspace') {
        e.preventDefault();
        if (scr === 'pause') this.act('resume');
        else if (scr !== 'main' && scr !== 'results') this.act('back');
        return;
      }
      if (scr === 'tracks' && (k === 'ArrowLeft' || k === 'ArrowRight')) {
        const i = TRACKS.findIndex((t) => t.id === this.storage.selection.track);
        this.selectTrack(TRACKS[(i + (k === 'ArrowRight' ? 1 : TRACKS.length - 1)) % TRACKS.length].id);
        return;
      }
      if (scr === 'garage') {
        if (k === 'ArrowLeft') return this.act('car-prev');
        if (k === 'ArrowRight') return this.act('car-next');
        if (k === 'ArrowUp' || k === 'ArrowDown') {
          const i = PAINTS.indexOf(this.storage.selection.color);
          const n = PAINTS[(Math.max(0, i) + (k === 'ArrowDown' ? 1 : PAINTS.length - 1)) % PAINTS.length];
          this.setColor(n);
          return;
        }
      }
      // Fokus-Navigation über Schaltflächen
      const el = $('#screen-' + scr);
      if (!el) return;
      const btns = [...el.querySelectorAll('.big-btn')].filter((b) => b.offsetParent !== null);
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        e.preventDefault();
        if (!btns.length) return;
        this.kbFocus = this.kbFocus < 0 ? 0 : (this.kbFocus + (k === 'ArrowDown' ? 1 : btns.length - 1)) % btns.length;
        btns.forEach((b, i) => b.classList.toggle('kb-focus', i === this.kbFocus));
      }
      if (k === 'Enter') {
        e.preventDefault();
        const b = btns[this.kbFocus] || el.querySelector('.big-btn.primary');
        if (b) b.click();
      }
    });
  }

  act(a, el) {
    switch (a) {
      case 'quick':
      case 'trial':
        this.flow = { mode: a };
        this.show('tracks');
        break;
      case 'champ':
        this.flow = { mode: 'champ' };
        if (!this.champ || this.champ.finished) this.champ = null;
        this.show('champ');
        break;
      case 'garage':
        this.flow = { mode: 'garage' };
        this.show('garage');
        break;
      case 'mp':
        this.mp.showStart();
        break;
      case 'keyform':
        this.mp.showKeyForm();
        break;
      case 'mp-create': case 'mp-join': case 'mp-leave': case 'mp-invite': case 'chat-send':
      case 'lobby-car-prev': case 'lobby-car-next': case 'lobby-main': case 'key-save': case 'key-del':
        this.mp.act(a, el);
        break;
      case 'records':
      case 'help':
        this.show(a);
        break;
      case 'settings':
        this.settingsFromPause = false;
        this.show('settings');
        break;
      case 'pause-settings':
        this.settingsFromPause = true;
        this.show('settings');
        break;
      case 'back':
        this.back();
        break;
      case 'tracks-next':
        this.show('garage');
        break;
      case 'car-prev':
      case 'car-next':
        this.carIdx = (this.carIdx + (a === 'car-next' ? 1 : CARS.length - 1)) % CARS.length;
        this.renderGarage(true);
        break;
      case 'garage-go':
        this.garageGo();
        break;
      case 'champ-go':
        if (this.champ && this.champ.finished) {
          this.champ = null;
          this.show('main');
        } else if (!this.champ) this.show('garage');
        else this.startChampRace();
        break;
      case 'fullscreen':
        this.fullscreen();
        break;
      case 'resume':
        this.pause(false);
        break;
      case 'restart':
        if (this.lastCfg) this.startRace(this.lastCfg);
        break;
      case 'reset-car':
        this.pause(false);
        this.world?.resetPlayer();
        break;
      case 'quit':
        if (this.world && this.world.online) this.mp.leave();
        else this.toMenu();
        break;
      case 'results-next':
        this.resultsNext();
        break;
      case 'reset-data':
        if (confirm('Alle Rekorde, Geister und Einstellungen löschen?')) {
          this.storage.reset();
          this.applySettings();
          this.renderSettings();
          this.toast('Spielstand zurückgesetzt');
        }
        break;
      case 'dismiss-rotate':
        this.rotateDismissed = true;
        this.resize();
        break;
    }
  }

  back() {
    const s = this.screen;
    if (s === 'tracks' || s === 'records' || s === 'help' || s === 'champ' || s === 'mp') this.show('main');
    else if (s === 'keyform') this.mp.showStart();
    else if (s === 'lobby') this.mp.leave();
    else if (s === 'settings') {
      if (this.settingsFromPause) this.show('pause');
      else this.show('main');
    } else if (s === 'garage') {
      if (this.flow.mode === 'quick' || this.flow.mode === 'trial') this.show('tracks');
      else if (this.flow.mode === 'champ') this.show('champ');
      else this.show('main');
    }
  }

  fullscreen() {
    const d = document.documentElement;
    const req = d.requestFullscreen || d.webkitRequestFullscreen;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else if (req) {
      try {
        const r = req.call(d);
        if (r && r.catch) r.catch(() => this.toast('Tipp: Teilen → „Zum Home-Bildschirm“ für echtes Vollbild'));
      } catch (e) {
        this.toast('Tipp: Teilen → „Zum Home-Bildschirm“ für echtes Vollbild');
      }
    } else this.toast('Tipp: Teilen → „Zum Home-Bildschirm“ für echtes Vollbild', 3500);
  }

  // ----- Hauptmenü -------------------------------------------------------
  renderMainStats() {
    const p = this.storage.progress;
    const car = getCarDef(this.storage.selection.car);
    $('#menu-stats').innerHTML = `Fahrzeug: <b>${car.name}</b><br>Rennen: <b>${p.races || 0}</b> · Siege: <b>${p.wins || 0}</b> · Titel: <b>${p.champWins || 0}</b>`;
  }

  getTrack(id) {
    if (!this.trackCache.has(id)) this.trackCache.set(id, new Track(getTrackDef(id)));
    return this.trackCache.get(id);
  }

  drawTrackPreview(canvas, id) {
    const tr = this.getTrack(id);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = (canvas.width = 300 * dpr), H = (canvas.height = 200 * dpr);
    const g = canvas.getContext('2d');
    const th = { coast: ['#1d4e7a', '#f7a26b'], canyon: ['#7a3416', '#f2c08a'], city: ['#140d2c', '#ff2bd6'], alps: ['#3a6ea8', '#e8f1fb'] }[tr.def.theme];
    const grd = g.createLinearGradient(0, 0, W, H);
    grd.addColorStop(0, th[0]);
    grd.addColorStop(1, th[1]);
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
    const mm = tr.minimapPoints(4);
    const s = Math.min(W, H * 1.4) * 0.8;
    g.lineJoin = g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      mm.pts.forEach(([x, y], i) => (i ? g.lineTo(W / 2 + x * s, H / 2 + y * s) : g.moveTo(W / 2 + x * s, H / 2 + y * s)));
      g.closePath();
    };
    path();
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 12 * dpr;
    g.stroke();
    path();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 5 * dpr;
    g.stroke();
    const p0 = mm.pts[0];
    g.fillStyle = '#ff3b5c';
    g.beginPath();
    g.arc(W / 2 + p0[0] * s, H / 2 + p0[1] * s, 6 * dpr, 0, Math.PI * 2);
    g.fill();
  }

  renderTracks() {
    const sel = this.storage.selection;
    const mode = this.flow.mode;
    $('#tracks-title').textContent = mode === 'trial' ? 'Zeitfahren – Strecke' : 'Strecke wählen';
    $('#race-options').style.display = mode === 'trial' ? 'none' : '';
    const list = $('#track-list');
    list.innerHTML = '';
    for (const t of TRACKS) {
      const tr = this.getTrack(t.id);
      const rec = this.storage.record(t.id);
      const card = document.createElement('button');
      card.className = 'track-card' + (sel.track === t.id ? ' sel' : '');
      card.dataset.track = t.id;
      card.innerHTML = `<canvas></canvas>${rec.lap ? `<span class="badge">⏱ ${formatTime(rec.lap)}</span>` : ''}<h3>${t.name}</h3><p>${t.desc}</p><div class="meta"><span>${(tr.length / 1000).toFixed(2)} km</span><span>${{ coast: '🌅 Abend', canyon: '☀️ Mittag', city: '🌃 Nacht', alps: '❄️ Schnee' }[t.theme]}</span></div>`;
      this.drawTrackPreview(card.querySelector('canvas'), t.id);
      card.addEventListener('click', () => {
        this.audio.click();
        this.selectTrack(t.id);
      });
      list.appendChild(card);
    }
    $$('.stepper').forEach((st) => (st.querySelector('span').textContent = sel[st.dataset.opt]));
    this.syncSeg($('.seg[data-opt="difficulty"]'), sel.difficulty);
  }

  selectTrack(id) {
    this.storage.selection.track = id;
    this.storage.save();
    $$('.track-card').forEach((c) => c.classList.toggle('sel', c.dataset.track === id));
  }

  // ----- Garage ----------------------------------------------------------
  renderGarage(changed = false) {
    if (!this.showroom) this.showroom = new Showroom(this.renderer, this.camera, this.qualityPreset());
    const def = CARS[this.carIdx];
    const sel = this.storage.selection;
    this.showroom.livery = sel.livery || 'plain';
    this.showroom.number = this.storage.progress.number || 7;
    if (changed || !this._shownCar || this._shownCar !== def.id) {
      this.showroom.setCar(def, sel.color);
      this._shownCar = def.id;
    }
    $('#car-cls').textContent = def.cls;
    $('#car-name').textContent = def.name;
    $('#car-desc').textContent = def.desc;
    const st = carStats(def);
    $('#car-stats').innerHTML = [['SPITZE', st.speed, `${Math.round(def.maxSpeed * 3.6 * 0.97)} km/h`], ['BESCHLEUNIGUNG', st.accel, ''], ['HANDLING', st.handling, ''], ['GEWICHT', st.weight, `${def.mass} kg`], ['GELÄNDE', st.offroad, ''], ['NITRO', 0.6, '']]
      .map(([n, v, t]) => `<div class="stat"><label>${n} <span style="color:var(--text)">${t}</span></label><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`)
      .join('');
    const sw = $('#swatches');
    sw.innerHTML = PAINTS.map((c) => `<button style="background:${c}" data-color="${c}" class="${c === sel.color ? 'on' : ''}"></button>`).join('');
    sw.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.setColor(b.dataset.color)));
    const lv = $('#liveries');
    lv.innerHTML = LIVERIES.map((l) => `<button data-v="${l.id}" class="${(sel.livery || 'plain') === l.id ? 'on' : ''}">${l.name}</button>`).join('');
    lv.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      sel.livery = b.dataset.v;
      this.storage.save();
      this.showroom.livery = sel.livery;
      this.showroom.setColor(sel.color);
      this.syncSeg(lv, sel.livery);
      this.audio.click();
    }));
    const locked = !!def.locked && !this.storage.isUnlocked(def.id);
    $('#screen-garage').classList.toggle('locked', locked);
    const mode = this.flow.mode;
    $('#garage-go').textContent = mode === 'garage' ? 'Übernehmen ✓' : mode === 'champ' ? 'Meisterschaft starten ›' : 'Rennen starten ›';
  }

  setColor(c) {
    this.storage.selection.color = c;
    this.storage.save();
    this.showroom?.setColor(c);
    $$('#swatches button').forEach((b) => b.classList.toggle('on', b.dataset.color === c));
  }

  garageGo() {
    const def = CARS[this.carIdx];
    if (def.locked && !this.storage.isUnlocked(def.id)) return;
    const sel = this.storage.selection;
    sel.car = def.id;
    this.storage.save();
    const mode = this.flow.mode;
    if (mode === 'garage') {
      this.toast(`${def.name} ausgewählt`);
      this.show('main');
      return;
    }
    if (mode === 'champ') {
      this.createChamp();
      this.startChampRace();
      return;
    }
    if (this.storage.settings.steering === 'tilt') this.input.requestTilt();
    this.startRace({
      mode,
      trackId: sel.track,
      carId: def.id,
      color: sel.color,
      livery: sel.livery || 'plain',
      laps: mode === 'trial' ? 5 : sel.laps,
      opponents: mode === 'trial' ? 0 : sel.opponents,
      difficulty: sel.difficulty,
    });
  }

  // ----- Meisterschaft ---------------------------------------------------
  createChamp() {
    const sel = this.storage.selection;
    const diffKey = sel.champDifficulty || 'normal';
    const diff = DIFFICULTY[diffKey];
    const r = rng((Date.now() & 0xffff) + 7);
    const names = ['M. Brandt', 'L. Moreau', 'K. Tanaka', 'S. Rossi', 'A. Novak', 'J. Silva', 'E. Larsen'];
    const pool = CARS.filter((c) => !c.locked);
    const colors = PAINTS.filter((c) => c !== sel.color).sort(() => r() - 0.5);
    const roster = names.map((n, i) => ({
      name: n,
      carId: pool[Math.floor(r() * pool.length)].id,
      color: colors[i % colors.length],
      livery: ['plain', 'stripes', 'side', 'twotone', 'race'][Math.floor(r() * 5)],
      number: 2 + Math.floor(r() * 97),
      skill: diff.skill[1] - (i / 6) * (diff.skill[1] - diff.skill[0]),
    }));
    this.champ = {
      difficulty: diffKey,
      carId: sel.car,
      color: sel.color,
      livery: sel.livery || 'plain',
      round: 0,
      roster,
      points: Object.fromEntries([...names, this.storage.settings.playerName || 'Du'].map((n) => [n, 0])),
      finished: false,
    };
  }

  startChampRace() {
    const c = this.champ;
    const t = TRACKS[c.round];
    this.startRace({ mode: 'champ', trackId: t.id, carId: c.carId, color: c.color, livery: c.livery, laps: 3, opponents: 7, difficulty: c.difficulty, roster: c.roster });
  }

  standingsTable() {
    const c = this.champ;
    const me = this.storage.settings.playerName || 'Du';
    const rows = Object.entries(c.points).sort((a, b) => b[1] - a[1]);
    const colorOf = (n) => (n === me ? c.color : c.roster.find((r) => r.name === n)?.color || '#888');
    return `<table><tr><th>#</th><th>Fahrer</th><th style="text-align:right">Punkte</th></tr>${rows
      .map(([n, p], i) => `<tr class="${n === me ? 'me' : ''}"><td class="pos">${i + 1}</td><td><span class="dot" style="background:${colorOf(n)}"></span>${n}</td><td class="pts">${p}</td></tr>`)
      .join('')}</table>`;
  }

  renderChamp() {
    const c = this.champ;
    const sel = this.storage.selection;
    this.syncSeg($('.seg[data-opt="champDifficulty"]'), sel.champDifficulty || 'normal');
    const diffOpt = $('.seg[data-opt="champDifficulty"]').closest('.opt');
    diffOpt.style.display = c ? 'none' : '';
    $('#champ-tracks').innerHTML = TRACKS.map((t, i) => {
      const cls = c ? (i < c.round ? 'done' : i === c.round && !c.finished ? 'next' : '') : '';
      return `<div class="ct ${cls}"><span class="n">${c && i < c.round ? '✓' : i + 1}</span>${t.name}</div>`;
    }).join('');
    $('#champ-standings').innerHTML = c ? `<h3>Gesamtwertung</h3>${this.standingsTable()}` : '';
    const btn = $('#champ-go');
    if (!c) btn.textContent = 'Fahrzeug wählen ›';
    else if (c.finished) btn.textContent = 'Zum Hauptmenü ›';
    else btn.textContent = `Rennen ${c.round + 1}: ${TRACKS[c.round].name} ›`;
  }

  // ----- Rennen ----------------------------------------------------------
  startAttract() {
    this.disposeWorld();
    this.state = 'menu';
    const w = new World(this, { mode: 'attract', trackId: this.storage.selection.track || 'coast', seed: 42 });
    try {
      w.build();
      this.world = w;
    } catch (e) {
      console.error(e);
    }
  }

  disposeWorld() {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
  }

  startRace(cfg) {
    this.lastCfg = cfg;
    $('#loading').classList.remove('hidden');
    $('#loading-text').textContent = `${getTrackDef(cfg.trackId).name} wird gebaut …`;
    $$('.screen').forEach((s) => s.classList.add('hidden'));
    this.screen = 'race';
    this.audio.silence();
    setTimeout(() => {
      this.disposeWorld();
      this.dynScale = 1;
      this.resize();
      const w = new World(this, cfg);
      const t0 = performance.now();
      w.build();
      this.lastBuildMs = performance.now() - t0;
      this.world = w;
      this.state = 'race';
      $('#loading').classList.add('hidden');
      $('#hud').classList.remove('hidden');
      $('#touch').classList.remove('hidden');
      this.applySettings();
      this.hud.setup(w.track, { mode: cfg.mode, laps: w.laps, units: this.storage.settings.units });
      this.hud.update(0, w);
      this.setHudLights(-1);
      this.input.setEnabled(true);
      const m = getTrackDef(cfg.trackId).music;
      this.audio.startMusic(m);
      this.renderer.compile(w.scene, this.camera);
      if (cfg.mode === 'online') this.mp.worldReady(w);
    }, 40);
  }

  setHudLights(n, go = false) {
    const el = $('#hud-lights');
    if (n < 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'flex';
    el.querySelectorAll('span').forEach((s, i) => {
      s.classList.toggle('on', !go && i < n);
      s.classList.toggle('go', go);
    });
  }

  onCountdown() {
    this.input.calibrateTilt();
  }
  onRaceStart() {
    if (this.world && this.world.online) this.mp.raceStarted();
  }

  onAction(a) {
    if (this.state !== 'race' || !this.world) return;
    if (a === 'pause') {
      const open = this.world.paused || this.world.menuOpen;
      if (open && this.screen !== 'pause') return; // z. B. Einstellungen aus der Pause offen
      this.pause(!open);
    } else if (this.world.paused || this.world.menuOpen) return;
    else if (a === 'camera') {
      const m = this.world.rig.cycle();
      this.storage.settings.camera = this.world.rig.mode;
      this.storage.save();
      this.hud.sub('KAMERA: ' + m.name.toUpperCase(), 1);
    } else if (a === 'reset') this.world.resetPlayer();
  }

  pause(on) {
    if (!this.world || this.state !== 'race') return;
    if (this.world.resultsShown || this.mp.results) return;
    const online = this.world.online;
    $('#screen-pause [data-act="restart"]').style.display = online ? 'none' : '';
    $('#screen-pause h2').textContent = online ? 'MENÜ' : 'PAUSE';
    $('#screen-pause [data-act="quit"]').textContent = online ? 'Party verlassen' : 'Rennen beenden';
    if (online) {
      // online läuft das Rennen weiter, das eigene Auto bremst
      this.world.menuOpen = on;
      this.world.paused = false;
      if (on) this.show('pause');
      else {
        $$('.screen').forEach((s) => s.classList.add('hidden'));
        this.screen = 'race';
      }
      return;
    }
    this.world.paused = on;
    if (on) {
      this.audio.silence();
      this.show('pause');
      this.input.setEnabled(true);
    } else {
      $$('.screen').forEach((s) => s.classList.add('hidden'));
      this.screen = 'race';
      this.world.acc = 0;
      this.input.calibrateTilt();
    }
  }

  onRaceComplete(results, fromNet = false) {
    const w = this.world;
    if (!w) return;
    const cfg = w.cfg;
    if (cfg.mode === 'online' && !fromNet) return;
    results.forEach((r, i) => (r.pos = r.pos || i + 1));
    w.resultsShown = true;
    w.menuOpen = false;
    const st = this.storage;
    const me = results.find((r) => r.isPlayer);
    st.progress.races = (st.progress.races || 0) + 1;
    if (me && me.pos === 1 && cfg.mode !== 'trial') st.progress.wins = (st.progress.wins || 0) + 1;
    st.save();
    $('#touch').classList.add('hidden');
    this.input.setEnabled(false);

    let extra = '';
    const title = $('#results-title');
    if (cfg.mode === 'trial') {
      title.textContent = 'ZEITFAHREN';
      const p = w.player;
      const rec = st.record(cfg.trackId);
      $('#results-body').innerHTML = `<table><tr><th>Runde</th><th>Zeit</th></tr>${p.lapTimes
        .map((t, i) => `<tr class="${t === p.bestLap ? 'me' : ''}"><td class="pos">${i + 1}</td><td>${formatTime(t)}</td></tr>`)
        .join('')}</table><div class="result-extra"><span>Beste Runde: <b>${formatTime(p.bestLap)}</b></span><span>Streckenrekord: <b>${formatTime(rec.lap)}</b></span></div>`;
      $('#results-next').textContent = 'Menü';
    } else {
      title.textContent = me ? (me.pos === 1 ? '🏆 SIEG!' : `PLATZ ${me.pos}`) : 'ERGEBNIS';
      let ptsCol = cfg.mode === 'champ';
      if (ptsCol) {
        for (const r of results) this.champ.points[r.name] = (this.champ.points[r.name] || 0) + (POINTS[r.pos - 1] || 0);
        this.champ.round++;
        if (this.champ.round >= TRACKS.length) this.champ.finished = true;
      }
      $('#results-body').innerHTML = `<table><tr><th>#</th><th>Fahrer</th><th>Auto</th><th>Zeit</th><th>Beste Runde</th>${ptsCol ? '<th style="text-align:right">Pkt.</th>' : ''}</tr>${results
        .map(
          (r) => `<tr class="${r.isPlayer ? 'me' : ''}"><td class="pos">${r.pos}</td><td><span class="dot" style="background:${esc(r.color)}"></span>${esc(r.name)}</td><td>${esc(r.carName)}</td><td>${r.estimated ? '≈ ' : ''}${formatTime(r.time)}</td><td>${formatTime(r.bestLap)}</td>${ptsCol ? `<td class="pts">+${POINTS[r.pos - 1] || 0}</td>` : ''}</tr>`
        )
        .join('')}</table>`;
      if (me) extra = `<div class="result-extra"><span>Deine beste Runde: <b>${formatTime(me.bestLap)}</b></span><span>Streckenrekord: <b>${formatTime(st.record(cfg.trackId).lap)}</b></span></div>`;
      if (ptsCol && this.champ.finished) {
        const me2 = st.settings.playerName || 'Du';
        const sorted = Object.entries(this.champ.points).sort((a, b) => b[1] - a[1]);
        const rank = sorted.findIndex(([n]) => n === me2) + 1;
        extra += `<div class="unlock">${rank === 1 ? '🏆 DU BIST MEISTER!' : `Meisterschaft beendet – Gesamtrang ${rank}`}</div>`;
        if (rank === 1) {
          st.progress.champWins = (st.progress.champWins || 0) + 1;
          st.save();
          if (st.unlock('phantom')) extra += `<div class="unlock">🔓 Neues Fahrzeug freigeschaltet: Phantom LMP</div>`;
        }
      }
      $('#results-body').innerHTML += extra;
      $('#results-next').textContent = cfg.mode === 'champ' ? (this.champ.finished ? 'Endstand ›' : 'Gesamtwertung ›') : cfg.mode === 'online' ? (this.mp.isHost ? 'Zur Lobby ›' : 'Party verlassen') : 'Menü';
      if (cfg.mode === 'online' && !this.mp.isHost) $('#results-body').innerHTML += '<div class="result-extra"><span>Der Gastgeber bringt alle zurück in die Lobby …</span></div>';
      if (cfg.mode === 'online') {
        $('#results-body').innerHTML += '<div class="traffic" id="traffic-info">Datenverkehr wird ermittelt …</div>';
        this.mp.renderTraffic($('#traffic-info'));
      }
    }
    $('#results-body').querySelectorAll('.result-extra').length || ($('#results-body').innerHTML += cfg.mode === 'trial' ? '' : '');
    this.show('results');
    // Neustart in der Meisterschaft nicht erlauben (würde Punkte doppelt zählen)
    $('#screen-results [data-act="restart"]').style.display = cfg.mode === 'champ' || cfg.mode === 'online' ? 'none' : '';
  }

  resultsNext() {
    const mode = this.lastCfg?.mode;
    if (mode === 'online') {
      if (this.mp.isHost) this.mp.hostToLobby();
      else this.mp.leave();
      return;
    }
    if (mode === 'champ') {
      $('#hud').classList.add('hidden');
      this.flow = { mode: 'champ' };
      this.show('champ');
      return;
    }
    this.toMenu();
  }

  // nach einem Online-Rennen zurück in die Lobby
  returnToLobby() {
    $('#hud').classList.add('hidden');
    $('#touch').classList.add('hidden');
    this.input.setEnabled(false);
    this.audio.silence();
    this.startAttract();
    this.audio.startMusic({ root: 57, bpm: 104 });
    this.mp.enterLobby();
  }

  toMenu() {
    $('#hud').classList.add('hidden');
    $('#touch').classList.add('hidden');
    this.input.setEnabled(false);
    this.audio.silence();
    this.startAttract();
    this.audio.startMusic({ root: 57, bpm: 104 });
    this.show('main');
  }

  // ----- Einstellungen / Rekorde -----------------------------------------
  renderSettings() {
    const s = this.storage.settings;
    $$('#screen-settings [data-set]').forEach((el) => {
      const v = s[el.dataset.set];
      if (el.classList.contains('seg')) this.syncSeg(el, String(v));
      else el.value = v;
    });
  }

  renderRecords() {
    const st = this.storage;
    $('#records-body').innerHTML = TRACKS.map((t) => {
      const r = st.record(t.id);
      const races = Object.keys(r).filter((k) => /^race\d+$/.test(k)).sort();
      return `<div class="rec-card"><h3>${t.name}</h3><table>
        <tr><td>Beste Runde</td><td><b>${formatTime(r.lap)}</b></td><td>${r.lapCar ? getCarDef(r.lapCar).name : ''}</td></tr>
        ${races.map((k) => `<tr><td>Rennen (${k.slice(4)} Rd.)</td><td><b>${formatTime(r[k])}</b></td><td>${getCarDef(r[k + 'Car']).name}</td></tr>`).join('')}
        <tr><td>Geist</td><td colspan="2">${st.ghost(t.id) ? '👻 gespeichert' : '–'}</td></tr>
      </table></div>`;
    }).join('');
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (e) {
    console.error(e);
    document.body.innerHTML = `<div style="padding:40px;font-family:system-ui;color:#fff;background:#111;height:100%">
      <h2>Das Spiel konnte nicht gestartet werden</h2><p>${e.message}</p><p>WebGL wird benötigt.</p></div>`;
  }
});
