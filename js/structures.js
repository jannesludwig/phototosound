// ─────────────────────────────────────────────────────────────
//  structures.js — the photograph's actual forms.
//
//  Global averages (analysis.js) say *what kind* of image this is.
//  This module extracts *its own shapes*, each of which becomes a
//  visual element and a sound source in the score:
//    strokes      Canny-lite edge chains → simplified polylines
//    contours     marching-squares iso-lines of the luminance field
//    segments     straight line segments (Hough, walked into runs)
//    corners      Shi–Tomasi keypoints
//    regions      k-means colour clusters (Lab-ish) + label map
//    fragments    Delaunay triangles coloured by the pixels underneath
//    salient      centre–surround saliency peaks (glitch emitters)
//    voids        dark, empty cells (silence)
//    symmetry     mirror correlation left/right, top/bottom
//    colour       colourfulness (Hasler–Süsstrunk), temperature
//    sorted       pixel-sorted copies (rows / columns inside edge intervals)
//  All coordinates are normalised: x, y ∈ [0, 1], y down.
// ─────────────────────────────────────────────────────────────
import { rasterize, blur } from './analysis.js';
import { makeRng, clamp } from './rng.js';

const S = 256; // working resolution (long side)

export function extractStructures(src, seed) {
  const t0 = performance.now();
  const cv = rasterize(src, S);
  const w = cv.width, h = cv.height, N = w * h;
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    L[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    A[i] = (r - g) * 0.5 + 0.5 * (r - L[i]);   // ≈ red–green opponent
    B[i] = (r + g) * 0.25 - b * 0.5;           // ≈ yellow–blue opponent
  }
  const rng = makeRng(seed ^ 0x57c7);

  const edges = cannyLite(L, w, h);
  const strokes = traceStrokes(edges, w, h);
  const contours = isoContours(L, w, h);
  const segments = lineSegments(edges, w, h);
  const corners = shiTomasi(L, w, h);
  const regions = segmentColours(src, seed);
  const fragments = triangulate(corners, strokes, regions, px, w, h, rng);
  const salient = saliency(L, A, B, w, h);
  const voids = findVoids(L, w, h);
  const symmetry = mirrorSymmetry(L, w, h);
  const colour = colourMetrics(px, N);
  const sorted = pixelSort(src, edges, w, h);

  return {
    width: w, height: h,
    strokes, contours, segments, corners, regions, fragments, salient, voids, symmetry, colour, sorted,
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

// ── corners: Shi–Tomasi with NMS and spacing ───────────────
function shiTomasi(L, w, h) {
  const N = w * h, Ix = new Float32Array(N), Iy = new Float32Array(N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; Ix[i] = (L[i + 1] - L[i - 1]) * 0.5; Iy[i] = (L[i + w] - L[i - w]) * 0.5; }
  const xx = new Float32Array(N), yy = new Float32Array(N), xy = new Float32Array(N);
  for (let i = 0; i < N; i++) { xx[i] = Ix[i] * Ix[i]; yy[i] = Iy[i] * Iy[i]; xy[i] = Ix[i] * Iy[i]; }
  const Sxx = blur(xx, w, h, 2, 1), Syy = blur(yy, w, h, 2, 1), Sxy = blur(xy, w, h, 2, 1);
  const R = new Float32Array(N);
  let max = 0;
  for (let i = 0; i < N; i++) {
    const tr = Sxx[i] + Syy[i], det = Math.sqrt((Sxx[i] - Syy[i]) ** 2 + 4 * Sxy[i] ** 2);
    R[i] = (tr - det) / 2; if (R[i] > max) max = R[i];
  }
  const cand = [];
  for (let y = 4; y < h - 4; y++) for (let x = 4; x < w - 4; x++) {
    const i = y * w + x, v = R[i]; if (v < max * 0.03) continue;
    let isMax = true;
    for (let dy = -2; dy <= 2 && isMax; dy++) for (let dx = -2; dx <= 2; dx++) if (R[i + dy * w + dx] > v) { isMax = false; break; }
    if (isMax) cand.push({ x, y, r: v / max });
  }
  cand.sort((a, b) => b.r - a.r);
  const out = [], minD = 6;
  for (const c of cand) {
    if (out.length >= 220) break;
    if (out.some((o) => Math.abs(o.x - c.x) < minD && Math.abs(o.y - c.y) < minD)) continue;
    out.push(c);
  }
  return out.map((c) => ({ x: (c.x + 0.5) / w, y: (c.y + 0.5) / h, r: Math.sqrt(c.r) }));
}

// ── colour regions: k-means in an opponent colour space ────
function segmentColours(src, seed) {
  const cv = rasterize(src, 96);
  const w = cv.width, h = cv.height, N = w * h;
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const F = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    F[i * 3] = l * 1.4; F[i * 3 + 1] = (r - g) * 0.9; F[i * 3 + 2] = (r + g) * 0.45 - b * 0.9;
  }
  const K = 6, rng = makeRng(seed ^ 0xc105);
  // k-means++ initialisation (seeded)
  const cent = [];
  cent.push(Array.from(F.subarray(Math.floor(rng() * N) * 3, Math.floor(rng() * N) * 3 + 3)));
  const d2 = new Float32Array(N).fill(Infinity);
  while (cent.length < K) {
    const c = cent[cent.length - 1]; let sum = 0;
    for (let i = 0; i < N; i++) { const d = (F[i * 3] - c[0]) ** 2 + (F[i * 3 + 1] - c[1]) ** 2 + (F[i * 3 + 2] - c[2]) ** 2; d2[i] = Math.min(d2[i], d); sum += d2[i]; }
    let r = rng() * sum, pick = 0; for (; pick < N - 1; pick++) { r -= d2[pick]; if (r <= 0) break; }
    cent.push([F[pick * 3], F[pick * 3 + 1], F[pick * 3 + 2]]);
  }
  const label = new Uint8Array(N);
  for (let it = 0; it < 10; it++) {
    const sums = cent.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < N; i++) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < K; k++) { const c = cent[k]; const d = (F[i * 3] - c[0]) ** 2 + (F[i * 3 + 1] - c[1]) ** 2 + (F[i * 3 + 2] - c[2]) ** 2; if (d < bd) { bd = d; bi = k; } }
      label[i] = bi; const s = sums[bi]; s[0] += F[i * 3]; s[1] += F[i * 3 + 1]; s[2] += F[i * 3 + 2]; s[3]++;
    }
    for (let k = 0; k < K; k++) if (sums[k][3]) cent[k] = [sums[k][0] / sums[k][3], sums[k][1] / sums[k][3], sums[k][2] / sums[k][3]];
  }
  const clusters = cent.map(() => ({ n: 0, r: 0, g: 0, b: 0, x: 0, y: 0 }));
  for (let i = 0; i < N; i++) {
    const c = clusters[label[i]]; c.n++; c.r += px[i * 4]; c.g += px[i * 4 + 1]; c.b += px[i * 4 + 2]; c.x += i % w; c.y += (i / w) | 0;
  }
  // number of connected components per cluster = how fragmented that colour is
  const comp = new Int32Array(N).fill(-1); const pieces = new Array(K).fill(0);
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0) continue;
    const l = label[i], st = [i]; comp[i] = 1; let size = 0;
    while (st.length) { const j = st.pop(); size++; for (const d of [-1, 1, -w, w]) { const k = j + d; if (k < 0 || k >= N || comp[k] >= 0 || label[k] !== l) continue; if (d === 1 && k % w === 0) continue; if (d === -1 && j % w === 0) continue; comp[k] = 1; st.push(k); } }
    if (size > N * 0.004) pieces[l]++;
  }
  const out = clusters.map((c, k) => {
    const n = Math.max(1, c.n);
    const r = c.r / n / 255, g = c.g / n / 255, b = c.b / n / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hue = 0; if (mx - mn > 1e-3) { if (mx === r) hue = ((g - b) / (mx - mn)) % 6; else if (mx === g) hue = (b - r) / (mx - mn) + 2; else hue = (r - g) / (mx - mn) + 4; hue = ((hue / 6) + 1) % 1; }
    return { id: k, area: c.n / N, r, g, b, hue, sat: mx > 0 ? (mx - mn) / mx : 0, lum: 0.2126 * r + 0.7152 * g + 0.0722 * b, x: c.x / n / w, y: c.y / n / h, pieces: pieces[k] };
  });
  // significant distinct regions (for "how segmentable is this image")
  const distinct = out.filter((c) => c.area > 0.03).length;
  return { w, h, label, clusters: out, distinct };
}

