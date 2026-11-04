// ─────────────────────────────────────────────────────────────
//  composer.js — "The Transmission". One journey in acts.
//
//  (ACT 0 OFFERING happens before the sound: the photo, intact, once.)
//  MEASUREMENT    the scan line measures the terrain once — sparse,
//                 clinical: sub, read-head ticks, clicks on hard edges,
//                 valleys ring (round 4's MAPPING, restored)
//  DECOMPOSITION  the image is split into 2–3 spectra (journey.js); each
//                 has its own sound state from round 3's styles, without
//                 kicks: clicks from the image's columns, data, pulses
//                 and fragments — irregular, experimental
//  ENTROPY        everything at once, densest: click storms, noise,
//                 data fields, glitches, pressure building
//  ABSORPTION     only sub pressure, falling, then silence
//  END            the crash — then nothing (debris)
//  Palette: sub pressure, low/mid sines, clicks, gated noise, data
//  textures, glitches. No beat, no pitched blips, no round bass, no hiss
//  beds, no bright tones.
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts, euclid, clamp } from '../rng.js';
import { GC, GR } from '../map.js';

export const STEPS = 16;
export const LAYERS = ['SUB', 'PULSE', 'PRESSURE', 'HUM', 'RESONANCE', 'CLICK', 'NOISE', 'DATA', 'FIELD', 'SCANNER', 'GLITCH', 'KICK', 'TONE', 'CRASH', 'HAND'];
const LAYER_OF = { sub: 'SUB', pulse: 'PULSE', pressure: 'PRESSURE', hum: 'HUM', res: 'RESONANCE', click: 'CLICK', noise: 'NOISE', data: 'DATA', field: 'FIELD', scanner: 'SCANNER', glitch: 'GLITCH', kick: 'KICK', tone: 'TONE', crash: 'CRASH' };
export const layerOf = (type) => LAYER_OF[type];
export const ACTS = ['OFFERING', 'MEASUREMENT', 'DECOMPOSITION', 'ENTROPY', 'ABSORPTION', 'END'];
const HELD = ['sub', 'hum', 'res', 'tone', 'pressure'];

export class Composer {
  constructor(analysis, map, journey) {
    this.a = analysis; this.f = analysis.features; this.map = map; this.P = map.params; this.J = journey;
    this.seed = analysis.seed;
    this.planArc();
  }

  planArc() {
    const A = this.J.acts;
    this.sections = []; let start = 0;
    for (const name of ['MEASUREMENT', 'DECOMPOSITION', 'ENTROPY', 'ABSORPTION', 'END']) { this.sections.push({ name, start, bars: A[name] }); start += A[name]; }
    this.loopBars = start;
    const [M, D, E, Ab, En] = this.sections;
    Object.assign(this, { M, D, E, Ab, endBar: En.start });
    // the spectra inside DECOMPOSITION
    let s0 = D.start;
    this.spectra = this.J.segs.map((sg, i) => { const o = { ...sg, start: s0, index: i }; s0 += sg.bars; return o; });
    // superposition (the ghosts of the particle field): twice in ENTROPY
    this.superBars = new Set([E.start + Math.round(E.bars * 0.35), E.start + Math.round(E.bars * 0.75)]);
  }

  sectionAt(loopBar) {
    for (let i = this.sections.length - 1; i >= 0; i--) { const s = this.sections[i]; if (loopBar >= s.start) return { index: i, ...s, barInSection: loopBar - s.start }; }
    return { index: 0, ...this.sections[0], barInSection: 0 };
  }
  /** The spectrum (DECOMPOSITION) at a fractional loop bar, or null. */
  spectrumAt(lb) { for (let i = this.spectra.length - 1; i >= 0; i--) if (lb >= this.spectra[i].start && lb < this.E.start) return this.spectra[i]; return null; }

  /** The scan line: one sweep, left → right, over MEASUREMENT. */
  scanAt(lbF) {
    const ph = clamp(lbF / (this.M.bars - 1));
    return { x: ph, sweep: 0, mapping: lbF < this.M.bars, reveal: ph, alpha: 1 - clamp((lbF - (this.M.bars - 1)) / 1.2), dir: 1 };
  }

