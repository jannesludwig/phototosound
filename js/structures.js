// ─────────────────────────────────────────────────────────────
//  structures.js — the photograph's actual forms.
//
//  Global averages (analysis.js) say *what kind* of image this is.
//  This module extracts *its own shapes* — used by the quanta (brief
//  contour flashes) and by the cursor's edge clicks:
//    strokes      Canny-lite edge chains → simplified polylines
//    contours     marching-squares iso-lines of the luminance field
//    segments     straight line segments (Hough, walked into oriented runs)
//  All coordinates are normalised: x, y ∈ [0, 1], y down.
// ─────────────────────────────────────────────────────────────
import { rasterize, blur } from './analysis.js';

const S = 256; // working resolution (long side)

export function extractStructures(src, seed) {
  const t0 = performance.now();
  const cv = rasterize(src, S);
  const w = cv.width, h = cv.height, N = w * h;
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  const edges = cannyLite(L, w, h);
  const strokes = traceStrokes(edges, w, h);
  const contours = isoContours(L, w, h);
  const segments = lineSegments(edges, w, h);
  return {
    width: w, height: h, strokes, contours, segments,
    edgeMag: edges.mag, edgeW: w, edgeH: h,
    ms: Math.round(performance.now() - t0),
  };
}

// ── edges: Sobel → non-maximum suppression → hysteresis ────
function cannyLite(L0, w, h) {
  const L = blur(L0, w, h, 1, 1);
  const N = w * h, mag = new Float32Array(N), dir = new Uint8Array(N), GX = new Float32Array(N), GY = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = (L[i - w + 1] + 2 * L[i + 1] + L[i + w + 1]) - (L[i - w - 1] + 2 * L[i - 1] + L[i + w - 1]);
    const gy = (L[i + w - 1] + 2 * L[i + w] + L[i + w + 1]) - (L[i - w - 1] + 2 * L[i - w] + L[i - w + 1]);
    mag[i] = Math.hypot(gx, gy); GX[i] = gx; GY[i] = gy;
    let a = Math.atan2(gy, gx) * 180 / Math.PI; if (a < 0) a += 180;
    dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
  }
  // thresholds from the magnitude distribution (robust for any photo)
  const sorted = Float32Array.from(mag).sort();
  const hi = Math.max(0.12, sorted[Math.floor(N * 0.9)]), lo = hi * 0.45;
  const nms = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, m = mag[i]; if (m < lo) continue;
    let a, b;
    switch (dir[i]) {
      case 0: a = mag[i - 1]; b = mag[i + 1]; break;
      case 1: a = mag[i - w - 1]; b = mag[i + w + 1]; break;
      case 2: a = mag[i - w]; b = mag[i + w]; break;
      default: a = mag[i - w + 1]; b = mag[i + w - 1];
    }
    if (m >= a && m >= b) nms[i] = m;
  }
  const thin = new Uint8Array(N); // 2 = strong, 1 = weak→promoted
  const stack = [];
  for (let i = 0; i < N; i++) if (nms[i] >= hi) { thin[i] = 2; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (const d of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
      const j = i + d; if (j < 0 || j >= N || thin[j] || nms[j] < lo) continue;
      thin[j] = 1; stack.push(j);
    }
  }
  return { mag, thin, hi, gx: GX, gy: GY };
}

// ── strokes: trace 8-connected chains, simplify (RDP) ──────
function traceStrokes(edges, w, h) {
  const { thin, mag } = edges, N = w * h;
  const seen = new Uint8Array(N);
  const NB = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  const neighbours = (i) => { const out = []; for (const d of NB) { const j = i + d; if (j >= 0 && j < N && thin[j] && Math.abs((j % w) - (i % w)) <= 1) out.push(j); } return out; };
  const chains = [];
  const follow = (start) => {
    const chain = [start]; seen[start] = 1; let cur = start;
    for (;;) {
      const nx = neighbours(cur).filter((j) => !seen[j]);
      if (!nx.length) break;
      // prefer the straightest continuation
      cur = nx[0]; seen[cur] = 1; chain.push(cur);
      if (chain.length > 4000) break;
    }
    return chain;
  };
  // endpoints first (open strokes), then whatever remains (closed loops)
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    if (!thin[i] || seen[i]) continue;
    if (pass === 0 && neighbours(i).length !== 1) continue;
    const c = follow(i);
    if (c.length >= 10) chains.push(c);
  }
  const strokes = chains.map((c) => {
    let strength = 0; for (const i of c) strength += mag[i];
    const pts = rdp(c.map((i) => [i % w, (i / w) | 0]), 0.9);
    let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return { pts: pts.map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h]), len: len / Math.max(w, h), strength: strength / c.length };
  });
  strokes.sort((a, b) => b.len * (0.5 + b.strength) - a.len * (0.5 + a.strength));
  return strokes.slice(0, 140);
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, dl = Math.hypot(dx, dy) || 1;
    let md = -1, mi = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((pts[k][0] - ax) * dy - (pts[k][1] - ay) * dx) / dl;
      if (d > md) { md = d; mi = k; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// ── iso-contours: marching squares at quantile levels ──────
function isoContours(L0, w, h) {
  const F = blur(L0, w, h, 3, 2);
  const sorted = Float32Array.from(F).sort();
  const levels = [];
  for (let q = 0.12; q < 0.9; q += 0.11) {
    const v = sorted[Math.floor(q * sorted.length)];
    if (!levels.length || v - levels[levels.length - 1] > 0.02) levels.push(v);
  }
  const out = [];
  levels.forEach((lv, li) => {
    const segs = [];
    for (let y = 0; y < h - 1; y++) for (let x = 0; x < w - 1; x++) {
      const a = F[y * w + x], b = F[y * w + x + 1], c = F[(y + 1) * w + x + 1], d = F[(y + 1) * w + x];
      const code = (a > lv ? 8 : 0) | (b > lv ? 4 : 0) | (c > lv ? 2 : 0) | (d > lv ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const t = (p, q) => (lv - p) / (q - p || 1e-6);
      const top = [x + t(a, b), y], right = [x + 1, y + t(b, c)], bottom = [x + t(d, c), y + 1], left = [x, y + t(a, d)];
      const add = (p, q) => segs.push([p, q]);
      switch (code) {
        case 1: case 14: add(left, bottom); break;
        case 2: case 13: add(bottom, right); break;
        case 3: case 12: add(left, right); break;
        case 4: case 11: add(top, right); break;
        case 5: add(left, top); add(bottom, right); break;
        case 6: case 9: add(top, bottom); break;
        case 7: case 8: add(left, top); break;
        case 10: add(top, right); add(left, bottom); break;
      }
    }
    for (const poly of joinSegments(segs)) {
      if (poly.length < 8) continue;
      const pts = rdp(poly, 0.6);
      let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      out.push({ level: li, value: lv, pts: pts.map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h]), len: len / Math.max(w, h) });
    }
  });
  out.sort((a, b) => b.len - a.len);
  return { levels, lines: out.slice(0, 220) };
}

