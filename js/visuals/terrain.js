// ─────────────────────────────────────────────────────────────
//  terrain.js — the SOUND MAP, the single visual language.
//
//  The photograph as a tilted terrain of thin lines. While READING the
//  photo itself lies on the terrain ahead of the scan line (same pose,
//  same relief) and turns into contour lines behind it. Then the map
//  lives; everything here is drawn ON the terrain, in its perspective:
//    contours     fine / main / index lines, carrying the photo's colours
//    photo core   near the epicenter (the focal point) the photo stays
//                 faintly recognisable → pixel dissolution → pure lines;
//                 in DECAY it is the last thing to go
//    pixels       single photo pixels at their own place; they glow when
//                 sound passes there
//    reveal       on sound events a small patch of the photo appears at
//                 that spot and fades
//    waves        heart and peak pulses run outward across the lines
//    interference where two waves cross, a bright line is drawn
//    flares       every event lights its own place (edge spark, glitch
//                 band, flicker, kick ring, glow, memory ghost of the
//                 scan, interference fringes)
//    superposition two ghost states (offset in yaw and height) flicker,
//                 then collapse into one on a strong beat
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer, toImg } from './common.js';

const EV = 16, WV = 10;
const EVENTS = /* glsl */`
uniform vec4 uEv[${EV}];   // x y (image space), start time, kind
uniform vec4 uEvB[${EV}];  // strength, height at the event (glitch) / angle (interference), life (s), radius
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
uniform float uScanX, uScanDir, uReveal, uMapping, uPhotoA, uScanA;
uniform float uShowContours, uShowWire, uShowRidges, uShowScan, uShowFlares, uShowDecay;
uniform float uShowCore, uShowPixels, uShowReveal, uShowWaves, uShowInterf, uShowMemory, uShowUnder;
uniform float uUnder;
uniform vec2 uFocal;                 // the epicenter (analysis coords, y down)
uniform float uCore, uCoreR;
uniform vec4 uWv[${WV}];             // waves: x y (analysis coords), start time, strength
uniform float uWaveV, uWaveR;
uniform float uGhostA;
varying vec2 vP;
varying vec3 vM;
varying float vFog;

// a 1 px iso-line of k; it fades where lines would crowd closer than ~3 px (steep slopes)
float iso(float k, float w) { float d = abs(fract(k + 0.5) - 0.5); float fw = fwidth(k); return (1.0 - smoothstep(fw * 0.35 * w, fw * 1.15 * w, d)) * (1.0 - smoothstep(0.18, 0.4, fw)) * step(1e-4, fw); }

void main() {
  vec2 p = vP;
  float ia = uHalf.x / uHalf.y;
  vec2 q = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);              // analysis coords
  float h = vM.r, ridge = vM.g;
  float sx = q.x, sy = p.y * 0.5 + 0.5;
  float dF = length((q - uFocal) * vec2(ia, 1.0));             // distance to the epicenter (image heights)
  // decay: the border crumbles and an erosion front eats inward — the epicenter goes last
  float border = 1.0 - max(abs(p.x), abs(p.y));
  float cellR = hash21(floor(p * 36.0));
  if (uShowDecay > 0.5 && (border < uDecay * 0.45 * (0.5 + cellR) || dF > (1.0 - uDecay) * 1.3 + 0.04 + cellR * 0.1)) discard;
  float broken = uShowDecay * step(vnoise(p * 24.0 + vec2(uTime * 0.04, 0.0)), uDecay * 0.75 * smoothstep(0.05, 0.3, dF));
  float revealed = uMapping > 0.5 ? smoothstep(uReveal, uReveal - 0.015, sx) : 1.0;

  // contours: main, index (every 5th), fine
  float k = h * uLevels + 0.37;
  float main = iso(k, 1.0), idx = iso(k / 5.0, 1.35), fine = iso(k * 3.0, 0.6) * uFine;
  float cont = (main * 0.5 + idx * 0.42 + fine * 0.18) * uShowContours;
  float wire = max(iso(sx * uGrid, 0.8), iso(sy * uGrid / ia, 0.8)) * uShowWire * uWire;
  float hatch = iso((p.x - p.y) * 110.0, 0.7) * smoothstep(0.35, 0.75, ridge) * uShowRidges * (0.18 + 0.82 * uClick);

  // the scan line and its afterglow (READING only)
  float dx = sx - uScanX;
  float scan = (1.0 - smoothstep(0.0, 0.003 + fwidth(sx) * 1.2, abs(dx))) * uShowScan * uScanA;
  float behind = -dx * uScanDir;
  float trail = uShowScan * uScanA * step(0.0, behind) * exp(-behind * 14.0);

  // waves from the heart and the peaks; where two cross, interference
  float wS = 0.0, wQ = 0.0;
  if (uShowWaves + uShowInterf > 0.5) for (int i = 0; i < ${WV}; i++) {
    vec4 w = uWv[i];
    float age = uTime - w.z;
    if (age < 0.0) continue;
    float r = age * uWaveV;
    if (r > uWaveR) continue;
    float d = length((q - w.xy) * vec2(ia, 1.0));
    float ring = exp(-pow((d - r) / 0.011, 2.0)) * w.w * (1.0 - r / uWaveR);
    wS += ring; wQ += ring * ring;
  }
  float interf = max(0.0, wS * wS - wQ) * uShowInterf;
  wS *= uShowWaves;

  // the events, each at its own place
  float fl = 0.0, white = 0.0, flick = 1.0, rev = 0.0;
  if (uShowFlares > 0.5) for (int i = 0; i < ${EV}; i++) {
    vec4 e = uEv[i], b = uEvB[i];
    float age = uTime - e.z;
    if (age < 0.0 || age > b.z) continue;
    float life = 1.0 - age / b.z, d = distance(p * uHalf, e.xy * uHalf);
    if (e.w < 1.5) { float l = exp(-d * d / (b.w * b.w)); fl += l * life * b.x * 2.0; white += l * life * b.x; rev += l * life * 0.7; }
    else if (e.w < 2.5) {
      float band = 1.0 - smoothstep(0.0, 0.03, abs(h - b.y));
      float l = exp(-d / b.w) * band * life;
      fl += l * 3.0; white += l * 2.0;
    }
    else if (e.w < 3.5) { float inR = step(d, b.w) * life; flick *= mix(1.0, step(0.45, hash21(floor(p * 70.0) + floor(uTime * 45.0))), inR); fl += inR * 0.5; }
    else if (e.w < 4.5) { float ring = 1.0 - smoothstep(0.0, 0.012, abs(d - age * 0.5)); fl += ring * life * b.x * 1.5; rev += exp(-d * d / 0.003) * life * 0.6; }
    else if (e.w < 5.5) { float l = exp(-d * d / (b.w * b.w)); fl += l * sin(life * 3.14159) * 0.9 * b.x; }
    else if (e.w < 6.5) {                                                   // memory: a ghost of the scan line where it heard this
      float ex = e.x * 0.5 + 0.5, ey = e.y * 0.5 + 0.5;
      float seg = (1.0 - smoothstep(0.0, 0.002 + fwidth(sx) * 1.2, abs(sx - ex))) * (1.0 - smoothstep(0.08, 0.16, abs(sy - ey)));
      white += seg * life * 1.2 * uShowMemory; rev += exp(-d * d / (b.w * b.w)) * life * 0.9 * uShowMemory;
    }
    else if (e.w < 7.5) {                                                   // interference fringes across the meeting line
      vec2 dir = vec2(cos(b.y), -sin(b.y));
      float along = dot((p - e.xy) * uHalf, dir);
      float fr = pow(0.5 + 0.5 * cos(along * 520.0), 6.0) * exp(-d * d / (b.w * b.w)) * life;
      white += fr * 1.6 * uShowInterf; fl += fr;
    }
    else { float l = exp(-d * d / (b.w * b.w)) * life; fl += l * 0.9; rev += l * 0.5; }   // a peak pulses
  }

  vec3 base = mix(vec3(0.78, 0.83, 0.88), photo(p) * 1.5 + 0.06, uColorAmt);      // the lines carry the photo's colours
  base = mix(base, uAccent, idx * 0.25);
  float lines = cont + wire * 0.38 + hatch * 0.7;
  vec3 col = base * lines * (0.65 + 0.6 * uLow) * (1.0 + fl * 1.4 + wS * 3.0) * (1.0 + trail * 0.9);
  col += vec3(1.0) * white * (lines + 0.15);
  col += mix(vec3(1.0), uAccent, 0.4) * interf * 1.4;
  col += vec3(1.0) * scan * 0.9 + uAccent * scan * 0.3;
  col *= flick * (1.0 - broken * 0.85) * vFog;
  col = mix(col, vec3(luma(col)), uDecay * 0.6);                             // colours drain as it is consumed

  // the photograph, held at the epicenter: core → pixel dissolution → lines
  float hold = uCore * uShowCore * (1.0 - smoothstep(0.82, 1.0, uDecay));
  float core = (1.0 - smoothstep(uCoreR * 0.3, uCoreR, dF)) * hold;
  vec2 cs = q * vec2(ia, 1.0) * 90.0, cell = floor(cs);
  vec2 cc = (cell + 0.5) / 90.0 / vec2(ia, 1.0);
  vec3 cellCol = texture2D(uImage, clamp(vec2(cc.x, 1.0 - cc.y), 0.001, 0.999)).rgb;
  float dis = (1.0 - smoothstep(uCoreR * 0.5, uCoreR * 1.9, dF)) * hold;
  float pix = step(hash21(cell), dis * 0.55) * (1.0 - core) * step(max(abs(fract(cs.x) - 0.5), abs(fract(cs.y) - 0.5)), 0.42);
  col += photo(p) * core * 0.6 + cellCol * pix * 0.45;
  // single pixels of the photo at their own places; they glow when sound passes
  vec2 ps = q * vec2(ia, 1.0) * 64.0, pc = floor(ps);
  float single = step(hash21(pc + 17.0), 0.022) * step(max(abs(fract(ps.x) - 0.5), abs(fract(ps.y) - 0.5)), 0.3) * uShowPixels * (1.0 - uDecay * 0.7);
  vec3 pCol = texture2D(uImage, clamp(vec2((pc.x + 0.5) / 64.0 / ia, 1.0 - (pc.y + 0.5) / 64.0), 0.001, 0.999)).rgb;
  col += pCol * single * (0.1 + 2.2 * (wS + fl * 0.6 + interf));
  // local reveal: a small patch of the photo where a sound just happened
  col += photo(p) * min(1.0, rev) * 0.75 * uShowReveal;

  // MEASUREMENT: the photo lies underneath the flowing contour lines, in the map's perspective
  col += photo(p) * uUnder * uShowUnder * (0.45 + 0.55 * vFog) * (1.0 - min(1.0, lines * 0.6));
  // READING: ahead of the scan the photograph itself lies on the terrain; behind it only the map remains
  col = mix(photo(p) * uPhotoA * (0.55 + 0.45 * vFog), col, revealed);
  float coh = coherence(p);
  col = col * (1.0 - coh) + photo(p) * coh;                                  // hold: the photograph shows through
  col *= uMix * uGhostA;
  if (max(col.r, max(col.g, col.b)) < 0.002) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

const SHOW = ['Contours', 'Wire', 'Ridges', 'Scan', 'Flares', 'Decay', 'Core', 'Pixels', 'Reveal', 'Waves', 'Interf', 'Memory', 'Under'];

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
    this.geo = new THREE.PlaneGeometry(2, 2, segX, segY);
    this.ev = []; this.evB = []; this.wv = [];
    for (let i = 0; i < EV; i++) { this.ev.push(new THREE.Vector4(0, 0, -99, 0)); this.evB.push(new THREE.Vector4(0, 0, 0.1, 0.1)); }
    for (let i = 0; i < WV; i++) this.wv.push(new THREE.Vector4(0, 0, -99, 0));
    this.slot = 0; this.wslot = 0;
    const own = {      // one set of uniform objects, shared by the terrain and its ghosts
      uEv: { value: this.ev }, uEvB: { value: this.evB }, uWv: { value: this.wv },
      uLevels: { value: P.levels }, uGrid: { value: P.grid }, uWire: { value: 1 }, uFine: { value: 0 }, uColorAmt: { value: 0.3 },
      uScanX: { value: 0 }, uScanDir: { value: 1 }, uReveal: { value: 0 }, uMapping: { value: 1 }, uPhotoA: { value: 1 }, uScanA: { value: 1 },
      uFocal: { value: new THREE.Vector2(map.focal.x, map.focal.y) }, uCore: { value: 0.5 }, uCoreR: { value: 0.18 }, uUnder: { value: 0.3 },
      uWaveV: { value: 0.2 }, uWaveR: { value: 0.55 },
    };
    for (const n of SHOW) own['uShow' + n] = { value: 1 };
    this.u = own;
    const mk = (yawOff, zOff, ghostA) => this.material({ vertex: VERT, fragment: FRAG, uniforms: { ...own, uYawOff: { value: yawOff }, uZOff: { value: zOff }, uGhostA: { value: ghostA } } });
    this.mat = mk(0, 0, 1);
    const mesh = new THREE.Mesh(this.geo, this.mat); mesh.frustumCulled = false; mesh.renderOrder = 2;
    this.group.add(mesh);
    // superposition: two ghost states of the same terrain
    this.ghosts = [mk(0.1, 0.3, 0), mk(-0.08, -0.25, 0)].map((m) => { const g = new THREE.Mesh(this.geo, m); g.frustumCulled = false; g.renderOrder = 1; g.visible = false; this.group.add(g); return g; });
    this.sup = { t0: -99, dur: 0, collapse: -99 };
    this.showGhost = true;
    this.wire = null; this.fine = null;
  }

  /** A flare at image coords (x, y ∈ 0..1, y down). */
  flare(kind, x, y, strength, life, radius, hAt, now) {
    const [ix, iy] = toImg(x, y), k = this.slot++ % EV;
    this.ev[k].set(ix, iy, now, kind); this.evB[k].set(strength, hAt, life, radius);
  }
  wave(x, y, strength, now) { this.wv[this.wslot++ % WV].set(x, y, now, strength); }

  onEvent(ev, now, hAt, stepDur) {
    if (ev.x === undefined) return;
    const h = hAt(ev.x, ev.y);
    switch (ev.type) {
      case 'click': this.flare(1, ev.x, ev.y, ev.vel, 0.28, 0.07, h, now); break;
      case 'nerve': this.flare(1, ev.x, ev.y, ev.vel * 0.8, 0.35, 0.035, h, now); break;
      case 'glitch': this.flare(2, ev.x, ev.y, 1, 0.5, 0.35, h, now); break;
      case 'noise': this.flare(3, ev.x, ev.y, 1, 0.22, 0.12, h, now); break;
      case 'scanner': this.flare(3, ev.x, ev.y, 0.6, 0.3, 0.05, h, now); break;
      case 'memory': this.flare(6, ev.x, ev.y, 1, 0.55, 0.05, h, now); break;
      case 'kick': this.flare(4, ev.x, ev.y, ev.vel, 1.3, 0.1, h, now); if (ev.collapse) this.sup.collapse = now; break;
      case 'res': this.flare(5, ev.x, ev.y, 1, ev.dur * stepDur * 16, 0.3, h, now); break;
      case 'erode': this.flare(5, ev.x, ev.y, 0.7, 0.9, 0.045, h, now); break;
      case 'interf': this.flare(7, ev.x, ev.y, 1, 0.45, 0.06, ev.ang, now); break;
      case 'peak': this.flare(8, ev.x, ev.y, 1, 0.5, 0.04, h, now); this.wave(ev.x, ev.y, 0.55, now); break;
      case 'heart': if (ev.lub) this.wave(ev.x, ev.y, 1, now); break;
      case 'superpose': this.sup = { t0: now, dur: (ev.bars || 1) * stepDur * 16, collapse: -99 }; break;
    }
  }

  update(s) {
    const u = this.u, P = this.ctx.map.params;
    u.uScanX.value = s.scan.x; u.uScanDir.value = 1; u.uReveal.value = s.scan.reveal; u.uMapping.value = s.scan.mapping ? 1 : 0; u.uScanA.value = s.scan.alpha ?? 1;
    // wireframe vs contour states over the piece (graphic images keep more wire)
    const base = { READING: 0.35, LIFE: 0.1 }[s.section] ?? 0.2;
    const wTarget = Math.min(1, base + P.terraced * 0.3 + s.kick * 0.25);
    if (this.wire === null) this.wire = wTarget;                              // a jump into the piece starts in the right state
    this.wire += (wTarget - this.wire) * Math.min(1, s.dt * (wTarget > this.wire ? 12 : 1.5));
    const fTarget = { READING: 0.12 + 0.3 * s.scan.reveal, LIFE: 0.3 }[s.section] ?? 0;
    if (this.fine === null) this.fine = fTarget;
    this.fine += (fTarget - this.fine) * Math.min(1, s.dt * 0.5);
    u.uWire.value = this.wire; u.uFine.value = this.fine;
    u.uColorAmt.value = 0.22 + 0.35 * s.energy;
    u.uCore.value = 0; u.uUnder.value = 0.24 + 0.1 * s.scan.reveal;
    u.uWaveV.value = this.ctx.waveV / (this.ctx.stepDur || 0.14);
    // superposition: the ghosts flicker for a bar, then collapse onto the one state on the strong beat
    const t = s.t, sp = this.sup;
    let mainA = 1;
    if (t >= sp.t0 && t < sp.t0 + sp.dur + 0.3 && this.showGhost) {
      const into = Math.min(1, (t - sp.t0) / 0.4), col = sp.collapse > 0 ? Math.min(1, (t - sp.collapse) / 0.12) : 0;
      const ga = into * (1 - col);
      mainA = 1 - 0.45 * ga * (Math.random() < 0.5 ? 1 : 0.3);
      this.ghosts.forEach((g, i) => {
        const m = g.material.uniforms, off = i ? [-0.08, -0.25] : [0.1, 0.3];
        m.uYawOff.value = off[0] * (1 - col); m.uZOff.value = off[1] * (1 - col);
        m.uGhostA.value = ga * (Math.random() < 0.55 ? 0.6 : 0.12);
        g.visible = ga > 0.01;
      });
    } else this.ghosts.forEach((g) => { g.visible = false; });
    this.mat.uniforms.uGhostA.value = mainA;
  }

  setShow(name, on) {
    if (name === 'Ghost') { this.showGhost = on; return; }
    const k = 'uShow' + name; if (this.u[k]) this.u[k].value = on ? 1 : 0;
  }
  dispose() { this.geo.dispose(); super.dispose(); this.tex.dispose(); }
}
