// ─────────────────────────────────────────────────────────────
//  visuals/engine.js — renderer and orchestration of the sound map.
//
//  One visual language: the terrain (terrain.js) with light add-ons —
//  edge flashes, the focal orbit, the crumbling border, rare quantum
//  slicing. Every sound event is dispatched to the layers with its
//  position (and the height of the map there), so it has a visible
//  consequence at a specific place. The only full-screen flash is the
//  crash at the very end. Each layer can be switched off in the mixer.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { makeSharedUniforms, makeMaterial, toImg } from './common.js';
import { ForceField } from './field.js';
import { Terrain } from './terrain.js';
import { EdgeFlash } from './edges.js';
import { Orbit } from './orbit.js';
import { Crumble } from './crumble.js';
import { Slicing } from './slicing.js';
import { heightAt } from '../map.js';

export const VISUAL_LAYERS = ['TERRAIN', 'CONTOURS', 'WIREFRAME', 'RIDGES', 'SCAN', 'FLARES', 'DEFORM', 'DECAY', 'EDGE FLASH', 'ORBIT', 'CRUMBLE', 'SLICING', 'ANNOTATIONS', 'CRASH', 'HAND'];
const TERRAIN_SHOW = { CONTOURS: 'Contours', WIREFRAME: 'Wire', RIDGES: 'Ridges', SCAN: 'Scan', FLARES: 'Flares', DECAY: 'Decay' };
const LAYER_OBJ = { TERRAIN: 'terrain', 'EDGE FLASH': 'edges', ORBIT: 'orbit', CRUMBLE: 'crumble', SLICING: 'slicing' };

const FOV = 30;
const CAM_Z = 1 / Math.tan((FOV / 2) * Math.PI / 180);

