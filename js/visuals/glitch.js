// ─────────────────────────────────────────────────────────────
//  glitch — the salient, high-contrast regions emit glitches.
//  On every data stutter aimed at a region, its block of the photo
//  is displaced, channel-split and duplicated for the length of the
//  stutter. Dark, empty areas are never salient: they stay silent.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';

const R = 8;
const VERT = /* glsl */`
varying vec2 vW;
void main() { vW = position.xy * uView * 1.02; gl_Position = projectionMatrix * modelViewMatrix * vec4(vW, 0.0, 1.0); }`;
const FRAG = /* glsl */`
uniform vec4 uReg[${R}];    // x y (image space), r (image units), start time
uniform float uLen[${R}];   // burst length (s)
varying vec2 vW;
void main() {
  vec2 p = vW / uHalf;
  vec3 col = vec3(0.0);
  float any = 0.0;
  for (int i = 0; i < ${R}; i++) {
    vec4 g = uReg[i];
    float age = uTime - g.w;
    if (age < 0.0 || age > uLen[i]) continue;
    vec2 d = (p - g.xy) / vec2(g.z * 1.6, g.z * 1.1);
    if (abs(d.x) > 1.0 || abs(d.y) > 1.0) continue;
    float slice = floor((d.y * 0.5 + 0.5) * 9.0);
    float t = floor(age * 30.0);
    float off = (hash21(vec2(slice, t + float(i))) - 0.5) * g.z * 1.4;
    vec2 q = p + vec2(off, 0.0);
    float split = g.z * 0.08;
    col += vec3(photo(q + vec2(split, 0.0)).r, photo(q).g, photo(q - vec2(split, 0.0)).b) * 1.25;
    any = 1.0;
  }
  // continuous low-level glitch at the peak: thin bright scan slivers
  float sliver = step(0.995 - uMix * 0.01, hash21(vec2(floor(vW.y / uPx / 2.0), floor(uTime * 24.0)))) * step(abs(p.x), 1.0) * step(abs(p.y), 1.0);
  col += photo(p) * sliver * 1.5 * uTension;
  col *= uMix;
  if (max(col.r, max(col.g, col.b)) < 0.003) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Glitch extends World {
  constructor(ctx) {
    super(ctx);
    this.regions = ctx.st.salient.peaks;
    this.reg = []; this.len = new Array(R).fill(0);
    for (let i = 0; i < R; i++) this.reg.push(new THREE.Vector4(0, 0, 0.1, -99));
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uReg: { value: this.reg }, uLen: { value: this.len } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); m.frustumCulled = false; m.renderOrder = 5;
    this.group.add(m);
    this.slot = 0;
  }
  onEvent(ev, now, stepDur) {
    if (ev.type !== 'stutter' && ev.type !== 'snare') return;
    const r = ev.type === 'stutter' ? this.regions[ev.region] : this.regions[Math.floor(now * 7) % Math.max(1, this.regions.length)];
    if (!r) return;
    const [x, y] = toImg(r.x, r.y);
    this.reg[this.slot % R].set(x, y, Math.max(0.05, r.r * 2), now);
    this.len[this.slot % R] = ev.type === 'stutter' ? ev.count * ev.rate * stepDur : 0.09;
    this.slot++;
  }
}
