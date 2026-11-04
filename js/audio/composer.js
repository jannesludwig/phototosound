// ─────────────────────────────────────────────────────────────
//  composer.js — the image becomes a deterministic, minimal score.
//
//  Round 3: built on the v1 composer (image grid scan, Euclidean
//  patterns, per-world styles). Reduced to the most basic materials:
//  sine kick, sub, clicks, gated noise, data/transmission bursts and
//  the white-flash glitch. No pitched blips, no melodies.
//
//  Layers (names used by the mixer):
//    KICK    sine kick with pitch envelope (+ rare ghost kicks)
//    SUB     clean sub sine: slow drone or gated sub pulses
//    CLICK   the v1 click palette (Euclidean, from image columns)
//    NOISE   short gated band-passed noise bursts          (optional per image)
//    DATA    image rows as data stutters / dial pulses     (optional per image)
//    GLITCH  white flash + digital glitch (structural accents)
//    TONE    one very low, soft sine interval, once, after the intense moment
//
//  Hypnotic: patterns are fixed per 4-bar phrase; each bar changes at most
//  one detail. Arc: INTRO → BUILD → PEAK (glitch storm, collapse) → FALL →
//  SILENCE, built by adding/removing a few layers. ≤ 5 layers at once.
//
//  Grid: 64 × 32 cells. Each phrase the sequencer reads a band of 8 rows;
//  the 16 steps read 16 columns across the full width; the band scans
//  top → bottom over the loop. columns → steps, x → stereo pan.
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts, euclid, clamp } from '../rng.js';
import { blendStyle } from '../worlds.js';

export const STEPS = 16;
export const BAND = 8;
export const LAYERS = ['KICK', 'SUB', 'CLICK', 'NOISE', 'DATA', 'GLITCH', 'TONE'];
export const MAX_LAYERS = 5;
const PRIORITY = ['KICK', 'SUB', 'CLICK', 'GLITCH', 'DATA', 'NOISE', 'TONE'];
const LAYER_OF = { kick: 'KICK', sub: 'SUB', pulse: 'SUB', click: 'CLICK', noise: 'NOISE', data: 'DATA', glitch: 'GLITCH', tone: 'TONE' };
export const layerOf = (type) => LAYER_OF[type];

export const ENERGY = { INTRO: 0.25, BUILD: 0.6, PEAK: 1, FALL: 0.35, SILENCE: 0.08 };

/** Sequencer read position for a loop bar (v1). */
export function readWindow(loopBar, grid, loopBars) {
  const band = Math.floor(loopBar / loopBars * (grid.rows - BAND + 1));
  const phase = Math.floor(loopBar / 4) % (grid.cols / STEPS);
  const cols = []; for (let i = 0; i < STEPS; i++) cols.push(i * (grid.cols / STEPS) + phase);
  return { band, phase, cols };
}

export class Composer {
  constructor(analysis, params, primary, secondary, accent) {
    this.a = analysis;
    this.f = analysis.features;
    this.grid = analysis.grid;
    this.params = params;
    this.seed = analysis.seed;
    this.setWorlds(primary, secondary, accent);
  }

  setWorlds(primary, secondary, accent = 0.3) {
    this.primary = primary; this.secondary = secondary; this.accent = accent;
    this.S = blendStyle(primary, secondary, accent * 0.4);
    this.planArc();
    this.chooseLayers();
    this.cache = new Map();
  }

  /** Section lengths vary per image (bars, multiples of 4). */
  planArc() {
    const f = this.f, S = this.S, rng = makeRng(this.seed ^ 0xa4c);
    const dark = clamp(1 - f.brightness * 1.8);
    const len = {
      INTRO: 12 + 4 * Math.round(dark + S.silence),
      BUILD: 24 + 4 * Math.round(f.edgeDensity + rng() * 0.6),
      PEAK: 12 + 4 * Math.round(f.contrast * 2 + rng() * 0.4),
      FALL: 12 + 4 * Math.round(S.silence + (f.face > 0 ? 1 : 0) * 0.6),
      SILENCE: 8,
    };
    this.sections = [];
    let start = 0;
    for (const name of ['INTRO', 'BUILD', 'PEAK', 'FALL', 'SILENCE']) { this.sections.push({ name, start, bars: len[name], energy: ENERGY[name] }); start += len[name]; }
    this.loopBars = start;
    this.collapseBar = this.sections[2].start + this.sections[2].bars - 1;   // the one intense moment
    this.fallStart = this.sections[3].start;
  }

