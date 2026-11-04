// ─────────────────────────────────────────────────────────────
//  slicing.js — QUANTUM SLICING: a rare intrusion at the strongest
//  moments. For under a second the photograph itself appears, flat,
//  cut into slices that sit in the wrong places (tunneled), flicker by
//  probability and leave white gaps — then it is gone.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer } from './common.js';

const VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uHalf, 0.02, 1.0); }`;
const FRAG = /* glsl */`
uniform float uT0, uN, uSeed;
varying vec2 vP;
void main() {
  float age = uTime - uT0;
  if (age < 0.0 || age > 0.85) discard;
  float fr = floor(age * 30.0);
  float row = floor((vP.y * 0.5 + 0.5) * uN);
  float on = step(0.42, hash21(vec2(row, fr + uSeed)));
  if (on < 0.5) discard;
  float shift = (floor(hash21(vec2(row * 1.7, uSeed)) * 9.0) - 4.0) / 16.0 * (1.0 - age);
  vec2 q = vec2(vP.x + shift, vP.y);
  if (abs(q.x) > 1.0) discard;
  vec3 c = photo(q);
  c = mix(c, vec3(1.0), step(0.93, hash21(vec2(row, fr * 3.1))));          // some slices burn white
  gl_FragColor = vec4(c * uMix * (1.0 - age / 0.85 * 0.6), 1.0);
}`;

export class Slicing extends Layer {
  constructor(ctx) {
    super(ctx);
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uT0: { value: -99 }, uN: { value: 40 }, uSeed: { value: 0 } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); m.frustumCulled = false; m.renderOrder = 9;
    this.group.add(m);
  }
  onEvent(ev, now) {
    if (ev.type === 'glitch' && ev.slice) { const u = this.mat.uniforms; u.uT0.value = now; u.uN.value = 24 + Math.floor(Math.random() * 40); u.uSeed.value = Math.random() * 99; }
  }
}
