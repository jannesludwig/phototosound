// ─────────────────────────────────────────────────────────────
//  visuals/engine.js — three.js renderer, the photo plane (what the
//  observer collapses back to), and the blend of primary/secondary
//  worlds. Audio events arrive as envelopes + sparks.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { makeSharedUniforms, makeMaterial, toImg } from './common.js';
import { Dissolution } from './dissolution.js';
import { Raster } from './raster.js';
import { Orbit } from './orbit.js';
import { Topography } from './topography.js';
import { Flow } from './flow.js';
import { MatrixWorld } from './matrix.js';

const WORLD_CLASSES = { DISSOLUTION: Dissolution, RASTER: Raster, ORBIT: Orbit, TOPOGRAPHY: Topography, FLOW: Flow, MATRIX: MatrixWorld };

const FOV = 30;
const CAM_Z = 1 / Math.tan((FOV / 2) * Math.PI / 180); // z=0 plane spans y ∈ [-1, 1]

const PHOTO_VERT = /* glsl */`
varying vec2 vP;
void main() {
  vP = position.xy;                        // plane is 2×2 → image space
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uHalf, 0.0, 1.0);
}`;
const PHOTO_FRAG = /* glsl */`
uniform float uIntro;  // fade-in of the photo when it first appears
varying vec2 vP;
void main() {
  float c = coherence(vP) * uIntro;
  vec3 col = photo(vP);
  // the observed area is very slightly over-exposed at its rim
  float rim = c * (1.0 - c) * 0.5;
  gl_FragColor = vec4(col + rim * 0.25, c);
}`;