  /** Which optional layers exist for this photo: none, one or both of NOISE / DATA. */
  chooseLayers() {
    const f = this.f, S = this.S;
    const noiseAmt = S.noise * (0.45 + f.saturation * 1.2);
    const dataAmt = S.data * (0.45 + f.edgeDensity + f.graphic * 0.5);
    this.layerSet = ['KICK', 'SUB', 'CLICK', 'GLITCH'];
    if (dataAmt > 0.3) this.layerSet.push('DATA');
    if (noiseAmt > 0.3) this.layerSet.push('NOISE');
    this.layerSet.push('TONE');
    this.amounts = { noise: noiseAmt, data: dataAmt };
  }
  has(layer) { return this.layerSet.includes(layer); }

  sectionAt(loopBar) {
    for (let i = this.sections.length - 1; i >= 0; i--) {
      const s = this.sections[i];
      if (loopBar >= s.start) return { index: i, ...s, barInSection: loopBar - s.start };
    }
    return { index: 0, ...this.sections[0], barInSection: 0 };
  }

  /** Column statistics of the read window (v1). */
  columnStats(loopBar) {
    const g = this.grid, { band, cols } = readWindow(loopBar, g, this.loopBars);
    return cols.map((c) => {
      let sl = 0, se = 0, ss = 0, peak = -1, peakRow = 0, edgeRow = 0, edgeMax = -1;
      for (let r = 0; r < BAND; r++) {
        const i = (band + r) * g.cols + c;
        sl += g.lum[i]; se += g.edge[i]; ss += g.sat[i];
        if (g.lum[i] > peak) { peak = g.lum[i]; peakRow = r; }
        if (g.edge[i] > edgeMax) { edgeMax = g.edge[i]; edgeRow = r; }
      }
      const lum = sl / BAND;
      return {
        col: c, x: (c + 0.5) / g.cols, lum, edge: se / BAND, sat: ss / BAND, peak, contrast: peak - lum,
        yPeak: (band + peakRow + 0.5) / g.rows, yEdge: (band + edgeRow + 0.5) / g.rows, yBand: (band + BAND / 2) / g.rows, row: band + peakRow,
      };
    });
  }

