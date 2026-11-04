// ─────────────────────────────────────────────────────────────
//  sort — pixel sorting along the photograph's own edges.
//  Rows/columns were sorted on the CPU inside intervals bounded by
//  edges and brightness thresholds (ASDF-style). Here bands of that
//  sorted photo are revealed on the beat, displaced like scanlines by
//  the tension; SWEEP signature: the sort runs across the whole image.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World } from './common.js';

const VERT = /* glsl */`
varying vec2 vP;
void main() {
  vP = position.xy;
  vec2 w = position.xy * uHalf;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 0.0, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uSorted;
uniform float uVert, uBands;
varying vec2 vP;
void main() {
  vec2 w = vP * uHalf;
  w -= fieldAt(w);                                   // the field bends the bands
  vec2 p = w / uHalf;
  vec2 uv = imgUV(p);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) discard;
  float coord = uVert > 0.5 ? uv.x : uv.y;           // bands run along the sort direction
  float band = floor(coord * uBands);
  float on = step(1.0 - (0.12 + 0.55 * uTension), hash21(vec2(band, floor(uBeat / 2.0))));
  float along = uVert > 0.5 ? 1.0 - uv.y : uv.x;
  on = max(on, step(along, sigOn(3.0) * 1.15));                // SWEEP
  float coh = coherence(p);
  float shift = (hash21(vec2(band, uBeat)) - 0.5) * 0.1 * uTension * (1.0 - coh);
  vec2 suv = uv + (uVert > 0.5 ? vec2(0.0, shift) : vec2(shift, 0.0));
  vec3 c = texture2D(uSorted, clamp(suv, 0.001, 0.999)).rgb;
  float edge = abs(fract(coord * uBands) - 0.5) * 2.0;                  // hairline gap between bands
  float a = on * uMix * (1.0 - coh) * step(edge, 0.94) * (1.0 - uFall * 0.7);
  c *= 1.0 + uKick * 0.15 + uNoise * 0.3 * step(0.8, hash21(vec2(band, floor(uTime * 20.0))));
  if (a < 0.003) discard;
  gl_FragColor = vec4(c * a, 1.0);
}`;

export class Sort extends World {
  constructor(ctx) {
    super(ctx);
    const f = ctx.analysis.features;
    const vert = Math.abs(Math.cos(f.flowAngle || 0)) < 0.7;     // sort along the image's flow
    const src = vert ? ctx.st.sorted.v : ctx.st.sorted.h;
    this.tex = new THREE.CanvasTexture(src); this.tex.colorSpace = THREE.NoColorSpace;
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uSorted: { value: this.tex }, uVert: { value: vert ? 1 : 0 }, uBands: { value: 36 + Math.round(ctx.params.density * 30) } } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); m.frustumCulled = false; m.renderOrder = 2;
    this.group.add(m);
  }
  dispose() { super.dispose(); this.tex.dispose(); }
}
