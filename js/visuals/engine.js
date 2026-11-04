// ─────────────────────────────────────────────────────────────
//  visuals/engine.js — renderer + orchestration of the layers.
//
//  The score decides which layers exist (the photo's vocabulary for
//  this pass) and how present each one is (section, tension,
//  signature, fall). Every score event is dispatched to the layers
//  as it is heard, so each sound has its visual action. The cursor's
//  force field and the "hold" reveal are applied to all layers.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { makeSharedUniforms, makeMaterial, toImg } from './common.js';
import { ForceField } from './field.js';
import { Contours } from './contours.js';
import { Constellation } from './constellation.js';
import { Fragments } from './fragments.js';
import { Sort } from './sort.js';
import { Barcode } from './barcode.js';
import { Glitch } from './glitch.js';
import { Particles } from './particles.js';
import { Topography } from './topography.js';
import { Flow } from './flow.js';
import { MatrixWorld } from './matrix.js';
import { Orbit } from './orbit.js';

export const LAYER_CLASSES = {
  contours: Contours, constellation: Constellation, glitch: Glitch,
  topography: Topography, orbit: Orbit, fragments: Fragments, sort: Sort, barcode: Barcode,
  particles: Particles, flow: Flow, matrix: MatrixWorld,
};
const SIG_KIND = { RECONSTRUCT: 0, GRID: 1, NETWORK: 2, SWEEP: 3, STRATA: 4 };
const SIG_LAYER = { STRATA: 'topography', GRID: 'matrix', SWEEP: 'sort', RECONSTRUCT: 'fragments', NETWORK: 'constellation' };

const FOV = 30;
const CAM_Z = 1 / Math.tan((FOV / 2) * Math.PI / 180);

