// Speicherung von Einstellungen, Rekorden und Fortschritt (localStorage)
const KEY = 'velox.v1';

const DEFAULTS = {
  settings: {
    quality: 'auto',
    steering: 'drag',
    autoGas: false,
    sensitivity: 1,
    invertTilt: false,
    musicVol: 0.5,
    sfxVol: 0.8,
    showFps: false,
    units: 'kmh',
    camera: 0,
    playerName: 'Du',
  },
  selection: { car: 'falke', color: '#d42a2a', track: 'coast', laps: 3, opponents: 7, difficulty: 'normal' },
  records: {}, // trackId -> { lap, lapCar, race, raceCar }
  ghosts: {}, // trackId -> { car, color, time, frames: [...] }
  progress: { champWins: 0, champBest: {}, unlocked: [] , races: 0, wins: 0 },
};

function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  if (!over || typeof over !== 'object') return out;
  for (const k of Object.keys(over)) {
    const b = base ? base[k] : undefined;
    const o = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object' && !Array.isArray(o)) out[k] = deepMerge(b, o);
    else out[k] = o;
  }
  return out;
}

export class Storage {
  constructor() {
    let data = null;
    try {
      data = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch (e) {
      data = null;
    }
    this.data = deepMerge(DEFAULTS, data || {});
  }
  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      // Speicher voll (z. B. durch Geister) → Geister verwerfen
      try {
        this.data.ghosts = {};
        localStorage.setItem(KEY, JSON.stringify(this.data));
      } catch (e2) { /* ignorieren */ }
    }
  }
  get settings() { return this.data.settings; }
  get selection() { return this.data.selection; }
  get progress() { return this.data.progress; }

  record(trackId) {
    return this.data.records[trackId] || {};
  }
  submitLap(trackId, time, carId) {
    const r = (this.data.records[trackId] = this.data.records[trackId] || {});
    if (!r.lap || time < r.lap) {
      r.lap = time;
      r.lapCar = carId;
      this.save();
      return true;
    }
    return false;
  }
  submitRace(trackId, time, carId, laps) {
    const r = (this.data.records[trackId] = this.data.records[trackId] || {});
    const key = 'race' + laps;
    if (!r[key] || time < r[key]) {
      r[key] = time;
      r[key + 'Car'] = carId;
      this.save();
      return true;
    }
    return false;
  }
  ghost(trackId) {
    return this.data.ghosts[trackId] || null;
  }
  setGhost(trackId, g) {
    this.data.ghosts[trackId] = g;
    this.save();
  }
  isUnlocked(carId) {
    return this.data.progress.unlocked.includes(carId);
  }
  unlock(carId) {
    if (!this.isUnlocked(carId)) {
      this.data.progress.unlocked.push(carId);
      this.save();
      return true;
    }
    return false;
  }
  reset() {
    this.data = deepMerge(DEFAULTS, {});
    this.save();
  }
}
