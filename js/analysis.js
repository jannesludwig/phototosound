// ─────────────────────────────────────────────────────────────
//  analysis.js — reads a photograph and returns a feature vector.
//
//  Everything runs on a small downscaled copy (≤ 192 px) so the
//  analysis takes a few tens of milliseconds. Face detection is
//  done separately (face.js) and merged in by the caller.
// ─────────────────────────────────────────────────────────────
import { hashBytes, clamp } from './rng.js';

const AN = 192;          // analysis resolution (long side)
export const GRID_COLS = 64; // sequencer grid (columns → steps)
export const GRID_ROWS = 32; // sequencer grid (rows → pitch)

/** Draw the source into a canvas of at most `max` px on the long side. */
export function rasterize(src, max) {
  const w0 = src.naturalWidth || src.width, h0 = src.naturalHeight || src.height;
  const s = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return c;
}

// ── colour helpers ───────────────────────────────────────────
function rgb2hsv(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6; if (h < 0) h += 1;
  }
  return [h, mx > 0 ? d / mx : 0, mx];
}

/** Separable box blur (radius r) on a Float32Array image, `passes` times ≈ gaussian. */
export function blur(src, w, h, r, passes = 2) {
  let a = Float32Array.from(src), b = new Float32Array(w * h);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {           // horizontal
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += a[y * w + xx]; n++; } }
        b[y * w + x] = s / n;
      }
    }
    for (let y = 0; y < h; y++) {           // vertical
      for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += b[yy * w + x]; n++; } }
        a[y * w + x] = s / n;
      }
    }
  }
  return a;
}

/**
 * Main entry. `src` is an <img> or <canvas>.
 * Returns { features, grid, maps, signature, seed, palette, points, ... }.
 */
