// ─────────────────────────────────────────────────────────────
//  testimages.js — procedural test photographs spanning the feature
//  space (used by the test harness / docs/TEST.md, not by the UI).
// ─────────────────────────────────────────────────────────────
import { makeRng } from './rng.js';

const W = 1200, H = 800;
function canvas() { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; }
function soften(c, px) { const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; const g = c2.getContext('2d'); g.filter = `blur(${px}px)`; g.drawImage(c, 0, 0); return c2; }

/** Night city: lit windows, neon lines, light points. */
function neon() {
  const [c, g] = canvas(), r = makeRng(11);
  g.fillStyle = '#04040a'; g.fillRect(0, 0, W, H);
  for (let b = 0; b < 9; b++) {
    const x = b * 140 + r() * 30, bw = 90 + r() * 50, top = 160 + r() * 380;
    g.fillStyle = '#0b0c14'; g.fillRect(x, top, bw, H - top);
    for (let y = top + 12; y < H - 10; y += 16) for (let xx = x + 8; xx < x + bw - 8; xx += 13) if (r() < 0.28) {
      g.fillStyle = r() < 0.7 ? '#ffd27a' : '#9fe6ff'; g.fillRect(xx, y, 5, 7);
    }
  }
  g.strokeStyle = '#ff2f6e'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 640); g.lineTo(W, 610); g.stroke();
  g.strokeStyle = '#2fe8ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(140, 0); g.lineTo(160, H); g.stroke();
  for (let i = 0; i < 60; i++) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(r() * W, r() * 150, 1 + r() * 1.5, 0, 7); g.fill(); }
  return c;
}

/** Fabric: flowing folds with soft shading. */
function silk() {
  const [c, g] = canvas();
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const fold = Math.sin(u * 22 + Math.sin(v * 5 + u * 3) * 2.2 + v * 6) * 0.5 + 0.5;
    const fine = Math.sin(u * 160 + v * 40 + Math.sin(v * 9) * 4) * 0.06;
    const s = Math.pow(fold, 1.5) * 0.85 + 0.1 + fine;
    const i = (y * W + x) * 4;
    d[i] = 40 + s * 150; d[i + 1] = 12 + s * 40; d[i + 2] = 50 + s * 110; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Graphic: flat Bauhaus composition. */
function bauhaus() {
  const [c, g] = canvas();
  g.fillStyle = '#ece6d8'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d6372b'; g.beginPath(); g.arc(380, 380, 220, 0, 7); g.fill();
  g.fillStyle = '#1f3c88'; g.fillRect(620, 140, 360, 360);
  g.fillStyle = '#f2b705'; g.beginPath(); g.moveTo(700, 720); g.lineTo(1100, 720); g.lineTo(900, 420); g.fill();
  g.fillStyle = '#111'; g.fillRect(80, 650, 600, 26); g.fillRect(1040, 60, 26, 600);
  return c;
}

/** Ocean horizon: soft gradient sky, flat sea, small sun. */
function horizon() {
  const [c, g] = canvas();
  const sky = g.createLinearGradient(0, 0, 0, 460);
  sky.addColorStop(0, '#6f8fae'); sky.addColorStop(1, '#d9dfe3');
  g.fillStyle = sky; g.fillRect(0, 0, W, 460);
  const sea = g.createLinearGradient(0, 460, 0, H);
  sea.addColorStop(0, '#5b7287'); sea.addColorStop(1, '#22313e');
  g.fillStyle = sea; g.fillRect(0, 460, W, H - 460);
  g.fillStyle = 'rgba(255,250,235,0.9)'; g.beginPath(); g.arc(820, 380, 26, 0, 7); g.fill();
  return soften(c, 3);
}

/** Thicket: dense organic strokes. */
function thicket() {
  const [c, g] = canvas(), r = makeRng(55);
  g.fillStyle = '#16200f'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 4000; i++) {
    const x = r() * W, y = r() * H, a = r() * Math.PI * 2, l = 10 + r() * 40;
    g.strokeStyle = `hsl(${70 + r() * 60},${30 + r() * 40}%,${15 + r() * 40}%)`; g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.6 + (r() - 0.5) * 20, y + Math.sin(a) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return c;
}

/** Ice: cold crystalline lines on pale blue. */
function ice() {
  const [c, g] = canvas(), r = makeRng(77);
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#dfeaf2'); bg.addColorStop(1, '#9fb8cc');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = r() * H, a = Math.floor(r() * 6) * Math.PI / 3, l = 80 + r() * 380;
    g.strokeStyle = `rgba(${30 + r() * 40},${60 + r() * 50},${90 + r() * 60},${0.4 + r() * 0.5})`; g.lineWidth = 0.6 + r() * 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return c;
}

/** Portrait-like: warm oval face shape on dark (organic, not a real face). */
function figure() {
  const [c, g] = canvas();
  g.fillStyle = '#120c0a'; g.fillRect(0, 0, W, H);
  const sk = g.createRadialGradient(560, 360, 20, 600, 400, 260);
  sk.addColorStop(0, '#e2a98a'); sk.addColorStop(0.7, '#a8664a'); sk.addColorStop(1, 'rgba(60,30,20,0)');
  g.fillStyle = sk; g.beginPath(); g.ellipse(600, 400, 190, 250, 0, 0, 7); g.fill();
  g.fillStyle = '#2a1712';
  g.beginPath(); g.ellipse(530, 360, 26, 12, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(670, 360, 26, 12, 0, 0, 7); g.fill();
  g.fillStyle = '#7a3a30'; g.beginPath(); g.ellipse(600, 520, 50, 14, 0, 0, 7); g.fill();
  g.fillStyle = '#1b100c'; g.beginPath(); g.ellipse(600, 200, 230, 120, 0, Math.PI, 2 * Math.PI); g.fill();
  return soften(c, 2);
}

export const TEST_IMAGES = [
  { name: 'neon', make: neon }, { name: 'silk', make: silk }, { name: 'bauhaus', make: bauhaus },
  { name: 'horizon', make: horizon }, { name: 'thicket', make: thicket }, { name: 'ice', make: ice }, { name: 'figure', make: figure },
];
