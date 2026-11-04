// ─────────────────────────────────────────────────────────────
//  field.js — the cursor as a force field (Lieberman: lines with mass).
//  A CPU spring grid over the view: each cell holds a displacement and
//  a velocity. The moving cursor injects velocity along its path (and a
//  radial push), scaled by its speed; springs pull everything back with
//  a little overshoot, neighbour diffusion smears the wake. Uploaded each
//  frame as a half-float texture that every layer samples (fieldAt()).
// ─────────────────────────────────────────────────────────────
import * as THREE from 'three';

export class ForceField {
  constructor(gw = 72, gh = 44) {
    this.gw = gw; this.gh = gh;
    const n = gw * gh;
    this.dx = new Float32Array(n); this.dy = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.tmpx = new Float32Array(n); this.tmpy = new Float32Array(n);
    this.data = new Uint16Array(n * 4);
    this.tex = new THREE.DataTexture(this.data, gw, gh, THREE.RGBAFormat, THREE.HalfFloatType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.needsUpdate = true;
    this.rect = new THREE.Vector4(-2, -1.1, 4, 2.2);
    this.energy = 0;
    this.k = 26; this.c = 5.2; this.diff = 9;   // spring, damping (under-damped → overshoot), diffusion
  }

  setView(aspect) { this.rect.set(-aspect * 1.05, -1.05, aspect * 2.1, 2.1); }

  /** Cursor moved from (x0,y0) to (x1,y1) in world units during dt. */
  inject(x0, y0, x1, y1, dt, radius = 0.16) {
    const mx = x1 - x0, my = y1 - y0, len = Math.hypot(mx, my);
    if (len < 1e-5 || dt <= 0) return;
    const speed = len / dt;                                   // world units / s
    const gain = Math.min(1, speed / 3) * 9;                  // effect scales with cursor speed
    const ux = mx / len, uy = my / len;
    const { gw, gh, rect } = this;
    const cw = rect.z / gw, ch = rect.w / gh;
    const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - radius - rect.x) / cw)), i1 = Math.min(gw - 1, Math.ceil((Math.max(x0, x1) + radius - rect.x) / cw));
    const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - radius - rect.y) / ch)), j1 = Math.min(gh - 1, Math.ceil((Math.max(y0, y1) + radius - rect.y) / ch));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = rect.x + (i + 0.5) * cw, cy = rect.y + (j + 0.5) * ch;
      // distance to the swept segment
      let t = ((cx - x0) * mx + (cy - y0) * my) / (len * len); t = Math.max(0, Math.min(1, t));
      const px = x0 + mx * t, py = y0 + my * t, dxp = cx - px, dyp = cy - py, d = Math.hypot(dxp, dyp);
      if (d > radius) continue;
      const fall = Math.exp(-(d * d) / (radius * radius * 0.35));
      const k = j * gw + i;
      // drag along the motion + push aside (things bend around the hand)
      this.vx[k] += (ux * 0.55 + (d > 1e-4 ? dxp / d : 0) * 0.45) * gain * fall * dt * 4;
      this.vy[k] += (uy * 0.55 + (d > 1e-4 ? dyp / d : 0) * 0.45) * gain * fall * dt * 4;
    }
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    const { gw, gh, dx, dy, vx, vy, tmpx, tmpy, k, c, diff } = this;
    let e = 0;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const n = j * gw + i;
      const l = i > 0 ? n - 1 : n, r = i < gw - 1 ? n + 1 : n, u = j > 0 ? n - gw : n, d = j < gh - 1 ? n + gw : n;
      const lapx = dx[l] + dx[r] + dx[u] + dx[d] - 4 * dx[n], lapy = dy[l] + dy[r] + dy[u] + dy[d] - 4 * dy[n];
      tmpx[n] = vx[n] + (-k * dx[n] - c * vx[n] + diff * lapx) * dt;
      tmpy[n] = vy[n] + (-k * dy[n] - c * vy[n] + diff * lapy) * dt;
    }
    for (let n = 0; n < gw * gh; n++) {
      vx[n] = tmpx[n]; vy[n] = tmpy[n];
      dx[n] = Math.max(-0.4, Math.min(0.4, dx[n] + vx[n] * dt));
      dy[n] = Math.max(-0.4, Math.min(0.4, dy[n] + vy[n] * dt));
      e += Math.abs(dx[n]) + Math.abs(dy[n]);
    }
    this.energy = e;
    if (e > 1e-4 || this.dirty) {
      const D = this.data, H = THREE.DataUtils.toHalfFloat;
      for (let n = 0; n < gw * gh; n++) { D[n * 4] = H(dx[n]); D[n * 4 + 1] = H(dy[n]); D[n * 4 + 2] = H(Math.hypot(vx[n], vy[n])); }
      this.tex.needsUpdate = true;
      this.dirty = e > 1e-4;
    }
  }

  /** Displacement at a world point (CPU side, e.g. for sound). */
  at(x, y) {
    const { gw, gh, rect } = this;
    const i = Math.floor((x - rect.x) / rect.z * gw), j = Math.floor((y - rect.y) / rect.w * gh);
    if (i < 0 || j < 0 || i >= gw || j >= gh) return [0, 0];
    return [this.dx[j * gw + i], this.dy[j * gw + i]];
  }
}
