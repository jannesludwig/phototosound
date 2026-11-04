// ─────────────────────────────────────────────────────────────
//  contours — the photograph's own lines.
//  Strokes (traced edges), face-landmark contours and iso-contours of
//  the luminance field, drawn as 1 px lines that DRAW THEMSELVES along
//  their arc length when the score reveals them (with their sound),
//  later DETACH and drift, fall in the afterglow, separate in depth for
//  STRATA, snap for GRID, return home for RECONSTRUCT, and bend in the
//  cursor's force field. Per-element state lives in a small float
//  texture: (reveal start, reveal duration, detach start, –).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { makeRng } from '../rng.js';

const VERT = /* glsl */`
attribute vec2 aP;
attribute float aS, aId, aSeed, aKind, aLevel;
uniform sampler2D uState;
uniform float uCount, uLevels;
varying float vS, vRev, vA;
varying vec3 vCol;
void main() {
  vec4 st = texture2D(uState, vec2((aId + 0.5) / uCount, 0.5));
  float rev = clamp((uTime - st.r) / max(st.g, 0.001), 0.0, 1.0);
  vec2 w = aP * uHalf;
  // detached: the line leaves the picture and wanders (more with tension)
  float dt = uTime - st.b;
  float det = (st.b > 0.0 && dt > 0.0) ? 1.0 - exp(-dt * 0.3) : 0.0;
  vec2 drift = vec2(cos(aSeed * 6.283 + uTime * 0.05), sin(aSeed * 8.17 + uTime * 0.041)) * (0.06 + 0.22 * uTension) * det;
  drift += curl2(w * 0.7 + aSeed * 3.0, uTime * 0.04) * 0.025 * det;
  drift.y -= uFall * uFall * (0.15 + aSeed * 0.55);                     // afterglow: it falls away
  drift *= 1.0 - sigOn(0.0);                                            // RECONSTRUCT: home
  w += drift;
  float iso = step(1.5, aKind);
  float z = sigOn(4.0) * (aLevel / max(uLevels - 1.0, 1.0) - 0.5) * 0.7 * iso; // STRATA
  w *= 1.0 + uKick * 0.005;
  w += fieldAt(w);
  w = mix(w, gridSnap(w, 56.0), sigOn(1.0) * 0.9);                       // GRID
  vS = aS; vRev = rev;
  vec3 pc = photo(aP);
  float face = step(0.5, aKind) * (1.0 - iso);
  vCol = mix(pc * 1.6 + 0.1, vec3(1.0), 0.28 + face * 0.3);
  vCol = mix(vCol, uAccent, face * 0.35);
  vA = uMix * (1.0 - coherence(aP)) * (1.0 - uFall * 0.45) * mix(0.95, 0.5, iso) * (1.0 + uKick * 0.25);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, z, 1.0);
}`;

const FRAG = /* glsl */`
varying float vS, vRev, vA;
varying vec3 vCol;
void main() {
  if (vRev <= 0.0 || vS > vRev) discard;
  float tip = (1.0 - smoothstep(0.0, 0.05, vRev - vS)) * (1.0 - step(0.999, vRev));   // the pen
  gl_FragColor = vec4((vCol + tip * 1.4) * vA, 1.0);
}`;

