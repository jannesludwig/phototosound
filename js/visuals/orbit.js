// ─────────────────────────────────────────────────────────────
//  orbit.js — HEART and PEAKS.
//  HEART: a light ring system around the epicenter (the focal point:
//  an eye, the brightest light, the most salient place), lying on the
//  terrain. It is the visible sub: rings widen and brighten with the
//  low end, and every heartbeat (lub) sends a ring of light outward.
//  PEAKS: the other summits, once awake, carry a small ring and a cross;
//  each of their pulses (their own period) flashes it.
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

export class Heart extends Layer {
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

const PK = 6, PSEG = 40;
const PVERT = /* glsl */`
attribute float aPeak, aAng, aRing;
uniform vec2 uPC[${PK}];
uniform vec4 uPS[${PK}];   // awake (0/1), last pulse time, awake time, -
varying float vA;
void main() {
  int k = int(aPeak + 0.5);
  vec2 c = vec2(0.0); vec4 st = vec4(0.0);
  for (int i = 0; i < ${PK}; i++) if (i == k) { c = uPC[i]; st = uPS[i]; }
  float since = uTime - st.y, on = st.x * smoothstep(0.0, 1.5, uTime - st.z);
  float flash = exp(-max(since, 0.0) * 7.0) * step(0.0, since);
  float r = aRing < 0.5 ? 0.012 : 0.022 + flash * 0.012;
  vec2 dir = vec2(cos(aAng), sin(aAng));
  vec2 p = c + dir * (aRing < 1.5 ? r : aRing < 2.5 ? 0.003 : 0.008) / uHalf;   // ring / cross
  vec3 pos = mapPos(p, terrainZ(p) + 0.006 + flash * 0.01);
  vA = uMix * on * (0.22 + 1.1 * flash) * (aRing > 1.5 ? 0.8 : 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const PFRAG = /* glsl */`
varying float vA;
void main() { if (vA < 0.004) discard; gl_FragColor = vec4(mix(vec3(1.0), uAccent, 0.5) * vA, 1.0); }`;

export class Peaks extends Layer {
  constructor(ctx) {
    super(ctx);
    const peaks = ctx.org.peaks.slice(0, PK);
    const Pk = [], A = [], R = [];
    peaks.forEach((p, i) => {
      for (let ring = 0; ring < 2; ring++) for (let k = 0; k < PSEG; k++) for (const j of [k, k + 1]) { Pk.push(i); A.push(j / PSEG * Math.PI * 2); R.push(ring); }
      for (let a = 0; a < 4; a++) for (const e of [2, 3]) { Pk.push(i); A.push(a * Math.PI / 2 + Math.PI / 4); R.push(e); }   // a small × (inner → outer end)
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(A.length * 3), 3));
    geo.setAttribute('aPeak', new THREE.BufferAttribute(new Float32Array(Pk), 1));
    geo.setAttribute('aAng', new THREE.BufferAttribute(new Float32Array(A), 1));
    geo.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(R), 1));
    const pc = [], ps = [];
    for (let i = 0; i < PK; i++) { const p = peaks[i]; pc.push(new THREE.Vector2(...(p ? toImg(p.x, p.y) : [9, 9]))); ps.push(new THREE.Vector4(0, -99, 0, 0)); }
    this.ps = ps;
    this.mat = this.material({ vertex: PVERT, fragment: PFRAG, uniforms: { uPC: { value: pc }, uPS: { value: ps } } });
    const l = new THREE.LineSegments(geo, this.mat); l.frustumCulled = false; l.renderOrder = 7;
    this.group.add(l);
  }
  onEvent(ev, now) {
    if (ev.type !== 'peak' || ev.id >= PK) return;
    const s = this.ps[ev.id];
    if (!s.x) { s.x = 1; s.z = now; }
    s.y = now;
  }
}