  energyAt(lb) {
    const { M, D, E, Ab } = this;
    if (lb < D.start) return 0.15 + 0.1 * clamp(lb / M.bars);
    if (lb < E.start) return 0.35 + 0.35 * clamp((lb - D.start) / D.bars);
    if (lb < Ab.start) return 0.75 + 0.25 * clamp((lb - E.start) / E.bars);
    return 0.4 * (1 - clamp((lb - Ab.start) / Ab.bars));
  }

  bar(barIndex) {
    this.cache = this.cache || new Map();
    if (this.cache.has(barIndex)) return this.cache.get(barIndex);
    const ev = this.compose(barIndex);
    this.cache.set(barIndex, ev);
    if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value);
    return ev;
  }

  compose(barIndex) {
    const loop = Math.floor(barIndex / this.loopBars), b = barIndex % this.loopBars;
    const sec = this.sectionAt(b), name = sec.name, sb = sec.barInSection, prog = sb / sec.bars;
    const rng = makeRng(hashInts(this.seed, b, loop % 4, 11));
    const out = [];
    const push = (step, type, o = {}) => out.push({ step, type, ...o });
    const pan = (x) => clamp(x * 1.8 - 0.9, -0.9, 0.9);
    const ctx = { b, sb, prog, rng, push, pan, sec };
    if (name === 'END') { if (sb === 0) push(0, 'crash', { x: this.map.focal.x, y: this.map.focal.y, vel: 1 }); }
    else if (name === 'MEASUREMENT') this.measurement(ctx);
    else if (name === 'DECOMPOSITION') this.decomposition(ctx);
    else if (name === 'ENTROPY') this.entropy(ctx);
    else if (name === 'ABSORPTION') this.absorption(ctx);
    // the bar before a cut breathes: silence after beat 3 (held sounds ring on)
    const nextCut = b + 1 === this.D.start || b + 1 === this.E.start || b + 1 === this.Ab.start || this.spectra.some((x) => x.start === b + 1);
    const kept = nextCut ? out.filter((e) => HELD.includes(e.type) || e.step < 10) : out;
    return this.budget(kept, name === 'ENTROPY' ? 7 : 6);
  }

  // ── ACT 1: MEASUREMENT — round 4's mapping scan, sparse and clinical ──
  measurement({ b, sb, prog, rng, push, pan }) {
    const M = this.map, P = this.P, T = M.thr, root = P.root;
    const cols = [];
    for (let i = 0; i < STEPS; i++) { const s = this.scanAt(b + i / STEPS); const c = Math.min(GC - 1, Math.floor(s.x * GC)); cols.push({ ...M.col[c], c, sx: s.x }); }
    const prevCol = (i) => (i > 0 ? cols[i - 1] : M.col[Math.min(GC - 1, Math.floor(this.scanAt(Math.max(0, b - 1 / STEPS)).x * GC))]);
    const meanH = cols.reduce((s, c) => s + c.hMean, 0) / STEPS;
    if (sb >= 2 && b % 2 === 0) push(0, 'sub', { freq: root * (meanH > 0.62 ? 9 / 8 : meanH < 0.3 ? 3 / 4 : 1), dur: 2, vel: 0.1 + 0.1 * prog, x: cols[0].sx, y: cols[0].yMax });
    for (let i = 0; i < STEPS; i++) {                                    // the read head enters a column
      const c = cols[i];
      if (c.c === prevCol(i).c) continue;
      const lum = M.grid.lum[Math.floor(c.yEdge * GR) * GC + c.c] || 0.5;
      push(i + (rng() < 0.3 ? 0.5 : 0), 'scanner', { ticks: 1 + Math.round(clamp(c.eMax) * 3), gap: 0.004 + rng() * 0.005, freq: 1500 * Math.pow(2, lum * 2.2), vel: 0.06 + 0.07 * clamp(c.eMax), crush: rng() < 0.25, pan: pan(c.x) * 0.7, x: c.x, y: c.yEdge });
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
    if (prog > 0.5 && sb % 4 === 1 && rng() < 0.5) {                     // late: the strongest edge is read out (dial)
      const c = cols.reduce((a, x) => (x.eMax > a.eMax ? x : a), cols[0]);
      push(Math.floor(rng() * 10), 'data', { kind: 'dial', count: 2 + Math.floor(c.hMean * 6), vel: 0.14, pan: pan(c.x), x: c.x, y: c.yEdge });
    }
  }

  // ── ACT 2: DECOMPOSITION — the image's spectra, each with its sound state ──
  decomposition({ b, sb, rng, push, pan }) {
    const sp = this.spectrumAt(b), st = sp.style, M = this.map, root = this.P.root;
    const sbs = b - sp.start, prog = sbs / sp.bars, phrase = Math.floor(sbs / 4);
    const rowBand = Math.floor(((sbs / sp.bars) * (GR - 8)));          // a band of rows scanned top → bottom over the spectrum
    const cols = Array.from({ length: STEPS }, (_, i) => {
      const c = Math.min(GC - 1, Math.floor((i + 0.5) / STEPS * GC));
      let e = 0, y = 0.5; for (let r = rowBand; r < rowBand + 8; r++) { const v = M.grid.edge[r * GC + c]; if (v > e) { e = v; y = (r + 0.5) / GR; } }
      return { x: (c + 0.5) / GC, y, e, h: M.grid.h[Math.floor(y * GR) * GC + c], tex: M.grid.tex[Math.floor(y * GR) * GC + c] };
    });
    const pr = makeRng(hashInts(this.seed, sp.index, phrase, 5));      // patterns hold for a phrase (4 bars)
    const silentHalf = rng() < st.silence * 0.6;
    const startCut = sbs === 0;                                          // a new spectrum: the slicing cut
    if (startCut) {
      push(0, 'glitch', { vel: 0.85, x: M.focal.x, y: M.focal.y, pan: 0, row: 16, slice: true });
      push(0, 'kick', { vel: 0.8, decay: this.P.kickDecay * 1.4, x: M.focal.x, y: M.focal.y, impact: true });    // one impact, never a beat
    }
    // sub: a drone that glides (DISSOLUTION, ORBIT) or gated pulses on irregular steps (RASTER, FLOW, MATRIX)
    if (st.sub === 'drone') {
      if (sbs % 4 === 0) push(0, 'sub', { freq: root * [1, 9 / 8, 3 / 4, 1][phrase % 4], to: root * [9 / 8, 1, 1, 3 / 4][phrase % 4], dur: 4, vel: 0.2, x: M.focal.x, y: M.focal.y });
      if (sbs % 4 === 2 && pr() < 0.6) push(0, 'hum', { freq: root * 2, dur: 4, vel: 0.03, x: M.focal.x, y: M.focal.y });
    } else {
      const rot = Math.floor(pr() * 16), keep = 0.35 + 0.45 * prog;
      for (const s0 of st.subSteps) { const s = (s0 + rot) % 16; if (rng() < keep && !(silentHalf && s >= 8)) push(s, 'pulse', { freq: root * (pr() < 0.2 ? 3 / 4 : 1), dur: 0.7, vel: 0.17, x: cols[s].x, y: cols[s].y }); }
    }
    // clicks: Euclidean, from the columns of the image, held for a phrase
    const k = Math.round(clamp(st.clickDens * (0.5 + prog * 0.6)) * (3 + 7 * clamp(cols.reduce((s, c) => s + c.e, 0) / STEPS * 2)));
    const pat = euclid(Math.max(1, k), STEPS, Math.floor(pr() * 16));
    for (let i = 0; i < STEPS; i++) {
      if (!pat[i] || (silentHalf && i >= 8)) continue;
      const c = cols[i];
      push(i, 'click', { vel: 0.22 + 0.5 * clamp(c.e), pan: pan(c.x), x: c.x, y: c.y, variant: (i + phrase) % 4, crush: rng() < st.crush });
      if (st.swing > 0.1 && rng() < 0.12) push(i + 0.5, 'click', { vel: 0.15, pan: -pan(c.x), x: c.x, y: c.y, variant: 1 });
    }
    // data: dial pulses or pixel-row stutters
    if (sbs % 2 === 1 && rng() < st.data) {
      const c = cols[Math.floor(rng() * STEPS)];
      if (st.dataKind === 'dial') push(Math.floor(rng() * 10), 'data', { kind: 'dial', count: 2 + Math.floor(c.h * 8), vel: 0.18, pan: pan(c.x), x: c.x, y: c.y });
      else push(Math.floor(rng() * 12), 'data', { kind: 'stutter', count: 3 + Math.floor(rng() * 5), rate: [1 / 3, 1 / 4, 1 / 6][Math.floor(rng() * 3)], vel: 0.16, row: Math.floor(c.y * 31), pan: pan(c.x), x: c.x, y: c.y, crush: rng() < st.crush });
    }
    // field: data textures (MATRIX, RASTER most)
    if (rng() < st.field * 0.55 && !silentHalf) {
      const c = cols[Math.floor(rng() * STEPS)];
      push(Math.floor(rng() * 13), 'field', { count: 8 + Math.floor(rng() * 10), dur: 2 + Math.floor(rng() * 3), vel: 0.1, freq: 1200 + 2600 * c.h, row: Math.floor(c.y * 31), pan: pan(c.x), x: c.x, y: c.y });
    }
    // noise: gated bursts where the image is rough
    for (let i = 0, n = 0; i < STEPS && n < 2; i++) if (cols[i].tex > M.thr.tex && rng() < st.noise * 0.25) { const c = cols[i]; push(i, 'noise', { vel: 0.1 + 0.2 * clamp(c.tex * 2), dur: 0.012 + rng() * 0.035, freq: 800 * Math.pow(2, c.h * 2.5), q: 4 + rng() * 8, pan: pan(c.x), x: c.x, y: c.y }); n++; }
    // a local glitch at some phrase ends
    if (sbs % 4 === 3 && rng() < st.glitch * 0.5) { const c = cols.reduce((a, x) => (x.e > a.e ? x : a), cols[0]); push(12 + Math.floor(rng() * 3), 'glitch', { vel: 0.6, x: c.x, y: c.y, pan: pan(c.x), row: Math.floor(c.y * 31) }); }
    // valleys ring in the drone spectra
    if (st.sub === 'drone' && sbs % 4 === 1 && rng() < 0.5) { const v = cols.reduce((a, x) => (x.h < a.h ? x : a), cols[0]); push(4, 'res', { freq: root * (4 + Math.floor(v.h * 4)), dur: 2, vel: 0.035, x: v.x, y: v.y }); }
  }

  // ── ACT 3: ENTROPY — the densest moment: Brownian, with a direction ──
  entropy({ b, sb, prog, rng, push, pan }) {
    const M = this.map, root = this.P.root, g = M.grid;
    const at = () => { const c = Math.floor(rng() * GC), r = Math.floor(rng() * GR); return { x: (c + 0.5) / GC, y: (r + 0.5) / GR, e: g.edge[r * GC + c], h: g.h[r * GC + c] }; };
    if (sb === 0) { push(0, 'glitch', { vel: 0.9, x: M.focal.x, y: M.focal.y, pan: 0, row: 12, slice: true }); push(0, 'kick', { vel: 0.85, decay: this.P.kickDecay * 1.6, x: M.focal.x, y: M.focal.y, impact: true }); }
    if (sb % 4 === 0) push(0, 'pressure', { freq: root / 2, to: root / 2 * (1 + 0.06 * prog), dur: 4, vel: 0.16 + 0.14 * prog, beat: 0.4, attack: 0.6, x: M.focal.x, y: M.focal.y });
    const nClicks = 5 + Math.floor(prog * 9 + rng() * 3);               // Brownian clicks: random places, random steps
    for (let i = 0; i < nClicks; i++) { const p = at(); const s = Math.floor(rng() * 16) + (rng() < 0.3 ? 0.5 : 0); push(Math.min(15.5, s), 'click', { vel: 0.18 + 0.45 * rng(), pan: pan(p.x), x: p.x, y: p.y, variant: Math.floor(rng() * 4), crush: rng() < 0.35 }); }
    for (let i = 0; i < 1 + Math.floor(prog * 3); i++) { const p = at(); push(Math.floor(rng() * 16), 'noise', { vel: 0.12 + 0.2 * rng(), dur: 0.01 + rng() * 0.05, freq: 600 * Math.pow(2, rng() * 4), q: 3 + rng() * 10, pan: pan(p.x), x: p.x, y: p.y }); }
    if (rng() < 0.7) { const p = at(); push(Math.floor(rng() * 12), 'field', { count: 10 + Math.floor(rng() * 14), dur: 2 + Math.floor(rng() * 4), vel: 0.11, freq: 900 + 3000 * rng(), row: Math.floor(p.y * 31), pan: pan(p.x), x: p.x, y: p.y }); }
    if (rng() < 0.5) { const p = at(); push(Math.floor(rng() * 14), 'data', { kind: 'stutter', count: 3 + Math.floor(rng() * 6), rate: [1 / 3, 1 / 4, 1 / 6][Math.floor(rng() * 3)], vel: 0.15, row: Math.floor(p.y * 31), pan: pan(p.x), x: p.x, y: p.y, crush: true }); }
    // irregular sub pulses (Brownian timing), never a pattern
    const np = 1 + Math.floor(rng() * 3 + prog * 2);
    for (let i = 0; i < np; i++) push(Math.floor(rng() * 16), 'pulse', { freq: root * (rng() < 0.25 ? 3 / 4 : 1), dur: 0.5 + rng(), vel: 0.15, x: M.focal.x, y: M.focal.y });
    if (rng() < 0.35 + prog * 0.4) { const p = at(); push(Math.floor(rng() * 16), 'glitch', { vel: 0.7, x: p.x, y: p.y, pan: pan(p.x), row: Math.floor(p.y * 31), bands: rng() < 0.4 }); }
    if (this.superBars.has(b)) push(0, 'superpose', { x: M.focal.x, y: M.focal.y, bars: 1 });
    if (this.superBars.has(b - 1)) push(0, 'kick', { vel: 1, decay: this.P.kickDecay * 1.3, x: M.focal.x, y: M.focal.y, collapse: true });
  }

  // ── ACT 4: ABSORPTION — only sub pressure, falling into the singularity; then silence ──
  absorption({ sb, prog, push, sec }) {
    const M = this.map, root = this.P.root;
    if (sb === 0) {
      push(0, 'tone', { freqs: [root * 2, root * 3], dur: 3, vel: 0.08, x: M.focal.x, y: M.focal.y });
      push(0, 'pressure', { freq: root / 2, to: 22, dur: sec.bars - 1, vel: 0.42, beat: 0.25, attack: 0.75, x: M.focal.x, y: M.focal.y });
      push(0, 'absorb', { x: M.focal.x, y: M.focal.y, bars: sec.bars });
    }
  }

  /** Soft layer budget per bar (visual-only events always pass). */
  budget(out, max) {
    const PRI = ['CRASH', 'PRESSURE', 'TONE', 'GLITCH', 'KICK', 'CLICK', 'SCANNER', 'SUB', 'PULSE', 'DATA', 'FIELD', 'NOISE', 'RESONANCE', 'HUM'];
    let kept = out;
    const present = PRI.filter((L) => kept.some((e) => LAYER_OF[e.type] === L));
    if (present.length > max) { const ok = new Set(present.slice(0, max)); kept = kept.filter((e) => !LAYER_OF[e.type] || ok.has(LAYER_OF[e.type])); }
    return kept.sort((a, c) => a.step - c.step);
  }
}