export function analyzeImage(src, signatureBytes = null) {
  const cv = rasterize(src, AN);
  const w = cv.width, h = cv.height, N = w * h;
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;

  // ── signature: hash of the original file bytes when we have them
  //    (identical on every device), else of the downscaled pixels ──
  const [h1, h2] = hashBytes(signatureBytes || px);
  const signature = h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0').slice(0, 4);
  const seed = (h1 ^ Math.imul(h2, 0x9e3779b1)) >>> 0;

  // ── per-pixel luminance / hsv ──────────────────────────────
  const L = new Float32Array(N), S = new Float32Array(N), H = new Float32Array(N);
  let sumL = 0, sumL2 = 0, sumS = 0;
  const hueHist = new Float32Array(12);
  for (let i = 0; i < N; i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const [hh, ss, vv] = rgb2hsv(r, g, b);
    // HSV saturation is meaningless in near-black pixels → fade it out there
    const se = ss * Math.min(1, Math.max(0, (vv - 0.04) / 0.22));
    L[i] = l; S[i] = se; H[i] = hh;
    sumL += l; sumL2 += l * l; sumS += se;
    hueHist[Math.floor(hh * 12) % 12] += se * vv;   // weight hue by chroma
  }
  const brightness = sumL / N;
  const contrast = Math.sqrt(Math.max(0, sumL2 / N - brightness * brightness)); // std dev
  const saturation = sumS / N;
  let hueTotal = 0, hx = 0, hy = 0;
  for (let k = 0; k < 12; k++) {
    hueTotal += hueHist[k];
    const a = (k + 0.5) / 12 * Math.PI * 2;
    hx += Math.cos(a) * hueHist[k]; hy += Math.sin(a) * hueHist[k];
  }
  let hue = (Math.atan2(hy, hx) / (Math.PI * 2) + 1) % 1;
  const hueConcentration = hueTotal > 0 ? Math.hypot(hx, hy) / hueTotal : 0;
  if (hueTotal < 1e-3) hue = 0.58; // grey images → cold default

  // ── gradients (Sobel) ──────────────────────────────────────
  const Gx = new Float32Array(N), Gy = new Float32Array(N), Gm = new Float32Array(N);
  const at = (x, y) => L[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
  let sumG = 0, sumLap = 0, flat = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const gy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      const i = y * w + x;
      Gx[i] = gx; Gy[i] = gy;
      const m = Math.hypot(gx, gy);
      Gm[i] = m; sumG += m;
      const lap = Math.abs(4 * at(x, y) - at(x - 1, y) - at(x + 1, y) - at(x, y - 1) - at(x, y + 1));
      sumLap += lap;
      if (m < 0.012 && L[i] > 0.07) flat++;   // dark voids are not "flat design"
    }
  }
  const meanG = sumG / N;
  const edgeThr = Math.min(0.8, Math.max(0.25, meanG * 2.2)); // capped: busy images must not hide their real edges
  let edgeCount = 0;
  for (let i = 0; i < N; i++) if (Gm[i] > edgeThr) edgeCount++;
  const edgeDensity = clamp(edgeCount / N * 4);           // 0..1
  const detail = clamp(sumLap / N * 18);                     // high-frequency texture
  const flatness = flat / N;                                 // perfectly flat area
  const darkness = clamp(1 - brightness * 1.8);

  // ── edge orientation histogram (18 bins, 0..180°) ─────────
  const oriHist = new Float32Array(18);
  for (let i = 0; i < N; i++) {
    if (Gm[i] < edgeThr) continue;
    let a = Math.atan2(Gy[i], Gx[i]); if (a < 0) a += Math.PI;
    oriHist[Math.floor(a / Math.PI * 18) % 18] += Gm[i];
  }
  const oriTotal = oriHist.reduce((s, v) => s + v, 0) || 1;
  // gradient angle 0 → vertical edge, 90° → horizontal edge
  const vertEdges = (oriHist[0] + oriHist[17] + oriHist[1] * 0.5 + oriHist[16] * 0.5) / oriTotal;
  const horzEdges = (oriHist[9] + oriHist[8] * 0.5 + oriHist[10] * 0.5) / oriTotal;
  const hvRatio = clamp((vertEdges + horzEdges) * 2.2 - 0.35) * clamp(edgeDensity * 3); // uniform → ~0.22 → 0

  // ── straight-line strength: Hough lines scored by coverage ───
  // For every candidate line (angle a, offset r) we count how many pixels lie on
  // it inside the frame (len) and how many of those are edges oriented along it
  // (votes). coverage = votes/len is ≈1 for a real straight line and stays near
  // the background rate for texture, however dense — no matter how busy the photo.
  const NA = 60, NR = Math.ceil(Math.hypot(w, h)) + 2, R0 = Math.ceil(Math.hypot(w, h)) + 1;
  const votes = new Float32Array(NA * NR * 2), len = new Float32Array(NA * NR * 2);
  const cosT = new Float32Array(NA), sinT = new Float32Array(NA);
  for (let a = 0; a < NA; a++) { cosT[a] = Math.cos(a / NA * Math.PI); sinT[a] = Math.sin(a / NA * Math.PI); }
  const B = 4; // ignore a thin margin: borders of scans/screenshots are not "architecture"
  for (let y = B; y < h - B; y++) for (let x = B; x < w - B; x++) {
    const i = y * w + x;
    for (let a = 0; a < NA; a++) len[a * NR * 2 + Math.round(x * cosT[a] + y * sinT[a]) + R0] += 1;
    if (Gm[i] < edgeThr) continue;
    let ga = Math.atan2(Gy[i], Gx[i]); if (ga < 0) ga += Math.PI;   // gradient ⟂ line → same Hough angle
    const ac = Math.round(ga / Math.PI * NA);
    for (let d = -1; d <= 1; d++) {
      const a = ((ac + d) % NA + NA) % NA;
      votes[a * NR * 2 + Math.round(x * cosT[a] + y * sinT[a]) + R0] += 1;
    }
  }
  const maxDim = Math.max(w, h), minLen = 0.3 * maxDim;
  const score = new Float32Array(NA * NR * 2);
  for (let a = 0; a < NA; a++) {
    let sv = 0, sl = 0;
    for (let r = 0; r < NR * 2; r++) { sv += votes[a * NR * 2 + r]; sl += len[a * NR * 2 + r]; }
    const bg = sl ? sv / sl : 0;                                     // chance coverage at this angle
    for (let r = 0; r < NR * 2; r++) {
      const k = a * NR * 2 + r, L = len[k];
      if (L < minLen) continue;
      const cov = votes[k] / L;
      score[k] = Math.max(0, (cov - bg * 1.5) / (1 - bg * 1.5 + 1e-6)) * Math.min(1, L / (0.6 * maxDim));
    }
  }
  const lines = [];
  for (let n = 0; n < 10; n++) {
    let best = 0.08, bi = -1;
    for (let k = 0; k < score.length; k++) if (score[k] > best) { best = score[k]; bi = k; }
    if (bi < 0) break;
    const a = Math.floor(bi / (NR * 2)), r = bi % (NR * 2);
    lines.push({ angle: a / NA * 180, score: best });
    for (let da = -2; da <= 2; da++) for (let dr = -3; dr <= 3; dr++) {
      const aa = ((a + da) % NA + NA) % NA, rr = r + dr;
      if (rr >= 0 && rr < NR * 2) score[aa * NR * 2 + rr] = 0;
    }
  }
  const lineSum = lines.reduce((s, l) => s + l.score, 0);
  const lineStrength = clamp(lineSum / 3.2);
  let hMass = 0, vMass = 0;
  for (const l of lines) {
    if (Math.abs(l.angle - 90) < 8) hMass += l.score;                 // normal at 90° → horizontal line
    else if (l.angle < 8 || l.angle > 172) vMass += l.score;
  }
  const hvLine = lineSum ? (hMass + vMass) / lineSum : 0;
  const lineOrientation = hMass + horzEdges * 0.5 >= vMass + vertEdges * 0.5 ? 'h' : 'v';

  // ── bright points on dark background ───────────────────────
  // Done at a higher resolution: stars and city lights vanish when averaged down.
  const points = detectPoints(src);
  points.sort((a, b) => b.peak * Math.sqrt(b.area) - a.peak * Math.sqrt(a.area));
  const pointCount = points.length;
  let spread = 0;
  if (pointCount > 1) {
    const mx = points.reduce((s, p) => s + p.x, 0) / pointCount, my = points.reduce((s, p) => s + p.y, 0) / pointCount;
    spread = Math.sqrt(points.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / pointCount);
  }
  // points of light only mean something on a dark ground
  const pointScore = clamp(Math.log2(1 + pointCount) / 5.5) * (0.12 + 0.88 * darkness * darkness) * clamp(0.4 + spread * 2.5);

  // ── radial symmetry (gradient voting toward circle centres) ──
  const radial = new Float32Array(N);
  const radii = [3, 5, 8, 12, 17, 24, 32, 44];
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    const i = y * w + x; const m = Gm[i]; if (m < edgeThr) continue;
    const ux = Gx[i] / m, uy = Gy[i] / m;
    for (const r of radii) {
      if (r > Math.min(w, h) * 0.45) break;
      for (const sgn of [1, -1]) {
        const cx = Math.round(x + sgn * ux * r), cy = Math.round(y + sgn * uy * r);
        if (cx >= 0 && cx < w && cy >= 0 && cy < h) radial[cy * w + cx] += 1 / Math.sqrt(r);
      }
    }
  }
  const radB = blur(radial, w, h, 2, 1);
  let rMax = 0, rMean = 0, rIdx = 0;
  for (let i = 0; i < N; i++) { rMean += radB[i]; if (radB[i] > rMax) { rMax = radB[i]; rIdx = i; } }
  rMean /= N;
  const circularity = clamp((rMax / (rMean + 1e-4) - 6) / 30);
  const circleCenter = { x: (rIdx % w) / w, y: ((rIdx / w) | 0) / h };

  // ── smoothness of gradients vs texture ─────────────────────
  // smooth = there are gradients (not flat) but little high-frequency detail
  const lowG = blur(L, w, h, 3, 2);
  let tonalRange = 0;
  { let mn = 1, mx = 0; for (let i = 0; i < N; i++) { mn = Math.min(mn, lowG[i]); mx = Math.max(mx, lowG[i]); } tonalRange = mx - mn; }
  const smoothness = clamp((1 - detail * 1.4) * clamp(tonalRange * 2.5) * (1 - flatness * 0.8));

  // ── structure tensor: directional flow / motion blur ───────
  const Jxx = new Float32Array(N), Jyy = new Float32Array(N), Jxy = new Float32Array(N);
  for (let i = 0; i < N; i++) { Jxx[i] = Gx[i] * Gx[i]; Jyy[i] = Gy[i] * Gy[i]; Jxy[i] = Gx[i] * Gy[i]; }
  const Bxx = blur(Jxx, w, h, 5, 1), Byy = blur(Jyy, w, h, 5, 1), Bxy = blur(Jxy, w, h, 5, 1);
  let cohSum = 0, cohW = 0, gxx = 0, gyy = 0, gxy = 0, flowArea = 0;
  for (let i = 0; i < N; i++) {
    const tr = Bxx[i] + Byy[i];
    if (tr < 1e-4) continue;
    const det = Math.sqrt((Bxx[i] - Byy[i]) ** 2 + 4 * Bxy[i] ** 2);
    const coh = det / tr;              // (λ1-λ2)/(λ1+λ2)
    const wgt = Math.sqrt(tr);
    cohSum += coh * coh * wgt; cohW += wgt;
    gxx += Bxx[i]; gyy += Byy[i]; gxy += Bxy[i];
    // a pixel inside a field of parallel structure: textured AND oriented
    if (tr > 0.06 && coh > 0.62) flowArea++;
  }
  flowArea /= N;
  const coherence = cohW > 0 ? cohSum / cohW : 0;
  const globalCoh = (gxx + gyy) > 0 ? Math.sqrt((gxx - gyy) ** 2 + 4 * gxy * gxy) / (gxx + gyy) : 0;
  // flow is strong when orientation is locally coherent but NOT made of crisp straight lines
  // Flow = large areas of parallel, streaky structure (hair, fabric, water, motion blur).
  // A clean graphic edge or a smooth sky is "coherent" too, but covers no area.
  // Flat graphics also produce coherent bands around their clean edges → damp by flatness.
  const flow = clamp((flowArea - 0.04) * 3.2 * (1 - lineStrength * 0.6) + globalCoh * 0.2 * clamp(flowArea * 4)) * (1 - flatness) ** 2;
  const flowAngle = 0.5 * Math.atan2(2 * gxy, gxx - gyy) + Math.PI / 2; // along iso-lines

  // ── colour count (4 bits/channel) ──────────────────────────
  const bins = new Uint32Array(4096);
  for (let i = 0; i < N; i++) bins[((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4)]++;
  let colorCount = 0; for (let i = 0; i < 4096; i++) if (bins[i] > N * 0.002 && i !== 0) colorCount++;
  const fewColors = clamp(1 - Math.log2(Math.max(1, colorCount)) / 7.5); // ≤4 colours → ~0.73
  const graphic = (clamp(flatness * 1.3) * 0.6 + fewColors * 0.6) * clamp(contrast * 4.5) * (1 - darkness * 0.6);

  // ── organic subject: warm/skin-ish hues + centre-weighted detail ──
  let skin = 0, centre = 0, border = 0, cN = 0, bN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    const hh = H[i], ss = S[i], vv = L[i];
    if ((hh < 0.11 || hh > 0.95) && ss > 0.15 && ss < 0.7 && vv > 0.2) skin++;
    const dx = x / w - 0.5, dy = y / h - 0.5;
    if (dx * dx + dy * dy < 0.06) { centre += Gm[i]; cN++; } else { border += Gm[i]; bN++; }
  }
  const skinRatio = skin / N;
  const centreFocus = clamp((centre / Math.max(1, cN)) / ((border / Math.max(1, bN)) + 1e-3) - 1);
  const organic = clamp(skinRatio * 2.5) * 0.6 + centreFocus * 0.4;

  // ── palette (seeded k-means in RGB, k=5) ───────────────────
  const palette = kmeansPalette(px, N, 5, seed);

  // ── sequencer grid: GRID_COLS × GRID_ROWS cells ────────────
  const grid = buildGrid(L, S, Gm, w, h, edgeThr);

  // ── maps for the visuals ───────────────────────────────────
  // heightmap: smooth luminance at ≤128px
  const height = blur(L, w, h, 2, 2);
  // flow field (unit vectors along iso-lines, magnitude from local gradient strength)
  const flowField = buildFlowField(Bxx, Byy, Bxy, Gx, Gy, w, h);
  // edge weights for particle spawning
  const edgeMap = Gm;

  return {
    signature, seed,
    width: w, height: h,
    features: {
      brightness, contrast, saturation, hue, hueConcentration,
      edgeDensity, detail, flatness,
      lineStrength, lineCount: lines.length, hvRatio, hvLine, lineOrientation,
      pointCount, pointSpread: spread, pointScore, darkness,
      circularity, circleCenter,
      smoothness, tonalRange,
      coherence, flow, flowAngle, flowArea,
      colorCount, fewColors, graphic,
      skinRatio, organic, centreFocus,
      // face fields are filled by face.js
      face: 0, faceSize: 0, faceBox: null,
    },
    points: points.slice(0, 24).map(p => ({ x: p.x, y: p.y, peak: p.peak, area: p.area })),
    palette, grid,
    maps: { L, height, Gm: edgeMap, flowField, pixels: px },
  };
}

