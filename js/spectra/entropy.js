// ─────────────────────────────────────────────────────────────
//  entropy.js — ACT 3 ENTROPY, ACT 4 ABSORPTION, and the debris.
//
//  The decomposed image becomes one particle field: every point is a
//  pixel of the photo (sampled toward edges and light) that has left its
//  place. Brownian motion with a drift — randomness with a direction.
//  Now and then the photo's own structures re-emerge (the points on its
//  edges fall back into place) and vanish again. The cursor observes:
//  around it the points collapse back to where they came from.
//  Superposition: two ghost copies of the field flicker, offset, and
//  collapse into one on a strong beat.
//  ABSORPTION: the points are pulled — nearest first, in a tightening
//  spiral — into the focal point, which becomes a singularity (a black
//  disc with one thin ring of light).
//  After the crash only debris remains: a few broken shards of the
//  image, displaced, dim, colourless, slowly sinking. Never the photo.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { makeRng } from '../rng.js';

const VERT = /* glsl */`
attribute vec2 aHome;
attribute vec4 aSeed;            // x, y, z random; w = edge strength at home
uniform float uEnt, uDriftAmt, uOrder, uPull, uDebris, uPt;
uniform vec2 uDrift, uSing;
uniform vec3 uGhost;             // dx, dy, rotation (ghost copies only)
varying vec3 vCol;
varying float vA;
vec2 rot(vec2 v, float a) { float c = cos(a), s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
void main() {
  float t = uTime;
  vec2 home = aHome;
  // Brownian: slow wandering + a fine per-frame tremor; the drift gives it a direction
  vec2 wander = vec2(vnoise(aSeed.xy * 37.0 + t * (0.25 + aSeed.z * 0.5)), vnoise(aSeed.yx * 41.0 - t * (0.25 + aSeed.z * 0.5))) - 0.5;
  vec2 tremor = vec2(hash11(floor(t * 24.0) + aSeed.x * 911.0), hash11(floor(t * 24.0) + aSeed.y * 577.0)) - 0.5;
  vec2 p = home + (curl2(home * 2.2 + aSeed.xy * 3.0, t * 0.12) * 0.09 + wander * (0.25 + 0.5 * aSeed.z)) * uEnt + tremor * 0.006 * uEnt;
  p += uDrift * uDriftAmt * (0.4 + aSeed.z);
  // structures emerge and vanish: the points of the photo's edges fall back into place
  float order = uOrder * smoothstep(0.25, 0.7, aSeed.w);
  // the observer collapses the state
  float obs = coherence(home);
  p = mix(p, home, clamp(order + obs * 0.9, 0.0, 1.0));
  // the hand pushes
  p += fieldAt(p * uHalf) / uHalf;
  // absorption: nearest first, a tightening spiral into the singularity
  vec2 d = p - uSing;
  float dist = length(d * uHalf);
  float k = clamp((uPull * 1.6 - dist * 0.9 - aSeed.x * 0.35) / 0.5, 0.0, 1.0) * (1.0 - step(0.001, uDebris));
  p = uSing + rot(d, k * k * 7.0) * pow(1.0 - k, 2.2);
  // debris: shards of the image, displaced and sinking
  if (uDebris > 0.0) {
    vec2 cell = floor(home * 6.0 + aSeed.w);
    vec2 shard = (vec2(hash21(cell), hash21(cell + 7.1)) - 0.5) * 0.42;                 // flung out of the singularity, broken
    vec2 dp = home + shard + (home - uSing) * 0.15 - vec2(0.0, uDebris * 0.04 * (0.5 + hash21(cell + 3.3)));
    p = mix(p, dp, step(0.001, uDebris));
  }
  p = rot(p, uGhost.z) + uGhost.xy;
  vec3 pos = vec3(p * uHalf, 0.0);
  vec3 c = photo(home);
  vCol = mix(c * 1.25 + 0.04, vec3(luma(c)) * 0.7 + 0.08, max(uEnt * 0.25, uDebris));
  float keep = uDebris > 0.0 ? step(aSeed.z, 0.05) * step(0.35, hash21(floor(home * 6.0 + aSeed.w) + 1.7)) : 1.0;
  vA = uMix * keep * (1.0 - k * k) * (0.35 + 0.65 * aSeed.w + order * 0.8) * (uDebris > 0.0 ? 1.1 : 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uPt * (0.55 + aSeed.y * 0.9) * (1.0 + order * 0.4);
}`;
const FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (max(abs(q.x), abs(q.y)) > 0.5 || vA < 0.004) discard;
  gl_FragColor = vec4(vCol * vA, 1.0);
}`;

// the singularity: a black disc (event horizon) and one thin ring of light around it
const SVERT = /* glsl */`
attribute float aAng, aRing;
uniform vec2 uSing;
uniform float uR, uRing;
varying float vA;
void main() {
  float r = uR * (aRing < 0.5 ? 1.0 : 1.35 + 0.06 * sin(aAng * 9.0 + uTime * 3.0));
  vec2 p = uSing * uHalf + vec2(cos(aAng), sin(aAng)) * r;
  vA = uMix * uRing * (aRing < 0.5 ? 0.0 : 0.9);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}`;
const SFRAG = /* glsl */`
varying float vA;
void main() { if (vA < 0.004) discard; gl_FragColor = vec4(mix(vec3(1.0), uAccent, 0.3) * vA, 1.0); }`;
const DISC_FRAG = /* glsl */`
uniform vec2 uSing; uniform float uR;
varying vec2 vW;
void main() { if (distance(vW, uSing * uHalf) > uR || uR < 0.0005) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, uMix); }`;
const DISC_VERT = /* glsl */`
varying vec2 vW;
void main() { vW = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0); }`;

export class Entropy extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, quality, focal } = ctx;
    const N = quality.mobile ? 9000 : 22000, rng = makeRng(analysis.seed ^ 0xe7);
    const w = analysis.width, h = analysis.height, G = analysis.maps.Gm, L = analysis.maps.L;
    let gmax = 1e-6; for (let i = 0; i < G.length; i++) gmax = Math.max(gmax, G[i]);
    const home = new Float32Array(N * 2), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      // sample toward edges and light (rejection), so the field keeps the image's structure
      let x, y, e, tries = 0;
      do { x = Math.floor(rng() * w); y = Math.floor(rng() * h); e = G[y * w + x] / gmax; tries++; } while (rng() > 0.18 + e * 1.6 + L[y * w + x] * 0.35 && tries < 12);
      const [ix, iy] = toImg((x + 0.5) / w, (y + 0.5) / h);
      home[i * 2] = ix; home[i * 2 + 1] = iy;
      seed[i * 4] = rng(); seed[i * 4 + 1] = rng(); seed[i * 4 + 2] = rng(); seed[i * 4 + 3] = Math.min(1, e * 2.2);
    }
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aHome', new THREE.BufferAttribute(home, 2));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
    const P = ctx.params;
    const own = {
      uEnt: { value: 0 }, uDriftAmt: { value: 0 }, uOrder: { value: 0 }, uPull: { value: 0 }, uDebris: { value: 0 }, uPt: { value: 2 },
      uDrift: { value: new THREE.Vector2(...P.entropyDrift).multiplyScalar(10) }, uSing: { value: new THREE.Vector2(...toImg(focal.x, focal.y)) },
    };
    this.u = own;
    const mk = (g) => this.material({ vertex: VERT, fragment: FRAG, uniforms: { ...own, uGhost: { value: new THREE.Vector3(...g) } } });
    this.main = new THREE.Points(geo, mk([0, 0, 0])); this.main.frustumCulled = false; this.main.renderOrder = 4;
    this.ghosts = [[0.035, 0.02, 0.03], [-0.03, -0.025, -0.025]].map((g) => { const m = new THREE.Points(geo, mk(g)); m.frustumCulled = false; m.renderOrder = 3; m.visible = false; return m; });
    this.group.add(this.main, ...this.ghosts);
    // the singularity
    const A = [], R = [];
    for (let k = 0; k < 160; k++) for (const j of [k, k + 1]) { A.push(j / 160 * Math.PI * 2); R.push(1); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(A.length * 3), 3));
    sg.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(A), 1));
    sg.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(R), 1));
    const sOwn = { uSing: own.uSing, uR: { value: 0 }, uRing: { value: 0 } };
    this.su = sOwn;
    const ring = new THREE.LineSegments(sg, this.material({ vertex: SVERT, fragment: SFRAG, uniforms: sOwn })); ring.frustumCulled = false; ring.renderOrder = 9;
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), this.material({ vertex: DISC_VERT, fragment: DISC_FRAG, uniforms: sOwn, blending: THREE.NormalBlending })); disc.frustumCulled = false; disc.renderOrder = 8;
    this.group.add(disc, ring);
    this.sup = { t0: -99, dur: 0, collapse: -99 };
    this.showGhost = true; this.showSing = true; this.showDebris = true;
  }
  resize(view) { this.u.uPt.value = Math.max(1.4, view.bufferHeight / 600); }
  onEvent(ev, time) {
    if (ev.type === 'superpose') this.sup = { t0: time, dur: (ev.bars || 1) * (this.ctx.stepDur || 0.14) * 16, collapse: -99 };
    if (ev.type === 'kick' && ev.collapse) this.sup.collapse = time;
  }
  /** s: { t, ent, driftAmt, order, pull, debris } */
  update(s) {
    const u = this.u;
    u.uEnt.value = s.ent; u.uDriftAmt.value = s.driftAmt; u.uOrder.value = s.order; u.uPull.value = s.pull;
    u.uDebris.value = this.showDebris ? s.debris : 0;
    // the singularity opens with the pull, and closes after the crash
    const r = this.showSing ? 0.05 * Math.pow(s.pull, 1.5) * (1 - s.debris) : 0;
    this.su.uR.value = r; this.su.uRing.value = r > 0.001 ? 1 : 0;
    const sp = this.sup, t = s.t;
    const on = this.showGhost && t >= sp.t0 && t < sp.t0 + sp.dur + 0.25;
    const col = sp.collapse > 0 ? Math.min(1, (t - sp.collapse) / 0.1) : 0;
    this.ghosts.forEach((g) => { g.visible = on && col < 1; g.material.uniforms.uMix.value = this.mix * (Math.random() < 0.5 ? 0.55 : 0.1) * (1 - col); });
  }
  setMix(m) { super.setMix(m); }
}
