// ─────────────────────────────────────────────────────────────
//  terrain.js — the SOUND MAP. The single visual language.
//
//  The photograph as a tilted terrain of thin lines: contour lines at
//  several densities (fine / main / index), a wireframe state, ridge
//  hatching where the image has hard edges. A scan line crosses it and
//  everything it touches sounds; the first sweep MAPS the terrain (it
//  only exists where the scan has passed). Every sound event lights a
//  specific place:
//    1 edge spark    (click)      lines + ridges flare in a small radius
//    2 band flare    (glitch)     the contour band at that height flares,
//                                 and the scan segment there burns white
//    3 flicker       (noise/data) a region flickers by chance
//    4 ring          (kick)       a ring of light runs out from the ridge
//    5 glow          (resonance / focus) a soft, slow glow
//  Height breathes with the low end; lines brighten with it; the image
//  decays (lines break, the border crumbles) as it is consumed.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer, toImg } from './common.js';

const EV = 16;
const EVENTS = /* glsl */`
uniform vec4 uEv[${EV}];   // x y (image space), start time, kind
uniform vec4 uEvB[${EV}];  // strength, height at the event, life (s), radius
`;

const VERT = EVENTS + /* glsl */`
varying vec2 vP;
varying vec3 vM;
varying float vFog;
void main() {
  vec2 p = position.xy;
  vM = mapData(p);
  float z = terrainZ(p);
  if (uDeformOn > 0.5) for (int i = 0; i < ${EV}; i++) {
    vec4 e = uEv[i], b = uEvB[i];
    float age = uTime - e.z;
    if (age < 0.0 || age > b.z) continue;
    float life = 1.0 - age / b.z, d = distance(p * uHalf, e.xy * uHalf);
    if (e.w < 1.5) z += b.x * 0.03 * exp(-d * d / 0.0016) * life;                                     // a spike where the edge clicked
    else if (e.w < 2.5 && abs(p.y - e.y) < 0.05 && d < b.w) p.x += (hash11(floor(uTime * 30.0) + e.x * 7.0) - 0.5) * 0.08 * life;  // a tear
    else if (e.w < 3.5 && d < b.w) z += (hash21(floor(p * 50.0) + floor(uTime * 30.0)) - 0.5) * 0.04 * life;      // jitter
  }
  vec3 pos = mapPos(p, z);
  vP = p;
  vFog = clamp(1.0 + pos.z * 0.85, 0.15, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const FRAG = EVENTS + /* glsl */`
uniform float uLevels, uGrid, uWire, uFine, uColorAmt;
uniform float uScanX, uScanDir, uReveal, uMapping, uPhotoA;
uniform float uShowContours, uShowWire, uShowRidges, uShowScan, uShowFlares, uShowDecay;
varying vec2 vP;
varying vec3 vM;
varying float vFog;

// a 1 px iso-line of k; it fades where lines would crowd closer than ~3 px (steep slopes)
float iso(float k, float w) { float d = abs(fract(k + 0.5) - 0.5); float fw = fwidth(k); return (1.0 - smoothstep(fw * 0.35 * w, fw * 1.15 * w, d)) * (1.0 - smoothstep(0.18, 0.4, fw)) * step(1e-4, fw); }

