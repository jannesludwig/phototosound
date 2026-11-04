// ─────────────────────────────────────────────────────────────
//  composer.js — the sound map is listened to.
//
//  Round 4: a long experimental piece, not a track. A scan line
//  crosses the terrain (map.js); what lies beneath it at each 16th
//  step decides what sounds:
//    hard edge      → CLICK (the hardest → GLITCH, a local flare)
//    high ridge     → KICK  (pressure, irregular — never 4/4)
//    rough texture  → NOISE (short gated bursts; particles break off)
//    valley / flat  → space, RESONANCE (slow low sines)
//    focal point    → SUB swell (the orbit breathes)
//    reading        → TRANSMISSION (the column read as data), DATA
//  Arc (≈ 3–3.5 min, one shot by default):
//    MAPPING     the scan maps the terrain for the first time; no beat
//    LISTENING   slow; hum, resonances, rare kicks on ridges
//    INTENSIFY   denser; irregular kicks, sub pulses, glitches, slicing
//    CONSUMPTION the image is consumed; the beat leaves; one low tone
//    END         the crash (the only full-screen flash), then nothing
//  Same palette as round 3 (sine sub/kick, clicks, gated noise,
//  data/transmission, glitch) — no pitched blips, no bright tones.
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts, euclid, clamp } from '../rng.js';
import { GC, GR } from '../map.js';

export const STEPS = 16;
export const LAYERS = ['KICK', 'SUB', 'PULSE', 'HUM', 'RESONANCE', 'CLICK', 'NOISE', 'DATA', 'SCANNER', 'GLITCH', 'TONE', 'CRASH'];
const LAYER_OF = { kick: 'KICK', sub: 'SUB', pulse: 'PULSE', hum: 'HUM', res: 'RESONANCE', click: 'CLICK', noise: 'NOISE', data: 'DATA', scanner: 'SCANNER', glitch: 'GLITCH', tone: 'TONE', crash: 'CRASH' };
export const layerOf = (type) => LAYER_OF[type];
export const MAX_LAYERS = 6;
const PRIORITY = ['CRASH', 'SUB', 'KICK', 'GLITCH', 'CLICK', 'HUM', 'PULSE', 'SCANNER', 'DATA', 'NOISE', 'RESONANCE', 'TONE'];

// scan speed per section, in sweeps per bar (the first sweep maps the whole terrain)
const ENERGY = { MAPPING: 0.15, LISTENING: 0.4, INTENSIFY: 0.9, CONSUMPTION: 0.35, END: 0 };

export class Composer {
  constructor(analysis, map) {
    this.a = analysis; this.f = analysis.features; this.map = map; this.P = map.params;
    this.seed = analysis.seed;
    this.planArc();
  }

  planArc() {
    const f = this.f, rng = makeRng(this.seed ^ 0x4a7c);
    const len = {
      MAPPING: 14 + 2 * Math.round(rng() * 2 + (1 - f.brightness)),
      LISTENING: 20 + 4 * Math.round(this.P.smooth + rng() * 0.6),
      INTENSIFY: 20 + 4 * Math.round(f.edgeDensity * 1.5 + rng() * 0.6),
      CONSUMPTION: 14 + 2 * Math.round(rng() * 2 + (f.face > 0 ? 1 : 0)),
      END: 3,
    };
    this.sections = []; let start = 0;
    for (const name of ['MAPPING', 'LISTENING', 'INTENSIFY', 'CONSUMPTION', 'END']) { this.sections.push({ name, start, bars: len[name], energy: ENERGY[name] }); start += len[name]; }
    this.loopBars = start;
    this.endBar = this.sections[4].start;
    // scan: sweeps per bar in each section; phases accumulate so the line never jumps
    const rate = { MAPPING: 1 / (len.MAPPING - 2), LISTENING: 1 / 8, INTENSIFY: 1 / (4 + Math.round(rng() * 2)), CONSUMPTION: 1 / 6, END: 0 };
    let ph = 0;
    for (const s of this.sections) { s.rate = rate[s.name]; s.phase0 = ph; ph += s.rate * s.bars; }
    // slicing: rare, at the strongest moments (two in INTENSIFY, one at the start of CONSUMPTION)
    const I = this.sections[2];
    this.sliceBars = new Set([I.start + Math.floor(I.bars * 0.55), I.start + I.bars - 2, this.sections[3].start]);
  }

