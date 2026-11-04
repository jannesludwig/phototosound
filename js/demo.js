// ─────────────────────────────────────────────────────────────
//  demo.js — three procedurally generated test photographs, each
//  designed to fall into a different world.
//    i   nocturne  → stars + a halo over black water    (ORBIT)
//    ii  facade    → a grid of windows, hard lines      (RASTER)
//    iii dune      → soft layered gradients             (TOPOGRAPHY)
// ─────────────────────────────────────────────────────────────
import { makeRng } from './rng.js';

const W = 1200, H = 800;

function canvas() {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  return [c, c.getContext('2d')];
}

function nocturne() {
  const [c, g] = canvas(), r = makeRng(101);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#010208'); sky.addColorStop(0.62, '#060b1c'); sky.addColorStop(1, '#010103');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // stars
  for (let i = 0; i < 340; i++) {
    const x = r() * W, y = r() * H * 0.62, b = Math.pow(r(), 3);
    const s = 0.6 + b * 2.2;
    g.fillStyle = `rgba(${200 + b * 55 | 0},${210 + b * 45 | 0},255,${0.35 + b * 0.65})`;
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  // a halo around a moon
  const mx = W * 0.68, my = H * 0.26;
  for (let k = 0; k < 4; k++) {
    g.strokeStyle = `rgba(190,215,255,${0.35 - k * 0.07})`; g.lineWidth = 2;
    g.beginPath(); g.arc(mx, my, 60 + k * 34, 0, Math.PI * 2); g.stroke();
  }
  const moon = g.createRadialGradient(mx, my, 0, mx, my, 38);
  moon.addColorStop(0, '#ffffff'); moon.addColorStop(0.8, '#dfe9ff'); moon.addColorStop(1, 'rgba(200,220,255,0)');
  g.fillStyle = moon; g.beginPath(); g.arc(mx, my, 38, 0, Math.PI * 2); g.fill();
  // water: scattered reflections as points of light
  for (let i = 0; i < 160; i++) {
    const y = H * 0.66 + Math.pow(r(), 1.4) * H * 0.34;
    const x = mx + (r() - 0.5) * (40 + (y - H * 0.66) * 1.2);
    const b = r();
    g.fillStyle = `rgba(220,235,255,${0.3 + b * 0.7})`;
    g.beginPath(); g.arc(x, y, 0.8 + b * 1.8, 0, Math.PI * 2); g.fill();
  }
  // far city lights on the horizon
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(255,190,120,0.9)' : 'rgba(255,240,220,0.8)';
    g.beginPath(); g.arc(r() * W, H * 0.64 + r() * 6, 0.8 + r() * 1.4, 0, Math.PI * 2); g.fill();
  }
  return c;
}

function facade() {
  const [c, g] = canvas(), r = makeRng(202);
  g.fillStyle = '#c9ccd1'; g.fillRect(0, 0, W, H);
  // sky band at top
  const sky = g.createLinearGradient(0, 0, 0, 120);
  sky.addColorStop(0, '#9fb3c8'); sky.addColorStop(1, '#c4d0db');
  g.fillStyle = sky; g.fillRect(0, 0, W, 110);
  // building body
  g.fillStyle = '#3a3d42'; g.fillRect(0, 110, W, H - 110);
  // floor slabs
  const floors = 9, bays = 16;
  for (let f = 0; f <= floors; f++) {
    const y = 110 + f * (H - 110) / floors;
    g.fillStyle = '#d8dadc'; g.fillRect(0, y - 4, W, 8);
  }
  // columns + windows
  for (let f = 0; f < floors; f++) {
    for (let b = 0; b < bays; b++) {
      const x = b * W / bays, y = 110 + f * (H - 110) / floors;
      const ww = W / bays - 14, wh = (H - 110) / floors - 22;
      const lit = r() < 0.32;
      g.fillStyle = lit ? `rgb(${235 + r() * 20 | 0},${200 + r() * 30 | 0},${140 + r() * 40 | 0})` : `rgb(${20 + r() * 25 | 0},${28 + r() * 25 | 0},${40 + r() * 25 | 0})`;
      g.fillRect(x + 7, y + 11, ww, wh);
      // mullion
      g.fillStyle = '#9aa0a6'; g.fillRect(x + 7 + ww / 2 - 1, y + 11, 2, wh);
    }
  }
  for (let b = 0; b <= bays; b++) { g.fillStyle = '#e4e6e8'; g.fillRect(b * W / bays - 3, 110, 6, H - 110); }
  return c;
}

function dune() {
  const [c, g] = canvas(), r = makeRng(303);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.55);
  sky.addColorStop(0, '#1d2a44'); sky.addColorStop(0.55, '#c27a5a'); sky.addColorStop(1, '#f2c08a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // a soft low sun
  const sun = g.createRadialGradient(W * 0.3, H * 0.47, 0, W * 0.3, H * 0.47, 260);
  sun.addColorStop(0, 'rgba(255,230,190,0.85)'); sun.addColorStop(1, 'rgba(255,200,150,0)');
  g.fillStyle = sun; g.fillRect(0, 0, W, H);
  // layered dunes, each a smooth vertical gradient
  const layers = 6;
  for (let l = 0; l < layers; l++) {
    const base = H * (0.5 + l * 0.09);
    const amp = 30 + l * 14, f1 = 0.002 + r() * 0.003, f2 = 0.006 + r() * 0.004, ph = r() * 10;
    const grad = g.createLinearGradient(0, base - amp, 0, H);
    const k = l / (layers - 1);
    grad.addColorStop(0, `rgb(${215 - k * 120 | 0},${150 - k * 90 | 0},${110 - k * 70 | 0})`);
    grad.addColorStop(1, `rgb(${120 - k * 90 | 0},${70 - k * 50 | 0},${60 - k * 45 | 0})`);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) g.lineTo(x, base + Math.sin(x * f1 + ph) * amp + Math.sin(x * f2 + ph * 2) * amp * 0.35);
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  // soften everything (smooth gradients, no texture)
  const c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d'); g2.filter = 'blur(6px)'; g2.drawImage(c, 0, 0);
  // filter unsupported (old Safari) → keep the sharp version
  return g2.getImageData(W / 2, H / 2, 1, 1).data[3] ? c2 : c;
}

export const DEMOS = [
  { id: 'i', name: 'nocturne', make: nocturne },
  { id: 'ii', name: 'facade', make: facade },
  { id: 'iii', name: 'dune', make: dune },
];
