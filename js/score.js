// ─────────────────────────────────────────────────────────────
//  score.js — one timeline for sound AND image.
//
//  planPiece() turns the photograph (features, structures, mood,
//  content) into a piece: tempo, key/mode, chords from the colour
//  regions, instrument set, rhythm, visual vocabulary, signature
//  moment. Each loop pass gets its own section lengths and seeded
//  mutations. bar(n) emits the events of one bar; every event is
//  both a sound (audio engine) and a visual action (visual engine),
//  scheduled on the same audio clock — one-to-one by construction.
//  state(t) gives the continuous parameters (section, tension,
//  layer presence, ghost, flash, fall) at audio time t.
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts, euclid, clamp, lerp, smoothstep } from './rng.js';

export const SECTIONS = ['READING', 'DECOMPOSITION', 'BUILD', 'PEAK', 'AFTERGLOW', 'MEMORY'];
export const LAYERS = ['topography', 'orbit', 'constellation', 'fragments', 'sort', 'barcode', 'particles', 'flow', 'matrix'];
export const SIGNATURES = ['RECONSTRUCT', 'GRID', 'NETWORK', 'SWEEP', 'STRATA'];
export const STEPS = 16;

const MODES = {
  'warm / intimate': { name: 'dorian', scale: [0, 2, 3, 5, 7, 9, 10], tempo: [108, 116], kick: 'soft' },
  'cold / clinical': { name: 'quartal', scale: [0, 2, 5, 7, 10], tempo: [118, 124], kick: 'tight' },
  'dark / mysterious': { name: 'phrygian', scale: [0, 1, 3, 5, 7, 8, 10], tempo: [112, 120], kick: 'deep' },
  'vast / calm': { name: 'lydian', scale: [0, 2, 4, 6, 7, 9, 11], tempo: [106, 114], kick: 'soft' },
  'tense / dense': { name: 'aeolian', scale: [0, 2, 3, 5, 7, 8, 10], tempo: [122, 128], kick: 'tight' },
  'vivid / restless': { name: 'mixolydian', scale: [0, 2, 4, 5, 7, 9, 10], tempo: [116, 123], kick: 'tight' },
};

