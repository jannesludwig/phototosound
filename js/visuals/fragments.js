// ─────────────────────────────────────────────────────────────
//  fragments — the photograph as its own mosaic (Quayola).
//  Delaunay triangles over the image's corners and stroke points,
//  each filled with the mean colour underneath, grouped by colour
//  region. They FRACTURE (hairline gaps open, pieces rotate apart
//  with the tension), whole colour regions SLIDE on fracture events
//  and spring back (reassemble), glow with the pad chord of their
//  region, and fly home to rebuild the photo for RECONSTRUCT.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { makeRng } from '../rng.js';

const K = 6;
const VERT = /* glsl */`
attribute vec2 aHome, aCen;
attribute vec3 aCol;
attribute float aCl, aSeed;
uniform vec2 uOff[${K}];
uniform float uGlow[${K}];
uniform float uSpread;
varying vec3 vCol;
varying float vA;
void main() {
  int cl = int(aCl);
  vec2 c = aCen * uHalf, v = aHome * uHalf - c;
  float home = sigOn(0.0);
  float spread = uSpread * (1.0 - home);
  float ang = (aSeed - 0.5) * 3.0 * spread;
  float gap = mix(0.97, 0.78, clamp(spread * 3.0, 0.0, 1.0));
  v = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * v * gap;
  vec2 dir = normalize(c + vec2(aSeed - 0.5, fract(aSeed * 7.3) - 0.5) * 0.3 + 1e-4);
  vec2 off = (uOff[cl] + dir * spread * (0.1 + aSeed * 0.5)) * (1.0 - home);
  off.y -= uFall * uFall * (0.15 + aSeed * 0.9);
  vec2 cc = c + off;
  cc += fieldAt(cc) * 1.25;
  cc = mix(cc, gridSnap(cc, 40.0), sigOn(1.0) * 0.95);
  vCol = aCol * (1.0 + uGlow[cl] * 0.6 + uKick * 0.08);
  vA = uMix * (1.0 - coherence(aCen)) * (1.0 - uFall * 0.6);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(cc + v, 0.0, 1.0);
}`;
const FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() { if (vA < 0.003) discard; gl_FragColor = vec4(vCol, vA); }`;

export class Fragments extends World {
  constructor(ctx) {
    super(ctx);
    const tris = ctx.st.fragments.slice(0, ctx.quality.mobile ? 500 : 900);
    const rng = makeRng(ctx.analysis.seed ^ 0xf7a6);
    const n = tris.length * 3;
    const H = new Float32Array(n * 2), C = new Float32Array(n * 2), COL = new Float32Array(n * 3), CL = new Float32Array(n), SE = new Float32Array(n);
    tris.forEach((t, i) => {
      const [cx, cy] = toImg(t.cx, t.cy), s = rng();
      [t.a, t.b, t.c].forEach((v, k) => {
        const j = i * 3 + k, [x, y] = toImg(v[0], v[1]);
        H[j * 2] = x; H[j * 2 + 1] = y; C[j * 2] = cx; C[j * 2 + 1] = cy;
        COL[j * 3] = t.col[0]; COL[j * 3 + 1] = t.col[1]; COL[j * 3 + 2] = t.col[2];
        CL[j] = Math.min(K - 1, t.cluster); SE[j] = s;
      });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aHome', new THREE.BufferAttribute(H, 2)); g.setAttribute('aCen', new THREE.BufferAttribute(C, 2));
    g.setAttribute('aCol', new THREE.BufferAttribute(COL, 3)); g.setAttribute('aCl', new THREE.BufferAttribute(CL, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(SE, 1));
    this.off = []; this.vel = []; for (let k = 0; k < K; k++) { this.off.push(new THREE.Vector2()); this.vel.push(new THREE.Vector2()); }
    this.glow = new Array(K).fill(0);
    this.mat = this.material({ vertex: VERT, fragment: FRAG, blending: THREE.NormalBlending, uniforms: { uOff: { value: this.off }, uGlow: { value: this.glow }, uSpread: { value: 0 } } });
    const mesh = new THREE.Mesh(g, this.mat); mesh.frustumCulled = false; mesh.renderOrder = 1;
    this.group.add(mesh);
    this.spread = 0;
  }

  onEvent(ev) {
    const h = this.ctx.view?.half || { x: 1, y: 0.7 };
    if (ev.type === 'fracture') { const k = ev.cluster % K; this.vel[k].x += ev.dx * h.x * 6; this.vel[k].y -= ev.dy * h.y * 6; }
    else if (ev.type === 'snare') for (let k = 0; k < K; k++) { this.vel[k].x += (Math.sin(k * 9.1 + ev.time) * 0.06); this.vel[k].y += Math.cos(k * 5.3 + ev.time) * 0.04; }
    else if (ev.type === 'pad' && ev.cluster !== undefined) this.glow[ev.cluster % K] = 1;
  }

  update(s) {
    const dt = Math.min(0.05, s.dt);
    for (let k = 0; k < K; k++) {   // regions slide away and spring back (reassemble)
      const o = this.off[k], v = this.vel[k];
      v.x += (-7 * o.x - 2.6 * v.x) * dt; v.y += (-7 * o.y - 2.6 * v.y) * dt;
      o.x += v.x * dt; o.y += v.y * dt;
      this.glow[k] *= Math.exp(-dt * 0.6);
    }
    const target = [0.0, 0.05 + 0.1 * s.sp, 0.12 + 0.22 * s.tension, 0.3, 0.2, 0.1][s.si] ?? 0;
    this.spread += (target - this.spread) * Math.min(1, dt * 1.2);
    this.mat.uniforms.uSpread.value = this.spread + s.kick * 0.01;
  }
}