  bar(barIndex) {
    if (this.cache.has(barIndex)) return this.cache.get(barIndex);
    const ev = this.compose(barIndex);
    this.cache.set(barIndex, ev);
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value);
    return ev;
  }

  /** The phrase pattern (fixed for 4 bars): this is what makes it hypnotic. */
  phrase(loopBar, sec) {
    const ph = Math.floor(loopBar / 4) * 4;
    const rng = makeRng(hashInts(this.seed, ph, 0xf4a));
    const cs = this.columnStats(ph), S = this.S, f = this.f;
    const winEdge = cs.reduce((s, c) => s + c.edge, 0) / STEPS;
    const winSat = cs.reduce((s, c) => s + c.sat, 0) / STEPS;
    const maxEdge = Math.max(1e-3, ...cs.map((c) => c.edge));
    const edgiest = cs.reduce((bi, c, i) => (c.edge > cs[bi].edge ? i : bi), 0);
    const brightest = cs.reduce((bi, c, i) => (c.lum > cs[bi].lum ? i : bi), 0);
    const prog = sec.barInSection / sec.bars;
    // clicks: edge density → count; grows through the build, thins in the fall
    const dens = { INTRO: 0.25, BUILD: 0.45 + 0.45 * prog, PEAK: 1, FALL: 0.6 * (1 - prog), SILENCE: 0.12 }[sec.name];
    const kClick = Math.max(sec.name === 'SILENCE' ? 0 : 1, Math.round((3 + winEdge * 14 + f.edgeDensity * 4) * S.clickDens * dens));
    const click = euclid(Math.min(13, kClick), STEPS, edgiest);
    const kNoise = Math.round((winSat * 6 + f.saturation * 3) * S.noise * 1.4);
    const noise = euclid(Math.min(6, Math.max(1, kNoise)), STEPS, Math.floor(f.hue * 16) + 2);
    return { cs, click, noise, maxEdge, edgiest, brightest, winEdge, rng };
  }

  compose(barIndex) {
    const loop = Math.floor(barIndex / this.loopBars), loopBar = barIndex % this.loopBars;
    const sec = this.sectionAt(loopBar);
    const S = this.S, f = this.f, P = this.params;
    const rng = makeRng(hashInts(this.seed, loopBar, loop % 3, 7));     // later loops vary slightly
    const ph = this.phrase(loopBar, sec);
    const cs = ph.cs;
    const out = [];
    const push = (step, type, o = {}) => out.push({ step, type, ...o });
    const sb = sec.barInSection, prog = sb / sec.bars, name = sec.name;
    const pan = (x) => clamp(x * 1.8 - 0.9, -0.9, 0.9);
    const phraseStart = loopBar % 4 === 0;

    // ── the collapse: one huge glitch, then silence while the image re-coheres ──
    if (loopBar === this.collapseBar) {
      const c = cs[ph.brightest];
      push(0, 'glitch', { big: true, vel: 1, x: c.x, y: c.yPeak, pan: 0, row: c.row });
      push(0, 'sub', { freq: P.root, to: P.root * 0.5, dur: 1, vel: 0.3 });
      return out;
    }

    // ── KICK: an insistent, repeating pattern (the world's), from BUILD to PEAK ──
    const kickOn = name === 'BUILD' || name === 'PEAK';
    const kvel = clamp((0.62 + f.contrast * 1.4) * S.kickGain, 0.4, 1);
    const decay = S.kickDecay * (0.85 + f.contrast * 0.5);
    if (kickOn) {
      let ks = S.kick;
      if (name === 'BUILD' && sb < 4) ks = [0];                          // the pulse arrives alone
      else if (name === 'BUILD' && sb < 8) ks = ks.filter((s) => s === 0 || s === 8);
      if (this.primary === 'MATRIX') ks = ks.filter((s) => s === 0 || ph.rng() > 0.12);
      for (const s of ks) push(s, 'kick', { vel: s === 0 ? kvel : kvel * 0.92, decay });
      // a rare ghost kick from the brightest column (micro-variation)
      if (name === 'PEAK' && rng() < S.ghost) {
        const g = (ph.brightest | 1) % 16;
        if (!ks.includes(g)) push(g, 'kick', { vel: kvel * 0.35, decay: decay * 0.5, ghost: true });
      }
    } else if (name === 'FALL' && sb < 6 && sb % 2 === 0) {
      push(0, 'kick', { vel: kvel * 0.5, decay: decay * 1.4 });           // a heartbeat, falling away
    }

    // ── SUB: clean sine pressure — slow drone, or gated pulses between the kicks ──
    const root = P.root;
    if (S.sub === 'pulse' && kickOn && !(name === 'BUILD' && sb < 8)) {
      for (const s of S.subSteps) push(s, 'pulse', { freq: root, dur: 0.85, vel: 0.24 + 0.08 * (name === 'PEAK' ? 1 : prog) });
    } else if (loopBar % 4 === 0 && name !== 'SILENCE') {
      // drone: one note per phrase, moving very slowly (1 ↔ 9/8 ↔ 3/4) with the image's brightness
      const ratios = [1, 1, 9 / 8, 1, 3 / 4];
      const r = name === 'FALL' ? 1 : ratios[Math.floor(cs[ph.brightest].lum * 4.99)];
      const to = name === 'FALL' ? root * 0.75 : root * r;
      push(0, 'sub', { freq: root * r, to, dur: 4, vel: name === 'INTRO' ? 0.18 + 0.1 * prog : 0.26 });
    } else if (name === 'SILENCE' && sb === 0) {
      push(0, 'sub', { freq: root * 0.75, to: root * 0.5, dur: 4, vel: 0.16 });   // the last breath
    }

    // ── CLICK: the v1 palette, Euclidean from the image columns ──
    const clickPat = ph.click.slice();
    // micro-variation: at most one step moves per bar
    if (rng() < 0.4) { const on = clickPat.map((v, i) => (v ? i : -1)).filter((i) => i >= 0); if (on.length) { const i = on[Math.floor(rng() * on.length)]; clickPat[i] = 0; clickPat[(i + (rng() < 0.5 ? 1 : 15)) % 16] = 1; } }
    if (name === 'INTRO' && sb % 2 === 1 && sb < sec.bars / 2) clickPat.fill(0);   // space in the intro
    for (let i = 0; i < STEPS; i++) {
      if (!clickPat[i]) continue;
      const c = cs[i];
      const vel = 0.25 + 0.75 * (c.edge / ph.maxEdge);
      const crush = name === 'PEAK' && rng() < S.crush * 0.5;
      push(i, 'click', { vel, pan: pan(c.x), x: c.x, y: c.yEdge, variant: Math.floor(c.sat * 3.99), crush });
      if ((name === 'PEAK' || name === 'BUILD') && rng() < f.edgeDensity * 0.18 + 0.03) push(i + 0.25, 'click', { vel: vel * 0.5, pan: -pan(c.x), x: c.x, y: c.yEdge, variant: 3, crush });
    }

    // ── NOISE: short gated bursts (second half of the build, the peak) ──
    const noiseOn = this.has('NOISE') && ((name === 'BUILD' && prog >= 0.5) || name === 'PEAK');
    // ── DATA: data stutters / dial pulses (transmission) ──
    const dataOn = this.has('DATA') && ((name === 'BUILD' && prog >= (this.has('NOISE') ? 0.75 : 0.5)) || name === 'PEAK' || (name === 'INTRO' && sb >= sec.bars - 4));
    // both optional layers never play in the same phrase at the peak (layer budget)
    const phraseIdx = Math.floor(loopBar / 4);
    const pickNoise = noiseOn && !(dataOn && name === 'PEAK' && phraseIdx % 2 === 1);
    const pickData = dataOn && !(noiseOn && name === 'PEAK' && phraseIdx % 2 === 0);
    if (pickNoise) for (let i = 0; i < STEPS; i++) {
      if (!ph.noise[i]) continue;
      const c = cs[i];
      push(i, 'noise', { vel: 0.12 + 0.28 * c.sat + 0.08 * rng(), dur: 0.012 + rng() * 0.05, freq: 600 * Math.pow(2, c.sat * 3.5 + c.lum * 1.5), q: 3 + rng() * 9, pan: pan(c.x), x: c.x, y: c.yBand });
    }
    if (pickData && (name !== 'INTRO' || sb % 2 === 0)) {
      const tries = this.primary === 'MATRIX' ? 2 : 1;
      for (let t = 0; t < tries; t++) {
        if (rng() > clamp(this.amounts.data * (name === 'PEAK' ? 1.1 : 0.7))) continue;
        const i = rng() < 0.5 ? ph.edgiest : Math.floor(rng() * 16), c = cs[i];
        if (S.dataKind === 'dial' && rng() < 0.6) push(i, 'data', { kind: 'dial', count: 2 + Math.floor(c.lum * 8), vel: 0.22, pan: pan(c.x), x: c.x, y: c.yPeak });
        else push(i, 'data', { kind: 'stutter', count: 3 + Math.floor(rng() * 6), rate: [1 / 3, 1 / 4, 1 / 6][Math.floor(rng() * 3)], vel: 0.16 + 0.12 * rng(), row: c.row, pan: pan(c.x), x: c.x, y: c.yPeak, crush: rng() < S.crush });
      }
    }

    // ── GLITCH: white flash + digital glitch, as structural accents ──
    const g = (step, o = {}) => { const c = cs[Math.floor(step) % 16]; push(step, 'glitch', { vel: 0.7, x: c.x, y: c.yEdge, pan: pan(c.x), row: c.row, ...o }); };
    if (name === 'INTRO' && sb === Math.floor(sec.bars / 2)) g(0);
    if (name === 'BUILD' && loopBar % 8 === 0 && sb > 0) g(0);
    if (name === 'BUILD' && phraseStart && rng() < S.glitch * f.contrast * 1.5) g(8 + Math.floor(rng() * 8));
    if (name === 'PEAK') {
      if (phraseStart) g(0, { vel: 0.85 });
      if (rng() < S.glitch * 0.6) g(4 + Math.floor(rng() * 12));
      if (loopBar === this.collapseBar - 1) for (const s of [8, 10, 11, 12, 13, 14, 14.5, 15, 15.5]) g(s, { vel: 0.6 + (s - 8) * 0.05, storm: true });   // the storm before the collapse
    }

    // ── TONE: once, right after the collapse — the emotional moment ──
    if (loopBar === this.fallStart + 1) push(0, 'tone', { freqs: [root * 2, root * 3], dur: 3, vel: 0.12 });

    // ── silence as composition: breath before boundaries + world-dependent gaps ──
    let mute = null;
    if (sb === sec.bars - 1 && name !== 'SILENCE') mute = [12, 16];
    else if (name !== 'INTRO' && name !== 'SILENCE' && rng() < S.silence * 0.3) mute = [[12, 16], [6, 8], [14, 16]][Math.floor(rng() * 3)];
    let kept = mute ? out.filter((e) => e.type === 'sub' || e.type === 'tone' || e.step < mute[0] || e.step >= mute[1]) : out;
    if (name === 'SILENCE' && sb >= sec.bars - 3) kept = [];                // the last bars are silent

    // ── layer budget: never more than MAX_LAYERS at once ──
    const present = PRIORITY.filter((L) => kept.some((e) => LAYER_OF[e.type] === L));
    if (present.length > MAX_LAYERS) { const allowed = new Set(present.slice(0, MAX_LAYERS)); kept = kept.filter((e) => allowed.has(LAYER_OF[e.type])); }
    kept.sort((a, b) => a.step - b.step);
    return kept;
  }
}
