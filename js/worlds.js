// ─────────────────────────────────────────────────────────────
//  worlds.js — maps the feature vector to six "worlds" and derives
//  the seeded per-photo parameters (visual + sonic style).
// ─────────────────────────────────────────────────────────────
import { makeRng, clamp, lerp } from './rng.js';

export const WORLDS = ['DISSOLUTION', 'RASTER', 'ORBIT', 'TOPOGRAPHY', 'FLOW', 'MATRIX'];

/** Weight of each world given the features. Each formula reads like the brief. */
export function worldWeights(f, rng) {
  const faceTerm = f.face > 0 ? (0.55 + 0.45 * f.face) * (0.55 + Math.min(1, f.faceSize * 5) * 0.45) : 0;
  const w = {
    // faces, portraits, organic subjects
    DISSOLUTION: 1.15 * faceTerm + 0.35 * f.organic + 0.15 * f.centreFocus,
    // straight lines, architecture, horizons
    RASTER: (1.05 * f.lineStrength * (0.5 + 0.5 * f.hvLine) + 0.4 * f.hvRatio) * (1 - 0.45 * f.flatness),
    // stars, water, light points, circular forms
    ORBIT: 1.1 * f.pointScore + 0.55 * f.circularity,
    // smooth gradients, landscapes, sky
    TOPOGRAPHY: 0.95 * f.smoothness + 0.2 * (1 - f.edgeDensity) * (1 - f.flatness),
    // motion, blur, fabric, fashion
    FLOW: 1.1 * f.flow + 0.15 * f.detail * f.coherence,
    // flat, graphic, abstract
    MATRIX: 1.25 * f.graphic * (0.5 + 0.5 * f.flatness) + 0.25 * f.fewColors,
  };
  // a breath of seeded jitter so ties never resolve the same way for different photos
  for (const k of WORLDS) w[k] = Math.max(0, w[k] + (rng() - 0.5) * 0.04);
  return w;
}

/** Pick primary + secondary world and the blend amount. */
export function chooseWorlds(f, seed) {
  const rng = makeRng(seed ^ 0x5eed);
  const weights = worldWeights(f, rng);
  const ranked = WORLDS.slice().sort((a, b) => weights[b] - weights[a]);
  const primary = ranked[0], secondary = ranked[1];
  const w1 = weights[primary], w2 = weights[secondary];
  const accent = clamp(w2 / (w1 + w2 + 1e-6), 0.18, 0.42);
  return { primary, secondary, accent, weights, ranked };
}

/**
 * Sound style per world. Values are blended between primary and secondary
 * (and pushed further toward the secondary during the breakdown).
 */
export const SOUND_STYLE = {
  //            kickDecay  swing  clickDens sineDens sineLen noise stutter crush silence space subAmt ghost
  DISSOLUTION: { kickDecay: 0.32, swing: 0.03, clickDens: 0.45, sineDens: 0.45, sineLen: 0.09, noise: 0.35, stutter: 0.08, crush: 0.05, silence: 0.35, space: 0.05, sub: 0.15, ghost: 0.15, kickGain: 0.75 },
  RASTER:      { kickDecay: 0.26, swing: 0.0,  clickDens: 1.0,  sineDens: 0.55, sineLen: 0.05, noise: 0.5,  stutter: 0.15, crush: 0.15, silence: 0.08, space: 0.0,  sub: 0.1,  ghost: 0.1,  kickGain: 1.0 },
  ORBIT:       { kickDecay: 0.55, swing: 0.02, clickDens: 0.4,  sineDens: 0.8,  sineLen: 0.6,  noise: 0.3,  stutter: 0.05, crush: 0.03, silence: 0.15, space: 0.35, sub: 0.55, ghost: 0.2,  kickGain: 0.85 },
  TOPOGRAPHY:  { kickDecay: 0.85, swing: 0.04, clickDens: 0.35, sineDens: 0.35, sineLen: 0.3,  noise: 0.25, stutter: 0.05, crush: 0.03, silence: 0.2,  space: 0.12, sub: 1.0,  ghost: 0.1,  kickGain: 0.95 },
  FLOW:        { kickDecay: 0.4,  swing: 0.17, clickDens: 0.75, sineDens: 0.5,  sineLen: 0.12, noise: 0.55, stutter: 0.12, crush: 0.06, silence: 0.08, space: 0.1,  sub: 0.3,  ghost: 0.55, kickGain: 0.9 },
  MATRIX:      { kickDecay: 0.22, swing: 0.0,  clickDens: 0.9,  sineDens: 0.5,  sineLen: 0.04, noise: 0.6,  stutter: 0.75, crush: 0.6,  silence: 0.18, space: 0.0,  sub: 0.12, ghost: 0.3,  kickGain: 0.9 },
};

export function blendStyle(a, b, t) {
  const A = SOUND_STYLE[a], B = SOUND_STYLE[b], out = {};
  for (const k in A) out[k] = lerp(A[k], B[k], t);
  return out;
}

/** Seeded visual + musical parameters for one photo. */
export function pieceParams(analysis, choice) {
  const f = analysis.features;
  const rng = makeRng(analysis.seed ^ 0xa11ce);
  // brightness → tempo (112–128 BPM), root (D1..A#1 region, semitone-quantised)
  const bpm = Math.round((112 + clamp(f.brightness * 1.25) * 16 + rng.range(-0.8, 0.8)) * 10) / 10;
  const semis = Math.round(clamp(f.brightness) * 8 + rng.range(-1, 1));
  const root = 36.71 * Math.pow(2, semis / 12);
  // hue → pitch set (harmonic numbers over the root, very high register)
  const HARM_SETS = [
    [16, 18, 24, 27, 32, 36],   // red      — open, fourths/fifths
    [16, 20, 24, 30, 32, 40],   // orange   — major partials
    [16, 19, 24, 28, 32, 38],   // yellow   — minor-ish
    [16, 21, 24, 28, 32, 42],   // green    — septimal
    [16, 17, 24, 25, 32, 34],   // cyan     — cold beating
    [16, 24, 27, 32, 36, 48],   // blue     — hollow
    [16, 22, 24, 33, 32, 44],   // violet   — 11th partial
  ];
  const harmonics = HARM_SETS[Math.floor(f.hue * HARM_SETS.length) % HARM_SETS.length];
  // one cold accent colour per photo
  const ACCENTS = [[0.45, 0.95, 1.0], [0.55, 0.78, 1.0], [0.5, 1.0, 0.86], [0.72, 0.86, 1.0], [0.35, 0.85, 0.95]];
  const accent = rng.pick(ACCENTS);
  return {
    bpm, root, harmonics, accent,
    density: rng.range(0.75, 1.25),      // visual density multiplier
    speed: rng.range(0.7, 1.35),         // visual speed multiplier
    thickness: rng.range(0.7, 1.4),      // line thickness multiplier
    rasterRows: rng.int(70, 170),
    rasterFill: rng.range(0.35, 0.85),
    rasterGroup: rng.int(1, 8),
    matrixCols: rng.int(36, 72),
    contourLevels: rng.int(14, 34),
    orbitRings: rng.range(0.035, 0.08),
    variant: rng(),
  };
}
