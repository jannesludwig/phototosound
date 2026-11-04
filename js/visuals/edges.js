// ─────────────────────────────────────────────────────────────
//  edges.js — EDGE FLASH: the photograph's hard edges, on the terrain.
//  Traced edge strokes and straight lines lie on the map surface but
//  are invisible. A click lights the edge it came from for 2–4 frames;
//  a glitch lights several, with a displaced copy; the crash lights all
//  of them at once. Fast, technical, never drawn slowly, never permanent.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer, toImg } from './common.js';
import { makeRng } from '../rng.js';

const SLOTS = 24;
const VERT = /* glsl */`
attribute vec2 aP;
attribute float aId;
uniform vec4 uSlot[${SLOTS}];   // id, start, life, has copy
uniform vec2 uOff[${SLOTS}];    // copy offset (image units)
uniform float uCopy, uAllT0;
varying float vA, vId;
varying vec3 vCol;
void main() {
  float a = 0.0; vec2 off = vec2(0.0);
  for (int k = 0; k < ${SLOTS}; k++) {
    vec4 s = uSlot[k];
    if (abs(s.x - aId) > 0.5) continue;
    float age = uTime - s.y;
    if (age < 0.0 || age > s.z) continue;
    if (uCopy > 0.5 && s.w < 0.5) continue;
    a = 1.0; off = uOff[k] * uCopy;
  }
  float all = uTime - uAllT0; if (all >= 0.0 && all < 0.35) a = 1.0;
  vec2 p = aP + off;
  vec3 pos = mapPos(p, terrainZ(p) + 0.006);
  vA = a * uMix * (uCopy > 0.5 ? 0.45 : 1.0); vId = aId;
  vCol = uCopy > 0.5 ? uAccent : mix(vec3(1.0), photo(aP) * 1.6, 0.15);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const FRAG = /* glsl */`
varying float vA, vId;
varying vec3 vCol;
void main() {
  float p = step(0.25, hash21(vec2(floor(uTime * 60.0), vId)));   // flicker by probability
  if (vA * p < 0.01) discard;
  gl_FragColor = vec4(vCol * vA * p, 1.0);
}`;

export class EdgeFlash extends Layer {
  constructor(ctx) {
    super(ctx);
    const st = ctx.st;
    this.rng = makeRng(ctx.analysis.seed ^ 0xed6e);
    const els = st.strokes.filter((s) => s.len > 0.025).map((s) => s.pts).concat(st.segments.map((g) => [[g.x1, g.y1], [g.x2, g.y2]]));
    this.count = els.length;
    this.cent = els.map((pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; });
    const P = [], I = [];
    els.forEach((pts, id) => { for (let k = 1; k < pts.length; k++) for (const j of [k - 1, k]) { const [x, y] = toImg(pts[j][0], pts[j][1]); P.push(x, y); I.push(id); } });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.length / 2 * 3), 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(P), 2));
    geo.setAttribute('aId', new THREE.BufferAttribute(new Float32Array(I), 1));
    this.slot = []; this.off = [];
    for (let k = 0; k < SLOTS; k++) { this.slot.push(new THREE.Vector4(-1, -99, 0.05, 0)); this.off.push(new THREE.Vector2()); }
    this.next = 0;
    const u = (copy) => ({ uSlot: { value: this.slot }, uOff: { value: this.off }, uCopy: { value: copy }, uAllT0: { value: -99 } });
    this.mA = this.material({ vertex: VERT, fragment: FRAG, uniforms: u(0) });
    this.mB = this.material({ vertex: VERT, fragment: FRAG, uniforms: u(1) });
    for (const m of [this.mA, this.mB]) { const l = new THREE.LineSegments(geo, m); l.frustumCulled = false; l.renderOrder = 6; this.group.add(l); }
  }
  near(x, y, n) {
    const order = this.cent.map((c, i) => [(c[0] - x) ** 2 + (c[1] - y) ** 2, i]).sort((a, b) => a[0] - b[0]);
    return order.slice(0, n).map((o) => o[1]);
  }
  flash(id, now, frames, copy) {
    const k = this.next++ % SLOTS, r = this.rng;
    this.slot[k].set(id, now, frames / 60, copy ? 1 : 0);
    this.off[k].set((r() - 0.5) * 0.05 + 0.012, (r() - 0.5) * 0.05);
  }
  onEvent(ev, now) {
    if (!this.count || ev.x === undefined) return;
    if (ev.type === 'crash') { for (const m of [this.mA, this.mB]) m.uniforms.uAllT0.value = now; return; }
    if (ev.type === 'click') this.flash(this.near(ev.x, ev.y, 1)[0], now, 2 + Math.floor(this.rng() * 3), false);
    else if (ev.type === 'glitch') for (const id of this.near(ev.x, ev.y, 3 + Math.floor(this.rng() * 4))) this.flash(id, now, 3 + Math.floor(this.rng() * 4), this.rng() < 0.6);
  }
}
