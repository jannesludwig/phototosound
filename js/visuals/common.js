// ─────────────────────────────────────────────────────────────
//  common.js — GLSL shared by every layer of the sound map.
//
//  Coordinates
//    image space  p ∈ [-1,1]², y up
//    map space    the terrain: (p * uHalf, z) — yawed, then tilted away
//    analysis     x,y ∈ [0,1], y down  → p = (2x-1, 1-2y)
//  terrainZ(p) and mapPos() are the single source of the terrain's
//  shape and pose: the terrain mesh, the edge flashes, the orbit and
//  the crumbling border all sit exactly on the same surface (and the
//  JS annotations use the same math, see engine.project()).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const GLSL_COMMON = /* glsl */`
uniform float uTime;
uniform vec2  uHalf;      // image half-extents in world units
uniform vec2  uView;      // view half-extents (aspect, 1)
uniform float uPx;        // one device pixel in world units
uniform float uForm;      // 0 = flat photograph, 1 = terrain
uniform vec3  uObs;       // hold-to-reveal: world xy + strength
uniform float uObsR;
uniform float uKick, uClick, uLow, uNoise, uData;  // audio envelopes / levels 0..1
uniform float uEnergy;    // section energy
uniform float uDecay;     // 0 → 1 as the image is consumed
uniform float uMix;       // this layer's visibility
uniform vec3  uAccent;
uniform sampler2D uImage;
uniform sampler2D uHeight; // r = height, g = ridges (edges), b = texture
uniform float uAmp, uTilt, uYaw;
uniform vec4  uRip[6];    // kick ripples: xy image, start time, strength
uniform float uDeformOn;
uniform sampler2D uField; // the hand's force field (bytes)
uniform vec4  uFieldRect;

float hash11(float p) { p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);
}
vec2 curl2(vec2 p, float t) {
  float e = 0.05; vec2 q = p + vec2(t * 0.31, -t * 0.17);
  return vec2(vnoise(q + vec2(0, e)) - vnoise(q - vec2(0, e)), -(vnoise(q + vec2(e, 0)) - vnoise(q - vec2(e, 0)))) / (2.0 * e);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec2 imgUV(vec2 p) { return p * 0.5 + 0.5; }
vec3 photo(vec2 p) { return texture2D(uImage, clamp(imgUV(p), 0.001, 0.999)).rgb; }
vec3 mapData(vec2 p) { return texture2D(uHeight, clamp(imgUV(p), 0.001, 0.999)).rgb; }

vec2 fieldAt(vec2 w) {
  vec2 uv = (w - uFieldRect.xy) / uFieldRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec2(0.0);
  return (texture2D(uField, uv).rg * 255.0 - 127.0) / 127.0 * 0.4;
}

// hold-to-reveal: how much of the photograph shows at image point p
float coherence(vec2 p) {
  float d = distance(p * uHalf, uObs.xy);
  return clamp(uObs.z * (1.0 - smoothstep(uObsR * 0.2, uObsR, d)), 0.0, 1.0);
}

// The terrain height at image point p: the sound map + its life.
float terrainZ(vec2 p) {
  vec3 m = mapData(p);
  float breath = 0.8 + 0.45 * uLow;                          // the low end lifts the land
  float z = (m.r - 0.45) * uAmp * breath;
  if (uDeformOn > 0.5) {
    for (int i = 0; i < 6; i++) {                             // kicks: a ripple from the ridge that sounded
      vec4 R = uRip[i];
      float age = uTime - R.z;
      if (age < 0.0 || age > 3.0) continue;
      float d = distance(p * uHalf, R.xy * uHalf);
      z += R.w * 0.045 * sin(d * 28.0 - age * 10.0) * exp(-age * 1.4) * exp(-d * 2.2) * step(d, age * 0.55 + 0.04);
    }
    z += (vnoise(p * 18.0 + uTime * 0.2) - 0.5) * 0.05 * uDecay;   // erosion as the image is consumed
  }
  return z * uForm;
}

// Pose: yaw in the map plane, then tilt away from the viewer.
vec3 mapPos(vec2 p, float z) {
  vec3 pos = vec3(p * uHalf, z);
  pos.xy += fieldAt(pos.xy);
  float yaw = uYaw * uForm;
  pos.xy = mat2(cos(yaw), sin(yaw), -sin(yaw), cos(yaw)) * pos.xy;
  float t = -uTilt * uForm;
  pos = vec3(pos.x, pos.y * cos(t) - pos.z * sin(t), pos.y * sin(t) + pos.z * cos(t));
  pos.y -= 0.1 * uTilt * uForm;
  return pos;
}
`;

export function makeSharedUniforms() {
  const rip = []; for (let i = 0; i < 6; i++) rip.push(new THREE.Vector4(0, 0, -99, 0));
  return {
    uTime: { value: 0 }, uHalf: { value: new THREE.Vector2(1, 1) }, uView: { value: new THREE.Vector2(1, 1) },
    uPx: { value: 0.002 }, uForm: { value: 0 }, uObs: { value: new THREE.Vector3(0, 0, 0) }, uObsR: { value: 0.3 },
    uKick: { value: 0 }, uClick: { value: 0 }, uLow: { value: 0 }, uNoise: { value: 0 }, uData: { value: 0 },
    uEnergy: { value: 0 }, uDecay: { value: 0 }, uAccent: { value: new THREE.Color(0.5, 0.9, 1) },
    uImage: { value: null }, uHeight: { value: null }, uAmp: { value: 0.4 }, uTilt: { value: 0.95 }, uYaw: { value: 0 },
    uRip: { value: rip }, uDeformOn: { value: 1 },
    uField: { value: null }, uFieldRect: { value: new THREE.Vector4(-2, -1, 4, 2) },
  };
}

export function makeMaterial(shared, { vertex, fragment, uniforms = {}, blending = THREE.AdditiveBlending, side = THREE.DoubleSide }) {
  const u = { ...shared, uMix: { value: 0 }, ...uniforms };
  return new THREE.ShaderMaterial({
    uniforms: u, vertexShader: GLSL_COMMON + vertex, fragmentShader: GLSL_COMMON + fragment,
    transparent: true, depthTest: false, depthWrite: false, blending, side,
    extensions: { derivatives: true },
  });
}

/** Base class for a layer. Subclasses fill this.group. */
export class Layer {
  constructor(ctx) { this.ctx = ctx; this.group = new THREE.Group(); this.materials = []; this.mix = 0; this.on = true; }
  material(opts) { const m = makeMaterial(this.ctx.shared, opts); this.materials.push(m); return m; }
  setMix(m) { this.mix = m; for (const mat of this.materials) mat.uniforms.uMix.value = m; this.group.visible = this.on && m > 0.003; }
  resize() {}
  update() {}
  onEvent() {}
  dispose() { this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); for (const m of this.materials) m.dispose(); }
}

export const toImg = (x, y) => [x * 2 - 1, 1 - y * 2];
