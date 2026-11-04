// ─────────────────────────────────────────────────────────────
//  nerves.js — NERVOUS SYSTEM. Thin circuit traces grow from the heart
//  over LIFE, linking peaks, ridges, hard edges and rough places (the
//  tree comes from organism.js). Each heartbeat (lub) launches a light
//  impulse along every grown path; it reaches a node exactly when that
//  node's click sounds (arrival = path length, quantized + micro-timing,
//  the same numbers the composer uses). In DECAY the network dies from
//  the leaves inward, flickering before each branch goes.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Layer, toImg } from './common.js';

const IMP = 6;
const VERT = /* glsl */`
attribute vec2 aOff;
attribute vec4 aT;          // arrival (steps), birth (bar), death (bar), every (impulse divisor)
attribute float aMark;
uniform float uImp[${IMP}], uImpN[${IMP}];
uniform float uStepDur, uBar;
varying float vA, vG;
void main() {
  vec2 p = position.xy + aOff / uHalf;
  vec3 pos = mapPos(p, terrainZ(position.xy) + 0.004);
  float alive = 1.0 - step(aT.z, uBar);
  float dying = smoothstep(aT.z - 0.6, aT.z, uBar);
  float flick = mix(1.0, step(0.5, hash11(floor(uTime * 22.0) + aT.x * 3.1)), dying);
  float g = 0.0;
  for (int i = 0; i < ${IMP}; i++) {
    if (mod(uImpN[i], aT.w) > 0.5) continue;
    float dt = (uTime - uImp[i]) / uStepDur - aT.x;
    g += smoothstep(-0.7, 0.0, dt) * exp(-max(dt, 0.0) * 1.4) * step(dt, 5.0);
  }
  vG = g;
  vA = uMix * step(aT.y, uBar) * alive * flick * (aMark > 0.5 ? 0.3 + 1.6 * g : 0.11 + 1.3 * g);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;
const FRAG = /* glsl */`
varying float vA, vG;
void main() {
  if (vA < 0.004) discard;
  gl_FragColor = vec4(mix(mix(vec3(0.75, 0.8, 0.85), uAccent, 0.45), vec3(1.0), min(1.0, vG)) * vA, 1.0);
}`;

export class Nerves extends Layer {
  constructor(ctx) {
    super(ctx);
    const { org } = ctx, nodes = org.nodes, D = org.dist;
    const P = [], O = [], T = [], M = [];
    const vert = (pt, off, t, mark) => { const [x, y] = toImg(pt.x, pt.y); P.push(x, y, 0); O.push(off[0], off[1]); T.push(...t); M.push(mark); };
    const time = (n) => (n.parent < 0 ? 0 : n.arrive + n.micro);
    nodes.forEach((n) => {
      if (n.parent < 0) return;
      const par = nodes[n.parent], legs = [[par, n.mid], [n.mid, n]];
      const total = D(par, n.mid) + D(n.mid, n);
      let along = 0;
      const t0 = time(par), t1 = time(n);
      for (const [a, b] of legs) {
        const L = D(a, b), k = Math.max(1, Math.ceil(L / 0.012));
        for (let i = 0; i < k; i++) {
          for (const e of [i, i + 1]) {
            const u = e / k, pt = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
            const f = total > 0 ? (along + L * u) / total : 1;
            vert(pt, [0, 0], [t0 + (t1 - t0) * f, n.birthBar - 1 + f, n.deathBar, n.every], 0);
          }
        }
        along += L;
      }
      // the node: a small square that flashes when the impulse arrives
      const s = n.kind === 'peak' ? 0.009 : 0.006, c = [[-s, -s], [s, -s], [s, s], [-s, s]];
      for (let i = 0; i < 4; i++) for (const j of [i, (i + 1) % 4]) vert(n, c[j], [t1, n.birthBar, n.deathBar, n.every], 1);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P), 3));
    geo.setAttribute('aOff', new THREE.BufferAttribute(new Float32Array(O), 2));
    geo.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(T), 4));
    geo.setAttribute('aMark', new THREE.BufferAttribute(new Float32Array(M), 1));
    this.imp = new Array(IMP).fill(-99); this.impN = new Array(IMP).fill(0); this.k = 0;
    this.mat = this.material({ vertex: VERT, fragment: FRAG, uniforms: { uImp: { value: this.imp }, uImpN: { value: this.impN }, uStepDur: { value: 0.14 }, uBar: { value: -1 } } });
    const l = new THREE.LineSegments(geo, this.mat); l.frustumCulled = false; l.renderOrder = 6;
    this.group.add(l);
  }
  onEvent(ev, now) {
    if (ev.type === 'heart' && ev.lub) { const k = this.k++ % IMP; this.imp[k] = now; this.impN[k] = ev.n ?? 0; }
  }
  update(s) { this.mat.uniforms.uBar.value = s.lb; this.mat.uniforms.uStepDur.value = this.ctx.stepDur || 0.14; }
}
