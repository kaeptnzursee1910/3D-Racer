// HUD: Tacho, Minikarte, Positionen, Zeiten, Meldungen
import { formatTime, formatDelta, clamp } from './utils.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = {
      root: $('hud'),
      pos: $('hud-pos'),
      posTotal: $('hud-pos-total'),
      lap: $('hud-lap'),
      time: $('hud-time'),
      laptime: $('hud-laptime'),
      best: $('hud-best'),
      delta: $('hud-delta'),
      board: $('hud-board'),
      msg: $('hud-msg'),
      sub: $('hud-sub'),
      wrong: $('hud-wrong'),
      fps: $('hud-fps'),
      speedlines: $('speedlines'),
      posBox: $('hud-posbox'),
    };
    this.speedo = $('speedo');
    this.sctx = this.speedo.getContext('2d');
    this.map = $('minimap');
    this.mctx = this.map.getContext('2d');
    this.cache = {};
    this.msgTimer = 0;
    this.subTimer = 0;
    this.boardTimer = 0;
    this.units = 'kmh';
  }

  set(key, el, val) {
    if (this.cache[key] !== val) {
      this.cache[key] = val;
      el.textContent = val;
    }
  }

  setup(track, opts) {
    this.track = track;
    this.mode = opts.mode;
    this.totalLaps = opts.laps;
    this.units = opts.units || 'kmh';
    this.cache = {};
    this.el.posBox.style.display = opts.mode === 'trial' ? 'none' : '';
    this.el.board.style.display = opts.mode === 'trial' ? 'none' : '';
    this.resize();
    this.drawMapBase();
    this.el.msg.className = '';
    this.el.sub.className = '';
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.speedo, this.map]) {
      const r = c.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
    }
    if (this.track) this.drawMapBase();
  }

  drawMapBase() {
    const tr = this.track;
    const W = this.map.width, H = this.map.height;
    if (!this.mapBase) this.mapBase = document.createElement('canvas');
    this.mapBase.width = W;
    this.mapBase.height = H;
    const g = this.mapBase.getContext('2d');
    const mm = tr.minimapPoints(3);
    this.mm = mm;
    const pad = 0.12;
    const s = Math.min(W, H) * (1 - pad * 2);
    this.mapTf = (x, z) => [W / 2 + ((x - mm.bounds.cx) / mm.scale) * s, H / 2 + ((z - mm.bounds.cz) / mm.scale) * s];
    g.clearRect(0, 0, W, H);
    g.lineJoin = g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      mm.pts.forEach(([x, y], i) => {
        const px = W / 2 + x * s, py = H / 2 + y * s;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      });
      g.closePath();
    };
    path();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = W * 0.07;
    g.stroke();
    path();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = W * 0.03;
    g.stroke();
    // Startlinie
    const [sx, sy] = this.mapTf(tr.cx[0], tr.cz[0]);
    g.fillStyle = '#ff3b3b';
    g.beginPath();
    g.arc(sx, sy, W * 0.03, 0, Math.PI * 2);
    g.fill();
  }

  drawMap(cars, player, ghost) {
    const g = this.mctx;
    const W = this.map.width;
    g.clearRect(0, 0, W, this.map.height);
    g.drawImage(this.mapBase, 0, 0);
    const r = W * 0.028;
    if (ghost && ghost.visible) {
      const [x, y] = this.mapTf(ghost.x, ghost.z);
      g.fillStyle = 'rgba(160,220,255,0.8)';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    for (const c of cars) {
      if (c === player) continue;
      const [x, y] = this.mapTf(c.x, c.z);
      g.fillStyle = c.color;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.lineWidth = W * 0.008;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    if (player) {
      const [x, y] = this.mapTf(player.x, player.z);
      g.save();
      g.translate(x, y);
      g.rotate(-player.heading + Math.PI);
      g.fillStyle = '#ffffff';
      g.strokeStyle = '#ff2b4a';
      g.lineWidth = W * 0.012;
      g.beginPath();
      g.moveTo(0, -r * 2);
      g.lineTo(r * 1.4, r * 1.4);
      g.lineTo(-r * 1.4, r * 1.4);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
  }

  drawSpeedo(car) {
    const g = this.sctx;
    const W = this.speedo.width, H = this.speedo.height;
    const cx = W / 2, cy = H / 2, R = W * 0.42;
    g.clearRect(0, 0, W, H);
    const mph = this.units === 'mph';
    const kmh = Math.abs(car.speed) * 3.6;
    const shown = mph ? kmh * 0.621371 : kmh;
    const maxV = mph ? 200 : 320;
    const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
    const t = clamp(shown / maxV, 0, 1);
    // Hintergrund
    g.fillStyle = 'rgba(8,10,18,0.62)';
    g.beginPath();
    g.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
    g.fill();
    // Skala
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = W * 0.05;
    g.beginPath();
    g.arc(cx, cy, R, a0, a1);
    g.stroke();
    const grd = g.createLinearGradient(cx - R, cy, cx + R, cy);
    grd.addColorStop(0, '#2ee6ff');
    grd.addColorStop(0.6, '#ffe14a');
    grd.addColorStop(1, '#ff3b5c');
    g.strokeStyle = grd;
    g.beginPath();
    g.arc(cx, cy, R, a0, a0 + (a1 - a0) * t);
    g.stroke();
    // Ticks
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = W * 0.008;
    for (let i = 0; i <= 8; i++) {
      const a = a0 + ((a1 - a0) * i) / 8;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78);
      g.lineTo(cx + Math.cos(a) * R * 0.86, cy + Math.sin(a) * R * 0.86);
      g.stroke();
    }
    // Drehzahl-Ring
    g.strokeStyle = car.rpm > 0.92 ? '#ff3b5c' : 'rgba(255,255,255,0.75)';
    g.lineWidth = W * 0.018;
    g.beginPath();
    g.arc(cx, cy, R * 0.68, a0, a0 + (a1 - a0) * clamp(car.rpm, 0, 1));
    g.stroke();
    // Nitro
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = W * 0.03;
    g.beginPath();
    g.arc(cx, cy, R * 1.12 - W * 0.02, Math.PI * 0.82, Math.PI * 0.18, true);
    g.stroke();
    g.strokeStyle = car.nitroActive ? '#ffffff' : '#3fa9ff';
    if (car.nitro > 0.01) {
      g.beginPath();
      g.arc(cx, cy, R * 1.12 - W * 0.02, Math.PI * 0.82, Math.PI * 0.82 - Math.PI * 0.64 * car.nitro, true);
      g.stroke();
    }
    // Zahlen
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 italic ${Math.round(W * 0.22)}px system-ui, -apple-system, sans-serif`;
    g.fillText(String(Math.round(shown)), cx, cy - W * 0.02);
    g.font = `600 ${Math.round(W * 0.07)}px system-ui, -apple-system, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(mph ? 'MPH' : 'KM/H', cx, cy + W * 0.13);
    g.font = `800 ${Math.round(W * 0.1)}px system-ui, -apple-system, sans-serif`;
    g.fillStyle = car.gear === -1 ? '#ff6b6b' : '#ffe14a';
    g.fillText(car.gear === -1 ? 'R' : String(car.gear), cx, cy + W * 0.27);
    g.font = `700 ${Math.round(W * 0.055)}px system-ui, -apple-system, sans-serif`;
    g.fillStyle = '#3fa9ff';
    g.fillText('N₂O', cx, cy + W * 0.41);
  }

  update(dt, race) {
    const p = race.player;
    if (!p) return;
    const e = this.el;
    // Position
    if (this.mode !== 'trial') {
      this.set('pos', e.pos, String(p.position));
      this.set('posT', e.posTotal, '/' + race.cars.length);
    }
    const lap = clamp(p.lapsDone + 1, 1, race.laps);
    this.set('lap', e.lap, this.mode === 'trial' ? `RUNDE ${p.lapsDone + 1}` : `RUNDE ${lap}/${race.laps}`);
    const now = race.time;
    this.set('time', e.time, formatTime(Math.max(0, now)));
    const lt = p.finished ? p.lapTimes[p.lapTimes.length - 1] : Math.max(0, now - p.lapStart);
    this.set('lt', e.laptime, formatTime(lt));
    const best = Math.min(p.bestLap, race.recordLap || Infinity);
    this.set('best', e.best, isFinite(p.bestLap) ? formatTime(p.bestLap) : race.recordLap ? formatTime(race.recordLap) : '--:--.---');
    if (race.delta != null && isFinite(race.delta)) {
      this.set('delta', e.delta, formatDelta(race.delta));
      e.delta.className = race.delta <= 0 ? 'good' : 'bad';
    } else this.set('delta', e.delta, '');

    // Falsche Richtung
    e.wrong.classList.toggle('show', p.wrongWay > 1.2 && !p.finished);

    // Rangliste
    this.boardTimer -= dt;
    if (this.boardTimer <= 0 && this.mode !== 'trial') {
      this.boardTimer = 0.3;
      const sorted = [...race.cars].sort((a, b) => a.position - b.position);
      const leader = sorted[0];
      let html = '';
      for (const c of sorted) {
        let gap = '';
        if (c !== leader) {
          if (c.finished && leader.finished) gap = '+' + (c.finishTime - leader.finishTime).toFixed(1);
          else {
            const dd = leader.totalDist - c.totalDist;
            const lapsBehind = Math.floor(dd / race.track.length);
            gap = lapsBehind >= 1 ? `+${lapsBehind} Rd.` : '+' + (dd / Math.max(15, Math.abs(c.speed) || 30)).toFixed(1);
          }
        }
        html += `<div class="row${c === p ? ' me' : ''}"><span class="p">${c.position}</span><span class="dot" style="background:${c.color}"></span><span class="n">${c.name}</span><span class="g">${c.finished ? '🏁' : gap}</span></div>`;
      }
      if (html !== this.cache.board) {
        this.cache.board = html;
        e.board.innerHTML = html;
      }
    }

    this.drawSpeedo(p);
    this.drawMap(race.cars, p, race.ghostCar);

    // Geschwindigkeitslinien
    const sl = clamp((Math.abs(p.speed) - 45) / 30, 0, 1) * 0.5 + (p.nitroActive ? 0.5 : 0);
    if (Math.abs((this.cache.sl || 0) - sl) > 0.02) {
      this.cache.sl = sl;
      e.speedlines.style.opacity = sl.toFixed(2);
    }

    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) e.msg.className = '';
    }
    if (this.subTimer > 0) {
      this.subTimer -= dt;
      if (this.subTimer <= 0) e.sub.className = '';
    }
  }

  message(text, dur = 1.5, cls = '') {
    const m = this.el.msg;
    m.textContent = text;
    m.className = '';
    void m.offsetWidth; // Animation neu starten
    m.className = 'show ' + cls;
    this.msgTimer = dur;
  }

  sub(text, dur = 1.5, cls = '') {
    const m = this.el.sub;
    m.textContent = text;
    m.className = '';
    void m.offsetWidth;
    m.className = 'show ' + cls;
    this.subTimer = dur;
  }

  fps(v, show) {
    this.el.fps.style.display = show ? 'block' : 'none';
    if (show) this.set('fps', this.el.fps, `${Math.round(v)} FPS`);
  }
}
