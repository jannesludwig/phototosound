// ─────────────────────────────────────────────────────────────
//  ORBIT — stars, water, points of light, circular forms.
//  Concentric rings and rotating arc segments emanate from the
//  brightest points; every kick sends a ripple out from one of them.
//  Fine particles travel on Keplerian orbits, coloured by the pixels
//  they pass over. A faint halftone keeps the photograph present.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { makeRng } from '../rng.js';

const MAXC = 6, MAXR = 10;

const FIELD_VERT = /* glsl */`
varying vec2 vW;
void main() {
  vW = position.xy * uView * 1.02;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vW, 0.0, 1.0);
}`;

const FIELD_FRAG = /* glsl */`
uniform vec4 uCenters[${MAXC}];  // xy image space, z weight, w ring spacing (world)
uniform float uCount;
uniform vec4 uRipples[${MAXR}];  // xy image space, z start time, w strength
uniform float uHalftone;
varying vec2 vW;

float ringLine(float k, float px) {
  float d = abs(fract(k + 0.5) - 0.5);           // distance to the nearest integer
  float fw = fwidth(k);
  return 1.0 - smoothstep(fw * 0.3 * px, fw * 1.1 * px, d);
}

void main() {
  vec2 w = vW - fieldAt(vW);           // rings bend around the hand
  vec2 pImg = w / uHalf;
  float coh = coherence(pImg);
  float free = 1.0 - coh;
  float inImg = step(abs(pImg.x), 1.0) * step(abs(pImg.y), 1.0);
  vec3 col = vec3(0.0);

  // faint halftone of the photograph (dot radius ∝ luminance)
  float cellPx = 7.0;
  vec2 gp = w / (uPx * cellPx);
  vec2 cellC = (floor(gp) + 0.5) * uPx * cellPx;
  vec3 pc = photo(cellC / uHalf);
  float dotR = sqrt(luma(pc)) * 0.5;
  float dotD = length(fract(gp) - 0.5);
  col += pc * (1.0 - smoothstep(dotR - 0.12, dotR, dotD)) * inImg * uHalftone * (0.35 + uKick * 0.2);

  for (int i = 0; i < ${MAXC}; i++) {
    if (float(i) >= uCount) break;
    vec4 C = uCenters[i];
    vec2 c = C.xy * uHalf;
    vec2 d = w - c;
    float r = length(d) * (1.0 - uKick * 0.025);
    float ang = atan(d.y, d.x) / 6.2831853 + 0.5;
    float fi = float(i);
    // rings drift slowly outward
    float k = r / C.w - uTime * 0.07 * uSpeed * (0.6 + hash11(fi + 0.5));
    float ri = floor(k + 0.5);
    float line = ringLine(k, 1.0 + 0.5 * step(0.8, hash21(vec2(ri, fi))));
    // arc segments: each ring has its own count, gap and rotation (inner rings turn faster)
    float nSeg = floor(1.0 + hash21(vec2(ri, fi + 3.0)) * 5.0);
    float gap = hash21(vec2(ri, fi + 7.0)) * 0.55;
    float dir = hash21(vec2(ri, fi + 9.0)) > 0.5 ? 1.0 : -1.0;
    float rot = uTime * 0.12 * uSpeed * dir / (0.6 + ri * 0.25);
    float seg = step(gap, fract(ang * nSeg + rot + hash21(vec2(ri, fi))));
    seg = max(seg, step(0.85, hash21(vec2(ri, fi + 13.0))));          // some rings are whole
    float maxR = C.w * (4.0 + 10.0 * C.z * C.z);                          // brighter sources reach further
    float fall = exp(-r * 2.2) * smoothstep(0.0, C.w * 0.8, r) * (1.0 - smoothstep(maxR * 0.55, maxR, r));
    vec3 rc = mix(photo(pImg) * 1.6 + 0.15, vec3(1.0), 0.45);
    rc = mix(rc, uAccent, step(0.9, hash21(vec2(ri, fi + 21.0))));
    col += rc * line * seg * fall * C.z * (0.4 + uEnergy * 0.35 + uKick * 0.5);
    // a fine cross marks the light source
    float px = uPx;
    float cross = (step(abs(d.x), px * 0.7) * step(abs(d.y), px * 7.0) + step(abs(d.y), px * 0.7) * step(abs(d.x), px * 7.0));
    col += vec3(cross) * 0.7 * C.z;
  }

  // ripples: one per kick, a thin bright circle that expands and fades
  for (int j = 0; j < ${MAXR}; j++) {
    vec4 R = uRipples[j];
    float age = uTime - R.z;
    if (age < 0.0 || age > 3.0) continue;
    float r = length(w - R.xy * uHalf);
    float rad = age * 0.42 * uSpeed;
    float ring = 1.0 - smoothstep(uPx * 0.6, uPx * 2.2, abs(r - rad));
    float trail = exp(-max(rad - r, 0.0) * 40.0) * step(r, rad) * 0.15;
    col += mix(vec3(1.0), uAccent, 0.35) * (ring + trail) * exp(-age * 1.5) * R.w;
  }

  // sparks → small bright points
  col += vec3(sparks(pImg, 220.0, 0.2)) * 1.2;

  col *= uMix * free;
  if (max(col.r, max(col.g, col.b)) < 0.002) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

const PART_VERT = /* glsl */`
attribute vec4 aOrbit;  // x centre index, y radius (world), z phase, w speed sign·factor
attribute float aSeed;
uniform vec4 uCenters[${MAXC}];
uniform float uCamZ, uPtSize;
varying vec3 vCol;
varying float vA;
void main() {
  vec4 C = uCenters[int(aOrbit.x)];
  vec2 c = C.xy * uHalf;
  float r = aOrbit.y * (1.0 + uKick * 0.06 * (1.0 - aSeed));
  // Kepler-ish: angular speed ∝ r^-1.5
  float om = aOrbit.w * 0.035 * uSpeed / pow(max(r, 0.02), 1.5) * 0.12;
  float a = aOrbit.z + uTime * om;
  vec2 p = c + vec2(cos(a), sin(a) * mix(1.0, 0.82, aSeed)) * r;
  p += fieldAt(p) * 2.2;                // knocked out of orbit, swings back
  p = mix(p, gridSnap(p, 56.0), sigOn(1.0));
  p.y -= uFall * uFall * (0.1 + aSeed * 0.4);
  vec2 pImg = p / uHalf;
  float coh = coherence(pImg);
  vec3 pc = photo(pImg);
  vCol = mix(pc * 1.8 + 0.25, vec3(1.0), 0.35);
  float inside = step(abs(pImg.x), 1.15) * step(abs(pImg.y), 1.15);
  vA = uMix * (1.0 - coh) * C.z * (0.35 + 0.65 * inside) * (0.5 + uEnergy * 0.5 + uSine * 0.6 * step(0.8, aSeed));
  vec4 mv = modelViewMatrix * vec4(p, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPtSize * (0.8 + aSeed * 1.2);
}`;

const PART_FRAG = /* glsl */`
varying vec3 vCol;
varying float vA;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.4, 1.0, r)) * vA;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

