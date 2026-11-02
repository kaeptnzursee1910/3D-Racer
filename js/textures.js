// Prozedurale Canvas-Texturen
import * as THREE from '../vendor/three.module.min.js';
import { makeCanvas, canvasTexture, rng } from './utils.js';

function noiseFill(g, w, h, base, variance, seed, alpha = 1) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const [br, bg, bb] = base;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * variance;
    d[i] = Math.max(0, Math.min(255, br + n));
    d[i + 1] = Math.max(0, Math.min(255, bg + n));
    d[i + 2] = Math.max(0, Math.min(255, bb + n));
    d[i + 3] = 255 * alpha;
  }
  g.putImageData(img, 0, 0);
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export function roadTexture(opts, aniso, hi = false) {
  const W = hi ? 1024 : 512, H = hi ? 2048 : 1024;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  noiseFill(g, W, H, hexToRgb(opts.asphalt), 26, 11);
  const r = rng(5);
  // Flecken / Ausbesserungen
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.06})`;
    const x = r() * W, y = r() * H;
    g.beginPath();
    g.ellipse(x, y, 10 + r() * 50, 10 + r() * 80, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  const k = W / 512;
  // heller Splitt
  for (let i = 0; i < 9000 * k * k; i++) {
    const v = 120 + r() * 90;
    g.fillStyle = `rgba(${v},${v},${v + 5},${0.25 + r() * 0.35})`;
    g.fillRect(r() * W, r() * H, k * (0.6 + r()), k * (0.6 + r()));
  }
  // Ausbesserungen mit Kanten
  for (let i = 0; i < 5; i++) {
    const x = (0.1 + r() * 0.6) * W, y = r() * H, w = (0.12 + r() * 0.25) * W, h = (0.05 + r() * 0.12) * H;
    g.fillStyle = `rgba(${r() > 0.5 ? '0,0,0' : '255,255,255'},${0.05 + r() * 0.05})`;
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 1.5 * k;
    g.strokeRect(x, y, w, h);
  }
  // Risse
  g.strokeStyle = 'rgba(10,10,12,0.32)';
  for (let i = 0; i < 16; i++) {
    let x = r() * W, y = r() * H;
    g.lineWidth = (0.6 + r() * 1.2) * k;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 6 + r() * 10; s++) {
      x += (r() - 0.5) * 30 * k;
      y += (r() - 0.3) * 26 * k;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // Querfuge
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, H * 0.5, W, 2 * k);
  // Ölflecken
  for (let i = 0; i < 8; i++) {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grd.addColorStop(0, 'rgba(0,0,0,0.3)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.translate((0.25 + r() * 0.5) * W, r() * H);
    g.scale((8 + r() * 20) * k, (14 + r() * 40) * k);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Fahrspur-Abrieb (dunklere Ideallinie)
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.3, 'rgba(0,0,0,0.10)');
  grd.addColorStop(0.5, 'rgba(0,0,0,0.02)');
  grd.addColorStop(0.7, 'rgba(0,0,0,0.10)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  // Randlinien
  g.fillStyle = opts.edgeLine || '#f2f2f2';
  g.fillRect(W * 0.025, 0, W * 0.022, H);
  g.fillRect(W * (1 - 0.047), 0, W * 0.022, H);
  // abgefahrene Stellen in der Linienfarbe
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(60,60,64,${0.2 + r() * 0.4})`;
    const side = r() < 0.5 ? W * 0.025 : W * (1 - 0.047);
    g.fillRect(side + r() * W * 0.022, r() * H, 1 + r() * 3 * k, 1 + r() * 6 * k);
  }
  // Mittellinie gestrichelt
  g.fillStyle = opts.centerLine || '#f0f0f0';
  for (let y = 0; y < H; y += H / 2) g.fillRect(W * 0.494, y + H * 0.05, W * 0.012, H * 0.22);
  return canvasTexture(c, { aniso });
}

