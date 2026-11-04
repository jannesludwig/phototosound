// ─────────────────────────────────────────────────────────────
//  DISSOLUTION — faces, portraits, organic subjects.
//  The photograph becomes a field of luminous pixel particles that
//  carry their source colours. Particles lift off in a seeded order;
//  the face region holds together the longest and dissolves last.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { makeRng } from '../rng.js';

const VERT = /* glsl */`
attribute vec2 aHome;   // image space
attribute vec3 aColor;
attribute vec4 aRand;   // x seed, y hold (face), z luminance, w seed2
uniform float uDis;     // dissolve amount 0..1
uniform float uSpacing; // particle spacing in device px
uniform float uCamZ;
uniform vec2  uCenter;  // centre of gravity (face) in image space
varying vec4 vColor;
varying float vD;

void main() {
  vec2 home = aHome;
  float seed = aRand.x, hold = aRand.y, lum = aRand.z, seed2 = aRand.w;
  float coh = coherence(home);

  // order of dissolution: random, light escapes first, the face last
  float thr = mix(0.04 + seed * 0.7 - lum * 0.12, 0.86 + seed * 0.3, hold);
  float d = smoothstep(thr, thr + 0.16, uDis) * (1.0 - coh);
  vD = d;

  vec2 w = home * uHalf;
  vec2 q = w;
  float t = uTime * 0.06 * uSpeed;
  for (int i = 0; i < 4; i++) q += curl2(q * 1.1 + seed2 * 0.6, t + float(i) * 1.7) * 0.085 * d;
  vec2 dir = normalize(w - uCenter * uHalf + 1e-4);
  // light drifts away from the subject and slowly rises, like ash or spores
  float far = d * d * (0.25 + seed * 1.1);
  q += (dir * 0.15 + vec2(0.0, 0.07)) * far;

  // kick → the whole field breathes outward
  q += dir * uKick * 0.03 * (0.2 + d);
  // noise → horizontal interference in thin bands
  float band = floor(home.y * 56.0 + 56.0);
  float on = step(0.8, hash11(band * 1.37 + floor(uTime * 13.0)));
  q.x += (hash11(band + floor(uTime * 29.0)) - 0.5) * 0.14 * uNoise * on * (0.25 + d);

  float flash = sparks(home, 34.0, 0.45);
  float z = (seed2 - 0.5) * 0.5 * d;
  vec4 mv = modelViewMatrix * vec4(q, z, 1.0);
  gl_Position = projectionMatrix * mv;

  // coherent: a pixel of the grid · free: a fine point of light
  float size = uSpacing * mix(0.95, 0.3 + seed * 0.4 + lum * 0.25, d) * (1.0 + flash * 1.4 + uKick * 0.35 * d);
  gl_PointSize = max(1.0, size * (uCamZ / -mv.z));

  vec3 c = aColor;
  c = mix(c, c * 1.35, d);                                  // luminous once free
  c += flash * 0.9;                                         // clicks → sparks
  c += uSine * 0.7 * step(0.985, hash11(seed * 13.0 + floor(uTime * 24.0))) * d; // sines → shimmer
  c = mix(c, uAccent * (0.4 + lum), 0.5 * d * step(0.96, seed2)); // a few cold particles
  // once free, only the light survives: dark particles fade into the black
  float keep = mix(1.0, 0.05 + 0.7 * smoothstep(0.08, 0.6, lum) + flash, d);
  float a = uMix * (1.0 - coh * 0.97) * keep;
  vColor = vec4(c, a);
}`;

const FRAG = /* glsl */`
varying vec4 vColor;
varying float vD;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  // bound: square-ish pixel when coherent, soft round light when free
  float r = mix(max(abs(q.x), abs(q.y)), length(q), smoothstep(0.0, 0.4, vD)) * 2.0;
  float core = 1.0 - smoothstep(0.55, 1.0, r);
  float glow = exp(-r * r * 4.0) * 0.3 * vD;
  float a = (core + glow) * vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * a, 1.0);
}`;

export class Dissolution extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, quality, params } = ctx;
    const f = analysis.features;
    const aspect = analysis.width / analysis.height;
    const target = (quality.mobile ? 13000 : 38000) * params.density;
    const cols = Math.round(Math.sqrt(target * aspect)), rows = Math.round(cols / aspect);
    this.cols = cols;
    const n = cols * rows;
    const rng = makeRng(analysis.seed ^ 0xd155);

    // sample colours from the analysis-resolution pixels (bilinear enough at this density)
    const px = analysis.maps.pixels, w = analysis.width, h = analysis.height;
    const home = new Float32Array(n * 2), color = new Float32Array(n * 3), rand = new Float32Array(n * 4);
    const fb = f.faceBox;
    const fc = fb ? [fb.x + fb.w / 2, fb.y + fb.h / 2] : [0.5, 0.45];
    let k = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++, k++) {
      const x = (i + 0.5) / cols, y = (j + 0.5) / rows;
      const [ix, iy] = toImg(x, y);
      home[k * 2] = ix; home[k * 2 + 1] = iy;
      const sx = Math.min(w - 1, Math.floor(x * w)), sy = Math.min(h - 1, Math.floor(y * h));
      const pi = (sy * w + sx) * 4;
      const r = px[pi] / 255, g = px[pi + 1] / 255, b = px[pi + 2] / 255;
      color[k * 3] = r; color[k * 3 + 1] = g; color[k * 3 + 2] = b;
      // hold: inside the face → dissolves last; without a face the centre holds a little
      let hold;
      if (fb) {
        const dx = (x - fc[0]) / (fb.w * 0.62), dy = (y - fc[1]) / (fb.h * 0.72);
        hold = Math.exp(-(dx * dx + dy * dy) * 1.4);
      } else {
        const dx = x - fc[0], dy = y - fc[1];
        hold = Math.exp(-(dx * dx + dy * dy) * 14) * 0.45;
      }
      rand[k * 4] = rng(); rand[k * 4 + 1] = hold; rand[k * 4 + 2] = 0.2126 * r + 0.7152 * g + 0.0722 * b; rand[k * 4 + 3] = rng();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); // unused, required
    geo.setAttribute('aHome', new THREE.BufferAttribute(home, 2));
    geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3));
    geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 4));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
    this.mat = this.material({
      vertex: VERT, fragment: FRAG,
      uniforms: { uDis: { value: 0 }, uSpacing: { value: 4 }, uCamZ: { value: ctx.camZ }, uCenter: { value: new THREE.Vector2(fc[0] * 2 - 1, 1 - fc[1] * 2) } },
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.dis = 0;
  }

  resize(view) {
    // spacing of the grid in device pixels
    this.mat.uniforms.uSpacing.value = (2 * view.half.x / this.cols) * (view.bufferHeight / 2);
  }

  update(s) {
    // how far the image has come apart follows the form of the piece
    const target = s.form * (0.22 + 0.58 * s.energy) + s.brk * 0.25;
    this.dis += (target - this.dis) * Math.min(1, s.dt * 0.6);
    this.mat.uniforms.uDis.value = this.dis + s.kick * 0.02;
  }
}
