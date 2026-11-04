// ─────────────────────────────────────────────────────────────
//  visuals/engine.js — "The Transmission": one journey in acts.
//
//  ACT 0 OFFERING       the photo, intact, once (the reading)
//  ACT 1 MEASUREMENT    the terrain (round 4/5) tilts back; the scan line
//                       measures it once; the photo lies underneath the
//                       flowing contour lines, in the map's perspective
//  ACT 2 DECOMPOSITION  the camera pulls back; the terrain flattens onto the
//                       image plane and the image is decomposed into 2–3 of
//                       its spectra — the v1 worlds RASTER, ORBIT,
//                       DISSOLUTION, FLOW, MATRIX, restored (js/spectra/)
//  ACT 3 ENTROPY        one particle field, Brownian with a drift;
//                       structures emerge and vanish; superposition ghosts
//  ACT 4 ABSORPTION     the points fall into the singularity at the focal
//                       point; the camera falls with them
//  END                  the crash (the only full-screen flash), then debris
//  Transitions are morphs (shared geometry) or quantum slicing (the frame
//  cut into displaced bands for a moment). The intact photo never returns.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { makeSharedUniforms, makeMaterial, toImg } from './common.js';
import { makeSharedUniforms as makeSpectraUniforms, makeMaterial as makeSpectraMaterial } from '../spectra/common.js';
import { ForceField } from './field.js';
import { Terrain } from './terrain.js';
import { EdgeFlash } from './edges.js';
import { Raster } from '../spectra/raster.js';
import { Orbit } from '../spectra/orbit.js';
import { Dissolution } from '../spectra/dissolution.js';
import { Flow } from '../spectra/flow.js';
import { MatrixWorld } from '../spectra/matrix.js';
import { Entropy } from '../spectra/entropy.js';
import { heightAt } from '../map.js';

export const SPECTRUM_CLASSES = { RASTER: Raster, ORBIT: Orbit, DISSOLUTION: Dissolution, FLOW: Flow, MATRIX: MatrixWorld };
export const VISUAL_LAYERS = ['TERRAIN', 'CONTOURS', 'WIREFRAME', 'RIDGES', 'SCAN', 'FLARES', 'DEFORM', 'PHOTO', 'REVEAL', 'EDGE FLASH',
  'MATRIX', 'RASTER', 'ORBIT', 'FLOW', 'DISSOLUTION', 'ENTROPY', 'SUPERPOSITION', 'SINGULARITY', 'DEBRIS', 'SLICING', 'LENS', 'DATA STRIP', 'ANNOTATIONS', 'CRASH', 'HAND'];
const TERRAIN_SHOW = { CONTOURS: 'Contours', WIREFRAME: 'Wire', RIDGES: 'Ridges', SCAN: 'Scan', FLARES: 'Flares', PHOTO: 'Under', REVEAL: 'Reveal' };

const FOV = 30;
const CAM_Z = 1 / Math.tan((FOV / 2) * Math.PI / 180);
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the offering: the photo, before the map exists — already on the terrain's surface and pose
const PHOTO_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(mapPos(vP, terrainZ(vP)), 1.0); }`;
const PHOTO_FRAG = /* glsl */`
uniform float uIntro;
varying vec2 vP;
void main() { if (uIntro < 0.01) discard; gl_FragColor = vec4(photo(vP), uIntro); }`;
// the quantum lens: where the cursor observes, a glimpse of the measured photo (fine scanlines, cooled) on the image plane
const LENS_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uHalf, 0.0, 1.0); }`;
const LENS_FRAG = /* glsl */`
varying vec2 vP;
void main() {
  float d = distance(vP * uHalf, uObs.xy);
  float o = uObs.z * (1.0 - smoothstep(uObsR * 0.15, uObsR, d));
  if (o < 0.01 || abs(vP.x) > 1.0 || abs(vP.y) > 1.0) discard;
  vec3 c = photo(vP);
  c = mix(vec3(luma(c)), c, 0.55) * (0.75 + 0.25 * step(0.5, fract(gl_FragCoord.y * 0.5)));
  float ring = (1.0 - smoothstep(0.0, uPx * 1.5, abs(d - uObsR * 0.92))) * uObs.z * 0.25;
  gl_FragColor = vec4((c * o * 0.8 + ring) * uMix, 1.0);
}`;
// full-screen: the crash (full white) and Ikeda bands (thin white rows, a glitch in ENTROPY)
const FLASH_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FLASH_FRAG = /* glsl */`
uniform float uFull, uBands, uSeed;
varying vec2 vUv;
float h(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  float row = floor(vUv.y * 180.0);
  float band = step(0.93, h(row * 1.37 + uSeed * 17.0));
  float a = max(uFull, band * uBands);
  if (a < 0.003) discard;
  gl_FragColor = vec4(1.0, 1.0, 1.0, a);
}`;
// quantum slicing: the rendered frame cut into horizontal bands, displaced against each other
const SLICE_FRAG = /* glsl */`
uniform sampler2D uTex; uniform float uAmt, uSeed;
varying vec2 vUv;
float h(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
void main() {
  float rows = 18.0 + floor(h(uSeed) * 40.0);
  float r = floor(vUv.y * rows), k = h(r * 3.7 + uSeed * 11.0);
  float dx = (k - 0.5) * 0.5 * uAmt * step(0.35, k);
  vec2 uv = vec2(fract(vUv.x + dx), vUv.y);
  vec3 c = texture2D(uTex, uv).rgb;
  float edge = step(fract(vUv.y * rows), 0.035) * step(0.6, k) * uAmt;       // hairlines at the cuts
  float drop = step(0.9, h(r * 1.9 + uSeed)) * uAmt;                           // a few rows drop out
  gl_FragColor = vec4(c * (1.0 - drop) + edge * 0.6, 1.0);
}`;

