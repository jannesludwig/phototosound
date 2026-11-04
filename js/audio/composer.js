// ─────────────────────────────────────────────────────────────
//  composer.js — turns the image into a deterministic score.
//
//  The image is a 64×32 grid. Each bar the sequencer reads a band of
//  8 rows; the 16 steps read 16 columns spread across the full width
//  (stride 4, the phase moves every 4 bars) and the band scans slowly
//  from the top of the photo to the bottom over one loop.
//     columns → steps (Euclidean patterns from column data)
//     rows    → pitch of high sine blips
//     x       → stereo position
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts, euclid, clamp } from '../rng.js';
import { blendStyle } from '../worlds.js';

export const SECTIONS = [
  { name: 'INTRO', bars: 16, energy: 0.3 },
  { name: 'BEAT', bars: 16, energy: 0.65 },
  { name: 'FULL', bars: 24, energy: 1.0 },
  { name: 'BREAKDOWN', bars: 16, energy: 0.45 },
  { name: 'RETURN', bars: 16, energy: 0.9 },
];
export const LOOP_BARS = SECTIONS.reduce((s, x) => s + x.bars, 0); // 88 bars ≈ 3 min
export const STEPS = 16;
export const BAND = 8;           // rows read per bar
export const VOID_BAR = 71;      // last breakdown bar: silence, the image re-coheres

/** Which section a bar (within the loop) belongs to. */
export function sectionAt(loopBar) {
  let b = loopBar;
  for (let i = 0; i < SECTIONS.length; i++) {
    if (b < SECTIONS[i].bars) return { index: i, ...SECTIONS[i], barInSection: b };
    b -= SECTIONS[i].bars;
  }
  return { index: 0, ...SECTIONS[0], barInSection: 0 };
}