  sectionAt(loopBar) {
    for (let i = this.sections.length - 1; i >= 0; i--) { const s = this.sections[i]; if (loopBar >= s.start) return { index: i, ...s, barInSection: loopBar - s.start }; }
    return { index: 0, ...this.sections[0], barInSection: 0 };
  }

  /** Scan line position (x in image coords 0..1) at a fractional loop bar. First sweep: left → right, then ping-pong. */
  scanAt(loopBarF) {
    const sec = this.sectionAt(Math.floor(loopBarF));
    const phase = sec.phase0 + (loopBarF - sec.start) * sec.rate;
    const k = Math.floor(phase), fr = phase - k;
    return { x: k % 2 === 0 ? fr : 1 - fr, sweep: k, mapping: phase < 1, reveal: Math.min(1, phase) };
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
    const M = this.map, P = this.P, f = this.f, root = P.root;
    const out = [];
    const push = (step, type, o = {}) => out.push({ step, type, ...o });
    const pan = (x) => clamp(x * 1.8 - 0.9, -0.9, 0.9);

    // ── END: the crash, then nothing ──
    if (name === 'END') {
      if (sb === 0) push(0, 'crash', { x: 0.5, y: 0.5, vel: 1 });
      return out;
    }

    // what the scan line crosses during this bar
    const cols = [];
    for (let i = 0; i < STEPS; i++) {
      const s = this.scanAt(b + i / STEPS);
      const c = Math.min(GC - 1, Math.floor(s.x * GC));
      cols.push({ ...M.col[c], c, sx: s.x });
    }
    const prevCol = (i) => (i > 0 ? cols[i - 1] : M.col[Math.min(GC - 1, Math.floor(this.scanAt(b - 1 / STEPS).x * GC))]);
    const T = M.thr;
    const meanH = cols.reduce((s, c) => s + c.hMean, 0) / STEPS;

    // ── SUB: pressure following the height under the scan (calm, not every bar) ──
    const subOn = name !== 'MAPPING' || sb >= 4;
    if (subOn && b % 2 === 0) {
      const ratio = meanH > 0.62 ? 9 / 8 : meanH < 0.3 ? 3 / 4 : 1;
      const vel = { MAPPING: 0.1 + 0.1 * prog, LISTENING: 0.2, INTENSIFY: 0.26, CONSUMPTION: 0.22 * (1 - prog * 0.6) }[name];
      if (name !== 'LISTENING' || rng() < 0.75) push(0, 'sub', { freq: root * ratio, to: name === 'CONSUMPTION' ? root * ratio * 0.75 : root * ratio, dur: 2, vel, x: cols[0].sx, y: cols[0].yMax });
    }
    // the focal point: when the scan crosses it, the sub swells (the orbit breathes)
    for (let i = 0; i < STEPS; i++) {
      const p = prevCol(i);
      const fx = M.focal.x;
      if ((p.x - fx) * (cols[i].x - fx) <= 0 && Math.abs(p.x - cols[i].x) < 0.2 && name !== 'MAPPING') {
        push(i, 'sub', { freq: root, to: root, dur: 1, vel: 0.3, focus: true, x: fx, y: M.focal.y });
        break;
      }
    }

    // ── HUM: the machine hum of the map, slowly following its mean height ──
    if ((name === 'LISTENING' || name === 'INTENSIFY' || (name === 'CONSUMPTION' && prog < 0.6)) && b % 4 === 0) {
      push(0, 'hum', { freq: root * 2, dur: 4, vel: 0.035 + 0.04 * meanH, x: 0.5, y: 0.5 });
    }

    // ── RESONANCE: valleys and plateaus ring softly (low/mid sines, slow) ──
    if ((name === 'LISTENING' || name === 'CONSUMPTION' || (name === 'INTENSIFY' && prog < 0.3)) && b % 2 === 1) {
      const v = cols.find((c) => c.hMean < T.valley * 1.15 && c.eMax < T.edge);
      if (v && rng() < 0.7) {
        const harm = [3, 4, 5, 6, 8][Math.min(4, Math.floor(v.hMean * 5))];
        push(cols.indexOf(v), 'res', { freq: root * harm, dur: 2 + Math.floor(rng() * 2), vel: 0.045, x: v.x, y: v.yMax });
      }
    }

    // ── SCANNER: the read head ticks where the scan enters a new column (fine, dry, glitchy) ──
    if (name === 'MAPPING' || (name === 'LISTENING' && sb % 4 === 1) || (name === 'CONSUMPTION' && sb % 5 === 2)) {
      for (let i = 0; i < STEPS; i++) {
        const c = cols[i];
        if (c.c === prevCol(i).c || (name !== 'MAPPING' && i > 6)) continue;
        const lum = M.grid.lum[Math.floor(c.yEdge * GR) * GC + c.c] || 0.5;
        push(i + (rng() < 0.3 ? 0.5 : 0), 'scanner', { ticks: 1 + Math.round(clamp(c.eMax) * 3), gap: 0.004 + rng() * 0.005, freq: 1500 * Math.pow(2, lum * 2.2), vel: 0.07 + 0.08 * clamp(c.eMax), crush: rng() < 0.25, pan: pan(c.x) * 0.7, x: c.x, y: c.yEdge });
      }
    }

    // ── CLICK / GLITCH: the hard edges the scan crosses ──
    const clickProb = { MAPPING: 0.45, LISTENING: 0.55, INTENSIFY: 0.95, CONSUMPTION: 0.5 }[name] * P.density;
    const maxClicks = { MAPPING: 3, LISTENING: 4, INTENSIFY: 9, CONSUMPTION: 4 }[name];
    let nClick = 0, nGlitch = 0;
    for (let i = 0; i < STEPS; i++) {
      const c = cols[i], p = prevCol(i);
      const crossing = c.eMax > T.edge && (c.c !== p.c) && (c.eMax - p.eMax > 0.02 || rng() < 0.25);
      if (!crossing) continue;
      if (c.eMax > T.glitch && name !== 'MAPPING' && nGlitch < (name === 'INTENSIFY' ? 2 : 1) && rng() < { LISTENING: 0.3, INTENSIFY: 0.5, CONSUMPTION: 0.35 }[name]) {
        push(i, 'glitch', { vel: 0.75, x: c.x, y: c.yEdge, pan: pan(c.x), row: Math.floor(c.yEdge * 31), slice: this.sliceBars.has(b) && nGlitch === 0 });
        nGlitch++;
      } else if (nClick < maxClicks && rng() < clickProb) {
        push(i, 'click', { vel: 0.3 + 0.6 * clamp(c.eMax), pan: pan(c.x), x: c.x, y: c.yEdge, variant: Math.floor((c.sat || 0) * 3.99) });
        nClick++;
        if (name === 'INTENSIFY' && rng() < 0.15) push(i + 0.25, 'click', { vel: 0.25, pan: -pan(c.x), x: c.x, y: c.yEdge, variant: 3 });
      }
    }
    // the slice moments always have their glitch
    if (this.sliceBars.has(b) && !out.some((e) => e.slice)) { const c = cols[4]; push(4, 'glitch', { vel: 0.85, x: c.x, y: c.yEdge, pan: pan(c.x), row: Math.floor(c.yEdge * 31), slice: true }); }

    // ── KICK: pressure on the ridges — rare, irregular, absent in parts ──
    const phrase = Math.floor(sb / 4);
    const kickPhraseOff = name === 'INTENSIFY' && hashInts(this.seed, b >> 2) % 3 === 0;   // whole phrases without beat
    if ((name === 'LISTENING' || name === 'INTENSIFY') && !kickPhraseOff) {
      let nk = 0;
      for (let i = 0; i < STEPS; i++) {
        const c = cols[i], p = prevCol(i);
        const ridge = c.hMax > T.ridge && c.hMax >= p.hMax && (i === STEPS - 1 || c.hMax >= cols[i + 1].hMax);
        if (!ridge) continue;
        if (name === 'LISTENING' && (b % 2 === 1 || nk >= 1 || rng() > 0.5)) continue;
        if (nk >= 3) break;
        push(i, 'kick', { vel: clamp(0.55 + c.hMax * 0.4 + f.contrast * 0.3, 0.4, 1), decay: P.kickDecay, x: c.x, y: c.yMax });
        nk++;
      }
      // in the intensification an irregular pattern joins the ridges (Euclidean, rotated by the terrain)
      if (name === 'INTENSIFY' && prog > 0.25 && nk < 2) {
        const pat = euclid(2 + (phrase % 2), STEPS, Math.floor(meanH * 16) + phrase * 3);
        for (let i = 0; i < STEPS; i++) if (pat[i] && !out.some((e) => e.type === 'kick' && Math.abs(e.step - i) < 2)) push(i, 'kick', { vel: 0.7, decay: P.kickDecay * 0.8, x: cols[i].x, y: cols[i].yMax });
      }
    } else if (name === 'CONSUMPTION' && sb < 6 && sb % 2 === 0) {
      push(0, 'kick', { vel: 0.5, decay: P.kickDecay * 1.3, x: cols[0].x, y: cols[0].yMax });   // a heartbeat, leaving
    }

    // ── PULSE: gated sub pulses between the kicks (intensification only, irregular) ──
    if (name === 'INTENSIFY' && prog > 0.4 && !kickPhraseOff) {
      const pat = euclid(3 + Math.floor(meanH * 3), STEPS, (b * 5) % 16);
      for (let i = 0; i < STEPS; i++) if (pat[i] && !out.some((e) => e.type === 'kick' && Math.floor(e.step) === i)) push(i, 'pulse', { freq: root, dur: 0.8, vel: 0.2, x: cols[i].x, y: cols[i].yMax });
    }

    // ── NOISE: rough texture breaks off in short gated bursts ──
    if (name === 'INTENSIFY' || (name === 'LISTENING' && prog > 0.5) || name === 'CONSUMPTION') {
      let nn = 0;
      for (let i = 0; i < STEPS && nn < (name === 'INTENSIFY' ? 3 : 1); i++) {
        const c = cols[i];
        if (c.tex > T.tex && rng() < 0.35) { push(i, 'noise', { vel: 0.12 + 0.25 * clamp(c.tex * 2), dur: 0.012 + rng() * 0.04, freq: 700 * Math.pow(2, (c.sat || 0) * 3 + c.hMean * 1.5), q: 3 + rng() * 9, pan: pan(c.x), x: c.x, y: c.yEdge }); nn++; }
      }
    }

    // ── DATA: saturated, structured places stutter (image rows as waveforms / dial pulses) ──
    if ((name === 'INTENSIFY' && rng() < 0.45) || (name === 'LISTENING' && sb % 4 === 2 && rng() < 0.5)) {
      const c = cols[Math.floor(rng() * STEPS)];
      if (rng() < 0.5) push(Math.floor(rng() * 14), 'data', { kind: 'stutter', count: 3 + Math.floor(rng() * 5), rate: [1 / 3, 1 / 4, 1 / 6][Math.floor(rng() * 3)], vel: 0.15 + 0.1 * rng(), row: Math.floor(c.yEdge * 31), pan: pan(c.x), x: c.x, y: c.yEdge, crush: rng() < 0.3 });
      else push(Math.floor(rng() * 12), 'data', { kind: 'dial', count: 2 + Math.floor(c.hMean * 8), vel: 0.2, pan: pan(c.x), x: c.x, y: c.yMax });
    }

    // ── TONE: once, as the image starts to be consumed ──
    if (name === 'CONSUMPTION' && sb === 1) push(0, 'tone', { freqs: [root * 2, root * 3], dur: 4, vel: 0.11, x: M.focal.x, y: M.focal.y });

    // ── silence: valleys mute the second half of a bar now and then; breath before boundaries ──
    let kept = out;
    if (sb === sec.bars - 1) kept = kept.filter((e) => ['sub', 'hum', 'res', 'tone'].includes(e.type) || e.step < 12);
    else if (meanH < T.valley && rng() < 0.35) kept = kept.filter((e) => ['sub', 'hum', 'res', 'tone'].includes(e.type) || e.step < 8);

    // ── soft layer budget ──
    const present = PRIORITY.filter((L) => kept.some((e) => LAYER_OF[e.type] === L));
    if (present.length > MAX_LAYERS) { const ok = new Set(present.slice(0, MAX_LAYERS)); kept = kept.filter((e) => ok.has(LAYER_OF[e.type])); }
    kept.sort((a, b2) => a.step - b2.step);
    return kept;
  }
}