// ── fragments: Delaunay over the image's own points ────────
function triangulate(corners, strokes, regions, px, w, h, rng) {
  const P = [];
  for (const c of corners.slice(0, 170)) P.push([c.x, c.y]);
  // samples along the strongest strokes keep object outlines in the mesh
  let budget = 170;
  for (const s of strokes) {
    if (budget <= 0) break;
    const step = Math.max(1, Math.floor(s.pts.length / 6));
    for (let k = 0; k < s.pts.length && budget > 0; k += step) { P.push(s.pts[k]); budget--; }
  }
  // border + a sparse jittered fill so flat areas still have fragments
  for (let k = 0; k <= 8; k++) { const t = k / 8; P.push([t, 0], [t, 1], [0, t], [1, t]); }
  for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) P.push([(i + 0.2 + rng() * 0.6) / 8, (j + 0.2 + rng() * 0.6) / 6]);
  // de-duplicate close points
  const pts = [];
  for (const p of P) if (!pts.some((q) => Math.abs(q[0] - p[0]) < 0.006 && Math.abs(q[1] - p[1]) < 0.006)) pts.push(p);
  const tris = delaunay(pts);
  const at = (x, y) => { const i = (Math.min(h - 1, Math.max(0, Math.floor(y * h))) * w + Math.min(w - 1, Math.max(0, Math.floor(x * w)))) * 4; return [px[i] / 255, px[i + 1] / 255, px[i + 2] / 255]; };
  const lab = regions.label, rw = regions.w, rh = regions.h;
  return tris.map(([a, b, c]) => {
    const A = pts[a], B = pts[b], C = pts[c];
    const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3;
    // mean colour from 4 samples (centroid + towards the vertices)
    let col = [0, 0, 0];
    for (const [u, v] of [[cx, cy], [(cx * 2 + A[0]) / 3, (cy * 2 + A[1]) / 3], [(cx * 2 + B[0]) / 3, (cy * 2 + B[1]) / 3], [(cx * 2 + C[0]) / 3, (cy * 2 + C[1]) / 3]]) { const s = at(u, v); col[0] += s[0] / 4; col[1] += s[1] / 4; col[2] += s[2] / 4; }
    const cl = lab[Math.min(rh - 1, Math.floor(cy * rh)) * rw + Math.min(rw - 1, Math.floor(cx * rw))];
    const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2;
    return { a: A, b: B, c: C, cx, cy, col, cluster: cl, area };
  });
}