void main() {
  vec2 p = vP;
  float h = vM.r, ridge = vM.g;
  float sx = p.x * 0.5 + 0.5, sy = p.y * 0.5 + 0.5;
  // decay: the border crumbles inward (irregular cells), lines break into dashes
  float border = 1.0 - max(abs(p.x), abs(p.y));
  float cellR = hash21(floor(p * 36.0));
  if (uShowDecay > 0.5 && border < uDecay * 0.45 * (0.5 + cellR)) discard;
  float broken = uShowDecay * step(vnoise(p * 24.0 + vec2(uTime * 0.04, 0.0)), uDecay * 0.75);
  // the first sweep maps the terrain: it exists only where the scan has passed
  float revealed = uMapping > 0.5 ? smoothstep(uReveal, uReveal - 0.015, sx) : 1.0;

  // contours: main, index (every 5th), fine (density grows with the piece)
  float k = h * uLevels + 0.37;                     // offset: flat terraces never sit exactly on a level
  float main = iso(k, 1.0), idx = iso(k / 5.0, 1.35), fine = iso(k * 3.0, 0.6) * uFine;
  float cont = (main * 0.5 + idx * 0.42 + fine * 0.18) * uShowContours;
  float wire = max(iso(sx * uGrid, 0.8), iso(sy * uGrid * uHalf.y / uHalf.x, 0.8)) * uShowWire * uWire;
  float hatch = iso((p.x - p.y) * 110.0, 0.7) * smoothstep(0.35, 0.75, ridge) * uShowRidges * (0.18 + 0.82 * uClick);

  // the scan line and its afterglow (the part just listened to)
  float dx = sx - uScanX;
  float scan = (1.0 - smoothstep(0.0, 0.003 + fwidth(sx) * 1.2, abs(dx))) * uShowScan;
  float behind = -dx * uScanDir;
  float trail = uShowScan * step(0.0, behind) * exp(-behind * 14.0);

  // the events, each at its own place
  float fl = 0.0, white = 0.0, flick = 1.0;
  if (uShowFlares > 0.5) for (int i = 0; i < ${EV}; i++) {
    vec4 e = uEv[i], b = uEvB[i];
    float age = uTime - e.z;
    if (age < 0.0 || age > b.z) continue;
    float life = 1.0 - age / b.z, d = distance(p * uHalf, e.xy * uHalf);
    if (e.w < 1.5) { float l = exp(-d * d / (b.w * b.w)); fl += l * life * b.x * 2.0; white += l * life * b.x; }
    else if (e.w < 2.5) {
      float band = 1.0 - smoothstep(0.0, 0.03, abs(h - b.y));
      float l = exp(-d / b.w) * band * life;
      fl += l * 3.0; white += l * 2.0;
      float seg = (1.0 - smoothstep(0.0, 0.006, abs(dx))) * step(abs(sy - (e.y * 0.5 + 0.5)), 0.12) * life;   // the scan burns white here
      white += seg * 3.0;
    }
    else if (e.w < 3.5) { float inR = step(d, b.w) * life; flick *= mix(1.0, step(0.45, hash21(floor(p * 70.0) + floor(uTime * 45.0))), inR); fl += inR * 0.5; }
    else if (e.w < 4.5) { float ring = 1.0 - smoothstep(0.0, 0.012, abs(d - age * 0.5)); fl += ring * life * b.x * 1.5; }
    else { float l = exp(-d * d / (b.w * b.w)); fl += l * sin(life * 3.14159) * 0.9; }
  }

  vec3 base = mix(vec3(0.78, 0.83, 0.88), photo(p) * 1.5 + 0.06, uColorAmt);
  base = mix(base, uAccent, idx * 0.25);
  float lines = cont + wire * 0.38 + hatch * 0.7;
  vec3 col = base * lines * (0.65 + 0.6 * uLow) * (1.0 + fl * 1.4) * (1.0 + trail * 0.9);
  col += vec3(1.0) * white * (lines + 0.15);
  col += vec3(1.0) * scan * 0.9 + uAccent * scan * 0.3;
  col *= flick * (1.0 - broken * 0.85) * vFog;
  // the first sweep turns the photograph into the map: ahead of the scan the photo itself lies on
  // the terrain (same pose, same relief), behind it only the lines remain
  col = mix(photo(p) * uPhotoA * (0.55 + 0.45 * vFog), col, revealed);
  col = mix(col, vec3(luma(col)), uDecay * 0.6);                             // colours drain as it is consumed
  float coh = coherence(p);
  col = col * (1.0 - coh) + photo(p) * coh;                                  // hold: the photograph shows through
  col *= uMix;
  if (max(col.r, max(col.g, col.b)) < 0.002) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Terrain extends Layer {
  constructor(ctx) {
    super(ctx);
    const { map, quality } = ctx, P = map.params;
    const w = map.width, h = map.height;
    // r = height, g = ridges (edges), b = texture — flipped so v = 0 is the bottom
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (h - 1 - y) * w + x, i = (y * w + x) * 4;
      data[i] = Math.round(map.H[s] * 255); data[i + 1] = Math.round(Math.min(1, map.edgeN[s]) * 255); data[i + 2] = Math.round(Math.min(1, map.texture[s] * 2) * 255); data[i + 3] = 255;
    }
    this.tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
    ctx.shared.uHeight.value = this.tex;

    const segX = quality.mobile ? 130 : 220, segY = Math.round(segX * h / w);
    const geo = new THREE.PlaneGeometry(2, 2, segX, segY);
    this.ev = []; this.evB = [];
    for (let i = 0; i < EV; i++) { this.ev.push(new THREE.Vector4(0, 0, -99, 0)); this.evB.push(new THREE.Vector4(0, 0, 0.1, 0.1)); }
    this.slot = 0;
    this.mat = this.material({
      vertex: VERT, fragment: FRAG,
      uniforms: {
        uEv: { value: this.ev }, uEvB: { value: this.evB },
        uLevels: { value: P.levels }, uGrid: { value: P.grid }, uWire: { value: 1 }, uFine: { value: 0 }, uColorAmt: { value: 0.3 },
        uScanX: { value: 0 }, uScanDir: { value: 1 }, uReveal: { value: 0 }, uMapping: { value: 1 }, uPhotoA: { value: 1 },
        uShowContours: { value: 1 }, uShowWire: { value: 1 }, uShowRidges: { value: 1 }, uShowScan: { value: 1 }, uShowFlares: { value: 1 }, uShowDecay: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(geo, this.mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
    this.group.add(mesh);
    this.wire = 1; this.fine = 0;
  }

  /** A flare at image coords (x, y ∈ 0..1, y down). */
  flare(kind, x, y, strength, life, radius, hAt, now) {
    const [ix, iy] = toImg(x, y), k = this.slot++ % EV;
    this.ev[k].set(ix, iy, now, kind); this.evB[k].set(strength, hAt, life, radius);
  }

  onEvent(ev, now, hAt, stepDur) {
    if (ev.x === undefined) return;
    const h = hAt(ev.x, ev.y);
    switch (ev.type) {
      case 'click': case 'nerve': this.flare(1, ev.x, ev.y, ev.vel, 0.28, 0.06, h, now); break;
      case 'glitch': this.flare(2, ev.x, ev.y, 1, 0.5, 0.35, h, now); break;
      case 'noise': this.flare(3, ev.x, ev.y, 1, 0.22, 0.12, h, now); break;
      case 'scanner': case 'memory': this.flare(3, ev.x, ev.y, 0.6, 0.3, 0.05, h, now); break;
      case 'kick': this.flare(4, ev.x, ev.y, ev.vel, 1.3, 0.1, h, now); break;
      case 'res': this.flare(5, ev.x, ev.y, 1, ev.dur * stepDur * 16, 0.3, h, now); break;
      case 'erode': this.flare(5, ev.x, ev.y, 0.6, 0.8, 0.05, h, now); break;
      case 'interf': this.flare(1, ev.x, ev.y, 1, 0.4, 0.05, h, now); break;
    }
  }

  update(s) {
    const u = this.mat.uniforms, P = this.ctx.map.params;
    u.uScanX.value = s.scan.x; u.uScanDir.value = s.scan.dir; u.uReveal.value = s.scan.reveal; u.uMapping.value = s.scan.mapping ? 1 : 0;
    // wireframe vs contour states over the piece (graphic images keep more wire); kicks flash the wire in
    const base = { READING: 1, AWAKENING: 0.3, LIFE: 0.06, DECAY: 0.3, END: 0.5 }[s.section] ?? 0.2;
    const wTarget = Math.min(1, base + P.terraced * 0.3 + s.kick * 0.25);
    this.wire += (wTarget - this.wire) * Math.min(1, s.dt * (wTarget > this.wire ? 12 : 1.5));
    const fTarget = { READING: 0, AWAKENING: 0.1, LIFE: 0.15 + 0.5 * s.energy, DECAY: 0.3, END: 0.2 }[s.section] ?? 0;
    this.fine += (fTarget - this.fine) * Math.min(1, s.dt * 0.5);
    u.uWire.value = this.wire; u.uFine.value = this.fine;
    u.uColorAmt.value = 0.18 + 0.35 * s.energy;
  }

  setShow(name, on) { const k = 'uShow' + name; if (this.mat.uniforms[k]) this.mat.uniforms[k].value = on ? 1 : 0; }
  dispose() { super.dispose(); this.tex.dispose(); }
}
