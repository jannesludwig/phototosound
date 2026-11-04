// ─────────────────────────────────────────────────────────────
//  common.js — GLSL shared by all worlds + material helper.
//
//  Coordinate conventions
//    image space  p ∈ [-1,1]², y up   (world = p * uHalf)
//    world space  z = 0 plane, view height 2 units (y ∈ [-1,1])
//    analysis     x,y ∈ [0,1], y down  → p = (2x-1, 1-2y)
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const GLSL_COMMON = /* glsl */`
uniform float uTime;
uniform vec2  uHalf;      // image half-extents in world units
uniform vec2  uView;      // view half-extents (aspect, 1)
uniform float uPx;        // one device pixel in world units
uniform float uForm;      // 0 = photograph, 1 = fully transformed
uniform float uCohere;    // global re-coherence (once per loop)
uniform vec3  uObs;       // observer: world xy + strength
uniform float uObsR;      // observer radius (world units)
uniform float uKick, uClick, uSine, uNoise;  // audio envelopes 0..1
uniform float uBeat;      // kick counter (integer-valued)
uniform float uStep;      // continuous 16th-step position
uniform float uEnergy;    // section energy 0..1
uniform float uBreak;     // breakdown amount 0..1
uniform float uMix;       // this world's visibility 0..1
uniform float uSpeed;     // seeded speed multiplier
uniform vec3  uAccent;    // one cold accent colour
uniform vec4  uSparks[8]; // xy image space, z start time, w kind (1 click 2 sine 3 noise 4 stutter)
uniform sampler2D uImage;
uniform sampler2D uField;  // force field: rg = displacement (world units)
uniform vec4  uFieldRect;  // field covers world rect (x0, y0, w, h)
uniform float uTension;   // score tension 0..1
uniform float uFall;      // afterglow: elements fall away 0..1
uniform float uSig;       // signature moment progress 0..1
uniform float uSigKind;   // 0 RECONSTRUCT 1 GRID 2 NETWORK 3 SWEEP 4 STRATA

// The cursor's force field: a wake with inertia and spring-back, sampled by every layer.
vec2 fieldAt(vec2 w) {
  vec2 uv = (w - uFieldRect.xy) / uFieldRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0);
  return texture2D(uField, uv).rg;
}
float sigOn(float kind) { return uSig * (1.0 - step(0.5, abs(uSigKind - kind))); }
// GRID signature: snap a world position to the grid
vec2 gridSnap(vec2 w, float cells) { float c = 2.0 / cells; return (floor(w / c) + 0.5) * c; }

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
// divergence-free 2D field from the curl of value noise
vec2 curl2(vec2 p, float t) {
  float e = 0.05;
  vec2 q = p + vec2(t * 0.31, -t * 0.17);
  float n1 = vnoise(q + vec2(0, e)), n2 = vnoise(q - vec2(0, e));
  float n3 = vnoise(q + vec2(e, 0)), n4 = vnoise(q - vec2(e, 0));
  return vec2(n1 - n2, -(n3 - n4)) / (2.0 * e);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 imgUV(vec2 p) { return p * 0.5 + 0.5; }
vec3 photo(vec2 p) { return texture2D(uImage, clamp(imgUV(p), 0.001, 0.999)).rgb; }

// How strongly the photograph is "observed" (collapsed) at image point p.
float coherence(vec2 p) {
  float d = distance(p * uHalf, uObs.xy);
  float o = uObs.z * (1.0 - smoothstep(uObsR * 0.2, uObsR, d));
  return clamp(max(max(1.0 - uForm, uCohere), o), 0.0, 1.0);
}

// Brightness of recent sparks near image point p (world-distance falloff k).
float sparks(vec2 p, float k, float life) {
  float s = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 sp = uSparks[i];
    float age = uTime - sp.z;
    if (age < 0.0 || age > life) continue;
    float d = distance(p * uHalf, sp.xy * uHalf);
    s += exp(-d * k) * (1.0 - age / life) * (sp.w < 1.5 ? 1.0 : 0.6);
  }
  return s;
}
`;

/** Shared uniform objects: one instance, referenced by every material. */
export function makeSharedUniforms() {
  const sparks = []; for (let i = 0; i < 8; i++) sparks.push(new THREE.Vector4(0, 0, -99, 0));
  return {
    uTime: { value: 0 }, uHalf: { value: new THREE.Vector2(1, 1) }, uView: { value: new THREE.Vector2(1, 1) },
    uPx: { value: 0.002 }, uForm: { value: 0 }, uCohere: { value: 0 },
    uObs: { value: new THREE.Vector3(0, 0, 0) }, uObsR: { value: 0.35 },
    uKick: { value: 0 }, uClick: { value: 0 }, uSine: { value: 0 }, uNoise: { value: 0 },
    uBeat: { value: 0 }, uStep: { value: 0 }, uEnergy: { value: 0 }, uBreak: { value: 0 },
    uSpeed: { value: 1 }, uAccent: { value: new THREE.Color(0.5, 0.9, 1) },
    uSparks: { value: sparks }, uImage: { value: null },
    uField: { value: null }, uFieldRect: { value: new THREE.Vector4(-2, -1, 4, 2) },
    uTension: { value: 0 }, uFall: { value: 0 }, uSig: { value: 0 }, uSigKind: { value: -1 },
  };
}

/**
 * ShaderMaterial wired to the shared uniforms plus a private uMix and extras.
 * Blending is additive by default (light on black).
 */
export function makeMaterial(shared, { vertex, fragment, uniforms = {}, blending = THREE.AdditiveBlending, extensions }) {
  const u = { ...shared, uMix: { value: 0 }, ...uniforms };
  const mat = new THREE.ShaderMaterial({
    uniforms: u,
    vertexShader: GLSL_COMMON + vertex,
    fragmentShader: GLSL_COMMON + fragment,
    transparent: true, depthTest: false, depthWrite: false, blending,
  });
  if (extensions) mat.extensions = extensions;
  return mat;
}

/** Base class for a world. Subclasses fill this.group and implement update(). */
export class World {
  constructor(ctx) {
    this.ctx = ctx;                // { shared, analysis, params, quality, renderer }
    this.group = new THREE.Group();
    this.materials = [];
    this.mix = 0;
  }
  material(opts) { const m = makeMaterial(this.ctx.shared, opts); this.materials.push(m); return m; }
  setMix(m) {
    this.mix = m;
    for (const mat of this.materials) mat.uniforms.uMix.value = m;
    this.group.visible = m > 0.003;
  }
  /** Called when the viewport changes. */
  resize() {}
  /** Per frame. s: { t, dt, tension, section, si, sp, signature, sigName, fall, kick, … } */
  update() {}
  /** A score event that concerns this layer (reveal, detach, flash, …). */
  onEvent() {}
  /** A new loop pass begins: forget per-element states. */
  resetPass() {}
  dispose() {
    this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}

/** Analysis (x,y ∈ [0,1], y down) → image space. */
export const toImg = (x, y) => [x * 2 - 1, 1 - y * 2];
