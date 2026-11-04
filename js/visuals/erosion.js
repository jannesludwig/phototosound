// ─────────────────────────────────────────────────────────────
//  erosion.js — EROSION. Late in LIFE, then as the main process of
//  DECAY: light drains off the peaks and ridges and runs downhill along
//  the steepest descent (organism.js streams) into the valleys. A bunch
//  of particles carrying the photo's colour from where it started takes
//  exactly the stream's travel time, so it arrives with its tick.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer, toImg } from './common.js';

const N = 480, BUNCH = 32;
const VERT = /* glsl */`
attribute vec2 aHome;
attribute float aA;
uniform float uPt;
varying vec3 vCol;
varying float vA;
void main() {
  vec3 pos = mapPos(position.xy, terrainZ(position.xy) + 0.004);
  vCol = photo(aHome) * 1.3 + 0.18;
  vA = aA * uMix;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uPt * (0.8 + aA);
}`;
const FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  if (max(abs(q.x), abs(q.y)) > 0.5 || vA < 0.004) discard;
  gl_FragColor = vec4(vCol * vA, 1.0);
}`;

export class Erosion extends Layer {
  constructor(ctx) {
    super(ctx);
    this.streams = ctx.org.streams.map((s) => {
      const cum = [0]; for (let i = 1; i < s.pts.length; i++) cum.push(cum[i - 1] + ctx.org.dist(s.pts[i - 1], s.pts[i]));
      return { ...s, cum };
    });
    this.pos = new Float32Array(N * 3); this.home = new Float32Array(N * 2); this.alpha = new Float32Array(N);
    this.p = Array.from({ length: N }, () => ({ s: -1 }));
    this.next = 0;
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aHome', new THREE.BufferAttribute(this.home, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uPt: { value: 2 } } });
    const pts = new THREE.Points(geo, this.mat); pts.frustumCulled = false; pts.renderOrder = 8;
    this.group.add(pts);
  }
  resize(view) { this.mat.uniforms.uPt.value = Math.max(1.5, view.bufferHeight / 520); }
  onEvent(ev, now) {
    if (ev.type !== 'drain' || !this.streams[ev.k]) return;
    const st = this.streams[ev.k], dur = ev.steps * (this.ctx.stepDur || 0.14);
    const [hx, hy] = toImg(st.pts[0].x, st.pts[0].y);
    for (let i = 0; i < BUNCH; i++) {
      const k = this.next++ % N;
      this.p[k] = { s: ev.k, t0: now, dur, lag: Math.random() * 0.18, j: (Math.random() - 0.5) * 0.008, j2: (Math.random() - 0.5) * 0.008 };
      this.home[k * 2] = hx + (Math.random() - 0.5) * 0.01; this.home[k * 2 + 1] = hy + (Math.random() - 0.5) * 0.01;
    }
    this.geo.attributes.aHome.needsUpdate = true;
  }
  update(s) {
    const t = s.t;
    for (let k = 0; k < N; k++) {
      const q = this.p[k];
      if (q.s < 0) { this.alpha[k] = 0; continue; }
      const st = this.streams[q.s], u0 = (t - q.t0) / q.dur - q.lag;
      if (u0 > 1.6) { q.s = -1; this.alpha[k] = 0; continue; }
      const u = Math.max(0, Math.min(1, u0)), e = Math.pow(u, 1.4) * st.len;   // it accelerates downhill
      let i = 1; while (i < st.cum.length - 1 && st.cum[i] < e) i++;
      const a = st.pts[i - 1], b = st.pts[i], f = Math.min(1, (e - st.cum[i - 1]) / Math.max(1e-6, st.cum[i] - st.cum[i - 1]));
      const [x, y] = toImg(a.x + (b.x - a.x) * f + q.j, a.y + (b.y - a.y) * f + q.j2);
      this.pos[k * 3] = x; this.pos[k * 3 + 1] = y;
      this.alpha[k] = u0 < 0 ? 0 : u0 < 0.1 ? u0 * 7 : u0 <= 1 ? 0.7 : Math.max(0, 1 - (u0 - 1) / 0.6);   // a last glow in the valley
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.aA.needsUpdate = true;
  }
}
