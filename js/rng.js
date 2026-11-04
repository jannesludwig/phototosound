// ─────────────────────────────────────────────────────────────
//  rng.js — hashing + seeded randomness.
//  The image signature seeds every random choice in the piece,
//  so the same photograph always produces the same work.
// ─────────────────────────────────────────────────────────────

/** cyrb53-style 53-bit hash over a byte array. Returns [h1, h2] (uint32 each). */
export function hashBytes(bytes, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

/** Hash a list of integers (used to derive sub-seeds, e.g. seed + bar index). */
export function hashInts(...ints) {
  let h = 0x811c9dc5;
  for (const n of ints) {
    h = Math.imul(h ^ (n & 0xffff), 16777619);
    h = Math.imul(h ^ (n >>> 16), 16777619);
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12; h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return h >>> 0;
}

/** sfc32 PRNG — small, fast, good quality. Returns a function giving [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0, b = (seed ^ 0x9e3779b9) >>> 0, c = (seed * 31 + 7) >>> 0, d = 1;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next(); // warm up
  const rng = () => next();
  rng.range = (lo, hi) => lo + (hi - lo) * next();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()); // inclusive
  rng.pick = (arr) => arr[Math.floor(next() * arr.length)];
  rng.chance = (p) => next() < p;
  return rng;
}

/** Euclidean rhythm (Bjorklund via Bresenham): k hits over n steps, rotated by r. */
export function euclid(k, n = 16, r = 0) {
  const out = new Array(n).fill(0);
  k = Math.max(0, Math.min(n, Math.round(k)));
  if (k === 0) return out;
  for (let i = 0; i < n; i++) {
    out[i] = ((i * k) % n) < k ? 1 : 0;
  }
  // rotate
  const rot = ((r % n) + n) % n;
  return out.slice(n - rot).concat(out.slice(0, n - rot));
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