function joinSegments(segs) {
  const key = (p) => `${Math.round(p[0] * 64)},${Math.round(p[1] * 64)}`;
  const map = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const k = key(s[e]); if (!map.has(k)) map.set(k, []); map.get(k).push([i, e]); } });
  const used = new Uint8Array(segs.length), polys = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = 1;
    const poly = [segs[i][0], segs[i][1]];
    for (const dirn of [1, 0]) {               // extend forward, then backward
      for (;;) {
        const end = dirn ? poly[poly.length - 1] : poly[0];
        const cand = (map.get(key(end)) || []).find(([j]) => !used[j]);
        if (!cand) break;
        const [j, e] = cand; used[j] = 1;
        const next = segs[j][1 - e];
        if (dirn) poly.push(next); else poly.unshift(next);
      }
    }
    polys.push(poly);
  }
  return polys;
}

// ── straight segments: Hough peaks walked into covered runs ─
function lineSegments(edges, w, h) {
  const { thin, mag } = edges;
  const NA = 90, R = Math.ceil(Math.hypot(w, h)), NR = 2 * R + 1;
  const acc = new Uint16Array(NA * NR);
  const cs = [], sn = [];
  for (let a = 0; a < NA; a++) { cs.push(Math.cos(a / NA * Math.PI)); sn.push(Math.sin(a / NA * Math.PI)); }
  const pts = [];
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) if (thin[y * w + x]) pts.push(x, y);
  for (let k = 0; k < pts.length; k += 2) for (let a = 0; a < NA; a++) acc[a * NR + Math.round(pts[k] * cs[a] + pts[k + 1] * sn[a]) + R]++;
  const segs = [];
  const minLen = Math.max(w, h) * 0.16;
  for (let n = 0; n < 60 && segs.length < 24; n++) {
    let best = minLen * 0.6, bi = -1;
    for (let i = 0; i < acc.length; i++) if (acc[i] > best) { best = acc[i]; bi = i; }
    if (bi < 0) break;
    const a = Math.floor(bi / NR), r = (bi % NR) - R;
    for (let da = -3; da <= 3; da++) for (let dr = -4; dr <= 4; dr++) { const aa = (a + da + NA) % NA, rr = r + dr + R; if (rr >= 0 && rr < NR) acc[aa * NR + rr] = 0; }
    // walk the line across the frame, collect runs covered by edge pixels (gaps ≤ 3 px)
    const c = cs[a], s = sn[a];
    const x0 = c * r, y0 = s * r, dx = -s, dy = c;
    let run = null, gap = 0;
    const flush = () => {
      if (!run) return;
      const L = Math.hypot(run.ex - run.sx, run.ey - run.sy) + 1;
      // a real straight line: long, densely covered, crisp
      if (run.n >= minLen * 0.8 && run.n / L > 0.82 && run.m / run.n > edges.hi * 0.9) segs.push({ x1: run.sx / w, y1: run.sy / h, x2: run.ex / w, y2: run.ey / h, len: Math.hypot(run.ex - run.sx, run.ey - run.sy) / Math.max(w, h), angle: a / NA * 180, strength: run.m / run.n });
      run = null;
    };
    for (let t = -R; t <= R; t++) {
      const x = Math.round(x0 + dx * t), y = Math.round(y0 + dy * t);
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      let hit = false, m = 0;
      for (const [ox, oy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (y + oy) * w + x + ox;
        // the edge must run along the line: its gradient points along the line normal (c, s)
        if (thin[j] && Math.abs(edges.gx[j] * c + edges.gy[j] * s) > 0.92 * mag[j]) { hit = true; m = Math.max(m, mag[j]); }
      }
      if (hit) { if (!run) run = { sx: x, sy: y, n: 0, m: 0 }; run.ex = x; run.ey = y; run.n++; run.m += m; gap = 0; }
      else if (run && ++gap > 3) { flush(); gap = 0; }
    }
    flush();
  }
  segs.sort((p, q) => q.len - p.len);
  return segs.slice(0, 24);
}
