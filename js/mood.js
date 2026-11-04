// ─────────────────────────────────────────────────────────────
//  mood.js — a subtle emotional reading of the photograph.
//  A continuous vector (warmth, energy, darkness, openness,
//  intimacy) plus the nearest of five named prototypes. Both
//  engines read the vector; the name is only a readout + defaults.
// ─────────────────────────────────────────────────────────────
import { clamp } from './rng.js';

export const MOODS = {
  'warm / intimate': { warmth: 0.75, energy: 0.35, darkness: 0.45, openness: 0.35, intimacy: 0.8 },
  'cold / clinical': { warmth: 0.25, energy: 0.5, darkness: 0.3, openness: 0.3, intimacy: 0.1 },
  'dark / mysterious': { warmth: 0.45, energy: 0.35, darkness: 0.85, openness: 0.45, intimacy: 0.25 },
  'vast / calm': { warmth: 0.5, energy: 0.15, darkness: 0.35, openness: 0.85, intimacy: 0.15 },
  'tense / dense': { warmth: 0.5, energy: 0.8, darkness: 0.45, openness: 0.1, intimacy: 0.15 },
};

export function deriveMood(f, st, content) {
  const c = content || {};
  const v = {
    warmth: clamp(0.5 + st.colour.temperature * 0.9),
    // calibrated so that an ordinary photo sits around 0.5
    energy: clamp(f.edgeDensity * 0.55 + f.contrast * 0.8 + f.detail * 0.15 + st.colour.colourfulness * 0.2 + st.segments.length / 24 * 0.12 - f.smoothness * 0.45 - st.voids.fraction * 0.3 - 0.12 + (c.city || 0) * 0.1),
    darkness: clamp(1 - f.brightness * 1.5 + st.voids.fraction * 0.4 + (c.night || 0) * 0.2),
    openness: clamp(f.smoothness * 0.55 + st.voids.fraction * 0.3 + (1 - f.edgeDensity) * 0.3 + ((c.nature || 0) + (c.water || 0)) * 0.25 - f.lineStrength * 0.15),
    intimacy: clamp((f.face > 0 ? 0.55 + Math.min(1, f.faceSize * 4) * 0.35 : 0) + f.organic * 0.3 + (c.portrait || 0) * 0.3),
  };
  let best = null, bd = Infinity;
  for (const [name, p] of Object.entries(MOODS)) {
    // intimacy and darkness are decisive when strong
    const d = (v.warmth - p.warmth) ** 2 + (v.energy - p.energy) ** 2 + 1.3 * (v.darkness - p.darkness) ** 2 + (v.openness - p.openness) ** 2 + 1.6 * (v.intimacy - p.intimacy) ** 2;
    if (d < bd) { bd = d; best = name; }
  }
  return { ...v, name: best };
}