/** Sequencer read position for a loop bar: which rows and columns. */
export function readWindow(loopBar, grid) {
  const band = Math.floor(loopBar / LOOP_BARS * (grid.rows - BAND + 1));
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
    this.cache = new Map(); // bars are recomputed with the new style
  }

  /** Musical style for a bar: primary blended toward secondary (more so in the breakdown). */
  styleFor(loopBar) {
    const sec = sectionAt(loopBar);
    const t = sec.name === 'BREAKDOWN' ? 0.75 : this.accent * 0.6;
    return blendStyle(this.primary, this.secondary, t);
  }

  /** Column statistics of the current read window. */
  columnStats(loopBar) {
    const g = this.grid, { band, cols } = readWindow(loopBar, g);
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
        col: c, x: (c + 0.5) / g.cols,
        lum, edge: se / BAND, sat: ss / BAND,
        peak, peakRow, contrast: peak - lum,
        yPeak: (band + peakRow + 0.5) / g.rows, yEdge: (band + edgeRow + 0.5) / g.rows,
        yBand: (band + BAND / 2) / g.rows, row: band + peakRow,
      };
    });
  }

  /** All events of one bar. Steps are floats (0..16); swing is applied by the engine. */
  bar(barIndex) {
    const loopBar = barIndex % LOOP_BARS;
    if (this.cache.has(loopBar)) return this.cache.get(loopBar);
    const ev = this.compose(loopBar);
    this.cache.set(loopBar, ev);
    return ev;
  }

  compose(loopBar) {
    const f = this.f, P = this.params;
    const rng = makeRng(hashInts(this.seed, loopBar, 7));
    const sec = sectionAt(loopBar);
    const S = this.styleFor(loopBar);
    const cs = this.columnStats(loopBar);
    const E = sec.energy;
    const progress = sec.barInSection / sec.bars;
    const prim = sec.name === 'BREAKDOWN' ? this.secondary : this.primary;
    const out = [];
    const push = (step, type, o) => out.push({ step, type, ...o });

    const winEdge = cs.reduce((s, c) => s + c.edge, 0) / STEPS;
    const winSat = cs.reduce((s, c) => s + c.sat, 0) / STEPS;
    const maxEdge = Math.max(1e-3, ...cs.map((c) => c.edge));
    const brightest = cs.reduce((bi, c, i) => (c.lum > cs[bi].lum ? i : bi), 0);
    const edgiest = cs.reduce((bi, c, i) => (c.edge > cs[bi].edge ? i : bi), 0);

    // ── the void: one bar of silence where the image re-coheres ──
    if (loopBar === VOID_BAR) {
      const top = cs[brightest];
      push(0, 'sine', { freq: this.pitch(0, top.peak), dur: 2.2, vel: 0.05, pan: top.x * 1.6 - 0.8, x: top.x, y: top.yPeak, long: true });
      return out;
    }

    // ── gain staging per section ──
    const has = {
      kick: sec.name === 'BEAT' || sec.name === 'FULL' || sec.name === 'RETURN',
      clicks: sec.name === 'INTRO' ? 0.25 + 0.6 * progress : sec.name === 'BREAKDOWN' ? 0.45 : sec.name === 'BEAT' ? 0.8 : 1,
      sines: sec.name === 'INTRO' ? 0.8 : sec.name === 'BEAT' ? 0.7 : 1,
      noise: sec.name === 'INTRO' ? 0.25 : sec.name === 'BEAT' ? 0.6 : sec.name === 'BREAKDOWN' ? 0.9 : 1,
      stutter: sec.name === 'FULL' || sec.name === 'RETURN' ? 1 : sec.name === 'BREAKDOWN' ? 1.1 : sec.name === 'BEAT' && sec.barInSection >= 8 ? 0.5 : 0,
      sub: (sec.name === 'INTRO' && sec.barInSection >= 8) || sec.name === 'BREAKDOWN' || S.sub > 0.6,
    };
    if (sec.name === 'INTRO' && sec.barInSection < 2) { has.clicks = 0.12; has.noise = 0; }

    // ── kick: contrast gives it weight; the world gives it shape ──
    if (has.kick) {
      const vel = clamp((0.6 + f.contrast * 1.5) * S.kickGain, 0.35, 1);
      const decay = S.kickDecay * (0.8 + f.contrast * 0.6);
      let steps;
      switch (this.primary) {
        case 'RASTER': steps = [0, 4, 8, 12]; break;
        case 'MATRIX': steps = [0, 4, 8, 12].filter((s) => s === 0 || !rng.chance(0.18)); break;
        case 'FLOW': steps = [0, 4, 8, 12]; break;
        case 'ORBIT': steps = [0, 8]; break;
        case 'TOPOGRAPHY': steps = [0, 10]; break;
        case 'DISSOLUTION': steps = [0, 8]; break;
        default: steps = [0, 4, 8, 12];
      }
      if (sec.name === 'BEAT' && sec.barInSection < 4) steps = [0, 8].filter((s) => steps.includes(s) || s === 0);
      for (const s of steps) push(s, 'kick', { vel: s === 0 ? vel : vel * 0.92, decay });
      // ghost kicks from bright columns (Euclidean, rotated by the brightest column)
      if (sec.name !== 'BEAT') {
        const g = euclid(Math.round(2 + winEdge * 6), STEPS, brightest);
        for (let i = 0; i < STEPS; i++) {
          if (!g[i] || steps.includes(i) || i % 2 === 0 && this.primary === 'RASTER') continue;
          if (rng() < S.ghost * cs[i].contrast * 3) push(i, 'kick', { vel: vel * 0.38, decay: decay * 0.5, ghost: true });
        }
      }
    }
    // breakdown: a single soft heartbeat every 4 bars
    if (sec.name === 'BREAKDOWN' && sec.barInSection % 4 === 0 && S.sub > 0.25) push(0, 'kick', { vel: 0.4, decay: S.kickDecay * 1.6 });

    // ── sub: slow deep movement ──
    if (has.sub && loopBar % 2 === 0) {
      const ratios = [1, 1, 4 / 3, 9 / 8, 3 / 2, 1];
      const r = ratios[Math.floor(cs[brightest].lum * 5.99)];
      push(0, 'sub', { freq: P.root * r, dur: 2, vel: 0.22 * clamp(S.sub + (sec.name === 'BREAKDOWN' ? 0.4 : 0)), x: 0.5, y: 0.5 });
    }

    // ── clicks: edge density → count, columns → position ──
    if (has.clicks > 0) {
      const k = Math.round((3 + winEdge * 16 + f.edgeDensity * 4) * S.clickDens * has.clicks);
      const pat = euclid(Math.min(15, k), STEPS, edgiest);
      const strict = this.primary === 'RASTER' || this.primary === 'MATRIX';
      for (let i = 0; i < STEPS; i++) {
        const c = cs[i];
        const strong = c.edge > maxEdge * 0.8 && rng() < 0.5 * has.clicks;
        if (!pat[i] && !strong) continue;
        const vel = 0.25 + 0.75 * (c.edge / maxEdge);
        const crush = this.isCrushBar(loopBar, S, rng);
        push(i, 'click', { vel: vel * (strict ? 1 : rng.range(0.6, 1)), pan: c.x * 1.8 - 0.9, x: c.x, y: c.yEdge, variant: Math.floor(c.sat * 3.99), crush });
        // micro-glitch: a second click a 1/64 later
        if (rng() < f.edgeDensity * S.stutter * 1.2 + 0.04) push(i + 0.25, 'click', { vel: vel * 0.5, pan: -(c.x * 1.8 - 0.9), x: c.x, y: c.yEdge, variant: 3, crush });
      }
    }

    // ── sines: highlights in a column → a pure high tone, row → pitch ──
    if (has.sines > 0) {
      const thr = 0.06 + (1 - f.contrast) * 0.06;
      let n = 0;
      for (let i = 0; i < STEPS; i++) {
        const c = cs[i];
        if (c.contrast < thr) continue;
        if (rng() > S.sineDens * has.sines * (0.55 + E * 0.45)) continue;
        if (n++ > 6) break;
        const long = sec.name === 'BREAKDOWN' || S.sineLen > 0.25;
        const dur = S.sineLen * rng.range(0.6, 1.4) * (sec.name === 'BREAKDOWN' ? 3 : 1);
        push(i, 'sine', { freq: this.pitch(c.peakRow, c.peak), dur, vel: 0.06 + 0.07 * c.contrast * 3 * (long ? 0.6 : 1), pan: c.x * 1.8 - 0.9, x: c.x, y: c.yPeak, long });
      }
    }

    // ── noise bursts: saturation → amount, hue → rotation ──
    if (has.noise > 0) {
      const k = Math.round((winSat * 6 + f.saturation * 4) * S.noise * has.noise * (0.6 + E * 0.4));
      const pat = euclid(Math.min(8, k), STEPS, Math.floor(f.hue * 16) + 2);
      for (let i = 0; i < STEPS; i++) {
        if (!pat[i]) continue;
        const c = cs[i];
        const long = sec.name === 'BREAKDOWN';
        push(i, 'noise', {
          vel: 0.12 + 0.3 * c.sat + 0.1 * rng(), dur: rng.range(0.015, 0.09) * (long ? 2.5 : 1),
          freq: 500 * Math.pow(2, c.sat * 4 + c.lum * 2 + rng.range(-0.3, 0.3)), q: rng.range(2, 12),
          pan: c.x * 1.8 - 0.9, x: c.x, y: c.yBand, crush: this.isCrushBar(loopBar, S, rng),
        });
      }
    }

    // ── data stutters: an image row played as a waveform, retriggered ──
    if (has.stutter > 0) {
      const tries = this.primary === 'MATRIX' ? 3 : 1;
      for (let t = 0; t < tries; t++) {
        if (rng() > S.stutter * has.stutter * (0.4 + f.edgeDensity)) continue;
        const i = rng() < 0.5 ? edgiest : rng.int(0, 15);
        const c = cs[i];
        const rate = rng.pick([1 / 3, 1 / 4, 1 / 6, 1 / 8]); // in steps
        push(i, 'stutter', { count: rng.int(3, 9), rate, vel: 0.18 + 0.15 * rng(), row: c.row, pan: c.x * 1.8 - 0.9, x: c.x, y: c.yPeak, crush: rng() < S.crush });
      }
    }

    // ── silence as a compositional element ──
    let mute = null;
    if (sec.name === 'INTRO' && sec.barInSection === sec.bars - 1) mute = [12, 16];      // breath before the beat
    else if (loopBar === LOOP_BARS - 1) mute = [8, 16];                                   // breath before the loop
    else if (sec.name !== 'INTRO' && rng() < S.silence * 0.35) mute = rng.pick([[12, 16], [6, 8], [14, 16], [8, 12]]);
    const kept = mute ? out.filter((e) => e.type === 'sub' || e.step < mute[0] || e.step >= mute[1]) : out;
    kept.sort((a, b) => a.step - b.step);
    return kept;
  }

  isCrushBar(loopBar, S, rng) {
    const sec = sectionAt(loopBar).name;
    if (sec !== 'FULL' && sec !== 'RETURN') return rng() < S.crush * 0.08;
    return loopBar % 8 === 7 ? rng() < 0.4 + S.crush : rng() < S.crush * 0.15;
  }

  /** Row (0 = top of the band) → pitch from the photo's harmonic set. */
  pitch(peakRow, peak) {
    const H = this.params.harmonics;
    const idx = BAND - 1 - peakRow;                       // higher in the image → higher pitch
    let f = this.params.root * H[idx % H.length] * (idx >= H.length ? 2 : 1) * 2;
    if (peak > 0.88) f *= 2;
    while (f > 12000) f /= 2;
    return f;
  }
}