const PHOTO_VERT = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy * uHalf, 0.0, 1.0); }`;
const PHOTO_FRAG = /* glsl */`
uniform float uIntro, uGhost;
varying vec2 vP;
void main() {
  float c = max(uGhost, coherence(vP)) * uIntro;
  gl_FragColor = vec4(photo(vP), c);
}`;
const FLASH_FRAG = /* glsl */`
uniform float uFlash;
void main() { gl_FragColor = vec4(vec3(1.0), uFlash); }`;
const FLASH_VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

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
    this.shared.uForm.value = 1;
    this.layers = {};
    this.view = { half: new THREE.Vector2(1, 1), bufferHeight: 1, aspect: 1 };
    this.time = 0;
    this.env = { kick: 0, click: 0, sine: 0, noise: 0 };
    this.sparkIdx = 0;
    this.beat = 0;
    this.obs = { x: 0, y: 0, s: 0, target: 0 };
    this.dprScale = 1; this.slow = 0; this.dtAvg = 1 / 60;
    // white flash (peak)
    this.flashMat = new THREE.ShaderMaterial({ vertexShader: FLASH_VERT, fragmentShader: FLASH_FRAG, uniforms: { uFlash: { value: 0 } }, transparent: true, depthTest: false, depthWrite: false });
    const fq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.flashMat); fq.frustumCulled = false; fq.renderOrder = 20;
    this.scene.add(fq);
    this.resize();
  }

  /** New photograph, shown sharp while it is read. */
  setPhoto(analysis, texCanvas) {
    this.clearPhoto();
    this.analysis = analysis;
    this.imgAspect = texCanvas.width / texCanvas.height;
    const tex = this.texture = new THREE.CanvasTexture(texCanvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
    this.shared.uImage.value = tex;
    this.obs.s = 0; this.obs.target = 0;
    this.photoMat = makeMaterial(this.shared, { vertex: PHOTO_VERT, fragment: PHOTO_FRAG, uniforms: { uIntro: { value: 0 }, uGhost: { value: 1 } }, blending: THREE.NormalBlending });
    this.photo = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.photoMat);
    this.photo.renderOrder = -1; this.photo.frustumCulled = false;
    this.scene.add(this.photo);
    this.resize();
  }

  clearPhoto() {
    for (const k in this.layers) { this.scene.remove(this.layers[k].group); this.layers[k].dispose(); }
    this.layers = {};
    this.piece = null;
    if (this.photo) { this.scene.remove(this.photo); this.photo.geometry.dispose(); this.photoMat.dispose(); this.photo = null; }
    if (this.texture) { this.texture.dispose(); this.texture = null; }
  }

  /** The piece is planned: build the structural layers + this pass's vocabulary. */
  setPiece(piece, extras) {
    this.piece = piece;
    this.extras = extras;            // { st, face }
    const p = piece.params;
    this.shared.uAccent.value.setRGB(...p.accent);
    this.shared.uSpeed.value = p.speed;
    for (const name of ['contours', 'constellation', 'glitch']) this.ensureLayer(name);
    this.ensureVocab(piece.pass(0));
    this.lastPass = 0;
    this.forced = null;
  }

  ensureVocab(plan) {
    for (const name of plan.vocab) this.ensureLayer(name);
    if (this.forced) this.ensureLayer(this.forced);
    const sl = SIG_LAYER[plan.signature]; if (sl) this.ensureLayer(sl);
  }

  ensureLayer(name) {
    if (!this.layers[name] && LAYER_CLASSES[name]) {
      const ctx = { shared: this.shared, analysis: this.analysis, params: this.piece.params, quality: this.quality, camZ: CAM_Z, renderer: this.renderer, st: this.extras.st, face: this.extras.face, view: this.view };
      const w = new LAYER_CLASSES[name](ctx);
      w.name = name; w.setMix(0); w.resize(this.view);
      this.layers[name] = w;
      this.scene.add(w.group);
    }
    return this.layers[name];
  }

  /** Manual override from the hidden selector: this layer leads. */
  forceLead(name) { this.forced = name || null; if (name) this.ensureLayer(name); }

  resize() {
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, this.quality.mobile ? 1.5 : 2) * this.dprScale);
    const W = window.innerWidth, H = window.innerHeight;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
    const aspect = W / H;
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    const ia = this.imgAspect || 1.5;
    const maxW = aspect * (W < 700 ? 0.92 : 0.74), maxH = W < 700 ? 0.78 : 0.74;
    let hx = maxW, hy = hx / ia;
    if (hy > maxH) { hy = maxH; hx = hy * ia; }
    this.view.half.set(hx, hy);
    this.view.aspect = aspect; this.view.bufferHeight = H * dpr; this.view.cssW = W; this.view.cssH = H;
    this.shared.uHalf.value.set(hx, hy);
    this.shared.uView.value.set(aspect, 1);
    this.shared.uPx.value = 2 / (H * dpr);
    this.shared.uObsR.value = W < 700 ? 0.42 : 0.32;
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
  imageToScreen(x, y) {
    const [ix, iy] = toImg(x, y);
    const wx = ix * this.view.half.x, wy = iy * this.view.half.y;
    return [(wx / this.view.aspect + 1) / 2 * this.view.cssW, (1 - wy) / 2 * this.view.cssH];
  }
  screenToImage(x, y) {
    const [wx, wy] = this.screenToWorld(x, y);
    return [(wx / this.view.half.x + 1) / 2, (1 - wy / this.view.half.y) / 2];
  }
  imageRect() { const [x0, y0] = this.imageToScreen(0, 0), [x1, y1] = this.imageToScreen(1, 1); return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; }

  /** Hold gesture: reveal the original photograph around (x, y). */
  observe(x, y, active) {
    const [wx, wy] = this.screenToWorld(x, y);
    this.obs.x = wx; this.obs.y = wy; this.obs.target = active ? 1 : 0;
    if (!this.obs.init) { this.obs.sx = wx; this.obs.sy = wy; this.obs.init = true; }
  }
  /** The cursor cut through the piece from (x0,y0) to (x1,y1) (CSS px) during dt. */
  force(x0, y0, x1, y1, dt) {
    const [a, b] = this.screenToWorld(x0, y0), [c, d] = this.screenToWorld(x1, y1);
    this.field.inject(a, b, c, d, dt, this.view.cssW < 700 ? 0.22 : 0.16);
  }

  trigger(ev) {
    const e = this.env;
    switch (ev.type) {
      case 'kick': e.kick = Math.max(e.kick, ev.vel * (ev.soft ? 0.5 : 1)); if (!ev.ghost) this.beat++; break;
      case 'click': case 'rim': e.click = Math.max(e.click, ev.vel); break;
      case 'pad': case 'tone': case 'bass': e.sine = Math.max(e.sine, 0.6); break;
      case 'snare': case 'fracture': case 'tex': e.noise = Math.max(e.noise, Math.min(1, (ev.vel || 0.3) * 2)); break;
      case 'stutter': e.noise = Math.max(e.noise, 0.6); e.click = Math.max(e.click, 0.7); break;
    }
    if (ev.x !== undefined && ['click', 'rim', 'stutter', 'hat', 'reveal', 'detach'].includes(ev.type)) {
      const kind = { click: 1, rim: 1, reveal: 2, detach: 2, hat: 3, stutter: 4 }[ev.type];
      const [ix, iy] = toImg(ev.x, ev.y);
      this.shared.uSparks.value[this.sparkIdx].set(ix, iy, this.time, kind);
      this.sparkIdx = (this.sparkIdx + 1) % 8;
    }
    const stepDur = this.piece ? this.piece.stepDur : 0.125;
    for (const k in this.layers) this.layers[k].onEvent?.(ev, this.time, stepDur);
  }

  /** One frame. f = { dt, playing, intro, state (score state or null) } */
  frame(f) {
    const dt = Math.min(0.1, f.dt);
    this.adapt(f.dt);
    this.time += dt * (f.playing ? 1 : 0.15);
    const U = this.shared, e = this.env, st = f.state;
    e.kick *= Math.exp(-dt * 7); e.click *= Math.exp(-dt * 22); e.sine *= Math.exp(-dt * 3); e.noise *= Math.exp(-dt * 9);
    U.uTime.value = this.time;
    U.uKick.value = e.kick; U.uClick.value = e.click; U.uSine.value = e.sine; U.uNoise.value = e.noise;
    U.uBeat.value = this.beat; U.uStep.value = f.stepF || 0;
    this.field.step(dt);

    // hold-to-observe: smooth position + strength
    const o = this.obs;
    if (o.init) {
      o.sx += (o.x - o.sx) * Math.min(1, dt * 14); o.sy += (o.y - o.sy) * Math.min(1, dt * 14);
      o.s += (o.target - o.s) * Math.min(1, dt * (o.target > o.s ? 6 : 1.8));
      U.uObs.value.set(o.sx, o.sy, o.s);
    }
    if (this.photoMat) { this.photoMat.uniforms.uIntro.value = f.intro; this.photoMat.uniforms.uGhost.value = st ? st.ghost : 1; }

    if (st && this.piece) {
      if (st.pass !== this.lastPass) { this.lastPass = st.pass; this.ensureVocab(st.plan); for (const k in this.layers) this.layers[k].resetPass(); }
      U.uTension.value = st.tension; U.uEnergy.value = st.tension; U.uFall.value = st.fall;
      U.uSig.value = st.signature; U.uSigKind.value = SIG_KIND[st.sigName] ?? -1;
      this.flashMat.uniforms.uFlash.value = st.flash;
      const pres = { ...st.presence, contours: st.contours, glitch: st.glitch };
      if (this.forced) {   // hidden selector: the chosen layer leads wherever A would
        const A = st.plan.vocab[0];
        pres[this.forced] = Math.max(pres[this.forced] || 0, pres[A] || 0); if (A !== this.forced) pres[A] = (pres[A] || 0) * 0.3;
      }
      const s = { ...st, dt, t: this.time, kick: e.kick, click: e.click, sine: e.sine, noise: e.noise, beat: this.beat, view: this.view, playing: f.playing, beatPhase: f.beatPhase };
      for (const k in this.layers) {
        const w = this.layers[k];
        const target = pres[k] || 0;
        const m = w.mix + (target - w.mix) * Math.min(1, dt * (target > w.mix ? 2.2 : 3.5));
        w.setMix(m < 0.003 && target === 0 ? 0 : m);
        if (w.mix > 0 || k === 'contours' || k === 'constellation') w.update(s);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
}
