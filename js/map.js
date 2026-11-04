// ─────────────────────────────────────────────────────────────
//  map.js — the SOUND MAP.
//
//  The photograph becomes a terrain that is listened to. Heights,
//  ridges, valleys, edges and the focal point of the image form a
//  landscape; a scan line crosses it and what lies beneath becomes
//  sound and light. This module is shared by the composer (what the
//  scan hears) and the visuals (what it shows), so both read the same
//  map:
//    height     smooth luminance + edge ridges (+ terraces for graphic
//               images) + a summit at the focal point, normalised
//    grid       64 × 32 cells: height, edge, texture, luminance, saturation
//    focal      the single most salient point (an eye, a light, a peak)
//    landmarks  peaks, valleys, hard edges — annotated on the map
//    params     tempo, root, contour density, relief, tilt, scan speeds …
// ─────────────────────────────────────────────────────────────
import { blur } from './analysis.js';
import { makeRng, clamp, lerp } from './rng.js';

export const GC = 64, GR = 32;   // map grid (columns = scan positions, rows = height profile)

export function buildMap(analysis) {
  const f = analysis.features, w = analysis.width, h = analysis.height, N = w * h;
  const rng = makeRng(analysis.seed ^ 0x3a9);
  const { L, Gm } = analysis.maps;

  // ── the character of this terrain ──
  const ridged = clamp(0.12 + f.lineStrength * 0.35 + f.edgeDensity * 0.3 + f.detail * 0.1);   // edges → ridges
  const terraced = clamp(f.graphic * 1.2 + f.flatness * 0.4 - 0.2);                            // graphic → terraces
  const smooth = clamp(f.smoothness);

  // ── height field ──
  const base = blur(L, w, h, 3, 2);
  let gmax = 1e-6; for (let i = 0; i < N; i++) gmax = Math.max(gmax, Gm[i]);
  const edgeN = new Float32Array(N); for (let i = 0; i < N; i++) edgeN[i] = Math.min(1, Gm[i] / (gmax * 0.5));
  const ridges = blur(edgeN, w, h, 2, 1);
  const texture = blur(edgeN, w, h, 4, 1);
  const H = new Float32Array(N);
  for (let i = 0; i < N; i++) H[i] = base[i] * (1 - ridged * 0.35) + ridges[i] * ridged * 0.35;
  // normalise by percentiles (every photo gets a full relief, shaped its own way)
  const sorted = Float32Array.from(H).sort();
  const lo = sorted[Math.floor(N * 0.02)], hi = sorted[Math.floor(N * 0.98)] + 1e-6;
  const steps = 5 + Math.floor(rng() * 6);
  for (let i = 0; i < N; i++) {
    let v = clamp((H[i] - lo) / (hi - lo));
    v = Math.pow(v, lerp(1.25, 0.8, f.brightness));                  // dark photos: deeper valleys
    if (terraced > 0) v = lerp(v, Math.round(v * steps) / steps, terraced);
    H[i] = v;
  }

  // ── focal point: an eye, the brightest light, or the most salient place ──
  let focal = null;
  const kp = f.faceKeypoints;
  if (f.face > 0 && kp && kp.length >= 2) focal = { x: kp[0].x, y: kp[0].y, kind: 'eye' };
  else if (f.face > 0 && f.faceBox) focal = { x: f.faceBox.x + f.faceBox.w * 0.35, y: f.faceBox.y + f.faceBox.h * 0.4, kind: 'eye' };
  else if (analysis.points.length && f.pointScore > 0.25) focal = { x: analysis.points[0].x, y: analysis.points[0].y, kind: 'light' };
  else {
    // saliency: local contrast + edges + colour, slightly towards the centre
    const g = analysis.grid; let best = -1;
    for (let r = 1; r < g.rows - 1; r++) for (let c = 1; c < g.cols - 1; c++) {
      const i = r * g.cols + c;
      let m = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) m += g.lum[i + dr * g.cols + dc]; m /= 9;
      const dx = (c + 0.5) / g.cols - 0.5, dy = (r + 0.5) / g.rows - 0.5;
      const s = (Math.abs(g.lum[i] - m) * 2 + g.edge[i] * 0.6 + g.sat[i] * 0.3) * (1 - Math.hypot(dx, dy) * 0.8);
      if (s > best) { best = s; focal = { x: (c + 0.5) / g.cols, y: (r + 0.5) / g.rows, kind: 'salient' }; }
    }
  }
  // the focal point is a summit of the map
  { const fx = focal.x * w, fy = focal.y * h, rad = Math.max(w, h) * 0.06;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d2 = ((x - fx) ** 2 + (y - fy) ** 2) / (rad * rad); if (d2 < 9) H[y * w + x] = Math.min(1, H[y * w + x] + 0.18 * Math.exp(-d2)); } }

  // ── the grid the scan line reads ──
  const cell = (arr, c, r) => { // average over a cell
    let s = 0, n = 0;
    for (let y = Math.floor(r * h / GR); y < Math.max(Math.floor(r * h / GR) + 1, Math.floor((r + 1) * h / GR)); y++)
      for (let x = Math.floor(c * w / GC); x < Math.max(Math.floor(c * w / GC) + 1, Math.floor((c + 1) * w / GC)); x++) { s += arr[y * w + x]; n++; }
    return s / n;
  };
  const grid = { cols: GC, rows: GR, h: new Float32Array(GC * GR), edge: new Float32Array(GC * GR), tex: new Float32Array(GC * GR), lum: new Float32Array(GC * GR), sat: analysis.grid.sat };
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
    const i = r * GC + c;
    grid.h[i] = cell(H, c, r); grid.edge[i] = cell(edgeN, c, r); grid.tex[i] = cell(texture, c, r); grid.lum[i] = cell(L, c, r);
  }
  // per-column summaries (what the vertical scan line sees at each position)
  const col = [];
  for (let c = 0; c < GC; c++) {
    let hs = 0, hm = -1, hr = 0, em = -1, er = 0, ts = 0, ss = 0;
    for (let r = 0; r < GR; r++) {
      const i = r * GC + c;
      hs += grid.h[i]; ts += grid.tex[i]; ss += (grid.sat[i] || 0);
      if (grid.h[i] > hm) { hm = grid.h[i]; hr = r; }
      if (grid.edge[i] > em) { em = grid.edge[i]; er = r; }
    }
    col.push({ x: (c + 0.5) / GC, hMean: hs / GR, hMax: hm, yMax: (hr + 0.5) / GR, eMax: em, yEdge: (er + 0.5) / GR, tex: ts / GR, sat: ss / GR });
  }
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.floor(p * (s.length - 1))]; };
  const thr = {
    edge: q(col.map((c) => c.eMax), 0.55),     // a hard edge under the scan → click
    glitch: q(col.map((c) => c.eMax), 0.9),    // the hardest edges → glitch
    ridge: q(col.map((c) => c.hMax), 0.7),     // high ridges → kick (pressure)
    tex: q(col.map((c) => c.tex), 0.7),        // rough texture → noise bursts
    valley: q(col.map((c) => c.hMean), 0.3),   // valleys → space, resonance
  };

  // ── landmarks for the annotations ──
  const marks = [];
  const local = (r, c, sign) => { const v = grid.h[r * GC + c] * sign; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= GR || cc >= GC || (!dr && !dc)) continue; if (grid.h[rr * GC + cc] * sign > v) return false; } return true; };
  const peaks = [], valleys = [];
  for (let r = 1; r < GR - 1; r++) for (let c = 1; c < GC - 1; c++) { const i = r * GC + c; if (local(r, c, 1)) peaks.push([grid.h[i], c, r]); if (local(r, c, -1)) valleys.push([grid.h[i], c, r]); }
  peaks.sort((a, b) => b[0] - a[0]); valleys.sort((a, b) => a[0] - b[0]);
  for (const [v, c, r] of peaks.slice(0, 4)) marks.push({ kind: 'peak', x: (c + 0.5) / GC, y: (r + 0.5) / GR, h: v });
  for (const [v, c, r] of valleys.slice(0, 2)) marks.push({ kind: 'valley', x: (c + 0.5) / GC, y: (r + 0.5) / GR, h: v });
  const edges = col.map((c, i) => [c.eMax, i]).sort((a, b) => b[0] - a[0]).slice(0, 2);
  for (const [v, i] of edges) marks.push({ kind: 'edge', x: col[i].x, y: col[i].yEdge, h: grid.h[Math.floor(col[i].yEdge * GR) * GC + i] });
  marks.push({ kind: 'focal', x: focal.x, y: focal.y, h: 1 });

  // ── params: tempo, root, terrain look, scan ──
  const bpm = Math.round((100 + clamp(f.brightness * 1.3) * 14 + rng.range(-1, 1)) * 10) / 10;
  const semis = Math.round(clamp(f.brightness) * 8 + rng.range(-1, 1));
  const root = 36.71 * Math.pow(2, semis / 12);
  const ACCENTS = [[0.45, 0.95, 1.0], [0.55, 0.78, 1.0], [0.5, 1.0, 0.86], [0.72, 0.86, 1.0], [0.35, 0.85, 0.95]];
  const params = {
    bpm, root, accent: rng.pick(ACCENTS), speed: rng.range(0.75, 1.3), density: rng.range(0.85, 1.15),
    levels: Math.round(10 + f.tonalRange * 16 + rng() * 8),             // contour density
    relief: clamp(0.13 + f.contrast * 0.45 + ridged * 0.08, 0.14, 0.34),  // height amplitude
    tilt: rng.range(0.72, 0.92),
    yaw: rng.range(-0.25, 0.25),
    grid: Math.round(22 + rng() * 20),                                   // wireframe density
    ridged, terraced, smooth, steps,
    kickDecay: lerp(0.9, 0.35, ridged),
    swing: clamp(f.flow * 0.12, 0, 0.1),
  };
  return { width: w, height: h, H, edgeN, texture, grid, col, thr, focal, marks, params };
}

/** Height at image coords (bilinear-ish nearest, for annotations and event positions). */
export function heightAt(map, x, y) {
  const xi = Math.min(map.width - 1, Math.max(0, Math.floor(x * map.width))), yi = Math.min(map.height - 1, Math.max(0, Math.floor(y * map.height)));
  return map.H[yi * map.width + xi];
}
