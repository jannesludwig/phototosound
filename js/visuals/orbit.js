// ─────────────────────────────────────────────────────────────
//  orbit.js — ORBIT: a light ring system around the single focal point
//  of the photograph (an eye, the brightest light, the most salient
//  place), lying on the terrain. It is the visible sub bass: rings
//  widen and brighten with the low end, the inner rings lift off the
//  ground, dashes turn; each time the scan crosses the focal point a
//  ring of light expands from it.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer, toImg } from './common.js';

const RINGS = 7, SEG = 120;
const VERT = /* glsl */`
attribute float aRing, aAng;
uniform vec2 uC;
uniform float uR0, uPulseT0;
varying float vA, vRing, vAng;
void main() {
  float ring = aRing;
  float pulse = clamp(uTime - uPulseT0, 0.0, 3.0);
  float r = uR0 * (ring + 1.0) * (1.0 + uLow * 0.45);
  if (ring > ${RINGS - 0.5}) r = uR0 * (1.0 + pulse * 9.0);       // the expanding pulse ring
  vec2 p = uC + vec2(cos(aAng), sin(aAng)) * r / uHalf;
  float lift = uLow * 0.05 / (ring + 1.0);
  vec3 pos = mapPos(p, terrainZ(p) + 0.008 + lift);
  vA = uMix * (ring > ${RINGS - 0.5} ? exp(-pulse * 1.6) * step(pulse, 2.9) : (0.12 + uLow * 0.95) * (1.0 - ring / ${RINGS + 1}.0));
  vRing = ring; vAng = aAng;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const FRAG = /* glsl */`
varying float vA, vRing, vAng;
void main() {
  float n = 2.0 + mod(vRing * 3.0, 5.0);
  float dash = step(0.35, fract(vAng / 6.2831853 * n + uTime * 0.05 * (mod(vRing, 2.0) * 2.0 - 1.0) / (vRing + 1.0)));
  if (vRing > ${RINGS - 0.5}) dash = 1.0;
  float a = vA * dash;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), uAccent, 0.35) * a, 1.0);
}`;

export class Orbit extends Layer {
  constructor(ctx) {
    super(ctx);
    const f = ctx.map.focal;
    const R = [], A = [];
    for (let ring = 0; ring <= RINGS; ring++) for (let k = 0; k < SEG; k++) for (const j of [k, k + 1]) { R.push(ring); A.push(j / SEG * Math.PI * 2); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(R.length * 3), 3));
    geo.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(R), 1));
    geo.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(A), 1));
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uC: { value: new THREE.Vector2(...toImg(f.x, f.y)) }, uR0: { value: 0.022 }, uPulseT0: { value: -99 } } });
    const l = new THREE.LineSegments(geo, this.mat); l.frustumCulled = false; l.renderOrder = 7;
    this.group.add(l);
  }
  onEvent(ev, now) {
    if ((ev.type === 'heart' && ev.lub) || ev.type === 'tone') this.mat.uniforms.uPulseT0.value = now;
  }
}