/** Bowyer–Watson Delaunay triangulation (O(n²), fine for ≤ 500 points). */
export function delaunay(pts) {
  const n = pts.length;
  const P = pts.concat([[-10, -10], [10, -10], [0.5, 20]]);
  let tris = [[n, n + 1, n + 2]];
  const circ = (t) => {
    const [ax, ay] = P[t[0]], [bx, by] = P[t[1]], [cx, cy] = P[t[2]];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-12;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let circles = tris.map(circ);
  for (let i = 0; i < n; i++) {
    const [px, py] = P[i];
    const bad = [], keep = [], keepC = [];
    tris.forEach((t, k) => { const c = circles[k]; if ((px - c[0]) ** 2 + (py - c[1]) ** 2 < c[2]) bad.push(t); else { keep.push(t); keepC.push(c); } });
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = a < b ? `${a},${b}` : `${b},${a}`;
      edges.set(k, edges.has(k) ? null : [a, b]);
    }
    tris = keep; circles = keepC;
    for (const e of edges.values()) if (e) { const t = [e[0], e[1], i]; tris.push(t); circles.push(circ(t)); }
  }
  return tris.filter((t) => t[0] < n && t[1] < n && t[2] < n);
}

// ── saliency: centre–surround in L, a, b ────────────────────
function saliency(L, A, B, w, h) {
  const N = w * h, sal = new Float32Array(N);
  for (const ch of [L, A, B]) {
    const c = blur(ch, w, h, 1, 1), s = blur(ch, w, h, 10, 2);
    for (let i = 0; i < N; i++) sal[i] += Math.abs(c[i] - s[i]);
  }
  const sm = blur(sal, w, h, 3, 1);
  let max = 1e-6, mean = 0; for (let i = 0; i < N; i++) { max = Math.max(max, sm[i]); mean += sm[i]; } mean /= N;
  const peaks = [];
  const copy = Float32Array.from(sm);
  for (let n = 0; n < 8; n++) {
    let best = 0, bi = -1; for (let i = 0; i < N; i++) if (copy[i] > best) { best = copy[i]; bi = i; }
    if (bi < 0 || best < mean * 2.4 || best < max * 0.4) break;
    const x = bi % w, y = (bi / w) | 0, r = Math.round(Math.max(w, h) * 0.07);
    // region extent: how far the saliency stays above half the peak
    let ext = 3; while (ext < r * 2 && x + ext < w && sm[y * w + x + ext] > best * 0.5) ext++;
    peaks.push({ x: (x + 0.5) / w, y: (y + 0.5) / h, r: ext / Math.max(w, h), s: best / max });
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h) copy[yy * w + xx] = 0; }
  }
  return { peaks, contrast: clamp(max / (mean * 6)) };
}