/** Small bright blobs on a darker surround, found at ≤ 512 px. */
function detectPoints(src) {
  const cv = rasterize(src, 512);
  const w = cv.width, h = cv.height, N = w * h;
  const px = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const L = new Float32Array(N);
  for (let i = 0; i < N; i++) L[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
  const Lb = blur(L, w, h, 6, 2);
  const mark = new Uint8Array(N);
  const maxArea = Math.max(12, N * 0.0005);
  const points = [];
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    if (mark[i] || L[i] < 0.4 || L[i] - Lb[i] < 0.24 || Lb[i] > 0.3) continue;
    // flood fill the blob, luminance-weighted centroid
    let area = 0, sx = 0, sy = 0, sw = 0, peak = 0, x0 = x, x1 = x, y0 = y, y1 = y;
    const stack = [i]; mark[i] = 1;
    while (stack.length && area <= maxArea * 2) {
      const j = stack.pop(); const jx = j % w, jy = (j / w) | 0;
      area++; sx += jx * L[j]; sy += jy * L[j]; sw += L[j]; peak = Math.max(peak, L[j]);
      x0 = Math.min(x0, jx); x1 = Math.max(x1, jx); y0 = Math.min(y0, jy); y1 = Math.max(y1, jy);
      for (const n of [j - 1, j + 1, j - w, j + w]) {
        if (n < 0 || n >= N || mark[n]) continue;
        if (L[n] - Lb[n] > 0.1 && L[n] > 0.2) { mark[n] = 1; stack.push(n); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const compact = Math.max(bw, bh) <= 3 * Math.min(bw, bh) + 1;   // a point, not a line fragment
    if (area <= maxArea && compact) points.push({ x: (sx / sw + 0.5) / w, y: (sy / sw + 0.5) / h, area, peak });
  }
  return points;
}

function kmeansPalette(px, N, k, seed) {
  // sample ≤ 2000 pixels deterministically
  const step = Math.max(1, Math.floor(N / 2000));
  const pts = [];
  for (let i = (seed % step); i < N; i += step) pts.push([px[i * 4], px[i * 4 + 1], px[i * 4 + 2]]);
  // init: spread over sorted luminance
  pts.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  let cents = []; for (let j = 0; j < k; j++) cents.push(pts[Math.floor((j + 0.5) / k * pts.length)].slice());
  const counts = new Array(k).fill(0);
  for (let it = 0; it < 8; it++) {
    const sums = cents.map(() => [0, 0, 0]); counts.fill(0);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const d = (p[0] - cents[j][0]) ** 2 + (p[1] - cents[j][1]) ** 2 + (p[2] - cents[j][2]) ** 2; if (d < bd) { bd = d; bi = j; } }
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    cents = cents.map((c, j) => counts[j] ? sums[j].map(s => s / counts[j]) : c);
  }
  return cents.map((c, j) => ({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255, weight: counts[j] / pts.length }))
    .sort((a, b) => b.weight - a.weight);
}

function buildGrid(L, S, Gm, w, h, edgeThr) {
  const C = GRID_COLS, R = GRID_ROWS;
  const lum = new Float32Array(C * R), edge = new Float32Array(C * R), sat = new Float32Array(C * R);
  const cnt = new Float32Array(C * R);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = Math.min(C - 1, Math.floor(x / w * C)), r = Math.min(R - 1, Math.floor(y / h * R));
    const i = y * w + x, g = r * C + c;
    lum[g] += L[i]; sat[g] += S[i]; edge[g] += Gm[i] > edgeThr ? 1 : Gm[i] / edgeThr * 0.3; cnt[g]++;
  }
  for (let g = 0; g < C * R; g++) { const n = Math.max(1, cnt[g]); lum[g] /= n; sat[g] /= n; edge[g] /= n; }
  return { cols: C, rows: R, lum, edge, sat };
}

function buildFlowField(Bxx, Byy, Bxy, Gx, Gy, w, h) {
  const FW = 48, FH = Math.max(8, Math.round(48 * h / w));
  const fx = new Float32Array(FW * FH), fy = new Float32Array(FW * FH);
  const sGx = blur(Gx, w, h, 3, 1), sGy = blur(Gy, w, h, 3, 1);
  let maxM = 1e-6;
  for (let j = 0; j < FH; j++) for (let i = 0; i < FW; i++) {
    const x = Math.min(w - 1, Math.floor((i + 0.5) / FW * w)), y = Math.min(h - 1, Math.floor((j + 0.5) / FH * h));
    const k = y * w + x;
    // dominant orientation from the structure tensor, perpendicular → along structures
    const ang = 0.5 * Math.atan2(2 * Bxy[k], Bxx[k] - Byy[k]) + Math.PI / 2;
    let vx = Math.cos(ang), vy = Math.sin(ang);
    // pick a consistent sign: rotate the smoothed gradient by +90°
    const tx = -sGy[k], ty = sGx[k];
    if (vx * tx + vy * ty < 0) { vx = -vx; vy = -vy; }
    const m = Math.sqrt(Bxx[k] + Byy[k]);
    fx[j * FW + i] = vx * m; fy[j * FW + i] = vy * m;
    maxM = Math.max(maxM, m);
  }
  // normalise magnitudes, keep a minimum drift so particles never stall
  for (let i = 0; i < FW * FH; i++) {
    const m = Math.hypot(fx[i], fy[i]) || 1e-6;
    const mag = 0.35 + 0.65 * Math.sqrt(m / maxM);
    fx[i] = fx[i] / m * mag; fy[i] = -(fy[i] / m * mag); // flip y: image down → world up
  }
  return { w: FW, h: FH, fx, fy };
}
