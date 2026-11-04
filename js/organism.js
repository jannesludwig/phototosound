// ─────────────────────────────────────────────────────────────
//  organism.js — the living map. Everything phase 2 (LIFE) does is
//  derived here from the sound map, so the rhythm comes out of the
//  geometry of the photograph:
//    heart    the focal point (an eye, a light, the most salient place):
//             the epicenter of everything
//    peaks    the other summits; each pulses in its own period, from its
//             height (higher → slower, heavier) and position (phase)
//    nerves   a tree of circuit traces grown from the heart, linking
//             peaks, ridges, hard edges and rough places; the path length
//             to a node = when an impulse from the heart arrives there
//    streams  downhill paths from peaks/ridges into valleys (erosion)
//  Distances are in image heights (x scaled by the aspect ratio).
// ─────────────────────────────────────────────────────────────
import { makeRng, clamp } from './rng.js';
import { GC, GR } from './map.js';

export const WAVE_V = 0.03;      // heart/peak waves: image heights per 16th step
export const WAVE_R = 0.55;      // a wave dies out at this radius
const PERIODS = [5, 6, 7, 9, 10, 11, 12, 14];   // peak periods in 16ths, inside a 2-bar (32-step) cycle

export function buildOrganism(map, analysis) {
  const rng = makeRng(analysis.seed ^ 0x51f3);
  const f = analysis.features, g = map.grid, T = map.thr;
  const ia = map.width / map.height;
  const D = (a, b) => Math.hypot((a.x - b.x) * ia, a.y - b.y);
  const at = (arr, c, r) => arr[Math.max(0, Math.min(GR - 1, r)) * GC + Math.max(0, Math.min(GC - 1, c))];
  const cellPt = (c, r) => ({ x: (c + 0.5) / GC, y: (r + 0.5) / GR });
  const heart = { x: map.focal.x, y: map.focal.y, kind: map.focal.kind };

  // ── peaks: local maxima, away from the heart and from each other ──
  const cand = [];
  for (let r = 1; r < GR - 1; r++) for (let c = 1; c < GC - 1; c++) {
    const v = at(g.h, c, r); let top = true;
    for (let dr = -2; dr <= 2 && top; dr++) for (let dc = -2; dc <= 2; dc++) if ((dr || dc) && at(g.h, c + dc, r + dr) > v) { top = false; break; }
    if (top) cand.push({ ...cellPt(c, r), h: v, c, r });
  }
  cand.sort((a, b) => b.h - a.h);
  const nPeaks = 3 + Math.round(clamp(map.params.ridged + rng() * 0.6) * 2);       // 3–5
  const peaks = [];
  for (const minD of [0.16, 0.1, 0.06]) {
    for (const p of cand) if (peaks.length < nPeaks && D(p, heart) > minD && peaks.every((q) => D(p, q) > minD)) peaks.push(p);
    if (peaks.length >= nPeaks) break;
  }
  peaks.sort((a, b) => D(a, heart) - D(b, heart));                                  // the nearest awaken first
  const used = new Set();
  peaks.forEach((p, i) => {
    let k = Math.min(PERIODS.length - 1, Math.floor(clamp(p.h * 0.7 + p.y * 0.3) * PERIODS.length));
    while (used.has(PERIODS[k]) && used.size < PERIODS.length) k = (k + 1) % PERIODS.length;
    used.add(PERIODS[k]);
    p.id = i; p.period = PERIODS[k];
    p.phase = Math.floor(p.x * 31) % p.period;
    p.awake = 0.2 + 0.4 * (i / Math.max(1, peaks.length - 1));                     // fraction of LIFE
    p.sleep = 0.15 + 0.6 * (1 - i / Math.max(1, peaks.length - 1));                   // fraction of DECAY (last awake → first asleep)
    p.ratio = 1.5 + Math.round((1 - p.h) * 3) * 0.5;                                  // its low pitch (× root)
  });

  // ── nerve nodes: hard edges, ridges, rough places, the peaks ──
  const nodes = [{ ...heart, kind: 'heart', h: 1, e: 0 }];
  const far = (p, minD) => nodes.every((q) => D(p, q) > minD);
  const add = (p, kind) => nodes.push({ ...p, kind, h: at(g.h, p.c, p.r), e: at(g.edge, p.c, p.r), tex: at(g.tex, p.c, p.r) });
  for (const p of peaks) add(p, 'peak');
  const cells = [];
  for (let r = 1; r < GR - 1; r++) for (let c = 1; c < GC - 1; c++) cells.push({ ...cellPt(c, r), c, r, e: at(g.edge, c, r), t: at(g.tex, c, r), h: at(g.h, c, r) });
  const nEdge = 10 + Math.round(clamp(f.edgeDensity * 2) * 10), nRidge = 6, nTex = 4;
  let k = 0;
  for (const p of cells.slice().sort((a, b) => b.e - a.e)) { if (k >= nEdge) break; if (far(p, 0.065)) { add(p, 'edge'); k++; } }
  k = 0;
  for (const p of cells.filter((q) => q.h > T.ridge).sort((a, b) => b.h - a.h)) { if (k >= nRidge) break; if (far(p, 0.08)) { add(p, 'ridge'); k++; } }
  k = 0;
  for (const p of cells.slice().sort((a, b) => b.t - a.t)) { if (k >= nTex) break; if (far(p, 0.08)) { add(p, 'tex'); k++; } }

  // ── the tree: grown from the heart (Prim), at most 3 branches per node ──
  const inTree = new Uint8Array(nodes.length), deg = new Uint8Array(nodes.length);
  nodes[0].parent = -1; nodes[0].cum = 0; nodes[0].depth = 0; inTree[0] = 1;
  for (let n = 1; n < nodes.length; n++) {
    let best = null, bd = 1e9;
    for (let i = 0; i < nodes.length; i++) {
      if (!inTree[i] || deg[i] >= (i === 0 ? 4 : 3)) continue;
      for (let j = 0; j < nodes.length; j++) {
        if (inTree[j]) continue;
        const d = D(nodes[i], nodes[j]) * (1 + nodes[i].depth * 0.04);
        if (d < bd) { bd = d; best = [i, j]; }
      }
    }
    if (!best) break;
    const [i, j] = best, P = nodes[i], C = nodes[j];
    // a circuit trace: 45° first, then straight (or the other way round)
    const dX = (C.x - P.x) * ia, dY = C.y - P.y, m = Math.min(Math.abs(dX), Math.abs(dY));
    const diagFirst = rng() < 0.5;
    const M = diagFirst
      ? { x: P.x + Math.sign(dX) * m / ia, y: P.y + Math.sign(dY) * m }
      : { x: C.x - Math.sign(dX) * m / ia, y: C.y - Math.sign(dY) * m };
    C.mid = M; C.parent = i; C.depth = P.depth + 1;
    C.cum = P.cum + D(P, M) + D(M, C);
    inTree[j] = 1; deg[i]++; deg[j]++;
  }
  const tree = nodes.filter((n, i) => inTree[i]);
  const remap = new Map(); nodes.forEach((n, i) => { if (inTree[i]) remap.set(i, tree.indexOf(n)); });
  for (const n of tree) n.parent = n.parent >= 0 ? remap.get(n.parent) : -1;
  // impulse timing: the farthest node is reached after ~22 steps; quantized, with a little micro-timing
  const maxCum = Math.max(1e-3, ...tree.map((n) => n.cum));
  const vN = maxCum / 22;
  const order = tree.map((n, i) => i).sort((a, b) => tree[a].cum - tree[b].cum);
  order.forEach((i, rank) => {
    const n = tree[i];
    const a = n.cum / vN;
    n.arrive = Math.round(a); n.micro = clamp((a - Math.round(a)) * 0.35, -0.2, 0.2);
    n.birth = i === 0 ? 0 : 0.06 + 0.74 * Math.pow((rank - 1) / Math.max(1, tree.length - 2), 1.1);   // fraction of LIFE
    n.every = n.depth <= 2 ? 1 : (n.kind === 'peak' || n.kind === 'ridge') ? 1 : 2;
    n.leaf = !tree.some((q) => q.parent === i);
  });
  order.slice().reverse().forEach((i, rank) => { tree[i].death = i === 0 ? 1 : 0.08 + 0.8 * rank / Math.max(1, tree.length - 1); });  // DECAY: leaves first, the heart last

  // ── erosion streams: steepest descent on the grid, from peaks and ridges into valleys ──
  const starts = [...peaks, ...tree.filter((n) => n.kind === 'ridge' || (n.kind === 'edge' && n.h > 0.55))];
  const streams = [];
  for (const s of starts) {
    let c = Math.min(GC - 1, Math.floor(s.x * GC)), r = Math.min(GR - 1, Math.floor(s.y * GR));
    const pts = [{ x: s.x, y: s.y }];
    for (let n = 0; n < 48; n++) {
      let bc = c, br = r, bh = at(g.h, c, r) - 0.004;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const v = at(g.h, c + dc, r + dr) + rng() * 0.002;
        if (v < bh && c + dc >= 0 && c + dc < GC && r + dr >= 0 && r + dr < GR) { bh = v; bc = c + dc; br = r + dr; }
      }
      if (bc === c && br === r) break;
      c = bc; r = br; pts.push(cellPt(c, r));
    }
    if (pts.length < 4) continue;
    let len = 0; for (let i = 1; i < pts.length; i++) len += D(pts[i - 1], pts[i]);
    const end = pts[pts.length - 1];
    streams.push({ pts, len, steps: Math.max(4, Math.min(32, Math.round(len / 0.012))), from: s, end, endH: at(g.h, Math.floor(end.x * GC), Math.floor(end.y * GR)) });
  }

  return { ia, heart, peaks, nodes: tree, streams, vN, waveV: WAVE_V, waveR: WAVE_R, dist: D };
}
