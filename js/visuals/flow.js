// ─────────────────────────────────────────────────────────────
//  FLOW — motion, blur, fabric, fashion.
//  Thousands of thin streaks travel along a flow field derived from
//  the photograph's own structure (structure-tensor orientation,
//  signed by the gradient). They take the colour of the pixels they
//  pass over, surge on every beat and scatter on noise bursts.
//  Simulated on the CPU (cheap at this count), drawn as 1px lines.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World } from './common.js';
import { makeRng } from '../rng.js';

const VERT = /* glsl */`
attribute float aAlpha;
varying vec3 vCol;
varying float vA;
void main() {
  vec2 pImg = position.xy / uHalf;
  float coh = coherence(pImg);
  vec3 pc = photo(pImg);
  float l = luma(pc);
  vCol = mix(pc * 1.9 + 0.08, uAccent, 0.5 * step(0.96, fract(position.z * 97.13)));
  vA = aAlpha * uMix * (1.0 - coh) * (0.4 + 0.6 * smoothstep(0.02, 0.4, l)) * (0.8 + uKick * 0.6);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);  // (z = id, not depth)
}`;
const FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  if (vA < 0.003) discard;
  gl_FragColor = vec4(vCol * vA, 1.0);
}`;

export class Flow extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, params, quality } = ctx;
    this.rng = makeRng(analysis.seed ^ 0xf10e);
    this.field = analysis.maps.flowField;
    this.aspect = analysis.width / analysis.height;
    const n = this.n = Math.round((quality.mobile ? 5000 : 14000) * params.density);

    // spawn distribution: weighted by edge strength (streaks gather on structure)
    const Gm = analysis.maps.Gm, W = analysis.width, H = analysis.height;
    const cdf = new Float32Array(Gm.length); let acc = 0;
    for (let i = 0; i < Gm.length; i++) { acc += 0.15 + Gm[i]; cdf[i] = acc; }
    this.cdf = cdf; this.cdfW = W; this.cdfH = H;

    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.age = new Float32Array(n); this.life = new Float32Array(n); this.spd = new Float32Array(n);
    for (let i = 0; i < n; i++) { this.spawn(i); this.age[i] = this.rng() * this.life[i]; }

    this.pos = new Float32Array(n * 2 * 3);
    this.alpha = new Float32Array(n * 2);
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = this.material({ vertex: VERT, fragment: FRAG });
    const lines = new THREE.LineSegments(geo, this.mat);
    lines.frustumCulled = false;
    this.group.add(lines);
    this.surge = 0;
  }

  spawn(i) {
    const r = this.rng() * this.cdf[this.cdf.length - 1];
    let lo = 0, hi = this.cdf.length - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.cdf[m] < r) lo = m + 1; else hi = m; }
    const px = lo % this.cdfW, py = Math.floor(lo / this.cdfW);
    this.x[i] = ((px + this.rng()) / this.cdfW) * 2 - 1;
    this.y[i] = 1 - ((py + this.rng()) / this.cdfH) * 2;
    this.age[i] = 0;
    this.life[i] = 1.4 + this.rng() * 2.8;
    this.spd[i] = 0.6 + this.rng() * 0.8;
  }

  /** Bilinear sample of the flow field at image-space (x, y). */
  sample(x, y, out) {
    const F = this.field;
    const gx = Math.min(F.w - 1.001, Math.max(0, (x * 0.5 + 0.5) * F.w - 0.5));
    const gy = Math.min(F.h - 1.001, Math.max(0, (0.5 - y * 0.5) * F.h - 0.5));
    const x0 = gx | 0, y0 = gy | 0, tx = gx - x0, ty = gy - y0;
    const i00 = y0 * F.w + x0, i10 = i00 + 1, i01 = i00 + F.w, i11 = i01 + 1;
    out[0] = (F.fx[i00] * (1 - tx) + F.fx[i10] * tx) * (1 - ty) + (F.fx[i01] * (1 - tx) + F.fx[i11] * tx) * ty;
    out[1] = (F.fy[i00] * (1 - tx) + F.fy[i10] * tx) * (1 - ty) + (F.fy[i01] * (1 - tx) + F.fy[i11] * tx) * ty;
  }

  update(s) {
    const dt = s.dt * (s.playing ? 1 : 0.15);
    const hx = s.view.half.x, hy = s.view.half.y;
    // rolling pulse: a surge right after each beat, plus the kick itself
    const pulse = 0.5 + 0.9 * Math.pow(1 - (s.beatPhase || 0), 3) + s.kick * 0.9;
    this.surge += (pulse - this.surge) * Math.min(1, s.dt * 10);
    const base = 0.16 * this.ctx.params.speed * (0.45 + 0.75 * s.energy) * this.surge;
    const scatter = s.noise * 0.012;
    const v = [0, 0];
    const P = this.pos, A = this.alpha, rng = this.rng;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      let x = this.x[i], y = this.y[i];
      if (this.age[i] > this.life[i] || x < -1.08 || x > 1.08 || y < -1.08 || y > 1.08) { this.spawn(i); x = this.x[i]; y = this.y[i]; }
      this.sample(x, y, v);
      const sp = base * this.spd[i];
      // world velocity → image-space step
      let dx = v[0] * sp * dt / hx, dy = v[1] * sp * dt / hy;
      if (scatter > 0 && rng() < s.noise * 0.3) { dx += (rng() - 0.5) * scatter; dy += (rng() - 0.5) * scatter; }
      x += dx; y += dy;
      this.x[i] = x; this.y[i] = y;
      // streak: head at the particle, tail behind it along the velocity
      const wx = x * hx, wy = y * hy;
      const len = 0.02 + sp * 0.34;
      const k = i * 6;
      P[k] = wx; P[k + 1] = wy; P[k + 2] = P[k + 5] = (i % 101) / 101;   // z carries a stable per-particle id
      P[k + 3] = wx - v[0] * len; P[k + 4] = wy - v[1] * len;
      const t = this.age[i] / this.life[i];
      const a = Math.sin(Math.PI * t);
      A[i * 2] = a; A[i * 2 + 1] = 0;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