export class Visuals {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.mobile, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
    this.camera.position.set(0, 0, CAM_Z);
    this.shared = makeSharedUniforms();          // the terrain family (round 4/5)
    this.sshared = makeSpectraUniforms();        // the spectra family (v1 / round 3)
    this.field = new ForceField();
    for (const U of [this.shared, this.sshared]) { U.uField.value = this.field.tex; U.uFieldRect.value = this.field.rect; }
    this.view = { half: new THREE.Vector2(1, 1), bufferHeight: 1, aspect: 1 };
    this.time = 0;
    this.env = { kick: 0, click: 0, sine: 0, noise: 0, data: 0, low: 0 };
    this.beat = 0; this.sparkIdx = 0; this.ripIdx = 0;
    this.obs = { x: undefined, y: undefined, s: 0, target: 0 };
    this.userYaw = 0;
    this.vis = Object.fromEntries(VISUAL_LAYERS.map((n) => [n, { mute: false, solo: false }]));
    this.dprScale = 1; this.slow = 0; this.dtAvg = 1 / 60;
    this.flashMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VERT, fragmentShader: FLASH_FRAG, uniforms: { uFull: { value: 0 }, uBands: { value: 0 }, uSeed: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false });
    const fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flashMat); fq.frustumCulled = false; fq.renderOrder = 20;
    this.scene.add(fq);
    // slicing post pass
    this.rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false });
    this.sliceMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VERT, fragmentShader: SLICE_FRAG, uniforms: { uTex: { value: this.rt.texture }, uAmt: { value: 0 }, uSeed: { value: 0 } }, depthTest: false, depthWrite: false });
    this.postScene = new THREE.Scene(); const pq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.sliceMat); pq.frustumCulled = false; this.postScene.add(pq);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.slice = { t0: -99, dur: 0.6, seed: 0 };
    this.crashFrame = 999; this.bands = { frame: 99, seed: 0 };
    this.layers = {}; this.spectra = {};
    this.resize();
  }

  // ── photo + journey ─────────────────────────────────────────
  setPhoto(analysis, texCanvas) {
    this.clearPhoto();
    this.analysis = analysis;
    this.imgAspect = texCanvas.width / texCanvas.height;
    const tex = this.texture = new THREE.CanvasTexture(texCanvas);
    tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    this.shared.uImage.value = tex; this.sshared.uImage.value = tex;
    this.shared.uForm.value = 0; this.shared.uDecay.value = 0;
    this.obs.s = 0; this.obs.target = 0;
    this.photoMat = makeMaterial(this.shared, { vertex: PHOTO_VERT, fragment: PHOTO_FRAG, uniforms: { uIntro: { value: 0 } }, blending: THREE.NormalBlending });
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 96, 64), this.photoMat);
    this.photo.renderOrder = -1; this.photo.frustumCulled = false;
    this.scene.add(this.photo);
    this.offered = false;                         // once the map exists, the intact photo never returns
    this.crashFrame = 999;
    this.camera.position.set(0, 0, CAM_Z); this.camera.up.set(0, 1, 0); this.camera.lookAt(0, 0, 0); this.camTilt = 0; this.camRoll = 0;
    this.resize();
  }

  /** The analysis is done: build the journey's layers. */
  beginMap(map, st, composer, journey) {
    this.map = map; this.C = composer; this.J = journey;
    const P = map.params;
    this.shared.uAccent.value.setRGB(...journey.accent); this.sshared.uAccent.value.setRGB(...journey.accent);
    this.shared.uAmp.value = P.relief; this.shared.uTilt.value = P.tilt;
    this.sshared.uSpeed.value = journey.params.speed; this.sshared.uForm.value = 1; this.sshared.uCohere.value = 0;
    this.baseYaw = P.yaw;
    const ctx = { shared: this.shared, analysis: this.analysis, map, st, quality: this.quality, view: this.view };
    this.layers = { terrain: new Terrain(ctx), edges: new EdgeFlash(ctx) };
    const sctx = { shared: this.sshared, analysis: this.analysis, params: journey.params, quality: this.quality, camZ: CAM_Z, renderer: this.renderer, focal: map.focal, stepDur: this.stepDur };
    this.spectra = {};
    for (const sg of journey.segs) this.spectra[sg.name] = new SPECTRUM_CLASSES[sg.name](sctx);
    this.spectra.ENTROPY = new Entropy(sctx);
    this.lensMat = makeSpectraMaterial(this.sshared, { vertex: LENS_VERT, fragment: LENS_FRAG });
    this.lens = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.lensMat); this.lens.frustumCulled = false; this.lens.renderOrder = 10; this.scene.add(this.lens);
    for (const l of [...Object.values(this.layers), ...Object.values(this.spectra)]) { l.setMix(0); l.resize(this.view); this.scene.add(l.group); }
    this.applyVisuals();
  }

  clearPhoto() {
    for (const l of [...Object.values(this.layers), ...Object.values(this.spectra)]) { this.scene.remove(l.group); l.dispose(); }
    if (this.lens) { this.scene.remove(this.lens); this.lens.geometry.dispose(); this.lensMat.dispose(); this.lens = null; }
    this.layers = {}; this.spectra = {}; this.map = null; this.C = null;
    if (this.photo) { this.scene.remove(this.photo); this.photo.geometry.dispose(); this.photoMat.dispose(); this.photo = null; }
    if (this.texture) { this.texture.dispose(); this.texture = null; }
    this.camera.position.set(0, 0, CAM_Z); this.camera.up.set(0, 1, 0); this.camera.lookAt(0, 0, 0);
  }

  // ── visual mixer ────────────────────────────────────────────
  setVisual(name, key, on) { this.vis[name][key] = on; this.applyVisuals(); }
  visOn(name) {
    const anySolo = VISUAL_LAYERS.some((n) => this.vis[n].solo);
    const v = this.vis[name];
    if (anySolo) return !v.mute && (v.solo || (TERRAIN_SHOW[name] && this.vis.TERRAIN.solo) || (name === 'TERRAIN' && Object.keys(TERRAIN_SHOW).some((n) => this.vis[n].solo)));
    return !v.mute;
  }
  applyVisuals() {
    const T = this.layers.terrain;
    if (T) { for (const [n, k] of Object.entries(TERRAIN_SHOW)) T.setShow(k, this.visOn(n)); for (const k of ['Core', 'Pixels', 'Waves', 'Interf', 'Memory', 'Ghost', 'Decay']) T.setShow(k, false); }
    if (this.layers.edges) this.layers.edges.on = this.visOn('EDGE FLASH');
    this.shared.uDeformOn.value = this.visOn('DEFORM') ? 1 : 0;
    const E = this.spectra.ENTROPY;
    if (E) { E.showGhost = this.visOn('SUPERPOSITION'); E.showSing = this.visOn('SINGULARITY'); E.showDebris = this.visOn('DEBRIS'); }
  }

  // ── view ────────────────────────────────────────────────────
  resize() {
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, this.quality.mobile ? 1.5 : 2) * this.dprScale);
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    const aspect = W / H;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    const ia = this.imgAspect || 1.5;
    const maxW = aspect * (W < 700 ? 0.88 : 0.64), maxH = W < 700 ? 0.7 : 0.66;
    let hx = maxW, hy = hx / ia;
    if (hy > maxH) { hy = maxH; hx = hy * ia; }
    this.view.half.set(hx, hy);
    this.view.aspect = aspect; this.view.bufferHeight = H * dpr; this.view.cssW = W; this.view.cssH = H;
    for (const U of [this.shared, this.sshared]) { U.uHalf.value.set(hx, hy); U.uView.value.set(aspect, 1); U.uPx.value = 2 / (H * dpr); }
    this.shared.uObsR.value = W < 700 ? 0.4 : 0.3; this.sshared.uObsR.value = W < 700 ? 0.32 : 0.24;
    this.field.setView(aspect);
    this.rt.setSize(Math.floor(W * dpr), Math.floor(H * dpr));
    for (const l of [...Object.values(this.layers), ...Object.values(this.spectra)]) l.resize(this.view);
  }
  adapt(dt) {
    if (!this.photo || dt > 0.25) return;
    this.dtAvg += (dt - this.dtAvg) * 0.05;
    this.slow = this.dtAvg > 1 / 42 ? this.slow + 1 : Math.max(0, this.slow - 2);
    if (this.slow > 120 && this.dprScale > 0.5) { this.dprScale *= 0.8; this.slow = 0; this.dtAvg = 1 / 60; this.resize(); }
  }

  screenToWorld(x, y) { return [(x / this.view.cssW * 2 - 1) * this.view.aspect, -(y / this.view.cssH * 2 - 1)]; }
  screenToImage(x, y) { const [wx, wy] = this.screenToWorld(x, y); return [(wx / this.view.half.x + 1) / 2, (1 - wy / this.view.half.y) / 2]; }
  imageToScreen(x, y) {
    const [ix, iy] = toImg(x, y);
    return [(ix * this.view.half.x / this.view.aspect + 1) / 2 * this.view.cssW, (1 - iy * this.view.half.y) / 2 * this.view.cssH];
  }
  imageRect() { const [x0, y0] = this.imageToScreen(0, 0), [x1, y1] = this.imageToScreen(1, 1); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }

  /** A point of the map (analysis coords) → CSS px, with the same pose as the terrain shaders. */
  project(x, y, lift = 0) {
    const U = this.shared, form = U.uForm.value;
    const [ix, iy] = toImg(x, y);
    const h = this.map ? heightAt(this.map, x, y) : 0;
    const z = ((h - 0.45) * U.uAmp.value * (0.8 + 0.45 * U.uLow.value) * form * (1 - 0.55 * U.uDecay.value)) + lift;
    let px = ix * this.view.half.x, py = iy * this.view.half.y;
    const yaw = U.uYaw.value * form, c = Math.cos(yaw), s = Math.sin(yaw);
    [px, py] = [c * px - s * py, s * px + c * py];
    const t = -U.uTilt.value * form;
    const v = new THREE.Vector3(px, py * Math.cos(t) - z * Math.sin(t) - 0.1 * U.uTilt.value * form, py * Math.sin(t) + z * Math.cos(t));
    v.project(this.camera);
    return [(v.x + 1) / 2 * this.view.cssW, (1 - v.y) / 2 * this.view.cssH, v.z];
  }
  /** Screen point → the point on the image plane (z = 0) under it, through the moving camera. */
  screenToPlane(x, y) {
    const v = new THREE.Vector3(x / this.view.cssW * 2 - 1, -(y / this.view.cssH * 2 - 1), 0.5).unproject(this.camera);
    const o = this.camera.position, d = v.sub(o).normalize();
    if (Math.abs(d.z) < 1e-5) return [0.5, 0.5, 0, 0];
    const k = -o.z / d.z, wx = o.x + d.x * k, wy = o.y + d.y * k;
    return [(wx / this.view.half.x + 1) / 2, (1 - wy / this.view.half.y) / 2, wx, wy];
  }
  /** The map point under a screen point on the posed terrain (act 1). */
  pickMap(x, y) {
    let best = [0.5, 0.5], bd = 1e9;
    const test = (u, v) => { const [px, py, pz] = this.project(u, v); if (pz > 1) return; const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = [u, v]; } };
    for (let j = 0; j <= 16; j++) for (let i = 0; i <= 24; i++) test(i / 24, j / 16);
    for (let r = 0; r < 2; r++) { const [u0, v0] = best, s = r ? 1 / 192 : 1 / 48; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) test(Math.min(1, Math.max(0, u0 + i * s)), Math.min(1, Math.max(0, v0 + j * s))); }
    return { x: best[0], y: best[1], px: Math.sqrt(bd) };
  }
  setUserYaw(rad) { this.userYaw = rad; }

  // ── input: the lens and the force ───────────────────────────
  /** The quantum lens follows the cursor (hover, no click); its strength grows while it rests. */
  observe(x, y, strength) { this.obs.cx = x; this.obs.cy = y; this.obs.target = this.visOn('LENS') ? strength : 0; }
  force(x0, y0, x1, y1, dt) {
    if (!this.visOn('HAND')) return;
    const [a, b] = this.screenToWorld(x0, y0), [c, d] = this.screenToWorld(x1, y1);
    this.field.inject(a, b, c, d, dt, this.view.cssW < 700 ? 0.22 : 0.16);
  }

  // ── sound → light ───────────────────────────────────────────
  trigger(ev) {
    const e = this.env;
    switch (ev.type) {
      case 'kick': e.kick = Math.max(e.kick, ev.vel); this.beat++;
        if (ev.x !== undefined) { const [ix, iy] = toImg(ev.x, ev.y); this.shared.uRip.value[this.ripIdx++ % 6].set(ix, iy, this.time, ev.vel); }
        break;
      case 'pulse': e.sine = Math.max(e.sine, 0.5); e.kick = Math.max(e.kick, 0.3); this.beat++; break;
      case 'sub': case 'tone': case 'pressure': e.sine = Math.max(e.sine, 0.4); break;
      case 'click': case 'scanner': e.click = Math.max(e.click, ev.vel); break;
      case 'noise': e.noise = Math.max(e.noise, Math.min(1, ev.vel * 2.2)); break;
      case 'data': case 'field': e.data = 1; e.noise = Math.max(e.noise, 0.5); e.click = Math.max(e.click, 0.6); this.sshared.uJump.value++; break;
      case 'glitch':
        e.click = 1; e.noise = Math.max(e.noise, 0.8); this.sshared.uJump.value++;
        if (ev.slice && this.visOn('SLICING')) this.slice = { t0: this.time, dur: 0.55, seed: Math.random() * 100 };
        if (ev.bands) this.bands = { frame: 0, seed: Math.random() * 100 };
        break;
      case 'crash': this.crashFrame = this.visOn('CRASH') ? 0 : 999; break;
    }
    if (ev.x !== undefined && ['click', 'glitch', 'noise', 'data', 'field', 'scanner'].includes(ev.type)) {
      const kind = { noise: 3, data: 4, field: 4 }[ev.type] || 1, [ix, iy] = toImg(ev.x, ev.y);
      this.sshared.uSparks.value[this.sparkIdx].set(ix, iy, this.time, kind); this.sparkIdx = (this.sparkIdx + 1) % 8;
    }
    const hAt = (x, y) => (this.map ? heightAt(this.map, x, y) : 0.5);
    const stepDur = this.stepDur || 0.13;
    for (const k in this.layers) if (this.layers[k].on) this.layers[k].onEvent(ev, this.time, hAt, stepDur);
    // the spectra hear the irregular pulses as their "kicks"
    const sev = ev.type === 'pulse' ? { ...ev, type: 'kick', vel: 0.5 } : ev;
    for (const k in this.spectra) this.spectra[k].onEvent?.(sev, this.time);
  }

  /** One frame. f = { dt, playing, intro, low, state: { act, lb, scan, energy, form, fade, stepF } | null } */
  frame(f) {
    const dt = Math.min(0.1, f.dt);
    this.adapt(f.dt);
    this.time += dt * (f.playing ? 1 : 0.15);
    const U = this.shared, S = this.sshared, e = this.env, st = f.state;
    e.kick *= Math.exp(-dt * 6); e.click *= Math.exp(-dt * 20); e.sine *= Math.exp(-dt * 5); e.noise *= Math.exp(-dt * 9); e.data *= Math.exp(-dt * 10);
    e.low += ((f.low || 0) - e.low) * Math.min(1, dt * 10);
    U.uTime.value = this.time; S.uTime.value = this.time;
    U.uKick.value = e.kick; U.uClick.value = e.click; U.uNoise.value = e.noise; U.uData.value = e.data; U.uLow.value = e.low;
    S.uKick.value = e.kick; S.uClick.value = e.click; S.uSine.value = e.sine; S.uNoise.value = e.noise; S.uBeat.value = this.beat;
    this.field.step(dt);
    // the lens: a resting cursor collapses the state around it (the plane point under it, through the camera)
    const o = this.obs;
    if (o.cx !== undefined) {
      o.s += (o.target - o.s) * Math.min(1, dt * (o.target > o.s ? 2.5 : 1.5));
      const [, , wx, wy] = this.screenToPlane(o.cx, o.cy);
      o.x = o.x === undefined ? wx : o.x + (wx - o.x) * Math.min(1, dt * 12); o.y = o.y === undefined ? wy : o.y + (wy - o.y) * Math.min(1, dt * 12);
      S.uObs.value.set(o.x, o.y, o.s);
      if (this.map && st && st.act === 'MEASUREMENT' && o.s > 0.01) { const m = this.pickMap(o.cx, o.cy); const [ix, iy] = toImg(m.x, m.y); U.uObs.value.set(ix * this.view.half.x, iy * this.view.half.y, m.px < 60 ? o.s * 0.8 : 0); }
      else U.uObs.value.set(0, 0, 0);
    }
    // the offering: the photo plane exists only until the map takes over — never again
    const tm = this.layers.terrain ? this.layers.terrain.mix : 0;
    if (tm > 0.97 || (st && st.lb > 1)) this.offered = true;
    if (this.photoMat) this.photoMat.uniforms.uIntro.value = this.offered ? 0 : f.intro * (1 - tm);
    // the crash: the only full-screen flash; Ikeda bands on some ENTROPY glitches
    const cf = this.crashFrame++;
    const CRASH = [1, 1, 1, 1, 0.9, 0, 0.8, 0.6, 0, 0.45, 0.3, 0.2, 0.12, 0.06];
    const bn = this.bands.frame++;
    this.flashMat.uniforms.uFull.value = cf < CRASH.length ? CRASH[cf] : 0;
    this.flashMat.uniforms.uBands.value = bn < 2 ? 0.85 : 0; this.flashMat.uniforms.uSeed.value = this.bands.seed + bn;

    if (st && this.map && this.C) this.conduct(st, dt);
    // slicing transition: render to a target, cut it into displaced bands
    const sl = (this.time - this.slice.t0) / this.slice.dur;
    if (sl >= 0 && sl < 1) {
      this.sliceMat.uniforms.uAmt.value = Math.sin(sl * Math.PI) * (sl < 0.15 ? 1.3 : 1);
      this.sliceMat.uniforms.uSeed.value = this.slice.seed + Math.floor(sl * 7);
      this.renderer.setRenderTarget(this.rt); this.renderer.render(this.scene, this.camera);
      this.renderer.setRenderTarget(null); this.renderer.render(this.postScene, this.postCam);
    } else this.renderer.render(this.scene, this.camera);
  }

  /** The acts: who is visible, where the camera is. */
  conduct(st, dt) {
    const C = this.C, J = this.J, lb = st.lb, U = this.shared, fade = st.fade ?? 1;
    const D = C.D, E = C.E, Ab = C.Ab, end = C.endBar;
    // terrain: act 1 only; it flattens back onto the image plane as the camera pulls back
    const T = this.layers.terrain;
    const tTarget = (1 - ss(D.start - 0.2, D.start + 1.6, lb)) * (this.visOn('TERRAIN') ? 1 : 0);
    T.setMix(T.mix + (tTarget - T.mix) * Math.min(1, dt * 2.5));
    const formT = st.form * (1 - ss(D.start - 0.6, D.start + 1.4, lb));
    U.uForm.value += (formT - U.uForm.value) * Math.min(1, dt * 1.5);
    if (Math.abs(formT - U.uForm.value) < 0.015) U.uForm.value = formT;
    U.uEnergy.value = st.energy; U.uDecay.value = 0;
    U.uYaw.value = this.baseYaw + this.userYaw + Math.sin(this.time * 0.02) * 0.04;
    const s = { ...st, section: lb < D.start ? 'READING' : 'LIFE', dt, t: this.time, kick: this.env.kick, click: this.env.click, noise: this.env.noise, low: this.env.low };
    if (T.mix > 0.002) T.update(s);
    const Ed = this.layers.edges; Ed.setMix(T.mix * (Ed.on ? 1 : 0)); if (Ed.mix > 0) Ed.update(s);

    // the spectra: each in its window, overlapping briefly with the next
    const S = this.sshared;
    S.uEnergy.value = st.energy; S.uBreak.value = 0; S.uStep.value = st.stepF || 0;
    C.spectra.forEach((sp, i) => {
      const w = this.spectra[sp.name], last = i === C.spectra.length - 1, endB = last ? E.start : C.spectra[i + 1].start;
      const target = ss(sp.start - 0.3, sp.start + 1.4, lb) * (1 - ss(endB - 0.4, endB + (last ? 2.0 : 1.0), lb)) * (this.visOn(sp.name) ? 1 : 0) * fade;
      w.setMix(w.mix + (target - w.mix) * Math.min(1, dt * 3));
      if (w.mix > 0.002) w.update({ dt, t: this.time, energy: st.energy, brk: 0, form: 1, kick: this.env.kick, click: this.env.click, sine: this.env.sine, noise: this.env.noise, beat: this.beat, view: this.view, stepF: st.stepF });
    });
    // the lens shows its glimpse only off the terrain (act 1 has its own reveal) and never after the entropy
    if (this.lensMat) this.lensMat.uniforms.uMix.value = this.visOn('LENS') ? ss(D.start, D.start + 1.5, lb) * (1 - ss(Ab.start - 1, Ab.start, lb)) : 0;
    // entropy → absorption → debris
    const En = this.spectra.ENTROPY;
    const debris = ss(end + 0.05, end + 0.4, lb);
    const eTarget = ss(E.start - 0.4, E.start + 1.6, lb) * (this.visOn('ENTROPY') ? 1 : 0) * (debris > 0 ? (this.visOn('DEBRIS') ? 1 : 0) : 1) * (st.fadeDebris ?? 1);
    En.setMix(En.mix + (eTarget - En.mix) * Math.min(1, dt * (debris > 0 ? 30 : 2.5)));
    const eP = (lb - E.start) / E.bars;
    // structures emerge and vanish: a few seeded moments of order inside ENTROPY
    const order = eP > 0 && eP < 1 ? Math.max(0, Math.sin(eP * Math.PI * (3 + (J.params.variant * 2 | 0)))) ** 6 * 0.85 : 0;
    if (En.mix > 0.002) En.update({ t: this.time, ent: ss(E.start - 0.5, E.start + 3, lb) * (0.6 + 0.4 * ss(0, 1, eP)), driftAmt: ss(E.start, Ab.start, lb), order, pull: ss(Ab.start, end, lb), debris });

    // the camera: still for act 1, pulled back for the spectra (each with its own angle), falling into the singularity
    const cam = this.camera, J2 = J.cam;
    const pull = ss(D.start - 0.5, D.start + 2.5, lb);
    const sp = C.spectrumAt(lb), si = sp ? sp.index : C.spectra.length - 1;
    const tilt = lb < D.start ? 0 : lb < E.start ? J2.tilt[si] : J2.tilt[si] * (1 - ss(E.start, E.start + 3, lb));
    const roll = lb < D.start ? 0 : lb < E.start ? J2.roll[si] : 0;
    const fall = ss(Ab.start, end + 0.2, lb);
    const [fx, fy] = toImg(this.map.focal.x, this.map.focal.y);
    const z = CAM_Z * (1 + (J2.pull - 1) * pull) * (1 - (1 - J2.dolly) * fall);
    const k = Math.min(1, dt * 1.2);
    this.camTilt += (tilt - this.camTilt) * k; this.camRoll += (roll - this.camRoll) * k;
    // the camera orbits the image (or the singularity) and always looks at it
    const tx = fx * this.view.half.x * fall * 0.85, ty = fy * this.view.half.y * fall * 0.85;
    const az = lb > E.start ? J2.drift * ss(E.start, Ab.start, lb) * 4 : 0, el = this.camTilt;
    cam.position.set(tx + z * Math.sin(az) * Math.cos(el), ty - z * Math.sin(el), z * Math.cos(az) * Math.cos(el));
    const r = this.camRoll + (lb > E.start ? 0.02 * Math.sin(this.time * 0.07) : 0);
    cam.up.set(Math.sin(r), Math.cos(r), 0);
    cam.lookAt(tx, ty, 0);
  }
}