export class Orbit extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, params, quality } = ctx;
    const f = analysis.features;
    const rng = makeRng(analysis.seed ^ 0x0b17);

    // centres: brightest points, the circle centre, else the brightest grid cells
    const cand = analysis.points.map((p) => ({ x: p.x, y: p.y, w: Math.min(1, p.peak * Math.sqrt(p.area) / 4) }));
    if (f.circularity > 0.25) cand.unshift({ x: f.circleCenter.x, y: f.circleCenter.y, w: 1 });
    if (cand.length < 2) {
      const g = analysis.grid;
      const cells = [...g.lum.keys()].sort((a, b) => g.lum[b] - g.lum[a]);
      for (const i of cells.slice(0, 12)) cand.push({ x: ((i % g.cols) + 0.5) / g.cols, y: (Math.floor(i / g.cols) + 0.5) / g.rows, w: g.lum[i] });
    }
    const centres = [];
    for (const c of cand) {
      if (centres.length >= MAXC) break;
      if (centres.some((o) => Math.hypot(o.x - c.x, (o.y - c.y) / 1.5) < 0.12)) continue;
      centres.push(c);
    }
    const maxW = Math.max(...centres.map((c) => c.w), 1e-3);
    this.centres = centres.map((c, i) => new THREE.Vector4(...toImg(c.x, c.y), i === 0 ? 1 : 0.35 + 0.55 * c.w / maxW, params.orbitRings * (0.75 + rng() * 0.6)));
    while (this.centres.length < MAXC) this.centres.push(new THREE.Vector4(0, 0, 0, 0.05));
    this.count = centres.length;

    this.ripples = []; for (let i = 0; i < MAXR; i++) this.ripples.push(new THREE.Vector4(0, 0, -99, 0));
    this.rippleIdx = 0;

    // ring field
    this.field = this.material({
      vertex: FIELD_VERT, fragment: FIELD_FRAG,
      uniforms: { uCenters: { value: this.centres }, uCount: { value: this.count }, uRipples: { value: this.ripples }, uHalftone: { value: 0.6 + 0.4 * rng() } },
      extensions: { derivatives: true },
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.field);
    plane.frustumCulled = false;
    this.group.add(plane);

    // orbiting particles
    const n = Math.round((quality.mobile ? 1400 : 3600) * params.density);
    const orb = new Float32Array(n * 4), seed = new Float32Array(n);
    const totalW = this.centres.slice(0, this.count).reduce((s, c) => s + c.z, 0);
    for (let i = 0; i < n; i++) {
      let pick = rng() * totalW, ci = 0;
      for (; ci < this.count - 1; ci++) { pick -= this.centres[ci].z; if (pick <= 0) break; }
      const sp = this.centres[ci].w;
      const ring = Math.floor(Math.pow(rng(), 1.6) * 14) + 1;
      orb[i * 4] = ci;
      orb[i * 4 + 1] = sp * (ring + (rng() - 0.5) * 0.15);
      orb[i * 4 + 2] = rng() * Math.PI * 2;
      orb[i * 4 + 3] = (rng() < 0.5 ? -1 : 1) * (0.7 + rng() * 0.6);
      seed[i] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('aOrbit', new THREE.BufferAttribute(orb, 4));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.parts = this.material({
      vertex: PART_VERT, fragment: PART_FRAG,
      uniforms: { uCenters: { value: this.centres }, uCamZ: { value: ctx.camZ }, uPtSize: { value: 2 } },
    });
    const pts = new THREE.Points(geo, this.parts);
    pts.frustumCulled = false;
    this.group.add(pts);
  }

  resize(view) { this.parts.uniforms.uPtSize.value = Math.max(1.5, view.bufferHeight / 520); }

  onEvent(ev, time) {
    if (ev.type === 'kick' && !ev.ghost) {
      // each kick sends a ripple from the next light source
      const c = this.centres[(this.rippleIdx) % this.count];
      this.ripples[this.rippleIdx % MAXR].set(c.x, c.y, time, ev.vel);
      this.rippleIdx++;
    } else if (ev.type === 'sine' && ev.long) {
      const [x, y] = toImg(ev.x, ev.y);
      this.ripples[this.rippleIdx % MAXR].set(x, y, time, 0.35);
      this.rippleIdx++;
    }
  }
}