// ── the plan (per photograph) ───────────────────────────────
export function planPiece(an, st, mood, content) {
  const f = an.features, seed = an.seed, rng = makeRng(seed ^ 0x5c0e);
  const c = content || {};
  const M = MODES[mood.name] || MODES['dark / mysterious'];

  // tempo inside the mood's range; root from the dominant hue
  // position inside the mood's tempo range: energy, brightness, hue and the seed all pull it
  const bpm = Math.round(lerp(M.tempo[0], M.tempo[1], clamp(0.35 * mood.energy + 0.25 * f.brightness + 0.15 * f.hue + 0.25 * rng())) * 10) / 10;
  const pc = Math.floor(f.hue * 12) % 12;
  const root = 36.71 * Math.pow(2, pc / 12);           // D1 … C#2 (≈ 37–69 Hz)
  const scale = M.scale;

  // harmony from the colour regions: largest regions first, hue → scale degree
  const clusters = st.regions.clusters.filter((k) => k.area > 0.02).sort((a, b) => b.area - a.area);
  const degrees = clusters.map((k) => Math.floor(k.hue * scale.length + k.lum * 2) % scale.length);
  while (degrees.length < 4) degrees.push((degrees[degrees.length - 1] || 0) + 3);
  const chords = degrees.slice(0, 4).map((d) => chordFrom(scale, d, M.name === 'quartal'));

  // ── instruments: amounts from the image; below 0.25 the voice does not exist ──
  const nCorners = Math.min(1, st.corners.length / 180), nLights = Math.min(1, an.points.length / 30);
  const sal = st.salient.contrast;
  const amt = {
    kick: 1,
    click: clamp(0.45 + nLights * 0.35 + nCorners * 0.2),
    hat: clamp(nCorners * 0.8 + f.detail * 0.35 - f.smoothness * 0.5 - mood.intimacy * 0.35 + (c.city || 0) * 0.2),
    rim: clamp(st.segments.length / 14 + f.lineStrength * 0.4 - mood.intimacy * 0.2),
    snare: clamp(mood.energy * 1.1 - mood.intimacy * 0.45 - mood.openness * 0.35 + 0.05),
    bass: clamp(0.3 + Math.min(1, st.strokes.length / 100) * 0.35 + mood.energy * 0.3 - mood.intimacy * 0.25),
    sub: clamp(0.4 + mood.darkness * 0.35 + mood.openness * 0.3),
    pad: clamp(0.2 + mood.warmth * 0.15 + mood.openness * 0.35 + mood.intimacy * 0.4 + f.smoothness * 0.2 - mood.energy * 0.25),
    crackle: clamp(f.detail * 0.7 + mood.warmth * 0.3 - 0.25),
    hiss: clamp(mood.darkness * 0.55 + st.voids.fraction * 0.5 - 0.1),
    grain: clamp(f.flow * 1.1 + sal * 0.2 + (c.water || 0) * 0.3),
    stutter: clamp(f.graphic * 0.7 + sal * 0.45 + f.edgeDensity * 0.3 - mood.intimacy * 0.35 - 0.1),
  };
  const has = Object.fromEntries(Object.entries(amt).map(([k, v]) => [k, v >= 0.25]));
  has.kick = has.click = true;

  // ── rhythm ──
  const styleW = {
    straight: f.lineStrength * 1.2 + f.graphic * 0.6 + (c.city || 0) * 0.3,
    rolling: f.flow * 1.4 + (c.fabric || 0) * 0.4 + (c.water || 0) * 0.2,
    half: mood.openness * 1.1 + f.smoothness * 0.3,
    broken: mood.intimacy * 1.1 + f.organic * 0.4,
    sparse: st.voids.fraction * 1.3 + mood.darkness * 0.3,
  };
  for (const k in styleW) styleW[k] += rng() * 0.12;
  const kickStyle = Object.entries(styleW).sort((a, b) => b[1] - a[1])[0][0];
  const swing = kickStyle === 'straight' ? 0 : kickStyle === 'rolling' ? 0.12 + f.flow * 0.1 : clamp(f.flow * 0.12 + mood.intimacy * 0.05, 0, 0.1);
  const kickChar = mood.darkness > 0.75 ? 'deep' : M.kick;
  // corners projected onto x → which 16ths the hats live on (the image's own rhythm)
  const hist = new Array(16).fill(0);
  for (const k of st.corners) hist[Math.min(15, Math.floor(k.x * 16))] += k.r;
  const hmax = Math.max(1e-6, ...hist);
  const hatW = hist.map((v) => v / hmax);
  // polyrhythmic click cycle (Bretschneider): 3, 5 or 7 against 16
  const clickCycle = [3, 5, 7][(an.points.length + st.corners.length) % 3];

  // ── visual vocabulary ──
  const segN = st.segments.length / 24;
  const vw = {
    topography: f.smoothness * 1.0 + f.tonalRange * 0.25 + mood.openness * 0.3 + ((c.nature || 0) + (c.water || 0)) * 0.2,
    orbit: f.pointScore * 1.0 + f.circularity * 0.5,
    constellation: nCorners * 0.35 + f.pointScore * 0.45 + (c.night || 0) * 0.2 + nLights * 0.2,
    fragments: st.regions.distinct / 6 * 0.4 + st.colour.colourfulness * 0.6 + f.organic * 0.15 + (f.face > 0 ? 0.15 : 0) + mood.warmth * 0.1,
    sort: f.detail * 0.15 + f.flow * 0.55 + f.edgeDensity * 0.15 + (c.fabric || 0) * 0.2,
    barcode: f.lineStrength * 0.85 + segN * 0.2 + (c.city || 0) * 0.25,
    particles: (f.face > 0 ? 0.9 + f.faceSize : 0) + f.organic * 0.35 + mood.intimacy * 0.3,
    flow: f.flow * 1.1 + (c.fabric || 0) * 0.3,
    matrix: f.graphic * 1.0 + (c.abstract || 0) * 0.3,
  };
  for (const k in vw) vw[k] = Math.max(0, vw[k] + (rng() - 0.5) * 0.06);
  const vocabRank = LAYERS.slice().sort((a, b) => vw[b] - vw[a]);

  // ── signature moments (ranked) ──
  const sw = {
    RECONSTRUCT: (f.face > 0 ? 1 : 0) + f.organic * 0.5 + vw.fragments * 0.5 + vw.particles * 0.4,
    GRID: f.lineStrength * 0.8 + f.graphic * 0.6 + vw.matrix * 0.4 + vw.barcode * 0.3,
    NETWORK: f.pointScore + nCorners * 0.3 + vw.constellation * 0.5 + vw.orbit * 0.4,
    SWEEP: f.flow * 0.8 + f.detail * 0.3 + vw.sort * 0.6 + vw.flow * 0.4,
    STRATA: f.smoothness * 0.8 + vw.topography * 0.7 + mood.openness * 0.3,
  };
  for (const k in sw) sw[k] += rng() * 0.1;
  const sigRank = SIGNATURES.slice().sort((a, b) => sw[b] - sw[a]);

  // seeded visual parameters (so two photos in the same vocabulary still differ)
  const vr = makeRng(seed ^ 0xa11ce);
  const ACCENTS = [[0.45, 0.95, 1.0], [0.55, 0.78, 1.0], [0.5, 1.0, 0.86], [0.72, 0.86, 1.0], [0.35, 0.85, 0.95]];
  const params = {
    accent: vr.pick(ACCENTS), density: vr.range(0.8, 1.2), speed: vr.range(0.75, 1.3), thickness: vr.range(0.7, 1.4),
    matrixCols: vr.int(36, 72), contourLevels: vr.int(14, 34), orbitRings: vr.range(0.035, 0.08),
  };

  const stepDur = 60 / bpm / 4;
  const piece = {
    params,
    seed, bpm, stepDur, barDur: stepDur * STEPS, root, scale, mode: M.name, chords, mood, content: c,
    amt, has, kickStyle, kickChar, swing, hatW, clickCycle,
    vocabWeights: vw, vocabRank, sigWeights: sw, sigRank,
    an, st, f,
    passes: [],
  };
  piece.pass = (p) => passPlan(piece, p);
  piece.bar = (n) => barEvents(piece, n);
  piece.locate = (n) => locate(piece, n);
  piece.state = (bars) => stateAt(piece, bars);
  return piece;
}

