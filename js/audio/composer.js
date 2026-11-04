// ─────────────────────────────────────────────────────────────
//  composer.js — the piece. Round 5: from a scan to a performance.
//
//  READING    the photo becomes the map; the scan line passes once and
//             what it hears (edge clicks, read-head ticks) is RECORDED
//  AWAKENING  the scan ends; near silence; then the first heartbeat
//  LIFE       the map comes alive (organism.js). Systems enter one by one:
//               HEART         the focal point beats (sub lub-dub)
//               NERVES        impulses from the heart run along a growing
//                             network; each arrival clicks — path length =
//                             timing, so the rhythm is the image's geometry
//               PEAKS         the other summits awaken and pulse in their
//                             own periods (a polyrhythm from the topography)
//               INTERFERENCE  where two waves meet: an accent
//               MEMORY        re-sequenced fragments of what the scan heard
//               KICK          where the heart and a peak coincide
//               EROSION       late: light drains downhill, ticks on arrival
//             + SUPERPOSITION (2–3×): the heart holds its breath, ghost
//               states flicker, they collapse on a strong beat
//  DECAY      overload and erosion: peaks fall asleep, nerves die from the
//             leaves inward, the rhythm fragments, one low tone
//  END        the crash (the only full-screen flash), then nothing
//  Palette: sub pressure, low sines, clicks, gated noise, glitches —
//  no pitched blips, no round bass, no hiss beds, no bright tones.
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts, clamp } from '../rng.js';
import { GC, GR } from '../map.js';
import { buildOrganism } from '../organism.js';

export const STEPS = 16;
export const LAYERS = ['HEART', 'PEAKS', 'NERVES', 'INTERFERENCE', 'MEMORY', 'EROSION', 'KICK', 'SUB', 'HUM', 'RESONANCE', 'SCANNER', 'CLICK', 'NOISE', 'GLITCH', 'TONE', 'CRASH'];
const LAYER_OF = { heart: 'HEART', peak: 'PEAKS', nerve: 'NERVES', interf: 'INTERFERENCE', memory: 'MEMORY', erode: 'EROSION', kick: 'KICK', sub: 'SUB', hum: 'HUM', res: 'RESONANCE', scanner: 'SCANNER', click: 'CLICK', noise: 'NOISE', glitch: 'GLITCH', tone: 'TONE', crash: 'CRASH' };
export const layerOf = (type) => LAYER_OF[type];
export const MAX_LAYERS = 6;
const HELD = ['sub', 'hum', 'res', 'tone'];

export class Composer {
  constructor(analysis, map) {
    this.a = analysis; this.f = analysis.features; this.map = map; this.P = map.params;
    this.seed = analysis.seed;
    this.org = buildOrganism(map, analysis);
    this.planArc();
    // what the scan hears while reading is recorded: the material of MEMORY
    this.rec = [];
    for (let b = 0; b < this.sections[0].bars; b++) {
      const evs = this.compose(b).filter((e) => e.type === 'click' || e.type === 'scanner');
      if (evs.length >= 2) this.rec.push({ bar: b, evs: evs.map((e) => ({ step: e.step, x: e.x, y: e.y, vel: e.vel, variant: e.variant ?? (e.type === 'scanner' ? 1 : 0) })) });
    }
  }

  planArc() {
    const f = this.f, rng = makeRng(this.seed ^ 0x4a7c);
    const len = {
      READING: 14 + 2 * Math.round(rng() * 2 + (1 - f.brightness)),
      AWAKENING: 3,
      LIFE: 40 + 4 * Math.round(clamp(f.edgeDensity * 1.5 + rng() * 0.8) * 3),
      DECAY: 12 + 2 * Math.round(rng() * 2),
      END: 3,
    };
    this.sections = []; let start = 0;
    for (const name of ['READING', 'AWAKENING', 'LIFE', 'DECAY', 'END']) { this.sections.push({ name, start, bars: len[name] }); start += len[name]; }
    this.loopBars = start;
    const [R, A, L, Dc, E] = this.sections;
    Object.assign(this, { R, A, L, Dc, endBar: E.start });
    // superposition: two in LIFE, sometimes a third early in DECAY
    this.superBars = new Set([L.start + Math.round(L.bars * 0.44), L.start + Math.round(L.bars * 0.8)]);
    if (rng() < 0.6) this.superBars.add(Dc.start + 3);
    const o = this.org;
    for (const p of o.peaks) { p.awakeBar = L.start + Math.round(p.awake * L.bars); p.sleepBar = Dc.start + Math.round(p.sleep * Dc.bars); }
    for (const n of o.nodes) { n.birthBar = L.start + Math.round(n.birth * L.bars); n.deathBar = Dc.start + Math.round(n.death * Dc.bars); }
  }