export function groundTexture(opts, aniso, seed = 3) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  noiseFill(g, S, S, hexToRgb(opts.ground), opts.groundVar ?? 30, seed);
  const r = rng(seed + 9);
  for (let i = 0; i < 400; i++) {
    const a = r();
    g.fillStyle = a > 0.5 ? `rgba(255,255,255,${r() * 0.07})` : `rgba(0,0,0,${r() * 0.09})`;
    g.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3);
  }
  // Weiche große Flecken für Variation
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.03 + r() * 0.04})`;
    g.beginPath();
    g.arc(r() * S, r() * S, 10 + r() * 40, 0, Math.PI * 2);
    g.fill();
  }
  return canvasTexture(c, { aniso });
}

export function wallTexture(style, aniso) {
  const W = 512, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  if (style === 'stripes') {
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f4f4f4' : '#d4202a';
      g.fillRect((i * W) / 8, 0, W / 8, H);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, H - 6, W, 6);
  } else if (style === 'concrete') {
    noiseFill(g, W, H, [168, 160, 150], 22, 7);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < W; x += 128) g.fillRect(x, 0, 3, H);
    g.fillStyle = '#e8b43a';
    g.fillRect(0, 4, W, 6);
  } else if (style === 'neon') {
    noiseFill(g, W, H, [40, 42, 52], 14, 8);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 2, H);
  } else {
    // blau / weiß (Alpen)
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#f0f4fa' : '#1f58b8';
      g.fillRect((i * W) / 8, 0, W / 8, H);
    }
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, 0, W, 4);
  }
  return canvasTexture(c, { aniso });
}

export function neonStripTexture() {
  const c = makeCanvas(256, 16);
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, '#ff2bd6');
  grd.addColorStop(0.5, '#29e3ff');
  grd.addColorStop(1, '#ff2bd6');
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 16);
  return canvasTexture(c);
}

export function checkerTexture() {
  const c = makeCanvas(128, 32);
  const g = c.getContext('2d');
  const s = 8;
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 16; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
      g.fillRect(x * s, y * s, s, s);
    }
  const t = canvasTexture(c, { repeat: false });
  t.magFilter = THREE.NearestFilter;
  return t;
}

export function bannerTexture(text, bg = '#101522', fg = '#ffffff', accent = '#ff3b3b') {
  const c = makeCanvas(1024, 128);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 128);
  g.fillStyle = accent;
  g.fillRect(0, 0, 1024, 10);
  g.fillRect(0, 118, 1024, 10);
  g.font = 'italic 900 78px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = fg;
  g.fillText(text, 512, 68);
  return canvasTexture(c, { repeat: false });
}

const AD_TEXTS = [
  ['VELOX', '#0d1b3a', '#ffffff', '#ff3b3b'],
  ['NITRO-X', '#121212', '#38f0ff', '#38f0ff'],
  ['TURBO KOLA', '#b3121c', '#ffffff', '#ffd200'],
  ['APEX REIFEN', '#ffd200', '#111111', '#111111'],
  ['BLITZ ÖL', '#0f5132', '#ffffff', '#9bff6a'],
  ['HORIZONT FM', '#3a0d5c', '#ffffff', '#ff7bf1'],
  ['KOMET UHREN', '#f4f4f4', '#151515', '#d4202a'],
  ['ZENIT ENERGIE', '#0d3b66', '#ffffff', '#f4d35e'],
];

export function adTexture(i) {
  const [t, bg, fg, ac] = AD_TEXTS[i % AD_TEXTS.length];
  return bannerTexture(t, bg, fg, ac);
}
export const AD_COUNT = AD_TEXTS.length;

export function windowTexture(seed = 1) {
  const S = 256;
  const c = makeCanvas(S, S);
  const g = c.getContext('2d');
  g.fillStyle = '#05070c';
  g.fillRect(0, 0, S, S);
  const r = rng(seed);
  const cols = 8, rows = 8;
  const cw = S / cols, ch = S / rows;
  const palette = ['#ffe9b0', '#ffd27a', '#bfe6ff', '#9fd3ff', '#ffffff', '#ffb4e6'];
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      if (x === 0 && y === rows - 1) continue; // dunkle Ecke für Dächer
      const lit = r() < 0.42;
      g.fillStyle = lit ? palette[Math.floor(r() * palette.length)] : `rgb(${18 + r() * 14},${22 + r() * 14},${34 + r() * 18})`;
      g.globalAlpha = lit ? 0.6 + r() * 0.4 : 1;
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 10);
    }
  g.globalAlpha = 1;
  return canvasTexture(c);
}

export function crowdTexture() {
  const W = 256, H = 64;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  g.fillStyle = '#2a2d36';
  g.fillRect(0, 0, W, H);
  const r = rng(77);
  const cols = ['#e63946', '#f1faee', '#a8dadc', '#457b9d', '#ffbe0b', '#fb5607', '#8338ec', '#3a86ff', '#ffd6a5'];
  for (let i = 0; i < 900; i++) {
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    const x = r() * W, y = r() * H;
    g.fillRect(x, y, 2, 3);
    g.fillStyle = '#e0b48c';
    g.fillRect(x, y - 2, 2, 2);
  }
  return canvasTexture(c);
}

export function stripeTexture(a = '#ffffff', b = '#d4202a', n = 6) {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) {
    g.fillStyle = i % 2 ? b : a;
    g.fillRect(0, (i * 64) / n, 64, 64 / n);
  }
  return canvasTexture(c);
}

// Normal- und Rauheitskarte für Asphalt (feine Körnung, Fahrspuren glatter)
export function asphaltMaps(aniso) {
  const S = 256;
  const r = rng(91);
  const h = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) h[i] = r();
  // leicht weichzeichnen
  const h2 = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += h[((y + dy + S) % S) * S + ((x + dx + S) % S)];
      h2[y * S + x] = s / 9;
    }
  const nc = makeCanvas(S, S), rc = makeCanvas(S, S);
  const ng = nc.getContext('2d'), rg = rc.getContext('2d');
  const ni = ng.createImageData(S, S), ri = rg.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = (h2[y * S + ((x + 1) % S)] - h2[y * S + ((x - 1 + S) % S)]) * 4;
      const dy = (h2[((y + 1) % S) * S + x] - h2[((y - 1 + S) % S) * S + x]) * 4;
      const l = Math.hypot(dx, dy, 1);
      ni.data[i * 4] = ((-dx / l) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      ni.data[i * 4 + 2] = (1 / l) * 0.5 * 255 + 127;
      ni.data[i * 4 + 3] = 255;
      // Rauheit: Fahrspuren (bei u ~ 0.3 / 0.7) etwas glatter
      const u = x / S;
      const lane = Math.exp(-(((u - 0.3) / 0.08) ** 2)) + Math.exp(-(((u - 0.7) / 0.08) ** 2));
      const v = 200 - lane * 60 + (h2[i] - 0.5) * 80;
      ri.data[i * 4] = ri.data[i * 4 + 1] = ri.data[i * 4 + 2] = Math.max(0, Math.min(255, v));
      ri.data[i * 4 + 3] = 255;
    }
  ng.putImageData(ni, 0, 0);
  rg.putImageData(ri, 0, 0);
  const normal = canvasTexture(nc, { srgb: false, aniso });
  const rough = canvasTexture(rc, { srgb: false, aniso });
  normal.repeat.set(3, 12);
  rough.repeat.set(1, 1);
  return { normal, rough };
}
