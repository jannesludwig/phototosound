// ─────────────────────────────────────────────────────────────
//  TOPOGRAPHY — smooth gradients, landscapes, sky.
//  Brightness becomes a height map. Contour lines (isohypses) are
//  drawn on a wireframe terrain that slowly tilts up out of the
//  picture plane and breathes with the sub; kicks send waves across.
//  Where the observer looks, the terrain lands back into the photo.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World, toImg } from './common.js';
import { blur } from '../analysis.js';
import { makeRng } from '../rng.js';

const VERT = /* glsl */`
uniform sampler2D uHeight;
uniform float uTilt, uAmp, uYaw, uLevels;
uniform vec4 uWaves[4];      // xy image space, z start time, w amplitude
varying vec2 vP;
varying float vH, vCoh, vFog;
void main() {
  vec2 p = position.xy;                               // image space
  float h = texture2D(uHeight, p * 0.5 + 0.5).r;
  float coh = coherence(p);
  float free = 1.0 - coh;
  float breath = 0.8 + 0.2 * sin(uTime * 0.37) + uKick * 0.1;
  float z = (h - 0.45) * uAmp * breath;
  for (int i = 0; i < 4; i++) {
    vec4 W = uWaves[i];
    float age = uTime - W.z;
    if (age < 0.0 || age > 4.0) continue;
    float d = distance(p * uHalf, W.xy * uHalf);
    z += W.w * 0.05 * sin(d * 26.0 - age * 9.0) * exp(-age * 1.3) * exp(-d * 1.6) * step(d, age * 0.5 + 0.05);
  }
  // STRATA: the field breaks into terraces that separate in depth
  float lv = floor(h * uLevels) / uLevels;
  z = mix(z, (lv - 0.45) * uAmp * 2.2, sigOn(4.0));
  z *= free * (1.0 - uFall * 0.8);
  vec3 pos = vec3(p * uHalf, z);
  pos.xy += fieldAt(pos.xy);
  pos.y -= uFall * uFall * 0.25;
  // slow yaw, then tilt the terrain away from the viewer
  float yaw = uYaw * free;
  pos.xy = mat2(cos(yaw), sin(yaw), -sin(yaw), cos(yaw)) * pos.xy;
  float t = -uTilt * free;
  pos = vec3(pos.x, pos.y * cos(t) - pos.z * sin(t), pos.y * sin(t) + pos.z * cos(t));
  pos.y -= 0.12 * uTilt * free;
  vP = p; vH = h; vCoh = coh;
  vFog = clamp(1.0 + pos.z * 0.9, 0.0, 1.0);        // far → dimmer
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uLevels, uGrid, uDrift, uReveal, uBass;
varying vec2 vP;
varying float vH, vCoh, vFog;

float isoLine(float k, float width) {
  float d = abs(fract(k + 0.5) - 0.5);
  float fw = fwidth(k);
  return 1.0 - smoothstep(fw * 0.35 * width, fw * 1.15 * width, d);
}

void main() {
  float free = 1.0 - vCoh;
  // contour lines; levels drift slowly (and step on each kick)
  float k = vH * uLevels + uTime * uDrift + uKick * 0.08;
  float line = isoLine(k, 1.0);
  float idx = isoLine(k / 5.0, 1.25) * (1.0 + uBass * 1.5);   // index contours glow with the bass
  // contours appear level by level during the reading (dark → bright)
  float shown = 1.0 - smoothstep(uReveal - 0.02, uReveal + 0.02, vH);
  line *= shown; idx *= shown;
  // wireframe grid
  float gx = isoLine(vP.x * uGrid * 0.5, 0.8), gy = isoLine(vP.y * uGrid * 0.5 * uHalf.y / uHalf.x, 0.8);
  float grid = max(gx, gy) * (0.16 + 0.1 * uEnergy);

  vec3 pc = photo(vP);
  vec3 lc = mix(pc * 1.6 + 0.12, vec3(1.0), 0.3);
  vec3 col = lc * line * 0.7 + mix(vec3(1.0), uAccent, 0.5) * idx * 0.55 + mix(pc, vec3(0.8), 0.5) * grid;
  // sines → a fine shimmer travels along the lines
  col += vec3(1.0) * line * uSine * 0.5 * step(0.9, hash21(floor(vP * 60.0) + floor(uTime * 16.0)));
  // sparks highlight their contour
  col += line * sparks(vP, 12.0, 0.35) * 1.2;
  col *= uMix * free * vFog * (0.75 + uKick * 0.4) * (1.0 - uFall * 0.5);
  if (max(col.r, max(col.g, col.b)) < 0.002) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Topography extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, params, quality } = ctx;
    const w = analysis.width, h = analysis.height;
    const rng = makeRng(analysis.seed ^ 0x7090);
    // a smoother height map than the analysis one (8-bit, linear filtered)
    const H = blur(analysis.maps.L, w, h, 3, 3);
    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = Math.round(H[(h - 1 - y) * w + x] * 255); // flip: texture v=0 is the bottom
      const i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    this.heightTex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    this.heightTex.minFilter = this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.needsUpdate = true;

    const aspect = w / h;
    const segX = quality.mobile ? 110 : 200, segY = Math.round(segX / aspect);
    const geo = new THREE.PlaneGeometry(2, 2, segX, segY);
    this.waves = []; for (let i = 0; i < 4; i++) this.waves.push(new THREE.Vector4(0, 0, -99, 0));
    this.waveIdx = 0;
    // wave origins: the darkest and brightest areas
    const g = analysis.grid, cells = [...g.lum.keys()].sort((a, b) => g.lum[a] - g.lum[b]);
    this.origins = [cells[0], cells[cells.length - 1], cells[Math.floor(cells.length / 2)]].map((i) => toImg(((i % g.cols) + 0.5) / g.cols, (Math.floor(i / g.cols) + 0.5) / g.rows));

    this.mat = this.material({
      vertex: VERT, fragment: FRAG,
      uniforms: {
        uHeight: { value: this.heightTex }, uTilt: { value: 0 }, uAmp: { value: 0.3 }, uYaw: { value: 0 }, uWaves: { value: this.waves },
        uLevels: { value: params.contourLevels }, uReveal: { value: 0 }, uBass: { value: 0 }, uGrid: { value: Math.round(28 + rng() * 30) }, uDrift: { value: (rng() < 0.5 ? -1 : 1) * (0.03 + rng() * 0.05) },
      },
      extensions: { derivatives: true },
    });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.tilt = 0; this.reveal = 0; this.revealGoal = 0;
    this.tiltMax = 0.75 + rng() * 0.35;
  }

  update(s) {
    // the terrain rises out of the picture plane with the tension of the piece
    const strata = s.sigName === 'STRATA' ? s.signature : 0;
    const target = this.tiltMax * (s.si === 0 ? 0.1 : 0.25 + 0.75 * s.tension) + strata * 0.25;
    this.tilt += (target - this.tilt) * Math.min(1, s.dt * 0.35);
    const u = this.mat.uniforms;
    u.uTilt.value = this.tilt;
    u.uAmp.value = 0.3 + 0.32 * s.tension + strata * 0.3;
    // reading: levels appear one per bar; afterwards all are there
    const goal = s.si === 0 ? this.revealGoal : 1.02;
    this.reveal += (goal - this.reveal) * Math.min(1, s.dt * 1.5);
    u.uReveal.value = this.reveal;
    u.uBass.value *= Math.exp(-s.dt * 4);
    u.uYaw.value = Math.sin(s.t * 0.03) * 0.12;
  }

  resetPass() { this.reveal = 0; this.revealGoal = 0; }

  onEvent(ev, time) {
    if (ev.type === 'reveal' && ev.what === 'level') this.revealGoal = Math.min(1.02, 0.12 + (ev.id + 1) * 0.085);
    if (ev.type === 'bass') this.mat.uniforms.uBass.value = Math.min(1, ev.vel);
    if (ev.type === 'kick' && !ev.ghost) {
      const o = this.origins[this.waveIdx % this.origins.length];
      this.waves[this.waveIdx % 4].set(o[0], o[1], time, ev.vel);
      this.waveIdx++;
    }
  }

  dispose() { super.dispose(); this.heightTex.dispose(); }
}