  sectionAt(loopBar) {
    for (let i = this.sections.length - 1; i >= 0; i--) { const s = this.sections[i]; if (loopBar >= s.start) return { index: i, ...s, barInSection: loopBar - s.start }; }
    return { index: 0, ...this.sections[0], barInSection: 0 };
  }

  /** The scan line: one sweep, left → right, during READING; afterwards it rests and fades. */
  scanAt(loopBarF) {
    const R = this.R, ph = clamp(loopBarF / R.bars);
    return { x: ph, sweep: 0, mapping: loopBarF < R.bars, reveal: ph, alpha: 1 - clamp((loopBarF - R.bars) / 1.5) };
  }

  /** How alive the map is (0..1): drives line intensity, colour, energy. */
  energyAt(lb) {
    const { R, A, L, Dc } = this;
    if (lb < R.start + R.bars) return 0.15;
    if (lb < L.start) return 0.06;
    if (lb < Dc.start) return 0.25 + 0.75 * clamp((lb - L.start) / (L.bars * 0.75));
    return 0.6 * (1 - clamp((lb - Dc.start) / Dc.bars));
  }

  bar(barIndex) {
    this.cache = this.cache || new Map();
    if (this.cache.has(barIndex)) return this.cache.get(barIndex);
    const ev = this.compose(barIndex);
    this.cache.set(barIndex, ev);
    if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value);
    return ev;
  }

  // ── the systems as pure functions of the (loop) bar ─────────
  /** The heart: lub-dub. Returns [{ step, vel, lub }] within bar b. */
  heart(b) {
    const { A, L, Dc } = this;
    if (this.superBars.has(b)) return [];                                   // it holds its breath
    if (b === A.start + A.bars - 1) return [{ step: 8, vel: 0.95, lub: true }, { step: 11, vel: 0.55, lub: false }];   // the first heartbeat
    if (b >= L.start && b < Dc.start) {
      const g = (b - L.start) / L.bars, out = [{ step: 0, vel: 0.85, lub: true }, { step: 3, vel: 0.5, lub: false }];
      if (g >= 0.3) out.push({ step: 8, vel: 0.68, lub: true }, { step: 11, vel: 0.4, lub: false });
      return out;
    }
    if (b >= Dc.start && b < this.endBar) {
      const p = (b - Dc.start) / Dc.bars, r = makeRng(hashInts(this.seed, b, 77));
      if (p < 0.35) return [{ step: 0, vel: 0.8 - p, lub: true }, { step: 3, vel: 0.45 - p * 0.5, lub: false }];
      if (p < 0.7) return (b % 2 === 0) ? [{ step: 0, vel: 0.55, lub: true }, { step: 5, vel: 0.3, lub: false }] : [];
      return r() < 0.4 ? [{ step: Math.floor(r() * 8), vel: 0.4, lub: true }] : [];
    }
    return [];
  }
  /** Peak pulses within bar b: [{ step, peak }]. Periods run in a 2-bar cycle so they lock into a groove. */
  peakPulses(b) {
    const out = [], L = this.L;
    if (b < L.start || b >= this.endBar || this.superBars.has(b)) return out;
    const half = (b - L.start) % 2;
    for (const p of this.org.peaks) {
      if (b < p.awakeBar || b >= p.sleepBar) continue;
      for (let s = p.phase; s < 32; s += p.period) if (Math.floor(s / 16) === half) out.push({ step: s % 16, peak: p });
    }
    return out;
  }
  /** Heart impulses launched in bar b (global steps), each numbered. */
  launches(b) { return this.heart(b).filter((h) => h.lub).map((h) => ({ S: b * STEPS + h.step, n: b * 2 + (h.step >= 8 ? 1 : 0) })); }
  /** Erosion streams launched in bar b. */
  drains(b) {
    const { L, Dc } = this, out = [];
    if (b < L.start || b >= this.endBar || !this.org.streams.length) return out;
    const g = (b - L.start) / L.bars, r = makeRng(hashInts(this.seed, b, 91));
    let n = 0;
    if (b < Dc.start) n = g >= 0.75 && (b - L.start) % 2 === 0 ? 1 : 0;
    else n = 1 + Math.floor(((b - Dc.start) / Dc.bars) * 2.5);
    for (let i = 0; i < n; i++) { const k = Math.floor(r() * this.org.streams.length); out.push({ step: Math.floor(r() * 12), k, st: this.org.streams[k] }); }
    return out;
  }

  compose(barIndex) {
    const loop = Math.floor(barIndex / this.loopBars), b = barIndex % this.loopBars;
    const sec = this.sectionAt(b), name = sec.name, sb = sec.barInSection, prog = sb / sec.bars;
    const rng = makeRng(hashInts(this.seed, b, loop % 4, 11));
    const M = this.map, P = this.P, root = P.root, O = this.org;
    const out = [];
    const push = (step, type, o = {}) => out.push({ step, type, ...o });
    const pan = (x) => clamp(x * 1.8 - 0.9, -0.9, 0.9);
    const T = M.thr;

    if (name === 'END') { if (sb === 0) push(0, 'crash', { x: 0.5, y: 0.5, vel: 1 }); return out; }
    if (name === 'READING') return this.reading(b, sb, prog, rng, pan);

    const g = name === 'LIFE' ? prog : name === 'DECAY' ? 1 : 0;      // growth of the organism
    const dp = name === 'DECAY' ? prog : 0;                              // decay progress
    const F = O.heart;

    // ── AWAKENING: the scan ends, near silence, a breath, then the first heartbeat ──
    if (name === 'AWAKENING') {
      if (sb === 0) {
        push(0, 'sub', { freq: root, to: root * 0.94, dur: 2.5, vel: 0.14, x: F.x, y: F.y });
        [0, 5, 13].forEach((s, i) => push(s, 'scanner', { ticks: 2 - (i > 1), gap: 0.006, freq: 2400, vel: 0.06 * (1 - i * 0.3), pan: 0.6, x: 1, y: 0.3 + i * 0.2 }));   // the last echoes of the read head
      }
      if (sb === 1) push(4, 'hum', { freq: root * 2, dur: 3, vel: 0.03, x: F.x, y: F.y });
    }

    // ── HEART ──
    for (const h of this.heart(b)) push(h.step, 'heart', { vel: h.vel, lub: h.lub, freq: root, x: F.x, y: F.y });

    // ── PEAKS: the polyrhythm of the topography; a KICK where a peak meets the heart ──
    const beats = this.heart(b), pulses = this.peakPulses(b);
    let kicks = 0;
    for (const { step, peak } of pulses) {
      if (dp > 0 && rng() < dp * 0.5) continue;                       // the rhythm fragments
      push(step, 'peak', { vel: 0.2 + 0.18 * peak.h, freq: root * peak.ratio, x: peak.x, y: peak.y, id: peak.id, period: peak.period });
      if (b === peak.awakeBar && step === pulses.find((q) => q.peak === peak).step) push(step, 'awake', { x: peak.x, y: peak.y, id: peak.id, period: peak.period });
      if (name === 'LIFE' && g >= 0.45 && g < 0.92 && kicks < 2 && beats.some((h) => h.lub && h.step === step)) {
        push(step, 'kick', { vel: 0.7 + 0.2 * peak.h, decay: P.kickDecay, x: peak.x, y: peak.y }); kicks++;
      }
    }

    // ── NERVES: impulses from the heart reach the grown nodes; arrival = path length ──
    const arr = new Map();
    for (let pb = b - 2; pb <= b; pb++) {
      if (pb < 0) continue;
      for (const L0 of this.launches(pb)) {
        O.nodes.forEach((n, i) => {
          if (i === 0 || pb < n.birthBar || b >= n.deathBar || L0.n % n.every) return;
          const S = L0.S + n.arrive, step = S - b * STEPS;
          if (step < 0 || step >= STEPS) return;
          const prev = arr.get(step);
          const w = (n.kind === 'peak' ? 2 : n.kind === 'ridge' ? 1.5 : 1) + n.e;
          if (!prev || w > prev.w) arr.set(step, { n, i, w, launch: L0.n });
        });
      }
    }
    const maxN = 2 + Math.round(clamp(g / 0.8) * 7);
    const nerveSteps = [...arr.entries()].sort((a, c) => c[1].w - a[1].w).slice(0, maxN);
    let glitches = 0;
    for (const [step, { n, i, launch }] of nerveSteps) {
      if (dp > 0 && rng() < dp * 0.55) continue;
      const st = Math.max(0, step + n.micro), x = n.x, y = n.y;
      if (n.leaf && n.e > T.glitch && launch % 4 === 0 && glitches < 1 && g > 0.3) {
        push(st, 'glitch', { vel: 0.6, x, y, pan: pan(x), row: Math.floor(y * 31), node: i }); glitches++;
      } else if (n.kind === 'tex') {
        push(st, 'nerve', { kind: 'tex', vel: 0.16 + 0.2 * clamp(n.tex * 2), freq: 1800 * Math.pow(2, (n.h || 0.5) * 1.6), x, y, pan: pan(x), node: i });
      } else {
        push(st, 'nerve', { kind: n.kind, vel: 0.22 + 0.4 * clamp(n.e), variant: n.kind === 'ridge' || n.kind === 'peak' ? 3 : (i % 2 ? 2 : 0), crush: n.depth > 3, x, y, pan: pan(x), node: i });
      }
    }

    // ── INTERFERENCE: where the waves of two sources meet ──
    const src = [];
    for (let pb = b - 2; pb <= b; pb++) {
      if (pb < 0) continue;
      for (const h of this.heart(pb)) if (h.lub) src.push({ S: pb * STEPS + h.step, p: F, k: -1, s: 1 });
      for (const q of this.peakPulses(pb)) src.push({ S: pb * STEPS + q.step, p: q.peak, k: q.peak.id, s: 0.6 });
    }
    const meets = [];
    for (let i = 0; i < src.length; i++) for (let j = i + 1; j < src.length; j++) {
      const A = src[i], B = src[j];
      if (A.k === B.k || Math.abs(A.S - B.S) > 10) continue;
      const d = O.dist(A.p, B.p), s = (d + O.waveV * (B.S - A.S)) / 2;
      if (s <= 0.02 || s >= d - 0.02 || s > O.waveR * 0.8 || d - s > O.waveR * 0.8) continue;
      const tS = A.S + s / O.waveV, step = Math.round(tS) - b * STEPS;
      if (step < 0 || step >= STEPS) continue;
      const u = s / d;
      meets.push({ step, x: A.p.x + (B.p.x - A.p.x) * u, y: A.p.y + (B.p.y - A.p.y) * u, ang: Math.atan2(B.p.y - A.p.y, (B.p.x - A.p.x) * O.ia), w: A.s * B.s * (1 - s / O.waveR) });
    }
    meets.sort((a, c) => c.w - a.w);
    const usedI = [];
    for (const m of meets) {
      if (usedI.length >= (g > 0.5 ? 2 : 1) || usedI.some((s) => Math.abs(s - m.step) < 3)) continue;
      if (dp > 0 && rng() < dp * 0.6) continue;
      usedI.push(m.step);
      push(m.step, 'interf', { vel: 0.3 + 0.25 * m.w, x: m.x, y: m.y, ang: m.ang, pan: pan(m.x), freq: 1200 + 1800 * heightAt(M, m.x, m.y) });
    }

    // ── MEMORY: re-sequenced fragments of what the scan heard ──
    const memOn = (name === 'LIFE' && g >= 0.3 && ((sb % 4 === 2) || (g > 0.6 && sb % 2 === 0))) || (name === 'DECAY' && dp < 0.7 && sb % 3 === 1);
    if (memOn && this.rec.length && rng() < 0.8) {
      const R = this.rec[Math.floor(rng() * this.rec.length)];
      const mode = Math.floor(rng() * 3);           // 0 rotate, 1 reverse, 2 half-bar stutter
      const rot = 2 + Math.floor(rng() * 12);
      let evs = R.evs.map((e) => ({ ...e, step: mode === 0 ? (e.step + rot) % 16 : mode === 1 ? 15.5 - e.step : e.step % 8 }));
      if (mode === 2) evs = evs.concat(evs.map((e) => ({ ...e, step: e.step + 8 })));
      evs = evs.filter((e) => e.step >= 0 && e.step < 16).slice(0, 6);
      evs.forEach((e, i) => push(e.step, 'memory', { vel: 0.16 + 0.2 * (e.vel || 0.5), variant: e.variant, crush: true, x: e.x, y: e.y, pan: pan(e.x), rec: R.bar, first: i === 0, row: Math.floor((e.y || 0.5) * 31) }));
    }

    // ── EROSION: light drains downhill; fine ticks where it arrives ──
    for (const d of this.drains(b)) push(d.step, 'drain', { k: d.k, steps: d.st.steps, x: d.st.from.x, y: d.st.from.y });
    for (let pb = b - 2; pb <= b; pb++) {
      if (pb < 0) continue;
      for (const d of this.drains(pb)) {
        const step = pb * STEPS + d.step + d.st.steps - b * STEPS;
        if (step < 0 || step >= STEPS) continue;
        push(step, 'erode', { n: 2 + Math.floor(rng() * 3), vel: 0.08 + 0.06 * rng(), x: d.st.end.x, y: d.st.end.y, pan: pan(d.st.end.x), k: d.k });
        if (name === 'DECAY' && d.st.endH < T.valley && rng() < 0.3) push(step, 'res', { freq: root * (3 + Math.floor(d.st.endH * 4)), dur: 2, vel: 0.04, x: d.st.end.x, y: d.st.end.y });
      }
    }

    // ── SUPERPOSITION: the heart holds its breath, ghost states flicker; collapse on a strong beat ──
    if (this.superBars.has(b)) push(0, 'superpose', { x: F.x, y: F.y, bars: 1 });
    if (this.superBars.has(b - 1)) {
      push(0, 'kick', { vel: 1, decay: P.kickDecay * 1.2, x: F.x, y: F.y, collapse: true });
      push(0, 'glitch', { vel: 0.8, x: F.x, y: F.y, pan: 0, row: Math.floor(F.y * 31), collapse: true });
    }

    // ── atmosphere ──
    if (name === 'LIFE' && g < 0.35 && sb % 4 === 0) push(0, 'hum', { freq: root * 2, dur: 4, vel: 0.028, x: F.x, y: F.y });
    if (name === 'DECAY') {
      if (sb % 2 === 0) push(0, 'sub', { freq: root, to: root * (1 - 0.12 * dp - 0.06), dur: 2, vel: 0.2 * (1 - dp * 0.7), x: F.x, y: F.y });
      if (sb === 1) push(0, 'tone', { freqs: [root * 2, root * 3], dur: 4, vel: 0.1, x: F.x, y: F.y });
      if (sb === 5) push(0, 'hum', { freq: root * 2, dur: 4, vel: 0.03, x: F.x, y: F.y });
      if (dp > 0.25 && dp < 0.85) {                                   // overload: rough places break off in bursts
        const texN = O.nodes.filter((n) => n.kind === 'tex' || n.kind === 'edge');
        for (let i = 0; i < 2; i++) if (texN.length && rng() < 0.6) { const n = texN[Math.floor(rng() * texN.length)]; push(Math.floor(rng() * 16), 'noise', { vel: 0.12 + 0.15 * rng(), dur: 0.012 + rng() * 0.03, freq: 900 * Math.pow(2, n.h * 2.5), q: 4 + rng() * 8, pan: pan(n.x), x: n.x, y: n.y }); }
      }
    }

    return this.budget(out, name === 'DECAY' || g > 0.75);
  }

  /** READING: the scan line listens (as in round 4's MAPPING) — sub, edge clicks, the read head. */
  reading(b, sb, prog, rng, pan) {
    const M = this.map, P = this.P, T = M.thr, root = P.root, out = [];
    const push = (step, type, o = {}) => out.push({ step, type, ...o });
    const cols = [];
    for (let i = 0; i < STEPS; i++) { const s = this.scanAt(b + i / STEPS); const c = Math.min(GC - 1, Math.floor(s.x * GC)); cols.push({ ...M.col[c], c, sx: s.x }); }
    const prevCol = (i) => (i > 0 ? cols[i - 1] : M.col[Math.min(GC - 1, Math.floor(this.scanAt(Math.max(0, b - 1 / STEPS)).x * GC))]);
    const meanH = cols.reduce((s, c) => s + c.hMean, 0) / STEPS;
    if (sb >= 4 && b % 2 === 0) push(0, 'sub', { freq: root * (meanH > 0.62 ? 9 / 8 : meanH < 0.3 ? 3 / 4 : 1), dur: 2, vel: 0.1 + 0.1 * prog, x: cols[0].sx, y: cols[0].yMax });
    for (let i = 0; i < STEPS; i++) {                                    // the read head enters a column
      const c = cols[i];
      if (c.c === prevCol(i).c) continue;
      const lum = M.grid.lum[Math.floor(c.yEdge * GR) * GC + c.c] || 0.5;
      push(i + (rng() < 0.3 ? 0.5 : 0), 'scanner', { ticks: 1 + Math.round(clamp(c.eMax) * 3), gap: 0.004 + rng() * 0.005, freq: 1500 * Math.pow(2, lum * 2.2), vel: 0.07 + 0.08 * clamp(c.eMax), crush: rng() < 0.25, pan: pan(c.x) * 0.7, x: c.x, y: c.yEdge });
    }
    let nClick = 0;
    for (let i = 0; i < STEPS; i++) {                                    // hard edges
      const c = cols[i], p = prevCol(i);
      if (!(c.eMax > T.edge && c.c !== p.c && (c.eMax - p.eMax > 0.02 || rng() < 0.25))) continue;
      if (nClick < 3 && rng() < 0.45 * P.density) { push(i, 'click', { vel: 0.3 + 0.6 * clamp(c.eMax), pan: pan(c.x), x: c.x, y: c.yEdge, variant: Math.floor((c.sat || 0) * 3.99) }); nClick++; }
    }
    if (sb % 4 === 3) {                                                  // valleys ring softly
      const v = cols.find((c) => c.hMean < T.valley * 1.15 && c.eMax < T.edge);
      if (v && rng() < 0.6) push(cols.indexOf(v), 'res', { freq: root * [3, 4, 5, 6, 8][Math.min(4, Math.floor(v.hMean * 5))], dur: 2, vel: 0.04, x: v.x, y: v.yMax });
    }
    if (sb === this.R.bars - 1) return out.filter((e) => HELD.includes(e.type) || e.step < 12).sort((a, c) => a.step - c.step);
    return out.sort((a, c) => a.step - c.step);
  }

  /** Soft layer budget: at most MAX_LAYERS sound layers start in one bar (visual-only events always pass). */
  budget(out, late) {
    const PRI = late
      ? ['CRASH', 'TONE', 'HEART', 'KICK', 'EROSION', 'NERVES', 'PEAKS', 'GLITCH', 'INTERFERENCE', 'MEMORY', 'SUB', 'NOISE', 'RESONANCE', 'HUM', 'SCANNER', 'CLICK']
      : ['CRASH', 'TONE', 'HEART', 'KICK', 'NERVES', 'PEAKS', 'INTERFERENCE', 'GLITCH', 'MEMORY', 'EROSION', 'SCANNER', 'CLICK', 'SUB', 'NOISE', 'RESONANCE', 'HUM'];
    let kept = out;
    const present = PRI.filter((L) => kept.some((e) => LAYER_OF[e.type] === L));
    if (present.length > MAX_LAYERS) { const ok = new Set(present.slice(0, MAX_LAYERS)); kept = kept.filter((e) => !LAYER_OF[e.type] || ok.has(LAYER_OF[e.type])); }
    return kept.sort((a, c) => a.step - c.step);
  }
}

function heightAt(map, x, y) {
  const xi = Math.min(map.width - 1, Math.max(0, Math.floor(x * map.width))), yi = Math.min(map.height - 1, Math.max(0, Math.floor(y * map.height)));
  return map.H[yi * map.width + xi];
}
