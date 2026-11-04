// ─────────────────────────────────────────────────────────────
//  journey.js — how the image decides its own journey.
//
//  The world weights and per-photo visual params are restored from
//  round 3 (worlds.js, v1). TOPOGRAPHY is no longer a spectrum: it is
//  act 1, MEASUREMENT. The analysis decides
//    · which 2–3 spectra the image is decomposed into (act 2), in an
//      order from most ordered to most entropic (MATRIX → RASTER →
//      ORBIT → FLOW → DISSOLUTION: order → chaos), each lasting in
//      proportion to how strongly the image calls for it
//    · the length of every act, the camera path and angles, the accent
//      colour (from the photo's palette), densities and speeds
//    · the sound style of each spectrum (round-3 SOUND_STYLE, without
//      the kick patterns: pulses and fragments, never a beat)
//  Everything is seeded from the image signature.
// ─────────────────────────────────────────────────────────────
import { makeRng, clamp, lerp } from './rng.js';

export const SPECTRA = ['MATRIX', 'RASTER', 'ORBIT', 'FLOW', 'DISSOLUTION'];   // order → chaos

/** Weight of each spectrum given the features (round-3 formulas). */
export function spectraWeights(f, rng) {
  const faceTerm = f.face > 0 ? (0.55 + 0.45 * f.face) * (0.55 + Math.min(1, f.faceSize * 5) * 0.45) : 0;
  const w = {
    DISSOLUTION: 1.15 * faceTerm + 0.35 * f.organic + 0.15 * f.centreFocus,                       // faces, portraits, organic
    RASTER: (1.05 * f.lineStrength * (0.5 + 0.5 * f.hvLine) + 0.4 * f.hvRatio) * (1 - 0.45 * f.flatness), // lines, architecture
    ORBIT: 1.1 * f.pointScore + 0.55 * f.circularity,                                              // lights, circles
    FLOW: 1.1 * f.flow + 0.15 * f.detail * f.coherence,                                            // motion, fabric
    MATRIX: 1.25 * f.graphic * (0.5 + 0.5 * f.flatness) + 0.25 * f.fewColors,                      // graphic, flat
  };
  for (const k of SPECTRA) w[k] = Math.max(0.01, w[k] + (rng() - 0.5) * 0.04);
  return w;
}

/** Sound style per spectrum (round 3, kicks removed). */
export const SPECTRUM_SOUND = {
  MATRIX:      { clickDens: 0.9, noise: 0.25, data: 0.95, field: 0.8, crush: 0.6, swing: 0.0, silence: 0.2, glitch: 0.7, sub: 'pulse', subSteps: [2, 3, 6, 7, 10, 11, 14, 15], dataKind: 'stutter' },
  RASTER:      { clickDens: 1.0, noise: 0.45, data: 0.55, field: 0.5, crush: 0.15, swing: 0.0, silence: 0.12, glitch: 0.5, sub: 'pulse', subSteps: [2, 6, 10, 14], dataKind: 'dial' },
  ORBIT:       { clickDens: 0.4, noise: 0.2, data: 0.4, field: 0.15, crush: 0.03, swing: 0.02, silence: 0.3, glitch: 0.35, sub: 'drone', subSteps: [], dataKind: 'dial' },
  FLOW:        { clickDens: 0.7, noise: 0.55, data: 0.3, field: 0.3, crush: 0.06, swing: 0.14, silence: 0.15, glitch: 0.35, sub: 'pulse', subSteps: [3, 6, 11, 14], dataKind: 'stutter' },
  DISSOLUTION: { clickDens: 0.45, noise: 0.35, data: 0.12, field: 0.1, crush: 0.05, swing: 0.03, silence: 0.45, glitch: 0.3, sub: 'drone', subSteps: [], dataKind: 'stutter' },
};

export function planJourney(analysis, map) {
  const f = analysis.features, rng = makeRng(analysis.seed ^ 0x7a11);
  const weights = spectraWeights(f, rng);
  const ranked = SPECTRA.slice().sort((a, b) => weights[b] - weights[a]);
  const n = weights[ranked[2]] > 0.6 * weights[ranked[0]] || rng() < 0.25 ? 3 : 2;
  const chosen = ranked.slice(0, n);
  const spectra = SPECTRA.filter((s) => chosen.includes(s));                // order → chaos

  // act lengths (bars)
  const decoBars = 2 * Math.round((28 + clamp(f.detail * 0.6 + f.edgeDensity * 0.6) * 8 + rng() * 2) / 2);
  const tw = spectra.reduce((s, k) => s + weights[k], 0);
  const extra = decoBars - 8 * spectra.length;                              // every spectrum gets 8 bars + its share
  let left = decoBars;
  const segs = spectra.map((name, i) => {
    const bars = i === spectra.length - 1 ? left : 8 + 2 * Math.round((extra * weights[name] / tw) / 2);
    left -= bars;
    return { name, bars, style: SPECTRUM_SOUND[name], weight: weights[name] };
  });
  const acts = {
    MEASUREMENT: 12 + 2 * Math.round(rng() * 2 + (1 - f.brightness)),
    DECOMPOSITION: segs.reduce((s, x) => s + x.bars, 0),
    ENTROPY: 14 + 2 * Math.round(clamp(f.edgeDensity + f.detail * 0.5) * 2),
    ABSORPTION: 6 + 2 * Math.round(rng()),
    END: 3,
  };

  // the camera: how far it pulls back for the spectra, their angles, the fall into the singularity
  const cam = {
    pull: lerp(1.18, 1.45, rng()),
    tilt: segs.map(() => rng.range(0.0, 0.32) * (rng() < 0.5 ? 1 : -1)),     // per spectrum: a slight tilt of the image plane
    roll: segs.map(() => rng.range(-0.07, 0.07)),
    drift: rng.range(-0.05, 0.05),                                           // slow yaw drift during entropy
    dolly: lerp(0.62, 0.8, rng()),                                           // how close it falls toward the singularity
  };

  // one accent colour from the photo: its most saturated palette entry, lifted and cooled a little
  const pal = analysis.palette || [];
  let best = null, bs = -1;
  for (const c of pal) { const mx = Math.max(c.r, c.g, c.b), mn = Math.min(c.r, c.g, c.b), s = mx > 0 ? (mx - mn) / mx : 0; if (s * (0.3 + mx) > bs) { bs = s * (0.3 + mx); best = c; } }
  const accent = best && bs > 0.12
    ? (() => { const m = Math.max(best.r, best.g, best.b) || 1; return [lerp(best.r / m, 0.85, 0.35), lerp(best.g / m, 0.92, 0.35), lerp(best.b / m, 1, 0.35)]; })()
    : rng.pick([[0.45, 0.95, 1.0], [0.55, 0.78, 1.0], [0.72, 0.86, 1.0]]);

  // per-photo visual params for the restored v1 spectra (round-3 pieceParams)
  const P = map.params;
  const params = {
    bpm: P.bpm, root: P.root, accent,
    density: rng.range(0.75, 1.2), speed: rng.range(0.7, 1.25), thickness: rng.range(0.7, 1.3),
    rasterRows: rng.int(70, 170), rasterFill: rng.range(0.35, 0.85), rasterGroup: rng.int(1, 8),
    matrixCols: rng.int(36, 72), contourLevels: rng.int(14, 34), orbitRings: rng.range(0.035, 0.08), variant: rng(),
    entropyDrift: [Math.cos(rng() * 6.283), Math.sin(rng() * 6.283)].map((v) => v * rng.range(0.02, 0.06)),
  };
  return { weights, ranked, spectra, segs, acts, cam, accent, params };
}