/** Chord (semitones above the root) from scale degree d. Never sweet: no close major triads. */
function chordFrom(scale, d, quartal) {
  const n = scale.length, deg = (k) => scale[(d + k) % n] + 12 * Math.floor((d + k) / n);
  if (quartal) return [deg(0), deg(2), deg(4), deg(6) + 12].map((s) => s + 24);
  return [deg(0), deg(4), deg(8), deg(9)].map((s) => s + 24); // root, fifth-ish, ninth, tenth — open voicing
}

// ── one pass of the loop (sections, vocabulary, signature, structure order) ──
function passPlan(P, p) {
  if (P.passes[p]) return P.passes[p];
  const prev = p > 0 ? passPlan(P, p - 1) : null;
  const rng = makeRng(hashInts(P.seed, p, 0x9a55));
  const m = P.mood, f = P.f;
  // target seconds, shaped by the image, jittered per pass
  const t = {
    READING: 20 + P.st.voids.fraction * 8 + m.openness * 3 - m.energy * 3,
    DECOMPOSITION: 35 - P.st.voids.fraction * 4,
    BUILD: 45 + m.energy * 9 - m.intimacy * 5,
    PEAK: 30 - m.intimacy * 5 + m.energy * 3,
    AFTERGLOW: 30 + m.intimacy * 8 + m.openness * 4,
    MEMORY: 20 + P.st.voids.fraction * 4,
  };
  for (const k in t) t[k] *= 0.88 + rng() * 0.24;
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  const sections = [];
  let start = 0;
  for (const name of SECTIONS) {
    const sec = t[name] * 180 / total;                            // normalise to ≈ 3 minutes
    let bars = Math.max(name === 'MEMORY' ? 4 : 6, Math.round(sec / P.barDur / 2) * 2);
    sections.push({ name, start, bars });
    start += bars;
  }
  // vocabulary: A, B, C — rotated on later passes so they never repeat identically
  const r = P.vocabRank;
  let vocab = [r[0], r[1], r[2]];
  if (p > 0) {
    const pool = r.slice(0, 4);
    const shift = p % 3;
    vocab = [pool[shift % 4], pool[(shift + 1) % 4], pool[(shift + 2) % 4]];
    if (prev && vocab.join() === prev.vocab.join()) vocab = [vocab[1], vocab[0], vocab[2]];
  }
  const signature = P.sigRank[p % 2 === 0 ? 0 : 1] || P.sigRank[0];
  // the order in which the photo's own structures are revealed
  const order = (n) => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { if (rng() < 0.35) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } } return a; };
  const plan = {
    p, sections, totalBars: start, vocab, signature,
    rot: Math.floor(rng() * 16), strokeOrder: order(P.st.strokes.length), pointOrder: order(Math.max(1, P.an.points.length)),
    startBar: prev ? prev.startBar + prev.totalBars : 0,
    rng,
  };
  P.passes[p] = plan;
  return plan;
}

