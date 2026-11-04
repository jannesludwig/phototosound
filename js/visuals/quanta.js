// ─────────────────────────────────────────────────────────────
//  quanta — the photograph's own contours, never permanent.
//
//  Forms come from the image (traced edge strokes, iso-contours,
//  straight lines) but they never stay on screen and are never drawn
//  like a pen. On sound events they exist for a few frames only:
//    · superposition  an element is in two places at once (a ghost copy)
//    · tunneling      it appears displaced — a jump, never a movement
//    · probability    every frame it is visible only by chance (flicker)
//    · fragments      only a random stretch of its length appears
//    · collapse       on the big glitch every scattered form snaps into the
//                     image at once, for a moment, then vanishes
//  One event → one flash: everything here is triggered by the sound.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { makeRng } from '../rng.js';

const SLOTS = 24;

const VERT = /* glsl */`
attribute vec2 aP;
attribute float aId, aS;
uniform vec4 uSlot[${SLOTS}];   // id, start, life, -
uniform vec4 uOff[${SLOTS}];    // jump xy, ghost copy xy (image units)
uniform vec2 uWin[${SLOTS}];    // visible arc window: start, length
uniform float uCopy;            // 0 = the element, 1 = its superposed ghost
uniform float uAllT0, uAllLife;  // collapse: every element at once
varying float vA, vS, vW0, vW1, vId;
varying vec3 vCol;
void main() {
  float a = 0.0; vec2 off = vec2(0.0); float w0 = 0.0, w1 = 1.0;
  for (int k = 0; k < ${SLOTS}; k++) {
    vec4 s = uSlot[k];
    if (abs(s.x - aId) > 0.5) continue;
    float age = uTime - s.y;
    if (age < 0.0 || age > s.z) continue;
    a = (uCopy > 0.5 && s.w < 0.5) ? 0.0 : 1.0 - age / s.z * 0.5;   // ghost only when superposed
    off = uOff[k].xy + uOff[k].zw * uCopy;
    w0 = uWin[k].x; w1 = uWin[k].x + uWin[k].y;
  }
  float allAge = uTime - uAllT0;
  if (allAge >= 0.0 && allAge < uAllLife) { a = max(a, 1.0 - allAge / uAllLife); off *= 0.0; w0 = 0.0; w1 = 1.0; }
  vec2 w = (aP + off) * uHalf;
  w += fieldAt(w);
  vA = a * uMix * (uCopy > 0.5 ? 0.4 : 1.0) * (1.0 - coherence(aP) * 0.5);
  vS = aS; vW0 = w0; vW1 = w1; vId = aId;
  vCol = mix(photo(aP) * 1.4 + 0.25, vec3(1.0), 0.55);
  if (uCopy > 0.5) vCol = mix(vCol, uAccent, 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
varying float vA, vS, vW0, vW1, vId;
varying vec3 vCol;
void main() {
  if (vA < 0.003 || vS < vW0 || vS > vW1) discard;
  // probability: each frame the element exists only by chance
  float p = step(0.3, hash21(vec2(floor(uTime * 60.0), vId)));
  gl_FragColor = vec4(vCol * vA * p, 1.0);
}`;

export class Quanta extends World {
  constructor(ctx) {
    super(ctx);
    const st = ctx.st;
    this.rng = makeRng(ctx.analysis.seed ^ 0x9a47);
    const els = [];
    for (const s of st.strokes) if (s.len > 0.03) els.push(s.pts);
    for (const c of st.contours.lines.slice(0, ctx.quality.mobile ? 40 : 80)) els.push(c.pts);
    for (const g of st.segments) els.push([[g.x1, g.y1], [g.x2, g.y2]]);
    this.count = els.length;
    // centroids → find the forms near a sound's source pixel
    this.cent = els.map((pts) => { let x = 0, y = 0; for (const p of pts) { x += p[0]; y += p[1]; } return [x / pts.length, y / pts.length]; });
    const P = [], I = [], S = [];
    els.forEach((pts, id) => {
      const q = pts.map(([x, y]) => toImg(x, y));
      const cum = [0]; for (let k = 1; k < q.length; k++) cum.push(cum[k - 1] + Math.hypot(q[k][0] - q[k - 1][0], q[k][1] - q[k - 1][1]));
      const tot = cum[cum.length - 1] || 1;
      for (let k = 1; k < q.length; k++) for (const j of [k - 1, k]) { P.push(q[j][0], q[j][1]); I.push(id); S.push(cum[j] / tot); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.length / 2 * 3), 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(P), 2));
    geo.setAttribute('aId', new THREE.BufferAttribute(new Float32Array(I), 1));
    geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(S), 1));
    this.slot = []; this.off = []; this.win = [];
    for (let k = 0; k < SLOTS; k++) { this.slot.push(new THREE.Vector4(-1, -99, 0.1, 0)); this.off.push(new THREE.Vector4()); this.win.push(new THREE.Vector2(0, 1)); }
    this.next = 0;
    const uniforms = (copy) => ({ uSlot: { value: this.slot }, uOff: { value: this.off }, uWin: { value: this.win }, uCopy: { value: copy }, uAllT0: { value: -99 }, uAllLife: { value: 0.4 } });
    this.matA = this.material({ vertex: VERT, fragment: FRAG, uniforms: uniforms(0) });
    this.matB = this.material({ vertex: VERT, fragment: FRAG, uniforms: uniforms(1) });
    for (const m of [this.matA, this.matB]) { const l = new THREE.LineSegments(geo, m); l.frustumCulled = false; l.renderOrder = 6; this.group.add(l); }
  }

  /** Elements nearest to (x, y), plus a few at random. */
  pick(x, y, n) {
    const r = this.rng, out = new Set();
    if (x !== undefined) {
      const order = this.cent.map((c, i) => [(c[0] - x) ** 2 + (c[1] - y) ** 2, i]).sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < Math.ceil(n / 2) && k < order.length; k++) out.add(order[k][1]);
    }
    while (out.size < Math.min(n, this.count)) out.add(Math.floor(r() * this.count));
    return [...out];
  }

  flash(id, now, life, jump, ghost, frag) {
    const r = this.rng, k = this.next++ % SLOTS;
    this.slot[k].set(id, now, life, ghost ? 1 : 0);
    const j = jump ? 0.08 : 0, g = ghost ? 0.025 : 0;
    this.off[k].set((r() - 0.5) * 2 * j, (r() - 0.5) * 2 * j, (r() - 0.5) * 2 * g + (ghost ? 0.012 : 0), (r() - 0.5) * 2 * g);
    if (frag) { const len = 0.2 + r() * 0.5; this.win[k].set(r() * (1 - len), len); } else this.win[k].set(0, 1);
  }

  onEvent(ev, now) {
    if (!this.count) return;
    const r = this.rng;
    if (ev.type === 'glitch') {
      if (ev.big) { for (const m of [this.matA, this.matB]) m.uniforms.uAllT0.value = now; return; }   // collapse
      const n = ev.storm ? 2 : 3 + Math.floor(r() * 5);
      for (const id of this.pick(ev.x, ev.y, n)) this.flash(id, now, 0.05 + r() * 0.07, r() < 0.6, r() < 0.7, r() < 0.5);
    } else if (ev.type === 'data') {
      for (const id of this.pick(ev.x, ev.y, 2)) this.flash(id, now, 0.08, false, true, true);   // interference: doubled
    } else if (ev.type === 'click' && ev.vel > 0.7 && r() < 0.18) {
      this.flash(this.pick(ev.x, ev.y, 1)[0], now, 0.04, r() < 0.5, false, true);
    }
  }
}