export class Contours extends World {
  constructor(ctx) {
    super(ctx);
    const { st, face } = ctx;
    const rng = makeRng(ctx.analysis.seed ^ 0xc047);
    const els = [];
    st.strokes.forEach((s, i) => els.push({ pts: s.pts, kind: 0, level: 0, ref: i }));
    this.nStrokes = st.strokes.length;
    this.faceIds = [];
    for (const fs of (face?.strokes || [])) { this.faceIds.push(els.length); els.push({ pts: fs.pts, kind: 1, level: 0 }); }
    this.levels = st.contours.levels.length;
    this.isoByLevel = [];
    const isos = st.contours.lines.slice(0, ctx.quality.mobile ? 50 : 110);
    for (const c of isos) { (this.isoByLevel[c.level] ||= []).push(els.length); els.push({ pts: c.pts, kind: 2, level: c.level }); }
    this.count = els.length;

    // geometry: one segment per consecutive pair of points
    const P = [], S = [], I = [], SE = [], K = [], LV = [];
    els.forEach((e, id) => {
      const pts = e.pts.map(([x, y]) => toImg(x, y));
      const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
      const tot = cum[cum.length - 1] || 1, seed = rng();
      for (let k = 1; k < pts.length; k++) for (const j of [k - 1, k]) {
        P.push(pts[j][0], pts[j][1]); S.push(cum[j] / tot); I.push(id); SE.push(seed); K.push(e.kind); LV.push(e.level);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P.length / 2 * 3), 3));
    geo.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(P), 2));
    geo.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(S), 1));
    geo.setAttribute('aId', new THREE.BufferAttribute(new Float32Array(I), 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(SE), 1));
    geo.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(K), 1));
    geo.setAttribute('aLevel', new THREE.BufferAttribute(new Float32Array(LV), 1));

    this.state = new Float32Array(Math.max(1, this.count) * 4);
    this.stateTex = new THREE.DataTexture(this.state, Math.max(1, this.count), 1, THREE.RGBAFormat, THREE.FloatType);
    this.stateTex.minFilter = this.stateTex.magFilter = THREE.NearestFilter;
    this.resetPass();
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uState: { value: this.stateTex }, uCount: { value: Math.max(1, this.count) }, uLevels: { value: this.levels } } });
    const lines = new THREE.LineSegments(geo, this.mat);
    lines.frustumCulled = false;
    lines.renderOrder = 3;
    this.group.add(lines);
  }

  resetPass() {
    for (let i = 0; i < this.count; i++) { this.state[i * 4] = 1e9; this.state[i * 4 + 1] = 1; this.state[i * 4 + 2] = -1; }
    this.stateTex.needsUpdate = true;
    this.faceQueued = false;
  }
  revealed(id) { return this.state[id * 4] < 1e8; }
  reveal(id, now, dur) {
    if (id < 0 || id >= this.count || this.revealed(id)) return;
    this.state[id * 4] = now; this.state[id * 4 + 1] = dur; this.stateTex.needsUpdate = true;
  }
  detach(id, now) {
    if (id < 0 || id >= this.count) return;
    if (!this.revealed(id)) this.reveal(id, now, 0.35);
    if (this.state[id * 4 + 2] < 0) { this.state[id * 4 + 2] = now + 0.05; this.stateTex.needsUpdate = true; }
  }

  onEvent(ev, now, stepDur) {
    if (ev.type === 'reveal' && ev.what === 'stroke') this.reveal(ev.id, now, ev.dur * stepDur);
    else if (ev.type === 'reveal' && ev.what === 'level') {
      const ids = this.isoByLevel[ev.id % Math.max(1, this.levels)] || [];
      ids.forEach((id, k) => this.reveal(id, now + k * 0.02, 1.6 + (k % 5) * 0.2));
    } else if (ev.type === 'detach' && ev.what === 'stroke') this.detach(ev.id, now);
  }

  update(s) {
    const now = s.t;
    // the face's own contours are drawn first, at the start of each pass
    if (!this.faceQueued && s.si === 0 && this.faceIds.length) {
      this.faceIds.forEach((id, k) => this.reveal(id, now + 0.6 + k * 0.45, 1.4));
      this.faceQueued = true;
    }
    // from the build on, whatever has not appeared yet arrives (quickly, a few per frame)
    if (s.si >= 2 && s.si <= 3) {
      let n = 0;
      for (let i = 0; i < this.count && n < 2; i++) if (!this.revealed(i)) { this.reveal(i, now, 0.6); n++; }
    }
  }

  dispose() { super.dispose(); this.stateTex.dispose(); }
}