/** Global bar → { pass plan, bar in pass, section, bar in section }. */
function locate(P, n) {
  let p = 0;
  while (true) { const pl = passPlan(P, p); if (n < pl.startBar + pl.totalBars) break; p++; if (p > 999) break; }
  const pl = passPlan(P, p), b = n - pl.startBar;
  const sec = pl.sections.find((s) => b >= s.start && b < s.start + s.bars) || pl.sections[0];
  return { pl, b, sec, si: SECTIONS.indexOf(sec.name), sb: b - sec.start, sp: (b - sec.start) / sec.bars };
}

/** Tension curve 0..1 at fractional bar position within a section. */
function tensionAt(name, sp, sb) {
  switch (name) {
    case 'READING': return lerp(0.05, 0.15, sp);
    case 'DECOMPOSITION': return lerp(0.2, 0.45, sp);
    case 'BUILD': return lerp(0.45, 0.85, sp) + 0.06 * Math.sin(((sb % 8) / 8) * Math.PI);  // micro-arcs every 8 bars
    case 'PEAK': return lerp(0.9, 1.0, Math.min(1, sp * 1.5));
    case 'AFTERGLOW': return lerp(0.35, 0.15, sp);
    default: return lerp(0.1, 0.0, sp);
  }
}

// ── continuous state for both engines ───────────────────────
function stateAt(P, barsF) {
  const n = Math.floor(barsF), frac = barsF - n;
  const L = locate(P, Math.max(0, n));
  const { pl, sec, si } = L;
  const sp = (L.sb + frac) / sec.bars;                           // section progress 0..1
  const T = tensionAt(sec.name, sp, L.sb + frac);
  const sb = L.sb + frac;
  const pres = {};
  for (const k of LAYERS) pres[k] = 0;
  const [A, B, C] = pl.vocab;
  const sig = pl.signature;
  const peakLast = sec.name === 'PEAK' && L.sb === sec.bars - 1;
  // structural layers (the image's own lines and points)
  const contours = [smoothstep(0, 0.15, sp), 1, 0.85, 1, lerp(0.7, 0.25, sp), lerp(0.2, 0, sp)][si];
  const constel = [smoothstep(0, 0.2, sp), 0.75, 0.55, sig === 'NETWORK' ? 1 : 0.45, lerp(0.35, 0, sp), 0][si];
  pres.constellation = constel;
  const ramp = (from, len) => smoothstep(from, from + len, sb);
  if (si === 1) pres[A] = Math.max(pres[A], ramp(0, sec.bars * 0.5));
  if (si === 2) {
    pres[A] = 1;
    pres[B] = Math.max(pres[B], 0.85 * ramp(sec.bars / 3, 4));
    pres[C] = Math.max(pres[C], 0.65 * ramp(sec.bars * 2 / 3, 4));
  }
  if (si === 3) { pres[A] = 1; pres[B] = Math.max(pres[B], 0.85); pres[C] = Math.max(pres[C], 0.7); }
  if (si === 4) { const fall = 1 - smoothstep(0, 0.6, sp); pres[A] = Math.max(pres[A], 0.6 * fall); pres[B] = Math.max(pres[B], 0.35 * fall); pres[C] = Math.max(pres[C], 0.25 * fall); }
  // signature moment: 0→1 across the peak
  const signature = si === 3 ? smoothstep(0.1, 0.85, sp) : 0;
  if (si === 3) {
    if (sig === 'STRATA') pres.topography = Math.max(pres.topography, 1);
    if (sig === 'GRID') pres.matrix = Math.max(pres.matrix, 0.6 + 0.4 * signature);
    if (sig === 'SWEEP') pres.sort = Math.max(pres.sort, 1);
    if (sig === 'RECONSTRUCT') pres.fragments = Math.max(pres.fragments, 1);
  }
  // flash on the downbeat of the last peak bar, then black for the rest of that bar
  const flash = peakLast ? Math.exp(-frac * 9) : 0;
  const black = peakLast ? smoothstep(0.02, 0.12, frac) : 0;
  // ghost of the photograph: reading start, reconstruct, memory
  let ghost = 0;
  if (si === 0) ghost = lerp(1, 0.1, smoothstep(0, 1.6, sb)) * (1 - smoothstep(0.8, 1, sp) * 0.6);
  if (si === 1) ghost = 0.04 * (1 - sp);
  if (si === 3 && sig === 'RECONSTRUCT') ghost = 0.75 * smoothstep(0.55, 0.95, sp);
  if (si === 5) ghost = 0.2 * smoothstep(0, 0.25, sp) * (1 - smoothstep(0.6, 0.95, sp));
  const glitch = [0, 0.25, 0.35 + T * 0.4, 1, 0.1, 0][si];
  const fall = si === 4 ? smoothstep(0, 1, sp) : si === 5 ? 1 : 0;
  const k = 1 - black;
  for (const key in pres) pres[key] *= k;
  return {
    pass: pl.p, plan: pl, section: sec.name, si, sb: L.sb, bars: sec.bars, sp, tension: T,
    presence: pres, contours: contours * k, glitch: glitch * k, ghost, flash, black, fall, signature, sigName: sig,
  };
}

