// ─────────────────────────────────────────────────────────────
//  constellation — the photograph's points.
//  Light points, Shi–Tomasi corners and face landmarks become stars
//  that LIGHT UP one by one (each with its click) and flash on every
//  click aimed at them; fine Delaunay links draw between lit points.
//  NETWORK signature: the link threshold opens until everything is
//  connected and the links pulse on the 16ths.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { delaunay } from '../structures.js';

const PT_VERT = /* glsl */`
attribute vec2 aP;
attribute float aId, aKind, aR;
uniform sampler2D uState;
uniform float uCount, uPt;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 st = texture2D(uState, vec2((aId + 0.5) / uCount, 0.5));
  float on = smoothstep(0.0, 0.25, uTime - st.r);
  float flash = exp(-max(uTime - st.g, 0.0) * 7.0) * st.b * step(st.g, uTime);
  vec2 w = aP * uHalf;
  w.y -= uFall * uFall * (0.1 + fract(aId * 0.618) * 0.5);
  w += fieldAt(w) * 1.3;
  w = mix(w, gridSnap(w, 56.0), sigOn(1.0) * 0.9);
  vec3 pc = photo(aP);
  vCol = aKind < 0.5 ? mix(vec3(1.0), pc * 1.4 + 0.3, 0.3) : aKind < 1.5 ? pc * 1.5 + 0.18 : mix(pc, uAccent, 0.6);
  vCol += flash * 1.5;
  vA = uMix * on * (aKind < 0.5 ? 1.0 : 0.55 + 0.45 * aR) * (1.0 - coherence(aP)) * (1.0 - uFall * 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 0.0, 1.0);
  gl_PointSize = uPt * (aKind < 0.5 ? 1.6 : 1.0) * (1.0 + flash * 2.5);
}`;
const PT_FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = max(abs(q.x), abs(q.y)) * 2.0;           // square pixels, not soft blobs
  if (d > 1.0 || vA < 0.003) discard;
  gl_FragColor = vec4(vCol * vA, 1.0);
}`;

const LN_VERT = /* glsl */`
attribute vec2 aP;
attribute float aA, aB, aLen;
uniform sampler2D uState;
uniform float uCount, uThr;
varying float vA;
varying vec3 vCol;
void main() {
  vec4 a = texture2D(uState, vec2((aA + 0.5) / uCount, 0.5));
  vec4 b = texture2D(uState, vec2((aB + 0.5) / uCount, 0.5));
  float on = smoothstep(0.0, 0.6, uTime - max(a.r, b.r));
  float fa = exp(-max(uTime - a.g, 0.0) * 5.0) * a.b * step(a.g, uTime);
  float fb = exp(-max(uTime - b.g, 0.0) * 5.0) * b.b * step(b.g, uTime);
  float thr = uThr + sigOn(2.0) * 0.6;
  float keep = 1.0 - smoothstep(thr * 0.8, thr, aLen);
  float pulse = 1.0 + sigOn(2.0) * 1.5 * step(fract(uStep), 0.22);
  vec2 w = aP * uHalf;
  w.y -= uFall * uFall * 0.3;
  w += fieldAt(w) * 1.3;
  w = mix(w, gridSnap(w, 56.0), sigOn(1.0) * 0.9);
  vA = uMix * on * keep * (0.1 + 0.25 * uTension + max(fa, fb) * 0.9) * pulse * (1.0 - coherence(aP));
  vCol = mix(photo(aP) * 1.3 + 0.2, vec3(1.0), 0.5);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 0.0, 1.0);
}`;
const LN_FRAG = /* glsl */`
varying float vA;
varying vec3 vCol;
void main() { if (vA < 0.003) discard; gl_FragColor = vec4(vCol * vA, 1.0); }`;

export class Constellation extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, st, face, quality } = ctx;
    const pts = [];
    for (const p of analysis.points.slice(0, 40)) pts.push({ x: p.x, y: p.y, kind: 0, r: p.peak });
    for (const c of st.corners.slice(0, quality.mobile ? 90 : 170)) if (!pts.some((q) => Math.abs(q.x - c.x) < 0.006 && Math.abs(q.y - c.y) < 0.006)) pts.push({ x: c.x, y: c.y, kind: 1, r: c.r });
    for (const p of (face?.points || [])) pts.push({ x: p.x, y: p.y, kind: 2, r: 0.8 });
    this.pts = pts;
    const n = this.count = Math.max(1, pts.length);

    this.state = new Float32Array(n * 4);
    this.stateTex = new THREE.DataTexture(this.state, n, 1, THREE.RGBAFormat, THREE.FloatType);
    this.stateTex.minFilter = this.stateTex.magFilter = THREE.NearestFilter;

    const P = new Float32Array(n * 2), I = new Float32Array(n), K = new Float32Array(n), R = new Float32Array(n);
    pts.forEach((p, i) => { const [x, y] = toImg(p.x, p.y); P[i * 2] = x; P[i * 2 + 1] = y; I[i] = i; K[i] = p.kind; R[i] = p.r; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aP', new THREE.BufferAttribute(P, 2)); g.setAttribute('aId', new THREE.BufferAttribute(I, 1));
    g.setAttribute('aKind', new THREE.BufferAttribute(K, 1)); g.setAttribute('aR', new THREE.BufferAttribute(R, 1));
    const common = { uState: { value: this.stateTex }, uCount: { value: n } };
    this.ptMat = this.material({ vertex: PT_VERT, fragment: PT_FRAG, uniforms: { ...common, uPt: { value: 3 } } });
    const points = new THREE.Points(g, this.ptMat); points.frustumCulled = false; points.renderOrder = 4;

    // links: Delaunay neighbours (the image's own topology)
    const tris = pts.length >= 3 ? delaunay(pts.map((p) => [p.x, p.y])) : [];
    const seen = new Set(), LP = [], LA = [], LB = [], LL = [];
    for (const t of tris) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const key = a < b ? a * 4096 + b : b * 4096 + a; if (seen.has(key)) continue; seen.add(key);
      const len = Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y);
      for (const id of [a, b]) { const [x, y] = toImg(pts[id].x, pts[id].y); LP.push(x, y); LA.push(a); LB.push(b); LL.push(len); }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LA.length * 3), 3));
    lg.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(LP), 2));
    lg.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(LA), 1));
    lg.setAttribute('aB', new THREE.BufferAttribute(new Float32Array(LB), 1));
    lg.setAttribute('aLen', new THREE.BufferAttribute(new Float32Array(LL), 1));
    this.lnMat = this.material({ vertex: LN_VERT, fragment: LN_FRAG, uniforms: { ...common, uThr: { value: 0.09 } } });
    const links = new THREE.LineSegments(lg, this.lnMat); links.frustumCulled = false; links.renderOrder = 4;
    this.group.add(links, points);
    this.resetPass();
  }

  resetPass() {
    for (let i = 0; i < this.count; i++) { this.state[i * 4] = 1e9; this.state[i * 4 + 1] = -99; this.state[i * 4 + 2] = 0; }
    this.stateTex.needsUpdate = true;
  }

  nearest(x, y) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < this.pts.length; i++) { const d = (this.pts[i].x - x) ** 2 + (this.pts[i].y - y) ** 2; if (d < bd) { bd = d; bi = i; } }
    return bd < 0.003 ? bi : -1;
  }

  light(i, now, strength) {
    if (i < 0) return;
    if (this.state[i * 4] > now) this.state[i * 4] = now;          // first light = reveal
    this.state[i * 4 + 1] = now; this.state[i * 4 + 2] = strength;
    this.stateTex.needsUpdate = true;
  }

  onEvent(ev, now) {
    if (ev.type === 'click' && ev.x !== undefined) this.light(this.nearest(ev.x, ev.y), now, 0.6 + 0.4 * (ev.vel || 0.5));
    else if (ev.type === 'hat' && ev.x !== undefined) this.light(this.nearest(ev.x, ev.y), now, 0.25);
  }

  update(s) {
    // by the build every point is lit (softly), the network is complete
    if (s.si >= 2 && s.si <= 3) {
      let n = 0;
      for (let i = 0; i < this.count && n < 3; i++) if (this.state[i * 4] > 1e8) { this.state[i * 4] = s.t; n++; }
      if (n) this.stateTex.needsUpdate = true;
    }
  }

  resize(view) { this.ptMat.uniforms.uPt.value = Math.max(2, view.bufferHeight / 380); }
  dispose() { super.dispose(); this.stateTex.dispose(); }
}
