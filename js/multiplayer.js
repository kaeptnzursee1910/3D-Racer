// Mehrspieler: Party/Lobby, Chat, Einladungslink, Rennablauf und Zustandsabgleich.
// Der Gastgeber verwaltet Lobby, KI-Gegner, Zieleinlauf und Ergebnisse. Jedes Gerät berechnet sein
// eigenes Auto und schickt 20-mal pro Sekunde dessen Zustand; der Gastgeber verteilt Momentaufnahmen.
import { Net } from './net.js';
import { CARS, PAINTS, LIVERIES, getCarDef, carStats } from './carModel.js';
import { TRACKS, getTrackDef } from './tracks.js';
import { DIFFICULTY } from './ai.js';
import { clamp } from './utils.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AI_NAMES = ['M. Brandt', 'L. Moreau', 'K. Tanaka', 'S. Rossi', 'A. Novak', 'J. Silva', 'E. Larsen', 'R. Okafor'];
const SEND_INTERVAL = 0.05; // 20 Hz wie in Horizon Rush

export class Multiplayer {
  constructor(game) {
    this.game = game;
    this.lobby = null; // { code, players: [{id,name,car,color,livery,ready,ping}], settings, racing }
    this.chat = [];
    this.inRace = false;
    this.sendT = 0;
    this.pingT = 0;
    Net.onMsg = (m, from) => this.onMsg(m, from);
    Net.onDrop = (id) => this.onDrop(id);
    this.bindUI();
  }

  get isHost() { return Net.isHost; }
  get myId() { return Net.isHost ? 0 : Net.myId; }
  get active() { return !!this.lobby; }
  me() { return this.lobby && this.lobby.players.find((p) => p.id === this.myId); }

