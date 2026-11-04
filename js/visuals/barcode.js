// ─────────────────────────────────────────────────────────────
//  barcode — the photograph's straight lines, extended (Ikeda).
//  Each Hough segment is continued to the edges of the screen as a
//  thin strip; along the strip, the luminance sampled on the original
//  segment is written as binary bars that scroll on the rims of that
//  line (one rim → one flash). Inside the original segment the strip
//  is bright; the extension is a quieter echo.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';

const NS = 64;
const VERT = /* glsl */`
attribute float aId;
attribute vec4 aSeg;              // x1 y1 x2 y2 in image space
uniform float uW;
uniform sampler2D uState;          // per line: last rim time, strength
uniform float uCount;
varying float vU, vT, vAcross, vId, vFlash;
void main() {
  vec2 a = aSeg.xy * uHalf, b = aSeg.zw * uHalf;
  vec2 d = normalize(b - a + 1e-5), nrm = vec2(-d.y, d.x);
  float L = length(b - a);
  float ext = 3.0;
  float t = mix(-ext, L + ext, position.x * 0.5 + 0.5);    // along, world units from a
  vec2 w = a + d * t + nrm * position.y * uW * uPx;
  w += fieldAt(w);
  if (sigOn(1.0) > 0.0) {                                   // GRID: lines snap to the grid
    vec2 g = gridSnap(w, 56.0);
    w = mix(w, abs(d.x) > abs(d.y) ? vec2(w.x, g.y) : vec2(g.x, w.y), sigOn(1.0));
  }
  vU = t / max(L, 1e-4); vT = t; vAcross = position.y; vId = aId;
  vec4 st = texture2D(uState, vec2((aId + 0.5) / uCount, 0.5));
  vFlash = exp(-max(uTime - st.r, 0.0) * 6.0) * st.g * step(st.r, uTime);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 0.0, 1.0);
}`;
const FRAG = /* glsl */`
uniform sampler2D uLum;            // NS samples × lines
uniform float uCount, uScroll;
varying float vU, vT, vAcross, vId, vFlash;
void main() {
  float inside = step(0.0, vU) * step(vU, 1.0);
  float u = fract(vU * (inside > 0.5 ? 1.0 : 0.37) + uScroll * hash11(vId + 1.0));
  float cell = floor(u * ${NS}.0);
  float l = texture2D(uLum, vec2((cell + 0.5) / ${NS}.0, (vId + 0.5) / uCount)).r;
  float bit = step(0.5, l + (hash21(vec2(cell, vId)) - 0.5) * 0.25);
  float gapc = step(0.3, fract(u * ${NS}.0));
  float base = inside > 0.5 ? 0.85 : 0.22 * exp(-abs(vU - 0.5) * 0.25);
  float a = uMix * bit * gapc * (base + vFlash * 1.2) * (0.5 + 0.5 * uTension) * (1.0 - uFall * 0.8);
  vec3 col = mix(vec3(0.92), uAccent, step(0.75, hash11(vId * 3.7)));
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, 1.0);
}`;

export class Barcode extends World {
  constructor(ctx) {
    super(ctx);
    const segs = ctx.st.segments.length ? ctx.st.segments : [{ x1: 0, y1: 0.5, x2: 1, y2: 0.5 }];
    const n = this.count = segs.length;
    // luminance sampled along each segment (from the analysis pixels)
    const { width: W, height: H, maps } = ctx.analysis;
    const lum = new Uint8Array(NS * n * 4);
    segs.forEach((s, i) => {
      for (let k = 0; k < NS; k++) {
        const t = (k + 0.5) / NS, x = s.x1 + (s.x2 - s.x1) * t, y = s.y1 + (s.y2 - s.y1) * t;
        const v = maps.L[Math.min(H - 1, Math.floor(y * H)) * W + Math.min(W - 1, Math.floor(x * W))];
        const j = (i * NS + k) * 4; lum[j] = lum[j + 1] = lum[j + 2] = Math.round(v * 255); lum[j + 3] = 255;
      }
    });
    this.lumTex = new THREE.DataTexture(lum, NS, n, THREE.RGBAFormat); this.lumTex.needsUpdate = true;
    this.state = new Float32Array(n * 4).fill(0);
    for (let i = 0; i < n; i++) this.state[i * 4] = -99;
    this.stateTex = new THREE.DataTexture(this.state, n, 1, THREE.RGBAFormat, THREE.FloatType); this.stateTex.needsUpdate = true;
    const base = new THREE.PlaneGeometry(2, 1, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.getAttribute('position'));
    const SEG = new Float32Array(n * 4), ID = new Float32Array(n);
    segs.forEach((s, i) => { const [a, b] = toImg(s.x1, s.y1), [c, d] = toImg(s.x2, s.y2); SEG.set([a, b, c, d], i * 4); ID[i] = i; });
    geo.setAttribute('aSeg', new THREE.InstancedBufferAttribute(SEG, 4));
    geo.setAttribute('aId', new THREE.InstancedBufferAttribute(ID, 1));
    geo.instanceCount = n;
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uLum: { value: this.lumTex }, uState: { value: this.stateTex }, uCount: { value: n }, uW: { value: 3 * ctx.params.thickness }, uScroll: { value: 0 } } });
    const mesh = new THREE.Mesh(geo, this.mat); mesh.frustumCulled = false; mesh.renderOrder = 3;
    this.group.add(mesh);
    this.scroll = 0;
  }
  onEvent(ev, now) {
    if ((ev.type === 'rim') && ev.seg !== undefined && ev.seg < this.count) {
      this.state[ev.seg * 4] = now; this.state[ev.seg * 4 + 1] = 0.6 + ev.vel; this.stateTex.needsUpdate = true;
      this.scroll += 1 / 64;                                 // bars step on every rim
    }
  }
  update() { this.mat.uniforms.uScroll.value = this.scroll; }
  dispose() { super.dispose(); this.lumTex.dispose(); this.stateTex.dispose(); }
}