// ── events of one bar ───────────────────────────────────────
function barEvents(P, n) {
  const L = locate(P, n), { pl, sec, si, sb } = L;
  const rng = makeRng(hashInts(P.seed, n, 0xba7));
  const st = P.st, an = P.an, f = P.f, A = P.amt, H = P.has;
  const sp = sb / sec.bars, T = tensionAt(sec.name, sp, sb);
  const ev = [];
  const push = (step, type, o = {}) => ev.push({ step, type, ...o });
  const last = sb === sec.bars - 1;
  const phrasePos = sb % 8;
  const rot = pl.rot;
  const pan = (x) => clamp(x * 1.8 - 0.9, -0.9, 0.9);
  if (sb === 0) push(0, 'section', { name: sec.name, index: si, pass: pl.p });

  // ── READING: the structures are revealed one by one, each with its sound ──
  if (si === 0) {
    if (sb % 4 === 0) push(0, 'sub', { freq: P.root, dur: 4, vel: 0.16 + 0.1 * A.sub });
    const strokes = st.strokes, pts = an.points.length ? an.points : st.corners.slice(0, 24);
    const nS = Math.min(strokes.length, 10 + sec.bars * 2), nP = Math.min(pts.length, 8 + sec.bars * 2);
    const totalSteps = (sec.bars - 0.5) * STEPS;
    // stroke k is revealed at a time that accelerates through the section
    for (let k = 0; k < nS; k++) {
      const at = Math.floor(Math.pow((k + 0.5) / nS, 0.75) * totalSteps);
      if (Math.floor(at / STEPS) !== sb) continue;
      const id = pl.strokeOrder[k] ?? k, s = strokes[id];
      if (!s) continue;
      const [x, y] = s.pts[0];
      push(at % STEPS, 'reveal', { what: 'stroke', id, dur: 4 + Math.min(12, Math.round(s.len * 40)), x, y, pan: pan(x), vel: 0.25 + 0.4 * Math.min(1, s.strength), freq: 260 + (1 - y) * 520 });
    }
    for (let k = 0; k < nP; k++) {
      const at = Math.floor(Math.pow((k + 0.3) / nP, 0.9) * totalSteps) + 2;
      if (Math.floor(at / STEPS) !== sb) continue;
      const id = pl.pointOrder[k % pl.pointOrder.length] ?? k, q = pts[id % pts.length];
      push(at % STEPS, 'click', { x: q.x, y: q.y, pan: pan(q.x), vel: 0.3 + 0.5 * (q.peak || q.r || 0.5), variant: k % 4, point: id, reveal: true });
    }
    // topography: one contour level per bar appears
    push(8, 'reveal', { what: 'level', id: sb, vel: 0.12, x: 0.5, y: 0.5, pan: 0, freq: P.root * 4 * Math.pow(2, P.scale[sb % P.scale.length] / 12), soft: true });
    if (last) return ev.filter((e) => e.step < 8 || e.type === 'section');
    return ev;
  }

  // ── MEMORY: a faint ghost, one tone, silence ──
  if (si === 5) {
    if (sb === 0) push(0, 'tone', { freq: P.root * 4 * Math.pow(2, (P.chords[0][0] % 12) / 12), dur: 3.5, vel: 0.12 });
    if (sb === 1) push(4, 'tex', { kind: 'hiss', dur: 2, vel: 0.05 });
    return ev;
  }

  const playing = { kick: si === 1 || si === 2 || si === 3, heartbeat: si === 4 };

  // ── kick (pulse) ──
  const kstyle = P.kickStyle;
  let ks = { straight: [0, 4, 8, 12], rolling: [0, 4, 8, 12], half: [0, 8], broken: [0, 8, 11], sparse: [0, 10] }[kstyle];
  if (si === 1 && sb < 4) ks = [0];
  else if (si === 1 && sb < 8) ks = ks.filter((s) => s === 0 || s === 8);
  if (si === 3 && kstyle === 'sparse') ks = [0, 6, 10];
  const contrast = clamp(0.62 + f.contrast * 1.2, 0.5, 1);
  if (playing.kick) {
    for (const s of ks) push(s, 'kick', { vel: contrast * (s === 0 ? 1 : 0.92), char: P.kickChar });
    // ghost kicks (rolling / tension)
    if ((kstyle === 'rolling' || T > 0.7) && si >= 2) for (const s of [7, 14]) if (rng() < 0.25 + T * 0.3) push(s, 'kick', { vel: contrast * 0.35, char: P.kickChar, ghost: true });
  } else if (playing.heartbeat && sb % 2 === 0 && P.mood.intimacy < 0.7) {
    push(0, 'kick', { vel: 0.45, char: 'soft', soft: true });   // a soft heartbeat in the afterglow
  }

  // ── bass: phrases drawn from the photo's strokes ──
  if (H.bass && (si === 2 || si === 3 || (si === 1 && sb >= sec.bars / 2))) {
    const strokes = st.strokes;
    if (strokes.length) {
      const id = pl.strokeOrder[Math.floor((sb + pl.p * 3) / 4) % Math.min(strokes.length, 12)] ?? 0;
      const s = strokes[id];
      const notes = strokeToPhrase(s, P, rot, T);
      for (const nt of notes) push(nt.step, 'bass', { ...nt, stroke: id, cutoff: 260 + T * 640, vel: (0.55 + 0.3 * Math.min(1, s.strength)) * (si === 1 ? 0.8 : 1) });
    }
  } else if (P.has.sub && (si === 1 || si === 2) && sb % 4 === 0 && !H.bass) {
    push(0, 'sub', { freq: P.root, dur: 4, vel: 0.2 });
  }

  // ── hats: steps where the image has corners ──
  if (H.hat && (si === 2 || si === 3 || (si === 1 && sp > 0.75))) {
    const dens = A.hat * (0.35 + T * 0.75);
    for (let i = 0; i < STEPS; i++) {
      const w = P.hatW[(i + rot) % 16];
      const off = i % 4 === 2;                                    // offbeats always welcome
      if (w * dens + (off && kstyle === 'straight' ? 0.4 : 0) < 0.35 + rng() * 0.3) continue;
      const k = st.corners[(n * 7 + i * 3) % Math.max(1, st.corners.length)] || { x: i / 16, y: 0.5 };
      push(i, 'hat', { vel: 0.12 + 0.3 * w * (off ? 1.2 : 0.8), open: off && rng() < 0.2 * T, x: k.x, y: k.y, pan: pan(k.x) * 0.6, corner: (n * 7 + i * 3) % Math.max(1, st.corners.length) });
    }
  }

  // ── clicks: light points / corners in a polyrhythmic cycle (with their flashes) ──
  const pts = an.points.length >= 4 ? an.points : st.corners.slice(0, 48);
  if (pts.length && si >= 1 && si <= 3) {
    const cyc = si === 3 ? Math.max(2, P.clickCycle - 2) : P.clickCycle;
    const base = n * STEPS;
    const dens = 0.45 + A.click * 0.5;
    for (let i = 0; i < STEPS; i++) {
      if ((base + i + rot) % cyc !== 0) continue;
      if (rng() > dens * (0.5 + T * 0.6)) continue;
      const id = ((base + i) / cyc | 0) % pts.length, q = pts[id];
      const sub = (f.edgeDensity > 0.4 && rng() < 0.3) ? 0.5 : 0;  // 32nd displacement
      push(i + sub, 'click', { x: q.x, y: q.y, pan: pan(q.x), vel: 0.35 + 0.55 * (q.peak || q.r || 0.6), variant: (id + i) % 4, point: id });
    }
  }

  // ── rims: the photo's straight lines ──
  if (H.rim && st.segments.length && si >= 1 && si <= 3 && (si > 1 || sp > 0.5)) {
    const nSeg = 1 + Math.floor(T * 2.5);
    for (let k = 0; k < nSeg; k++) {
      const id = (n * 3 + k + rot) % st.segments.length, sg = st.segments[id];
      for (const [x, y] of [[sg.x1, sg.y1], [sg.x2, sg.y2]]) {
        const step = Math.min(15, Math.floor(x * 16));
        if (rng() > 0.55 + T * 0.4) continue;
        push(step, 'rim', { freq: 420 + (sg.angle / 180) * 900, vel: 0.2 + 0.4 * Math.min(1, sg.strength), x, y, pan: pan(x), seg: id });
      }
    }
  }

  // ── snare / clap ──
  if (H.snare && (si === 3 || (si === 2 && sp > 0.25))) {
    const sn = kstyle === 'half' ? [8] : kstyle === 'broken' ? [12] : [4, 12];
    for (const s of sn) push(s, 'snare', { vel: 0.35 + 0.35 * T, clap: P.st.colour.colourfulness > 0.35 });
  }

  // ── pads: chords from the colour regions ──
  const padOn = (H.pad && (si === 2 && sp > 0.4 || si === 3)) || si === 4;
  if (padOn && sb % (si === 4 ? 2 : 4) === 0) {
    const ci = Math.floor(sb / (si === 4 ? 2 : 4) + pl.p) % P.chords.length;
    const freqs = P.chords[ci].map((s) => P.root * Math.pow(2, s / 12));
    const cl = st.regions.clusters[ci % st.regions.clusters.length];
    push(0, 'pad', { freqs, dur: si === 4 ? 2 : 4, vel: (si === 4 ? 0.16 : 0.09) * (0.6 + A.pad * 0.6), cutoff: si === 4 ? 650 + 300 * P.mood.warmth : 380 + 600 * T, cluster: ci, x: cl ? cl.x : 0.5, y: cl ? cl.y : 0.5, warm: P.mood.warmth });
  }
  if (si === 4 && sb % 2 === 1 && P.has.sub) push(0, 'sub', { freq: P.root * (sb % 4 === 1 ? 1 : 1.5), dur: 1, vel: 0.14 });

  // ── decomposition actions: strokes detach, regions fracture ──
  if (si === 1 || si === 2) {
    const k = Math.min(st.strokes.length, sb * 2 + 2);
    for (let j = 0; j < 2; j++) {
      const idx = pl.strokeOrder[(sb * 2 + j) % Math.max(1, st.strokes.length)];
      if (idx === undefined || sb * 2 + j >= k) continue;
      const s = st.strokes[idx]; if (!s) continue;
      const [x, y] = s.pts[Math.floor(s.pts.length / 2)];
      push(j ? 10 : 2, 'detach', { what: 'stroke', id: idx, x, y, pan: pan(x), vel: 0.25, freq: 300 + (1 - y) * 500 });
    }
    if (sb % 2 === 1) {
      const cl = st.regions.clusters[(sb + pl.p) % st.regions.clusters.length];
      push(sb % 4 === 1 ? 6 : 14, 'fracture', { cluster: cl.id, x: cl.x, y: cl.y, pan: pan(cl.x), vel: 0.18 + 0.2 * T, dx: (rng() - 0.5) * 0.4, dy: (rng() - 0.5) * 0.3 });
    }
  }

  // ── glitch emitters (salient regions) + data stutters ──
  if (H.stutter && st.salient.peaks.length && si >= 2 && si <= 3) {
    const tries = si === 3 ? 2 : 1;
    for (let k = 0; k < tries; k++) {
      if (rng() > A.stutter * (0.35 + T * 0.6)) continue;
      const id = (n + k) % st.salient.peaks.length, r = st.salient.peaks[id];
      push(rng.int(4, 15), 'stutter', { count: rng.int(3, 8), rate: rng.pick([1 / 3, 1 / 4, 1 / 6]), vel: 0.14 + 0.12 * r.s, x: r.x, y: r.y, pan: pan(r.x), region: id, row: Math.floor(r.y * 31), crush: rng() < 0.3 + f.graphic * 0.4 });
    }
  }

  // ── textures ──
  if (sb % 2 === 0 && si >= 1) {
    if (H.crackle) push(0, 'tex', { kind: 'crackle', dur: 2, vel: 0.05 + 0.08 * A.crackle * (si === 4 ? 1.3 : 0.7 + T * 0.5) });
    if (H.hiss) push(0, 'tex', { kind: 'hiss', dur: 2, vel: 0.03 + 0.05 * A.hiss });
  }
  if (H.grain && si >= 2 && si <= 4 && rng() < 0.5) {
    const r = st.salient.peaks[n % Math.max(1, st.salient.peaks.length)] || { x: 0.5, y: 0.5 };
    push(rng.int(0, 7), 'tex', { kind: 'grain', dur: 1, vel: 0.06 + 0.08 * A.grain, x: r.x, y: r.y, pan: pan(r.x), row: Math.floor(r.y * 31) });
  }

  // ── fills on the last bar of 8-bar phrases ──
  if ((si === 2 || si === 3) && phrasePos === 7) {
    for (let i = 12; i < 16; i++) {
      const sg = st.segments[(n + i) % Math.max(1, st.segments.length)];
      push(i + (i % 2 ? 0.5 : 0), H.rim && sg ? 'rim' : 'click', { freq: 600 + i * 40, vel: 0.2 + (i - 12) * 0.08, x: sg ? sg.x1 : i / 16, y: sg ? sg.y1 : 0.5, pan: pan(i / 16), variant: 3, seg: sg ? (n + i) % st.segments.length : undefined });
    }
  }

  // ── PEAK: signature actions, flash on the last bar ──
  if (si === 3) {
    if (sb === 0) push(0, 'signature', { name: pl.signature });
    if (last) {
      const keep = ev.filter((e) => e.step < 1 && e.type !== 'pad');
      keep.push({ step: 0, type: 'flash', vel: 1 });
      keep.push({ step: 0, type: 'sub', freq: P.root, dur: 1, vel: 0.35 });
      return keep;
    }
  }

  // ── silence: mutes follow the empty areas of the photo; a breath before boundaries ──
  let mute = null;
  if (last && si !== 4) mute = [12, 16];
  else if (si >= 1 && si <= 3 && rng() < st.voids.fraction * 0.35 + 0.03) mute = rng.pick([[12, 16], [8, 12], [14, 16]]);
  const keep = mute ? ev.filter((e) => ['sub', 'pad', 'tex', 'section', 'signature'].includes(e.type) || e.step < mute[0] || e.step >= mute[1]) : ev;
  keep.sort((a, b) => a.step - b.step);
  return keep;
}

