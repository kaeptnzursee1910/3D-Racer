// Online-Verbindung über WebRTC (PeerJS) – gleiche Verbindungsart wie in Horizon Rush:
// Gastgeber meldet sich beim PeerJS-Vermittlungsserver mit Präfix + 4-stelligem Code an,
// Gäste verbinden sich direkt (P2P). In Netzen, die das blockieren, hilft ein TURN-Verbindungsserver
// (metered.ca). Dessen Zugangsdaten stehen nicht im Code, sondern nur im Speicher dieses Browsers.

export const Net = {
  PREFIX: 'velox-v1-',
  prefix: 'velox-v1-',
  limit: 8, // maximale Spielerzahl inklusive Gastgeber
  peer: null,
  isHost: false,
  conns: new Map(),
  hostConn: null,
  code: null,
  myId: null,
  onMsg: null,
  onDrop: null,
  nextId: 1,
  // Verkehrszähler (Nutzdaten, JSON-Länge in Bytes)
  stats: { sent: 0, recv: 0, msgSent: 0, msgRecv: 0, since: performance.now() },

  KEY_STORE: 'velox_online_key',
  getKey() {
    try { return JSON.parse(localStorage.getItem(this.KEY_STORE) || 'null'); } catch (_) { return null; }
  },
  setKey(user, pass) {
    try {
      if (user && pass) localStorage.setItem(this.KEY_STORE, JSON.stringify({ user, pass }));
      else localStorage.removeItem(this.KEY_STORE);
    } catch (_) { /* ignorieren */ }
  },

  iceServers() {
    const ice = [{ urls: 'stun:stun.relay.metered.ca:80' }, { urls: 'stun:stun.l.google.com:19302' }];
    const k = this.getKey();
    if (k) {
      for (const u of ['turn:global.relay.metered.ca:80', 'turn:global.relay.metered.ca:80?transport=tcp',
        'turn:global.relay.metered.ca:443', 'turns:global.relay.metered.ca:443?transport=tcp']) {
        ice.push({ urls: u, username: k.user, credential: k.pass });
      }
    }
    return ice;
  },

  available() { return typeof window.Peer === 'function'; },

  makePeer(id) {
    const opts = Object.assign({ debug: 0, config: { iceServers: this.iceServers() } }, window.VELOX_PEER_SERVER || {});
    return id ? new window.Peer(id, opts) : new window.Peer(opts);
  },

  host(cb) {
    this.close();
    this.isHost = true;
    this.myId = 0;
    this.nextId = 1;
    const tryCode = (attempt) => {
      const code = String(Math.floor(1000 + Math.random() * 9000));
      const p = this.makePeer(this.prefix + code);
      let opened = false;
      p.on('open', () => { opened = true; this.peer = p; this.code = code; cb(null, code); });
      p.on('error', (e) => {
        if (!opened && e.type === 'unavailable-id' && attempt < 5) { p.destroy(); tryCode(attempt + 1); return; }
        if (!opened) cb(this.errText(e));
        else if (e.type !== 'peer-unavailable') console.warn('Netz', e);
      });
      p.on('disconnected', () => this.keepAlive(p));
      p.on('connection', (conn) => this.acceptConn(conn));
    };
    tryCode(0);
  },

  // Der Gastgeber muss beim Vermittlungsserver angemeldet bleiben, sonst finden neue Mitspieler
  // seinen Code nicht mehr. Nach einem Abbruch (Standby, WLAN-Wechsel) immer wieder neu anmelden.
  keepAlive(p) {
    clearTimeout(this._ka);
    if (this.peer !== p || p.destroyed || !p.disconnected) return;
    try { p.reconnect(); } catch (_) { /* */ }
    this._ka = setTimeout(() => this.keepAlive(p), 4000);
  },

  acceptConn(conn) {
    conn.on('open', () => {
      if (this.conns.size >= this.limit - 1) {
        conn.send({ t: 'full', max: this.limit });
        setTimeout(() => conn.close(), 300);
        return;
      }
      // gleiches Gerät verbindet sich neu (z. B. nach Zeitüberschreitung): alte Verbindung ersetzen
      for (const [oid, oc] of this.conns) {
        if (oc.peer === conn.peer) {
          this.conns.delete(oid);
          try { oc.close(); } catch (_) { /* */ }
          if (this.onDrop) this.onDrop(oid);
        }
      }
      const id = this.nextId++;
      conn.vxId = id;
      this.conns.set(id, conn);
      conn.on('data', (d) => this.received(d, id));
      conn.on('close', () => this.drop(id));
      conn.on('error', () => this.drop(id));
      this.watchIce(conn, () => this.drop(id));
      this.sendRaw(conn, { t: 'welcome', id });
    });
  },

  received(d, from) {
    this.stats.recv += this.size(d);
    this.stats.msgRecv++;
    if (this.onMsg) this.onMsg(d, from);
  },

  drop(id) {
    if (!this.conns.has(id)) return;
    this.conns.delete(id);
    if (this.onDrop) this.onDrop(id);
  },

  join(code, cb, attempt = 0) {
    this.close();
    this.isHost = false;
    const p = this.makePeer();
    let done = false;
    const fail = (msg) => { if (done) return; done = true; cb(msg); this.close(); };
    const timer = setTimeout(() => fail('Keine Verbindung zum Gastgeber. Bitte den Code prüfen und es erneut versuchen.'), 20000);
    p.on('open', () => {
      this.peer = p;
      const conn = p.connect(this.prefix + code, { reliable: true, serialization: 'json' });
      conn.on('data', (d) => {
        if (d && d.t === 'welcome' && !done) {
          done = true;
          clearTimeout(timer);
          this.myId = d.id;
          this.hostConn = conn;
          this.code = code;
          cb(null, d.id);
          return;
        }
        if (d && d.t === 'full') { clearTimeout(timer); fail('Hier ist schon alles voll (maximal ' + (d.max || this.limit) + ' Spieler).'); return; }
        this.received(d, 0);
      });
      const lost = () => { if (done && this.hostConn === conn) { this.hostConn = null; if (this.onDrop) this.onDrop(0); } };
      conn.on('close', lost);
      conn.on('error', lost);
      this.watchIce(conn, lost);
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      // Code noch nicht gefunden: kurz warten und erneut versuchen (der Gastgeber meldet sich evtl. gerade neu an)
      if (!done && e.type === 'peer-unavailable' && attempt < 1) {
        done = true;
        this.close();
        setTimeout(() => this.join(code, cb, attempt + 1), 2000);
        return;
      }
      if (!done) fail(this.errText(e));
      else if (e.type === 'peer-unavailable' || e.type === 'network') { if (this.onDrop) this.onDrop(0); }
    });
  },

  watchIce(conn, onDead) {
    const pc = conn.peerConnection;
    if (!pc) return;
    pc.addEventListener('iceconnectionstatechange', () => {
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') onDead();
    });
  },

  errText(e) {
    switch (e && e.type) {
      case 'peer-unavailable': return 'Keine Party mit diesem Code gefunden.';
      case 'network': case 'server-error': case 'socket-error': case 'socket-closed':
        return 'Keine Verbindung zum Vermittlungsserver. Ist das Gerät online?';
      case 'browser-incompatible': return 'Dieser Browser unterstützt kein WebRTC.';
      default: return 'Verbindungsfehler: ' + ((e && (e.type || e.message)) || 'unbekannt');
    }
  },

  size(msg) {
    try { return JSON.stringify(msg).length; } catch (_) { return 0; }
  },
  sendRaw(conn, msg) {
    if (!conn || !conn.open) return;
    try {
      conn.send(msg);
      this.stats.sent += this.size(msg);
      this.stats.msgSent++;
    } catch (_) { /* */ }
  },
  send(msg) { this.sendRaw(this.hostConn, msg); }, // Gast -> Gastgeber
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except) this.sendRaw(c, msg); }, // Gastgeber -> alle
  sendTo(id, msg) { this.sendRaw(this.conns.get(id), msg); },

  active() { return !!this.peer && (this.isHost || !!this.hostConn); },

  // tatsächlicher Verkehr inkl. WebRTC-Overhead (SCTP/DTLS/UDP/IP) über getStats
  async transportStats() {
    const conns = this.isHost ? [...this.conns.values()] : this.hostConn ? [this.hostConn] : [];
    let sent = 0, recv = 0, pkSent = 0, pkRecv = 0;
    for (const c of conns) {
      const pc = c.peerConnection;
      if (!pc) continue;
      const st = await pc.getStats();
      st.forEach((r) => {
        if (r.type === 'transport') {
          sent += r.bytesSent || 0;
          recv += r.bytesReceived || 0;
          pkSent += r.packetsSent || 0;
          pkRecv += r.packetsReceived || 0;
        }
      });
    }
    return { sent, recv, pkSent, pkRecv };
  },

  close() {
    for (const c of this.conns.values()) try { c.close(); } catch (_) { /* */ }
    this.conns.clear();
    if (this.hostConn) try { this.hostConn.close(); } catch (_) { /* */ }
    this.hostConn = null;
    if (this.peer) try { this.peer.destroy(); } catch (_) { /* */ }
    this.peer = null;
    this.code = null;
    this.isHost = false;
    this.myId = null;
  },
};