const PHOTO_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uHalf, 0.0, 1.0); }`;
const PHOTO_FRAG = /* glsl */`
uniform float uIntro;
varying vec2 vP;
void main() { float a = uIntro * (1.0 - uForm); if (a < 0.006) discard; gl_FragColor = vec4(photo(vP), a); }`;
const FLASH_VERT = /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FLASH_FRAG = /* glsl */`uniform float uFull; void main() { if (uFull < 0.003) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, uFull); }`;

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
    this.shared = makeSharedUniforms();
    this.field = new ForceField();
    this.shared.uField.value = this.field.tex;
    this.shared.uFieldRect.value = this.field.rect;
    this.view = { half: new THREE.Vector2(1, 1), bufferHeight: 1, aspect: 1 };
    this.time = 0;
    this.env = { kick: 0, click: 0, noise: 0, data: 0, low: 0 };
    this.ripIdx = 0;
    this.obs = { x: 0, y: 0, s: 0, target: 0 };
    this.userYaw = 0;
    this.vis = Object.fromEntries(VISUAL_LAYERS.map((n) => [n, { mute: false, solo: false }]));
    this.dprScale = 1; this.slow = 0; this.dtAvg = 1 / 60;
    this.flashMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VERT, fragmentShader: FLASH_FRAG, uniforms: { uFull: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false });
    const fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flashMat); fq.frustumCulled = false; fq.renderOrder = 20;
    this.scene.add(fq);
    this.crashFrame = 999;
    this.layers = {};
    this.resize();
  }

  // ── photo + map ─────────────────────────────────────────────
  setPhoto(analysis, texCanvas) {
    this.clearPhoto();
    this.analysis = analysis;
    this.imgAspect = texCanvas.width / texCanvas.height;
    const tex = this.texture = new THREE.CanvasTexture(texCanvas);
    tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    this.shared.uImage.value = tex;
    this.shared.uForm.value = 0; this.shared.uDecay.value = 0;
    this.obs.s = 0; this.obs.target = 0;
    this.photoMat = makeMaterial(this.shared, { vertex: PHOTO_VERT, fragment: PHOTO_FRAG, uniforms: { uIntro: { value: 0 } }, blending: THREE.NormalBlending });
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.photoMat);
    this.photo.renderOrder = -1; this.photo.frustumCulled = false;
    this.scene.add(this.photo);
    this.crashFrame = 999;
    this.resize();
  }

  /** The analysis is done: build the sound map's layers. */
  beginMap(map, st) {
    this.map = map;
    const P = map.params;
    this.shared.uAccent.value.setRGB(...P.accent);
    this.shared.uAmp.value = P.relief; this.shared.uTilt.value = P.tilt;
    this.baseYaw = P.yaw;
    const ctx = { shared: this.shared, analysis: this.analysis, map, st, quality: this.quality, view: this.view };
    this.layers = { terrain: new Terrain(ctx), edges: new EdgeFlash(ctx), orbit: new Orbit(ctx), crumble: new Crumble(ctx), slicing: new Slicing(ctx) };
    for (const k in this.layers) { const l = this.layers[k]; l.setMix(0); l.resize(this.view); this.scene.add(l.group); }
    this.applyVisuals();
  }

  clearPhoto() {
    for (const k in this.layers) { this.scene.remove(this.layers[k].group); this.layers[k].dispose(); }
    this.layers = {}; this.map = null;
    if (this.photo) { this.scene.remove(this.photo); this.photo.geometry.dispose(); this.photoMat.dispose(); this.photo = null; }
    if (this.texture) { this.texture.dispose(); this.texture = null; }
  }

  // ── visual mixer ────────────────────────────────────────────
  setVisual(name, key, on) { this.vis[name][key] = on; this.applyVisuals(); }
  visOn(name) {
    const anySolo = VISUAL_LAYERS.some((n) => this.vis[n].solo);
    const v = this.vis[name];
    // terrain sub-features count as soloed when TERRAIN is soloed (and vice versa)
    if (anySolo) return !v.mute && (v.solo || (TERRAIN_SHOW[name] && this.vis.TERRAIN.solo) || (name === 'TERRAIN' && Object.keys(TERRAIN_SHOW).some((n) => this.vis[n].solo)));
    return !v.mute;
  }
  applyVisuals() {
    const T = this.layers.terrain;
    if (T) for (const [n, k] of Object.entries(TERRAIN_SHOW)) T.setShow(k, this.visOn(n));
    for (const [n, k] of Object.entries(LAYER_OBJ)) if (this.layers[k]) this.layers[k].on = this.visOn(n);
    this.shared.uDeformOn.value = this.visOn('DEFORM') ? 1 : 0;
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
    this.shared.uHalf.value.set(hx, hy); this.shared.uView.value.set(aspect, 1);
    this.shared.uPx.value = 2 / (H * dpr);
    this.shared.uObsR.value = W < 700 ? 0.4 : 0.3;
    this.field.setView(aspect);
    for (const k in this.layers) this.layers[k].resize(this.view);
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

  /** A point of the map (analysis coords) → CSS px, with the same pose as the shaders. */
  project(x, y, lift = 0) {
    const U = this.shared, form = U.uForm.value;
    const [ix, iy] = toImg(x, y);
    const h = this.map ? heightAt(this.map, x, y) : 0;
    const z = ((h - 0.45) * U.uAmp.value * (0.8 + 0.45 * U.uLow.value) * form) + lift;
    let px = ix * this.view.half.x, py = iy * this.view.half.y;
    const yaw = U.uYaw.value * form, c = Math.cos(yaw), s = Math.sin(yaw);
    [px, py] = [c * px - s * py, s * px + c * py];
    const t = -U.uTilt.value * form;
    const v = new THREE.Vector3(px, py * Math.cos(t) - z * Math.sin(t) - 0.1 * U.uTilt.value * form, py * Math.sin(t) + z * Math.cos(t));
    v.project(this.camera);
    return [(v.x + 1) / 2 * this.view.cssW, (1 - v.y) / 2 * this.view.cssH, v.z];
  }

  setUserYaw(rad) { this.userYaw = rad; }

  // ── input ───────────────────────────────────────────────────
  observe(x, y, active) {
    const [wx, wy] = this.screenToWorld(x, y);
    this.obs.x = wx; this.obs.y = wy; this.obs.target = active ? 1 : 0;
    if (!this.obs.init) { this.obs.sx = wx; this.obs.sy = wy; this.obs.init = true; }
  }
  force(x0, y0, x1, y1, dt) {
    if (!this.visOn('HAND')) return;
    const [a, b] = this.screenToWorld(x0, y0), [c, d] = this.screenToWorld(x1, y1);
    this.field.inject(a, b, c, d, dt, this.view.cssW < 700 ? 0.22 : 0.16);
  }

  // ── sound → light ───────────────────────────────────────────
  trigger(ev) {
    const e = this.env;
    switch (ev.type) {
      case 'kick':
        e.kick = Math.max(e.kick, ev.vel);
        if (ev.x !== undefined) { const [ix, iy] = toImg(ev.x, ev.y); this.shared.uRip.value[this.ripIdx++ % 6].set(ix, iy, this.time, ev.vel); }
        break;
      case 'click': e.click = Math.max(e.click, ev.vel); break;
      case 'glitch': e.click = 1; e.noise = Math.max(e.noise, 0.7); break;
      case 'noise': e.noise = Math.max(e.noise, Math.min(1, ev.vel * 2.5)); break;
      case 'data': case 'transmission': e.data = 1; break;
      case 'crash': this.crashFrame = this.visOn('CRASH') ? 0 : 999; break;
    }
    const hAt = (x, y) => (this.map ? heightAt(this.map, x, y) : 0.5);
    const stepDur = this.stepDur || 0.13;
    for (const k in this.layers) if (this.layers[k].on) this.layers[k].onEvent(ev, this.time, hAt, stepDur);
  }

  /** One frame. f = { dt, playing, intro, low, state: { section, energy, scan, decay, form } | null } */
  frame(f) {
    const dt = Math.min(0.1, f.dt);
    this.adapt(f.dt);
    this.time += dt * (f.playing ? 1 : 0.15);
    const U = this.shared, e = this.env, st = f.state;
    e.kick *= Math.exp(-dt * 6); e.click *= Math.exp(-dt * 18); e.noise *= Math.exp(-dt * 8); e.data *= Math.exp(-dt * 10);
    e.low += ((f.low || 0) - e.low) * Math.min(1, dt * 10);
    U.uTime.value = this.time;
    U.uKick.value = e.kick; U.uClick.value = e.click; U.uNoise.value = e.noise; U.uData.value = e.data; U.uLow.value = e.low;
    this.field.step(dt);
    const o = this.obs;
    if (o.init) {
      o.sx += (o.x - o.sx) * Math.min(1, dt * 14); o.sy += (o.y - o.sy) * Math.min(1, dt * 14);
      o.s += (o.target - o.s) * Math.min(1, dt * (o.target > o.s ? 6 : 1.8));
      U.uObs.value.set(o.sx, o.sy, o.s);
    }
    if (this.photoMat) this.photoMat.uniforms.uIntro.value = f.intro;
    // the crash: the only full-screen flash — a few white frames, then black
    const cf = this.crashFrame++;
    const CRASH = [1, 1, 1, 1, 0.9, 0, 0.8, 0.6, 0, 0.45, 0.3, 0.2, 0.12, 0.06];
    this.flashMat.uniforms.uFull.value = cf < CRASH.length ? CRASH[cf] : 0;

    if (st && this.map) {
      U.uForm.value += (st.form - U.uForm.value) * Math.min(1, dt * 1.5);
      if (Math.abs(st.form - U.uForm.value) < 0.003) U.uForm.value = st.form;
      U.uEnergy.value = st.energy; U.uDecay.value = this.visOn('DECAY') ? st.decay : 0;
      U.uYaw.value = this.baseYaw + this.userYaw + Math.sin(this.time * 0.02) * 0.04;
      const s = { ...st, dt, t: this.time, kick: e.kick, click: e.click, noise: e.noise, low: e.low };
      const fade = st.fade ?? 1;
      for (const k in this.layers) {
        const l = this.layers[k];
        const target = (k === 'terrain' ? 1 : k === 'orbit' ? (st.section === 'MAPPING' ? 0.4 : 1) : 1) * fade;
        l.setMix(l.mix + (target - l.mix) * Math.min(1, dt * 2));
        if (l.mix > 0) l.update(s);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