/** A stroke becomes a bass phrase: its vertices are the notes, its height the pitch. */
function strokeToPhrase(s, P, rot, T) {
  const pts = s.pts;
  // cumulative arc length → step position; RDP vertices are the stroke's "turns"
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
  const total = cum[cum.length - 1] || 1;
  const maxNotes = 2 + Math.round(T * 3);
  const cand = [];
  for (let k = 0; k < pts.length; k++) {
    const step = (Math.floor(cum[k] / total * 15.99) + rot) % 16;
    const turn = k > 0 && k < pts.length - 1 ? Math.abs(Math.atan2(pts[k + 1][1] - pts[k][1], pts[k + 1][0] - pts[k][0]) - Math.atan2(pts[k][1] - pts[k - 1][1], pts[k][0] - pts[k - 1][0])) : 1;
    cand.push({ step, y: pts[k][1], turn });
  }
  cand.sort((a, b) => b.turn - a.turn);
  const used = new Set(), notes = [];
  for (const c of cand) {
    if (notes.length >= maxNotes) break;
    if (used.has(c.step) || used.has(c.step - 1)) continue;
    used.add(c.step);
    const deg = Math.min(P.scale.length - 1, Math.floor((1 - c.y) * 5));
    notes.push({ step: c.step, freq: P.root * 2 * Math.pow(2, P.scale[deg] / 12) });
  }
  notes.sort((a, b) => a.step - b.step);
  notes.forEach((nt, k) => { const next = k + 1 < notes.length ? notes[k + 1].step : 16; nt.dur = Math.max(1, Math.min(6, next - nt.step) * (0.5 + 0.4 * (1 - T))); });
  return notes;
}

export { euclid };