// ── voids: dark, flat cells ────────────────────────────────
function findVoids(L, w, h) {
  const GX = 32, GY = Math.max(8, Math.round(32 * h / w));
  const mask = new Uint8Array(GX * GY); let count = 0;
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    let s = 0, s2 = 0, n = 0;
    for (let y = Math.floor(j * h / GY); y < Math.floor((j + 1) * h / GY); y++) for (let x = Math.floor(i * w / GX); x < Math.floor((i + 1) * w / GX); x++) { const v = L[y * w + x]; s += v; s2 += v * v; n++; }
    const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m));
    if (m < 0.13 && sd < 0.035) { mask[j * GX + i] = 1; count++; }
  }
  return { gx: GX, gy: GY, mask, fraction: count / (GX * GY) };
}

// ── symmetry ───────────────────────────────────────────────
function mirrorSymmetry(L, w, h) {
  let lr = 0, tb = 0, dev = 0, mean = 0;
  for (let i = 0; i < w * h; i++) mean += L[i]; mean /= w * h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const v = L[y * w + x];
    lr += Math.abs(v - L[y * w + (w - 1 - x)]);
    tb += Math.abs(v - L[(h - 1 - y) * w + x]);
    dev += Math.abs(v - mean);
  }
  dev = dev || 1;
  return { lr: clamp(1 - lr / dev), tb: clamp(1 - tb / dev) };
}

// ── colour metrics ─────────────────────────────────────────
function colourMetrics(px, N) {
  let srg = 0, syb = 0, srg2 = 0, syb2 = 0, temp = 0, tw = 0;
  for (let i = 0; i < N; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const rg = r - g, yb = 0.5 * (r + g) - b;
    srg += rg; syb += yb; srg2 += rg * rg; syb2 += yb * yb;
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    temp += (r - b) * chroma; tw += chroma;
  }
  const mrg = srg / N, myb = syb / N;
  const sd = Math.sqrt(Math.max(0, srg2 / N - mrg * mrg) + Math.max(0, syb2 / N - myb * myb));
  const colourfulness = (sd + 0.3 * Math.hypot(mrg, myb)) / 255;   // Hasler–Süsstrunk, scaled
  return { colourfulness: clamp(colourfulness / 0.6), temperature: tw ? clamp(temp / tw / 255, -1, 1) : 0 };
}

// ── pixel sorting (ASDF-style, inside edge/threshold intervals) ──
function pixelSort(src, edges, ew, eh) {
  const cv = rasterize(src, 384);
  const w = cv.width, h = cv.height;
  const img = cv.getContext('2d').getImageData(0, 0, w, h);
  const isEdge = (x, y) => edges.thin[Math.min(eh - 1, Math.floor(y / h * eh)) * ew + Math.min(ew - 1, Math.floor(x / w * ew))];
  const make = (horizontal) => {
    const out = new ImageData(new Uint8ClampedArray(img.data), w, h);
    const D = out.data;
    const outer = horizontal ? h : w, inner = horizontal ? w : h;
    for (let o = 0; o < outer; o++) {
      let run = [];
      for (let k = 0; k < inner; k++) {
        const x = horizontal ? k : o, y = horizontal ? o : k, i = (y * w + x) * 4;
        const l = 0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2];
        // intervals: bright-enough pixels, broken by edges (sorting "flows" out of edges)
        if (l > 40 && l < 245 && !(isEdge(x, y) && run.length > 3)) run.push(i);
        else { if (run.length > 2) sortInto(D, run); run = []; }
      }
      if (run.length > 2) sortInto(D, run);
    }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').putImageData(out, 0, 0);
    return c;
  };
  return { h: make(true), v: make(false) };
}

function sortInto(D, run) {
  const vals = run.map((i) => [0.2126 * D[i] + 0.7152 * D[i + 1] + 0.0722 * D[i + 2], D[i], D[i + 1], D[i + 2]]);
  vals.sort((a, b) => b[0] - a[0]);
  run.forEach((i, k) => { D[i] = vals[k][1]; D[i + 1] = vals[k][2]; D[i + 2] = vals[k][3]; });
}