export class Visuals {
  constructor(canvas, quality) {
    this.canvas = canvas;
    this.quality = quality;
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.mobile, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // colours pass through untouched
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 20);
    this.camera.position.set(0, 0, CAM_Z);
    this.shared = makeSharedUniforms();
    this.worlds = {};
    this.mix = { primary: 0, secondary: 0 };
    this.view = { half: new THREE.Vector2(1, 1), bufferHeight: 1, aspect: 1 };
    this.time = 0;
    this.env = { kick: 0, click: 0, sine: 0, noise: 0 };
    this.sparkIdx = 0;
    this.beat = 0;
    this.obs = { x: 0, y: 0, s: 0, target: 0 };
    this.dprScale = 1;           // lowered automatically if frames are slow
    this.slow = 0; this.dtAvg = 1 / 60;
    this.resize();
  }

  /** New photograph (shown sharp while it is read). `texCanvas` is a ≤2048px canvas of the photo. */
  setPhoto(analysis, texCanvas) {
    this.clearPhoto();
    this.analysis = analysis;
    this.imgAspect = texCanvas.width / texCanvas.height;
    const tex = this.texture = new THREE.CanvasTexture(texCanvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    this.shared.uImage.value = tex;
    this.shared.uForm.value = 0; this.shared.uCohere.value = 0;
    this.obs.s = 0; this.obs.target = 0;

    this.photoMat = makeMaterial(this.shared, { vertex: PHOTO_VERT, fragment: PHOTO_FRAG, uniforms: { uIntro: { value: 0 } }, blending: THREE.NormalBlending });
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.photoMat);
    this.photo.renderOrder = -1;
    this.photo.frustumCulled = false;
    this.scene.add(this.photo);
    this.resize();
  }

  /** After reading: build the worlds this photograph chose. */
  beginWorlds(params, choice) {
    this.params = params;
    this.shared.uAccent.value.setRGB(...params.accent);
    this.shared.uSpeed.value = params.speed;
    this.setWorlds(choice.primary, choice.secondary, choice.accent);
  }

  clearPhoto() {
    for (const k in this.worlds) { this.scene.remove(this.worlds[k].group); this.worlds[k].dispose(); }
    this.worlds = {};
    if (this.photo) { this.scene.remove(this.photo); this.photo.geometry.dispose(); this.photoMat.dispose(); this.photo = null; }
    if (this.texture) { this.texture.dispose(); this.texture = null; }
  }

  /** Instantiate worlds lazily; keep at most the two in use (+ the outgoing one while it fades). */
  ensureWorld(name) {
    if (!this.worlds[name]) {
      const ctx = { shared: this.shared, analysis: this.analysis, params: this.params, quality: this.quality, camZ: CAM_Z, renderer: this.renderer };
      const w = new WORLD_CLASSES[name](ctx);
      w.name = name;
      w.setMix(0);
      w.resize(this.view);
      this.worlds[name] = w;
      this.scene.add(w.group);
    }
    return this.worlds[name];
  }

  setWorlds(primary, secondary, accent) {
    this.primary = primary; this.secondary = secondary; this.accent = accent;
    this.ensureWorld(primary); this.ensureWorld(secondary);
    // drop worlds that are neither (after they have faded — handled in frame())
  }

  resize() {
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, this.quality.mobile ? 1.5 : 2) * this.dprScale);
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    const aspect = W / H;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    // fit the image inside the view with a generous black margin
    const ia = this.imgAspect || 1.5;
    const maxW = aspect * (W < 700 ? 0.92 : 0.74), maxH = W < 700 ? 0.78 : 0.74;
    let hx = maxW, hy = hx / ia;
    if (hy > maxH) { hy = maxH; hx = hy * ia; }
    this.view.half.set(hx, hy);
    this.view.aspect = aspect;
    this.view.bufferHeight = H * dpr;
    this.view.cssW = W; this.view.cssH = H;
    this.shared.uHalf.value.set(hx, hy);
    this.shared.uView.value.set(aspect, 1);
    this.shared.uPx.value = 2 / (H * dpr);
    this.shared.uObsR.value = W < 700 ? 0.42 : 0.32;
    for (const k in this.worlds) this.worlds[k].resize(this.view);
  }

  /** Keep ~60 fps: if frames stay slow for ~2 s, render at a lower resolution. */
  adapt(dt) {
    if (!this.photo || dt > 0.25) return;                // ignore tab switches
    this.dtAvg += (dt - this.dtAvg) * 0.05;
    this.slow = this.dtAvg > 1 / 42 ? this.slow + 1 : Math.max(0, this.slow - 2);
    if (this.slow > 120 && this.dprScale > 0.5) {
      this.dprScale *= 0.8; this.slow = 0; this.dtAvg = 1 / 60;
      this.resize();
    }
  }

  /** CSS pixel → world coords on the z=0 plane. */
  screenToWorld(x, y) {
    return [(x / this.view.cssW * 2 - 1) * this.view.aspect, -(y / this.view.cssH * 2 - 1)];
  }
  /** Image analysis coords (0..1, y down) → CSS pixels. */
  imageToScreen(x, y) {
    const [ix, iy] = toImg(x, y);
    const wx = ix * this.view.half.x, wy = iy * this.view.half.y;
    return [(wx / this.view.aspect + 1) / 2 * this.view.cssW, (1 - wy) / 2 * this.view.cssH];
  }
  /** Image rect in CSS px. */
  imageRect() {
    const [x0, y0] = this.imageToScreen(0, 0), [x1, y1] = this.imageToScreen(1, 1);
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  /** Observer input: active=true while pointer moves/touches. */
  observe(x, y, active) {
    const [wx, wy] = this.screenToWorld(x, y);
    this.obs.x = wx; this.obs.y = wy; this.obs.target = active ? 1 : 0;
    if (!this.obs.init) { this.obs.sx = wx; this.obs.sy = wy; this.obs.init = true; }
  }

  /** Audio event → envelopes + a spark at its source pixel. */
  trigger(ev) {
    const e = this.env;
    switch (ev.type) {
      case 'kick': e.kick = Math.max(e.kick, ev.vel); if (!ev.ghost) this.beat++; break;
      case 'click': e.click = Math.max(e.click, ev.vel); break;
      case 'sine': e.sine = Math.max(e.sine, Math.min(1, ev.vel * 8)); break;
      case 'noise': e.noise = Math.max(e.noise, Math.min(1, ev.vel * 2.2)); break;
      case 'stutter': e.noise = Math.max(e.noise, 0.6); e.click = Math.max(e.click, 0.7); break;
    }
    if (ev.x !== undefined && ev.type !== 'sub' && ev.type !== 'kick') {
      const kind = { click: 1, sine: 2, noise: 3, stutter: 4 }[ev.type] || 1;
      const [ix, iy] = toImg(ev.x, ev.y);
      this.shared.uSparks.value[this.sparkIdx].set(ix, iy, this.time, kind);
      this.sparkIdx = (this.sparkIdx + 1) % 8;
    }
    for (const k in this.worlds) this.worlds[k].onEvent?.(ev, this.time);
  }

  /**
   * One frame. s = { dt, playing, form, cohere, energy, brk, stepF, beatPhase, intro }
   */
  frame(s) {
    const dt = Math.min(0.1, s.dt);
    this.adapt(s.dt);
    this.time += dt * (s.playing ? 1 : 0.15);
    const U = this.shared, e = this.env;
    // envelopes: fast attack (on trigger), exponential release
    e.kick *= Math.exp(-dt * 7); e.click *= Math.exp(-dt * 22); e.sine *= Math.exp(-dt * 5); e.noise *= Math.exp(-dt * 9);
    U.uTime.value = this.time;
    U.uKick.value = e.kick; U.uClick.value = e.click; U.uSine.value = e.sine; U.uNoise.value = e.noise;
    U.uBeat.value = this.beat; U.uStep.value = s.stepF || 0;
    U.uEnergy.value = s.energy; U.uBreak.value = s.brk;
    U.uForm.value = s.form; U.uCohere.value = s.cohere;

    // observer: smooth position + strength (collapses fast, dissolves slowly)
    const o = this.obs;
    if (o.init) {
      o.sx += (o.x - o.sx) * Math.min(1, dt * 14); o.sy += (o.y - o.sy) * Math.min(1, dt * 14);
      o.s += (o.target - o.s) * Math.min(1, dt * (o.target > o.s ? 7 : 1.6));
      U.uObs.value.set(o.sx, o.sy, o.s);
    }
    if (this.photoMat) this.photoMat.uniforms.uIntro.value = s.intro;

    // world mix: primary ↔ secondary, the breakdown leans into the secondary
    const accent = this.accent ?? 0.3;
    // the accent world is a trace in normal sections and takes over in the breakdown
    // one hand: the primary world alone; the accent world only while the piece falls away
    const fade = 1 - (s.fade || 0);
    const mp = (1 - s.brk * 0.7) * fade, ms = s.brk * 0.85 * fade;
    for (const k in this.worlds) {
      const w = this.worlds[k];
      const target = k === this.primary ? mp : k === this.secondary ? ms : 0;
      const m = w.mix + (target - w.mix) * Math.min(1, dt * 2.5);
      w.setMix(m < 0.002 && target === 0 ? 0 : m);
      if (w.mix > 0) w.update({ ...s, dt, t: this.time, kick: e.kick, click: e.click, sine: e.sine, noise: e.noise, beat: this.beat, view: this.view });
      else if (target === 0 && k !== this.primary && k !== this.secondary) {   // fully faded and unused → free it
        this.scene.remove(w.group); w.dispose(); delete this.worlds[k];
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
