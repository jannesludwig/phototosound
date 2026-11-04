// ─────────────────────────────────────────────────────────────
//  crumble.js — EDGE DISSOLUTION: only the outer border of the terrain
//  crumbles. Particles carrying the photo's colours break off the edges
//  of the map and drift away (a biased random walk: outward, sinking);
//  noise bursts release more of them; as the image is consumed the
//  border crumbles faster.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer } from './common.js';
import { makeRng } from '../rng.js';

const VERT = /* glsl */`
attribute vec2 aHome, aDir;
attribute vec2 aSeed;
uniform float uRelease, uPt;
varying vec3 vCol;
varying float vA;
void main() {
  float amount = uDecay * 0.5 + uRelease * 0.3 * uDecay;     // only as the image is consumed
  float on = step(aSeed.y, amount);
  float rate = 0.05 + aSeed.x * 0.09;
  float cyc = fract(uTime * rate + aSeed.x * 7.13);
  float age = cyc * 6.0;
  vec2 p = aHome + aDir * age * (0.04 + aSeed.y * 0.05) + (curl2(aHome * 3.0, uTime * 0.05 + aSeed.x) * 0.02) * age;
  float z = terrainZ(aHome) - age * age * 0.006;
  vec3 pos = mapPos(p, z);
  vCol = photo(aHome) * 1.4 + 0.1;
  vA = uMix * on * (1.0 - cyc) * smoothstep(0.0, 0.05, cyc);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uPt * (0.7 + aSeed.x);
}`;
const FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (max(abs(q.x), abs(q.y)) > 0.5 || vA < 0.004) discard;
  gl_FragColor = vec4(vCol * vA, 1.0);
}`;

export class Crumble extends Layer {
  constructor(ctx) {
    super(ctx);
    const n = ctx.quality.mobile ? 1600 : 4200, rng = makeRng(ctx.analysis.seed ^ 0xc4b);
    const H = new Float32Array(n * 2), D = new Float32Array(n * 2), S = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const side = Math.floor(rng() * 4), t = rng() * 2 - 1, inset = rng() * 0.06;
      const [hx, hy, dx, dy] = [[t, 1 - inset, 0, 1], [t, -1 + inset, 0, -1], [1 - inset, t, 1, 0], [-1 + inset, t, -1, 0]][side];
      H.set([hx, hy], i * 2); D.set([dx + (rng() - 0.5) * 0.6, dy + (rng() - 0.5) * 0.6], i * 2); S.set([rng(), rng()], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aHome', new THREE.BufferAttribute(H, 2)); geo.setAttribute('aDir', new THREE.BufferAttribute(D, 2)); geo.setAttribute('aSeed', new THREE.BufferAttribute(S, 2));
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uRelease: { value: 0 }, uPt: { value: 2 } } });
    const pts = new THREE.Points(geo, this.mat); pts.frustumCulled = false; pts.renderOrder = 4;
    this.group.add(pts);
    this.release = 0;
  }
  resize(view) { this.mat.uniforms.uPt.value = Math.max(1.5, view.bufferHeight / 480); }
  onEvent(ev) { if (ev.type === 'noise') this.release = Math.min(1, this.release + 0.35); }
  update(s) { this.release *= Math.exp(-s.dt * 1.2); this.mat.uniforms.uRelease.value = this.release; }
}