  // ---------------------------------------------------------------------
  // Oberfläche
  bindUI() {
    $('#mp-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.act('mp-join'); });
    $('#chat-text').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.act('chat-send'); });
    $('#mp-code').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); });
  }

  act(a, el) {
    switch (a) {
      case 'mp-create': return this.create();
      case 'mp-join': {
        const code = ($('#mp-code').value || '').replace(/\D/g, '');
        if (code.length !== 4) return this.error('Bitte den 4-stelligen Code eingeben.');
        return this.join(code);
      }
      case 'mp-leave': return this.leave();
      case 'mp-invite': return this.invite();
      case 'chat-send': {
        const inp = $('#chat-text');
        const text = inp.value.trim().slice(0, 200);
        inp.value = '';
        if (!text) return;
        if (this.isHost) this.hostChat(0, text);
        else Net.send({ t: 'chat', text });
        return;
      }
      case 'lobby-car-prev':
      case 'lobby-car-next': {
        const me = this.me();
        if (!me) return;
        const avail = CARS.filter((c) => !c.locked || this.game.storage.isUnlocked(c.id));
        let i = avail.findIndex((c) => c.id === me.car);
        i = (i + (a === 'lobby-car-next' ? 1 : avail.length - 1)) % avail.length;
        return this.updateMe({ car: avail[i].id });
      }
      case 'lobby-main': {
        if (this.isHost) return this.hostStart();
        const me = this.me();
        if (me) this.updateMe({ ready: !me.ready });
        return;
      }
      case 'key-save': {
        Net.setKey($('#key-user').value.trim(), $('#key-pass').value.trim());
        this.game.toast(Net.getKey() ? 'Zugangsdaten gespeichert' : 'Zugangsdaten gelöscht');
        return this.game.show('mp');
      }
      case 'key-del':
        Net.setKey(null);
        this.game.toast('Zugangsdaten gelöscht');
        return this.game.show('mp');
    }
  }

  showStart(invite) {
    const g = this.game;
    g.show('mp');
    const name = g.storage.settings.playerName;
    $('#mp-name').value = name && name !== 'Du' ? name : '';
    $('#mp-code').value = invite || '';
    $('#mp-err').hidden = true;
    $('#mp-create').style.display = invite ? 'none' : '';
    $('#mp-note').innerHTML = invite
      ? `Du wurdest in die Party <b>${esc(invite)}</b> eingeladen. Gib deinen Namen ein und tippe auf <b>Beitreten</b>.`
      : 'Bis zu 8 Spieler, jeder auf seinem eigenen Gerät. Freie Plätze füllen Computergegner auf.';
    if (!Net.available()) this.error('Der Mehrspieler-Modus konnte nicht geladen werden.');
  }

  showKeyForm() {
    const k = Net.getKey() || {};
    $('#key-user').value = k.user || '';
    $('#key-pass').value = k.pass || '';
    this.game.show('keyform');
  }

  error(msg) {
    const e = $('#mp-err');
    e.textContent = msg;
    e.hidden = false;
    $('#lobby-status').textContent = '';
  }

  readName() {
    let n = ($('#mp-name').value || '').trim().slice(0, 14);
    if (!n) n = 'Spieler ' + Math.floor(10 + Math.random() * 89);
    this.game.storage.settings.playerName = n;
    this.game.storage.save();
    return n;
  }

  profile() {
    const sel = this.game.storage.selection;
    let car = getCarDef(sel.car);
    if (car.locked && !this.game.storage.isUnlocked(car.id)) car = CARS[0];
    return { name: this.game.storage.settings.playerName, car: car.id, color: sel.color, livery: sel.livery || 'plain' };
  }

  // ---------------------------------------------------------------------
  // Party eröffnen / beitreten / verlassen
  create() {
    this.readName();
    this.game.toast('Party wird eröffnet …');
    Net.host((err, code) => {
      if (err) return this.error(err);
      const sel = this.game.storage.selection;
      this.chat = [];
      this.lobby = {
        code,
        players: [{ id: 0, ...this.profile(), ready: true, ping: 0 }],
        settings: { track: sel.track || 'coast', laps: 3, ai: true, difficulty: sel.difficulty || 'normal' },
        racing: false,
      };
      this.sys('Party eröffnet. Teile den Code ' + code + ' oder den Einladungslink.');
      this.enterLobby();
    });
  }

  join(code) {
    this.readName();
    $('#mp-err').hidden = true;
    this.game.toast('Verbinde mit Party ' + code + ' …', 4000);
    Net.join(code, (err) => {
      if (err) return this.error(err);
      this.chat = [];
      Net.send({ t: 'hello', ...this.profile() });
      this.lobby = { code, players: [], settings: {}, racing: false };
      this.enterLobby();
      $('#lobby-status').textContent = 'Verbunden – warte auf Lobby …';
    });
  }

  leave(silent = false) {
    if (this.isHost) Net.broadcast({ t: 'bye' });
    setTimeout(() => Net.close(), 100);
    this.lobby = null;
    this.inRace = false;
    if (!silent) this.game.toMenu();
  }

  enterLobby() {
    this.game.show('lobby');
    this.renderLobby();
  }

  invite() {
    if (!this.lobby) return;
    const k = Net.getKey();
    const url = location.origin + location.pathname + '?party=' + this.lobby.code +
      (k && k.user && k.pass ? '#k=' + btoa(unescape(encodeURIComponent(JSON.stringify([k.user, k.pass])))).replace(/=+$/, '') : '');
    const text = 'Fahr mit mir bei VELOX! Party-Code ' + this.lobby.code;
    if (navigator.share) { navigator.share({ title: 'VELOX', text, url }).catch(() => {}); return; }
    const done = () => this.game.toast('Link kopiert: ' + url, 3500);
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text + '\n' + url).then(done, () => window.prompt('Link kopieren:', url));
    else window.prompt('Link kopieren:', url);
  }

  // Einladungslink beim Start auswerten (?party=1234#k=...)
  static parseInvite(storeKey) {
    const inv = (new URLSearchParams(location.search).get('party') || '').replace(/\D/g, '').slice(0, 4);
    const km = /[#&]k=([A-Za-z0-9+/]+)/.exec(location.hash);
    if (km) {
      try {
        const [u, p] = JSON.parse(decodeURIComponent(escape(atob(km[1]))));
        if (u && p) storeKey(String(u), String(p));
      } catch (_) { /* */ }
    }
    if (inv.length === 4 || km) history.replaceState(null, '', location.pathname);
    return inv.length === 4 ? inv : null;
  }

  // ---------------------------------------------------------------------
  updateMe(fields) {
    const me = this.me();
    if (!me) return;
    Object.assign(me, fields);
    if (fields.car || fields.color || fields.livery) {
      const sel = this.game.storage.selection;
      if (fields.car) sel.car = fields.car;
      if (fields.color) sel.color = fields.color;
      if (fields.livery) sel.livery = fields.livery;
      this.game.storage.save();
    }
    if (this.isHost) this.pushLobby();
    else {
      Net.send({ t: 'upd', ...fields });
      this.renderLobby();
    }
  }

  setSetting(k, v) {
    if (!this.isHost) return;
    this.lobby.settings[k] = v;
    this.pushLobby();
  }

  pushLobby() {
    if (!this.isHost || !this.lobby) return;
    Net.broadcast({ t: 'lobby', l: this.lobby });
    this.renderLobby();
  }

  sys(text) {
    this.addChat({ sys: true, text });
  }
  addChat(m) {
    this.chat.push(m);
    if (this.chat.length > 80) this.chat.shift();
    this.renderChat();
  }
  hostChat(from, text) {
    const p = this.lobby.players.find((x) => x.id === from);
    const m = { id: from, name: p ? p.name : '?', color: p ? p.color : '#888', text: String(text).slice(0, 200) };
    this.addChat(m);
    Net.broadcast({ t: 'chat', m });
  }

  // ---------------------------------------------------------------------
  // Nachrichten
  onMsg(m, from) {
    if (!m || typeof m !== 'object') return;
    const host = this.isHost;
    const L = this.lobby;
    switch (m.t) {
      // ----- beim Gastgeber -----
      case 'hello':
        if (!host || !L) return;
        if (!L.players.some((p) => p.id === from)) {
          L.players.push({ id: from, name: String(m.name || 'Gast').slice(0, 14), car: getCarDef(m.car).id, color: String(m.color || '#888').slice(0, 9), livery: String(m.livery || 'plain'), ready: false, ping: 0 });
          this.sys(`${L.players[L.players.length - 1].name} ist beigetreten.`);
          Net.sendTo(from, { t: 'chatlog', c: this.chat.slice(-30) });
          Net.broadcast({ t: 'chat', m: { sys: true, text: `${L.players[L.players.length - 1].name} ist beigetreten.` } }, from);
        }
        this.pushLobby();
        return;
      case 'upd': {
        if (!host || !L) return;
        const p = L.players.find((x) => x.id === from);
        if (!p) return;
        if (m.car) p.car = getCarDef(m.car).id;
        if (m.color) p.color = String(m.color).slice(0, 9);
        if (m.livery) p.livery = String(m.livery);
        if (typeof m.ready === 'boolean') p.ready = m.ready;
        this.pushLobby();
        return;
      }
      case 'chat':
        if (host) this.hostChat(from, m.text || '');
        else if (m.m) this.addChat(m.m);
        return;
      case 'pong': {
        if (!host || !L) return;
        const p = L.players.find((x) => x.id === from);
        if (p) p.ping = Math.round(performance.now() - m.ts);
        return;
      }
      case 'loaded':
        if (host && this.loaded) { this.loaded.add(from); this.checkLoaded(); }
        return;
      case 'st': {
        if (!host || !this.world || !Array.isArray(m.c)) return;
        const car = this.world.cars.find((c) => c.netIdx === m.c[0] && c.entrantId === 'h' + from);
        if (car) car.pushNet(m.c, performance.now());
        return;
      }
      case 'fin': {
        if (!host || !this.world) return;
        const car = this.world.cars.find((c) => c.entrantId === 'h' + from);
        if (car && !car.finishedReported) this.applyFinish(car, m.time, m.best);
        return;
      }
      // ----- bei Gästen -----
      case 'lobby':
        if (host) return;
        this.lobby = m.l;
        if (this.game.screen === 'lobby') this.renderLobby();
        return;
      case 'chatlog':
        if (!host) { this.chat = m.c || []; this.renderChat(); }
        return;
      case 'ping':
        if (!host) Net.send({ t: 'pong', ts: m.ts });
        return;
      case 'start':
        if (!host) this.startRace(m.cfg);
        return;
      case 'go':
        if (!host && this.world) this.go(m.gd);
        return;
      case 's': {
        if (host || !this.world) return;
        const now = performance.now();
        for (const a of m.c) {
          const car = this.world.cars[a[0]];
          if (car && car.remote) car.pushNet(a, now);
        }
        if (m.f) for (const [idx, time, best] of m.f) {
          const car = this.world.cars[idx];
          if (car && car.remote && !car.finishedReported) this.applyFinish(car, time, best);
        }
        return;
      }
      case 'results':
        if (!host) this.showResults(m.rows);
        return;
      case 'tolobby':
        if (!host) this.backToLobby();
        return;
      case 'bye':
        if (!host) this.onDrop(0);
        return;
    }
  }

  onDrop(id) {
    if (this.isHost) {
      const L = this.lobby;
      if (!L) return;
      const p = L.players.find((x) => x.id === id);
      L.players = L.players.filter((x) => x.id !== id);
      if (p) {
        this.sys(`${p.name} hat die Party verlassen.`);
        Net.broadcast({ t: 'chat', m: { sys: true, text: `${p.name} hat die Party verlassen.` } });
      }
      if (this.world) {
        const car = this.world.cars.find((c) => c.entrantId === 'h' + id);
        if (car) {
          car.gone = true;
          car.remote = true;
          car.mesh.visible = false;
          car.x = car.z = 1e6;
          car.netBuf = null;
        }
        if (this.loaded) this.checkLoaded();
      }
      this.pushLobby();
    } else {
      if (!this.lobby) return;
      this.game.toast('Verbindung zum Gastgeber verloren', 3500);
      this.lobby = null;
      this.inRace = false;
      Net.close();
      this.game.toMenu();
    }
  }

  // ---------------------------------------------------------------------
  // Rennen
  hostStart() {
    const L = this.lobby;
    if (!L || this.inRace) return;
    const notReady = L.players.filter((p) => p.id !== 0 && !p.ready);
    if (notReady.length && !this._forceStart) {
      this._forceStart = true;
      setTimeout(() => (this._forceStart = false), 4000);
      this.game.toast(`${notReady.map((p) => p.name).join(', ')} ${notReady.length > 1 ? 'sind' : 'ist'} noch nicht bereit – nochmal tippen zum Starten`, 3800);
      return;
    }
    const S = L.settings;
    const humans = [...L.players].sort(() => Math.random() - 0.5);
    const diff = DIFFICULTY[S.difficulty] || DIFFICULTY.normal;
    const entrants = [];
    const nAI = S.ai ? Math.max(0, 8 - humans.length) : 0;
    const used = new Set(humans.map((h) => h.color));
    const pool = CARS.filter((c) => !c.locked);
    for (let k = 0; k < nAI; k++) {
      let color = PAINTS[(k * 5 + 3) % PAINTS.length];
      for (let j = 0; j < PAINTS.length && used.has(color); j++) color = PAINTS[(k * 5 + 3 + j) % PAINTS.length];
      used.add(color);
      const t = nAI > 1 ? k / (nAI - 1) : 0.5;
      entrants.push({
        id: 'a' + k, ai: true, name: AI_NAMES[k % AI_NAMES.length], carId: pool[(k * 3 + 1) % pool.length].id, color,
        livery: LIVERIES[k % LIVERIES.length].id, number: 10 + k * 7, skill: +(diff.skill[1] - t * (diff.skill[1] - diff.skill[0])).toFixed(3),
      });
    }
    humans.forEach((h, k) => entrants.push({ id: 'h' + h.id, ai: false, name: h.name, carId: h.car, color: h.color, livery: h.livery, number: k + 1 }));
    const cfg = { mode: 'online', trackId: S.track, laps: S.laps, difficulty: S.difficulty, entrants, seed: Math.floor(Math.random() * 1e6) };
    L.racing = true;
    for (const p of L.players) if (p.id !== 0) p.ready = false;
    Net.broadcast({ t: 'start', cfg });
    this.pushLobby();
    this.startRace(cfg);
  }

  startRace(cfg) {
    this.inRace = true;
    this.cfg = { ...cfg, localId: 'h' + this.myId, isHost: this.isHost };
    this.world = null;
    this.results = null;
    this.firstHumanFinish = null;
    if (this.isHost) {
      this.loaded = new Set();
      clearTimeout(this._loadTimer);
      this._loadTimer = setTimeout(() => this.go(), 25000);
    }
    Net.stats.raceStart = { ...Net.stats, t: performance.now() };
    this.game.startRace(this.cfg);
  }

  // vom Spiel aufgerufen, sobald die Strecke gebaut ist
  worldReady(world) {
    this.world = world;
    if (this.isHost) { this.loaded.add(0); this.checkLoaded(); }
    else Net.send({ t: 'loaded' });
  }

  checkLoaded() {
    if (!this.isHost || !this.loaded || !this.world || this.world.phase !== 'wait') return;
    const need = this.cfg.entrants.filter((e) => !e.ai).map((e) => +e.id.slice(1)).filter((id) => id === 0 || Net.conns.has(id));
    if (need.every((id) => this.loaded.has(id))) this.go();
  }

  go(gd) {
    const w = this.world;
    if (!w || w.phase !== 'wait') return;
    if (this.isHost) {
      clearTimeout(this._loadTimer);
      gd = +(0.2 + Math.random() * 0.8).toFixed(2);
      Net.broadcast({ t: 'go', gd });
    }
    w.fixedGoDelay = gd;
    w.setPhase('intro');
  }

  carFinished(car) {
    if (car !== this.world.player) {
      if (this.isHost && !car.remote) this.applyFinish(car, car.finishTime, car.bestLap);
      return;
    }
    const best = isFinite(car.bestLap) ? +car.bestLap.toFixed(3) : null;
    if (this.isHost) this.applyFinish(car, car.finishTime, car.bestLap);
    else Net.send({ t: 'fin', time: +car.finishTime.toFixed(3), best });
  }

  applyFinish(car, time, best) {
    car.finished = true;
    car.finishTime = time;
    car.finishedReported = true;
    if (best != null) car.bestLap = best;
    if (car.human && this.firstHumanFinish == null) this.firstHumanFinish = performance.now();
  }

  // pro Frame aus World.update
  tick(dt, world) {
    if (!this.lobby) return;
    // Ping in der Lobby/Rennen alle 2 s
    if (this.isHost) {
      this.pingT -= dt;
      if (this.pingT <= 0) {
        this.pingT = 2;
        Net.broadcast({ t: 'ping', ts: Math.round(performance.now()) });
      }
    }
    if (world.phase === 'wait' || world.phase === 'intro') return;
    this.sendT -= dt;
    if (this.sendT > 0) return;
    this.sendT += SEND_INTERVAL;
    if (this.sendT < 0) this.sendT = SEND_INTERVAL;
    if (this.isHost) {
      // Momentaufnahme: eigene + KI-Autos frisch, Mitspieler mit ihrem letzten Paket
      const packs = [];
      for (const c of world.cars) {
        if (c.gone) continue;
        if (c.remote) { if (c.lastPack) packs.push(c.lastPack); }
        else packs.push(c.packState(c.netIdx));
      }
      const fins = world.cars.filter((c) => c.finished && isFinite(c.finishTime)).map((c) => [c.netIdx, +c.finishTime.toFixed(3), isFinite(c.bestLap) ? +c.bestLap.toFixed(3) : null]);
      for (const [id] of Net.conns) {
        const own = world.cars.find((c) => c.entrantId === 'h' + id);
        const msg = { t: 's', c: own ? packs.filter((p) => p[0] !== own.netIdx) : packs };
        if (fins.length) msg.f = fins;
        Net.sendTo(id, msg);
      }
      this.checkEnd(world);
    } else if (world.player) {
      Net.send({ t: 'st', c: world.player.packState(world.player.netIdx) });
    }
  }

  checkEnd(world) {
    if (this.results) return;
    const humans = world.cars.filter((c) => c.human && !c.gone);
    const allDone = humans.length && humans.every((c) => c.finished);
    const timeout = this.firstHumanFinish != null && performance.now() - this.firstHumanFinish > 60000;
    if (allDone || timeout) {
      if (!this._endAt) this._endAt = performance.now() + (allDone ? 3500 : 0);
      if (performance.now() >= this._endAt) {
        const rows = world.results().map((r) => ({ ...r, isPlayer: undefined }));
        this.results = rows;
        Net.broadcast({ t: 'results', rows });
        this.showResults(rows);
      }
    }
  }

  showResults(rows) {
    this.results = rows;
    this._endAt = null;
    const me = 'h' + this.myId;
    const marked = rows.map((r) => ({ ...r, isPlayer: r.id === me, time: r.time == null ? Infinity : r.time }));
    this.game.onRaceComplete(marked, true);
  }

  // Gastgeber: zurück in die Lobby (alle folgen)
  hostToLobby() {
    if (!this.isHost) return;
    Net.broadcast({ t: 'tolobby' });
    this.backToLobby();
  }

  backToLobby() {
    this.inRace = false;
    this.world = null;
    this.loaded = null;
    if (this.lobby) this.lobby.racing = false;
    this.game.returnToLobby();
    if (this.isHost) this.pushLobby();
  }

  // ---------------------------------------------------------------------
  renderChat() {
    const log = $('#chat-log');
    if (!log) return;
    log.innerHTML = this.chat
      .map((m) => (m.sys ? `<div class="sys">${esc(m.text)}</div>` : `<div><b style="color:${esc(m.color || '#fff')}">${esc(m.name)}:</b>${esc(m.text)}</div>`))
      .join('');
    log.scrollTop = log.scrollHeight;
  }

  renderLobby() {
    const L = this.lobby;
    if (!L) return;
    const host = this.isHost;
    $('#lobby-code').textContent = L.code || '----';
    const S = L.settings || {};
    const humans = L.players || [];
    const nAI = S.ai ? Math.max(0, 8 - humans.length) : 0;
    $('#lobby-count').textContent = `Spieler (${humans.length}/8)`;
    const rows = humans.map((p) => {
      const car = getCarDef(p.car);
      const tag = p.id === 0 ? '<span class="tag host">Gastgeber</span>' : p.ready ? '<span class="tag ok">Bereit</span>' : '<span class="tag">Wartet</span>';
      const ping = p.id !== 0 && p.ping ? `<small>${p.ping} ms</small>` : '';
      return `<li class="${p.id === this.myId ? 'me' : ''}"><span class="dot" style="background:${esc(p.color)}"></span><b>${esc(p.name)}</b><small>${esc(car.name)}</small>${ping}${tag}</li>`;
    });
    if (nAI) rows.push(`<li class="ai"><span class="dot" style="background:#666"></span><b>${nAI} Computergegner</b><small>${esc((DIFFICULTY[S.difficulty] || DIFFICULTY.normal).name)}</small></li>`);
    $('#lobby-players').innerHTML = rows.join('');

    // Einstellungen (nur Gastgeber änderbar)
    const tr = getTrackDef(S.track || 'coast');
    const dis = host ? '' : 'disabled';
    $('#lobby-settings').innerHTML = `
      <div class="opt"><label>Strecke</label><div class="seg" data-lset="track">${TRACKS.map((t) => `<button ${dis} data-v="${t.id}" class="${t.id === tr.id ? 'on' : ''}">${t.name}</button>`).join('')}</div></div>
      <div class="opt"><label>Runden</label><div class="stepper"><button ${dis} data-lstep="-1">−</button><span>${S.laps || 3}</span><button ${dis} data-lstep="1">+</button></div></div>
      <div class="opt"><label>Computergegner</label><div class="seg" data-lset="ai"><button ${dis} data-v="false" class="${!S.ai ? 'on' : ''}">Aus</button><button ${dis} data-v="true" class="${S.ai ? 'on' : ''}">Auffüllen</button></div></div>
      <div class="opt"><label>Schwierigkeit</label><div class="seg" data-lset="difficulty">${Object.entries(DIFFICULTY).map(([k, d]) => `<button ${dis} data-v="${k}" class="${S.difficulty === k ? 'on' : ''}">${d.name}</button>`).join('')}</div></div>`;
    if (host) {
      $('#lobby-settings').querySelectorAll('[data-lset] button').forEach((b) => b.addEventListener('click', () => {
        const k = b.parentElement.dataset.lset;
        let v = b.dataset.v;
        if (v === 'true' || v === 'false') v = v === 'true';
        this.setSetting(k, v);
        this.game.audio.click();
      }));
      $('#lobby-settings').querySelectorAll('[data-lstep]').forEach((b) => b.addEventListener('click', () => {
        this.setSetting('laps', clamp((S.laps || 3) + +b.dataset.lstep, 1, 9));
        this.game.audio.click();
      }));
    }

    // eigenes Auto
    const me = this.me();
    if (me) {
      const def = getCarDef(me.car);
      $('#lobby-car-cls').textContent = def.cls;
      $('#lobby-car-name').textContent = def.name;
      const st = carStats(def);
      $('#lobby-car-stats').innerHTML = [['SPITZE', st.speed], ['BESCHL.', st.accel], ['HANDLING', st.handling], ['GELÄNDE', st.offroad]]
        .map(([n, v]) => `<div class="stat"><label>${n}</label><div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div></div>`).join('');
      const sw = $('#lobby-swatches');
      sw.innerHTML = PAINTS.map((c) => `<button style="background:${c}" data-color="${c}" class="${c === me.color ? 'on' : ''}"></button>`).join('');
      sw.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.updateMe({ color: b.dataset.color })));
      const lv = $('#lobby-liveries');
      lv.innerHTML = LIVERIES.map((l) => `<button data-v="${l.id}" class="${me.livery === l.id ? 'on' : ''}">${l.name}</button>`).join('');
      lv.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.updateMe({ livery: b.dataset.v })));
    }

    const btn = $('#lobby-main');
    btn.classList.remove('waiting');
    if (L.racing && !this.inRace) {
      btn.textContent = 'Rennen läuft …';
      btn.classList.add('waiting');
      $('#lobby-status').textContent = 'Ein Rennen läuft – du bist beim nächsten dabei.';
    } else if (host) {
      btn.textContent = 'Rennen starten ›';
      const ready = humans.filter((p) => p.id !== 0 && p.ready).length;
      $('#lobby-status').textContent = humans.length > 1 ? `${ready}/${humans.length - 1} Mitspieler bereit` : 'Lade Mitspieler mit dem Code oder Link ein.';
    } else {
      btn.textContent = me && me.ready ? 'Nicht bereit' : 'Bereit ✓';
      $('#lobby-status').textContent = me ? (me.ready ? 'Warte auf den Gastgeber …' : 'Tippe auf „Bereit“, wenn du startklar bist.') : 'Verbinde …';
    }
    this.renderChat();
  }
}
