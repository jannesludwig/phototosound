// ─────────────────────────────────────────────────────────────
//  MATRIX — flat, graphic, abstract images.
//  The image becomes a grid of data cells: quantised colour blocks,
//  binary digits (1 where the cell is bright, 0 where it is dark),
//  dots and voids. Cells flip state on the sequencer steps, rows are
//  reordered by noise bursts, bands stutter (repeat one column), and
//  some rows leak out of the frame as streams of bits.
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { World } from './common.js';

const VERT = /* glsl */`
varying vec2 vW;
void main() {
  vW = position.xy * vec2(uView.x * 1.02, uHalf.y);   // full width, image height
  gl_Position = projectionMatrix * modelViewMatrix * vec4(vW, 0.0, 1.0);
}`;

const FRAG = /* glsl */`
uniform float uCols, uDensity, uMeanL;
varying vec2 vW;

// 3×5 bitmap glyphs, rows top→bottom
float glyph(float g, vec2 f) {
  vec2 q = (f - vec2(0.22, 0.14)) / vec2(0.56, 0.72);
  if (q.x < 0.0 || q.x >= 1.0 || q.y < 0.0 || q.y >= 1.0) return 0.0;
  float gx = floor(q.x * 3.0), gy = 4.0 - floor(q.y * 5.0);
  float idx = gy * 3.0 + gx;
  return mod(floor(g / exp2(14.0 - idx)), 2.0);
}

void main() {
  vec2 fd = fieldAt(vW);
  vec2 pImg = (vW - fd * 1.5) / uHalf;    // cells are displaced by the hand…
  float rows = floor(uCols * uHalf.y / uHalf.x + 0.5);
  vec2 grid = vec2(uCols, rows);
  vec2 g = (pImg * 0.5 + 0.5) * grid;
  vec2 cell = floor(g), f = fract(g);
  float inside = step(0.0, cell.x) * step(cell.x, grid.x - 1.0);
  float coh = coherence(clamp(pImg, -1.0, 1.0));
  float free = 1.0 - coh;
  float st = floor(uStep);                  // sequencer step
  float bar = floor(uStep / 16.0);

  // ── row reordering on noise bursts (plus a slow permanent shuffle)
  float rowSrc = cell.y;
  float swap = step(0.8 - uNoise * 0.5, hash21(vec2(cell.y, floor(uTime * 10.0)))) * step(0.15, uNoise);
  rowSrc = mix(rowSrc, floor(hash21(vec2(cell.y, st)) * rows), swap);
  // ── stutter: a band of rows repeats one column
  float band = floor(cell.y / 3.0);
  float stut = step(0.93 - uClick * 0.15, hash21(vec2(band, st))) * free;
  float colSrc = mix(cell.x, floor(cell.x / 6.0) * 6.0, stut);
  vec2 sp = (vec2(clamp(colSrc, 0.0, grid.x - 1.0), rowSrc) + 0.5) / grid * 2.0 - 1.0;
  vec3 c = photo(sp);
  float l = luma(c);
  vec3 cq = floor(c * 4.0 + 0.5) / 4.0;     // quantised data colour

  // ── cell state flips on steps; each cell has its own period (1..4 steps)
  float period = 1.0 + floor(hash21(cell + 0.5) * 4.0);
  float h = hash21(cell + floor(st / period) * 0.1373);
  h = mix(h, fract(h + 0.37), step(0.012, length(fd)));   // …and flipped where it passes
  float e = 0.45 + 0.55 * uEnergy;
  // cells that differ from the image's average carry the data; the background recedes
  float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  float dev = clamp(abs(l - uMeanL) * 1.6 + sat * 0.8, 0.0, 1.0);
  float pBlock = (0.04 + 0.42 * dev) * e * uDensity;
  float pDigit = (0.12 + 0.3 * dev) * e;
  float pDot = 0.14;
  float cellPx = (2.0 * uHalf.x / uCols) / uPx;
  float gap = 1.0 / cellPx;                 // 1 px gutter
  float inner = step(gap, f.x) * step(gap, f.y);
  vec3 col = vec3(0.0);
  if (h < pBlock) {
    col = cq * inner * (0.75 + 0.25 * step(0.5, fract(st * 0.5 + h * 7.0)));
  } else if (h < pBlock + pDigit) {
    float one = step(uMeanL, l);
    float gl = glyph(one > 0.5 ? 11415.0 : 31599.0, f);
    vec3 dc = mix(vec3(0.78), cq * 1.2 + 0.1, step(0.5, hash21(cell + 3.0))) * (0.45 + 0.55 * dev);
    dc = mix(dc, uAccent, step(0.94, hash21(cell + st)));
    col = dc * gl;
  } else if (h < pBlock + pDigit + pDot) {
    col = mix(cq, vec3(0.6), 0.4) * (1.0 - step(0.12, length(f - 0.5)));
  }
  // faint hairline grid
  float gridLine = (1.0 - step(gap, f.x)) + (1.0 - step(gap, f.y));
  col += vec3(0.07) * min(gridLine, 1.0);

  // ── rows that leak out of the frame as bit streams
  float leak = step(0.9 - 0.08 * uEnergy, hash21(vec2(cell.y, bar + 0.5)));
  float out_ = 1.0 - inside;
  if (out_ > 0.5) {
    float dist = cell.x < 0.0 ? -cell.x : cell.x - grid.x + 1.0;
    float bitSrc = luma(photo((vec2(mod(cell.x + st, grid.x), rowSrc) + 0.5) / grid * 2.0 - 1.0));
    float gl = glyph(bitSrc > uMeanL ? 11415.0 : 31599.0, f);
    col = vec3(0.7) * gl * leak * exp(-dist * 0.07) * step(0.35, hash21(vec2(cell.x, cell.y + st)));
  }

  // clicks → cells near the spark invert briefly
  float sk = sparks(pImg, 30.0, 0.18);
  col = mix(col, vec3(1.0) - col, clamp(sk, 0.0, 1.0) * inside * inner);
  col *= 1.0 + uKick * 0.3;
  col *= uMix * free;
  if (max(col.r, max(col.g, col.b)) < 0.002) discard;
  gl_FragColor = vec4(col, 1.0);
}`;

export class MatrixWorld extends World {
  constructor(ctx) {
    super(ctx);
    this.mat = this.material({
      vertex: VERT, fragment: FRAG,
      uniforms: { uCols: { value: ctx.params.matrixCols }, uDensity: { value: ctx.params.density }, uMeanL: { value: ctx.analysis.features.brightness } },
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    plane.frustumCulled = false;
    this.group.add(plane);
  }

  resize(view) {
    // keep cells ≥ 9 device px so the digits stay legible
    const imgPx = view.half.x * view.bufferHeight;
    this.mat.uniforms.uCols.value = Math.max(16, Math.min(this.ctx.params.matrixCols, Math.floor(imgPx / 9)));
  }
}
