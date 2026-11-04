// ─────────────────────────────────────────────────────────────
//  RASTER — straight lines, architecture, horizons.
//  The photograph splits into scanlines along its dominant line
//  orientation. Rows shift in quantised steps on the beat, stretch
//  their edge pixels beyond the frame, pixelate, and some turn into
//  barcode-like data stripes that run across the whole screen.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World } from './common.js';

const VERT = /* glsl */`
attribute float aRow;
uniform float uRows, uVert;
varying float vRow, vU, vY;
void main() {
  vRow = aRow;
  float ext = uVert > 0.5 ? uView.y / uHalf.y : uView.x / uHalf.x;   // screen edge in image units
  vU = position.x * ext * 1.02;
  vY = position.y;                                                    // -0.5..0.5 across the row
  float v = 1.0 - (aRow + 0.5) / uRows * 2.0 + position.y * 2.0 / uRows;
  vec2 p = uVert > 0.5 ? vec2(v, -vU) : vec2(vU, v);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p * uHalf, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uRows, uVert, uGroup, uFill, uThick;
varying float vRow, vU, vY;

vec2 toImg(float u, float v) { return uVert > 0.5 ? vec2(v, -u) : vec2(u, v); }

void main() {
  float row = vRow;
  float vc = 1.0 - (row + 0.5) / uRows * 2.0;           // row centre (across)
  float v = vc + vY * 2.0 / uRows;
  vec2 pImg = toImg(clamp(vU, -1.0, 1.0), v);
  float coh = coherence(toImg(vU, v));
  float free = 1.0 - coh;

  float beat = uBeat;
  float grp = floor(row / uGroup);
  float bar = floor(beat / 4.0);
  // ── shift on the beat: a seeded subset of row-groups jumps by 1/16 steps
  float hs = hash21(vec2(grp, beat));
  float moving = step(0.86 - 0.42 * uEnergy, hs);
  float shift = moving * (floor((hash21(vec2(grp * 1.7, beat + 3.1)) - 0.5) * 12.0) / 16.0);
  shift += (hash21(vec2(grp, 11.0)) - 0.5) * 0.04 * uEnergy;      // permanent misregistration
  shift *= free;
  float u = vU - shift;
  float inside = step(abs(u), 1.0);

  // ── pixelation along the row (some rows, re-rolled every bar)
  float pq = exp2(floor(hash21(vec2(row, bar)) * 4.0) + 4.0);       // 16..128 cells
  float doQ = step(0.55, hash21(vec2(row * 3.1, bar))) * free;
  float uq = mix(u, ((floor((u * 0.5 + 0.5) * pq) + 0.5) / pq) * 2.0 - 1.0, doQ);

  // ── strip colour: sampled at the row centre (scanline), exact when observed
  vec2 sp = toImg(clamp(uq, -1.0, 1.0), mix(vc, v, coh));
  vec3 col = photo(sp);

  // ── beyond the frame: edge pixels stretch out and fade
  float outside = max(abs(u) - 1.0, 0.0);
  float ext = step(0.86 - 0.3 * uEnergy, hash21(vec2(row, floor(bar / 2.0) + 7.0)));
  float streak = ext * exp(-outside * mix(7.0, 0.35, hash21(vec2(row, 5.0)))) * 0.75;

  // ── data stripes: luminance → binary bars, running across the whole screen
  float isData = step(0.955 - 0.05 * uEnergy - 0.04 * uBreak, hash21(vec2(row * 3.3, floor(beat / 2.0))));
  float cells = 48.0 + floor(hash21(vec2(row, 2.0)) * 4.0) * 32.0;
  float du = vU * 0.5 + 0.5 + floor(beat) * 0.0625 * (hash21(vec2(row, 9.0)) - 0.5);
  float cell = floor(du * cells);
  float bit = step(0.5, luma(photo(toImg(fract(cell / cells) * 2.0 - 1.0, vc))) + (hash21(vec2(cell, row)) - 0.5) * 0.3);
  float thin = step(0.35, fract(du * cells));                        // gap between bars
  vec3 dataCol = mix(vec3(0.92), uAccent, step(0.82, hash21(vec2(row, 3.0))));

  // ── row thickness: thin lines separated by black, full when observed
  float fill = mix(uFill * (0.55 + 0.9 * hash21(vec2(row, 1.0))) * uThick * (1.0 + uKick * 0.35), 1.0, coh);
  fill = mix(fill, 0.8, isData * free);
  float aa = 2.0 / uRows * uHalf.y / uPx;                           // row height in px
  float lineMask = 1.0 - smoothstep(fill * 0.5 - 0.5 / aa, fill * 0.5 + 0.5 / aa, abs(vY));

  float a = inside + (1.0 - inside) * streak;
  vec3 c = col * (1.0 + uKick * 0.25);
  if (isData * free > 0.5) { c = dataCol * bit * thin; a = 1.0; }

  // hairline registration rows across the whole screen
  float hair = step(0.985, hash21(vec2(row, 17.0))) * free;
  float hairLine = hair * (1.0 - smoothstep(0.0, 1.0 / aa, abs(vY))) * 0.35;

  // clicks → the row near a spark flashes white; noise → rows tear horizontally
  float sk = sparks(pImg, 26.0, 0.22);
  c += sk * 0.8;
  c *= 1.0 - uNoise * 0.5 * step(0.85, hash21(vec2(row, floor(uTime * 20.0)))) * free;

  float alpha = a * lineMask * uMix * (1.0 - coh * 0.97);
  vec3 outc = c * alpha + vec3(hairLine) * uMix;
  if (max(outc.r, max(outc.g, outc.b)) < 0.002) discard;
  gl_FragColor = vec4(outc, 1.0);
}`;

export class Raster extends World {
  constructor(ctx) {
    super(ctx);
    const { analysis, params, quality } = ctx;
    const vert = analysis.features.lineOrientation === 'v';
    const rows = Math.round(params.rasterRows * (quality.mobile ? 0.7 : 1));
    const base = new THREE.PlaneGeometry(2, 1, 1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    const rowIdx = new Float32Array(rows); for (let i = 0; i < rows; i++) rowIdx[i] = i;
    geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(rowIdx, 1));
    geo.instanceCount = rows;
    this.mat = this.material({
      vertex: VERT, fragment: FRAG,
      uniforms: {
        uRows: { value: rows }, uVert: { value: vert ? 1 : 0 },
        uGroup: { value: params.rasterGroup }, uFill: { value: params.rasterFill }, uThick: { value: params.thickness },
      },
    });
    const mesh = new THREE.Mesh(geo, this.mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }
}
