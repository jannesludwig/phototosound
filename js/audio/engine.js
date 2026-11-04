// ─────────────────────────────────────────────────────────────
//  engine.js — Web Audio synthesis + sample-accurate scheduling.
//
//  Round 3: the v1 engine (sine kick, sub, the v1 click buffers, gated
//  noise, image-row data stutters, 4-bit crush, limiter) — with every
//  pitched blip removed. Each sound layer has its own bus (gain +
//  analyser) so the hidden mixer (M) can mute/solo and meter it.
//
//  A worker-driven clock wakes every 25 ms and schedules every step
//  that falls within the next 150 ms. Step times are computed from
//  the integer step index (start + n·stepDur): no drift. Every
//  scheduled sound is also pushed onto a queue that the visuals read
//  against the audio clock — picture and sound stay locked.
// ─────────────────────────────────────────────────────────────
import { makeRng } from '../rng.js';
import { STEPS, LAYERS, layerOf } from './composer.js';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;

function makeTicker(cb) {
  try {
    const src = `let id=null;onmessage=e=>{if(e.data==='start'){clearInterval(id);id=setInterval(()=>postMessage(0),${TICK_MS});}else{clearInterval(id);id=null;}}`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = cb;
    return { start: () => w.postMessage('start'), stop: () => w.postMessage('stop') };
  } catch (e) {
    let id = null;
    return { start: () => { clearInterval(id); id = setInterval(cb, TICK_MS); }, stop: () => clearInterval(id) };
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.events = [];
    this.volume = 0.8;
    this.mute = {}; this.solo = {};          // mixer state survives new photos
    this.loopMode = false;                    // default: the piece runs once and ends
    this.lastHit = {};                        // layer → last audio time it played
    this.ticker = makeTicker(() => this.tick());
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* */ }
    // master: volume → limiter → out (+ recording tap)
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const lim = this.limiter = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    const trim = ctx.createGain(); trim.gain.value = 0.95;
    this.master.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
    this.recordDest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.recordDest) trim.connect(this.recordDest);
    this.crushCurve = new Float32Array(4096);
    for (let i = 0; i < 4096; i++) { const x = i / 4095 * 2 - 1; this.crushCurve[i] = Math.round(x * 7) / 7; }
    this.buildBuffers();
    return ctx;
  }

  async unlock() {
    const ctx = this.ensureContext();
    try { const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* */ }
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* */ } }
    return ctx.state === 'running';
  }
  get running() { return this.ctx && this.ctx.state === 'running'; }

  /** The v1 palette: white noise + four click buffers (impulse, noise tick, 6.2 kHz ring, 3.1 kHz square). */
  buildBuffers() {
    const ctx = this.ctx, sr = ctx.sampleRate, rng = makeRng(0xc0ffee);
    const mk = (len, fn) => { const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = fn(i, i / sr); return b; };
    this.noiseBuf = mk(sr * 2, () => rng() * 2 - 1);
    this.clickBufs = [
      mk(64, (i) => (i === 0 ? 1 : i === 1 ? -0.7 : i < 6 ? (rng() - 0.5) * 0.2 : 0)),
      mk(Math.floor(sr * 0.0012), (i, t) => (rng() * 2 - 1) * Math.exp(-t * 4000)),
      mk(Math.floor(sr * 0.002), (i, t) => Math.sin(2 * Math.PI * 6200 * t) * Math.exp(-t * 2200)),
      mk(Math.floor(sr * 0.003), (i, t) => (Math.sin(2 * Math.PI * 3100 * t) > 0 ? 0.6 : -0.6) * Math.exp(-t * 1400)),
    ];
  }

  /** Per photo: image rows become tiny waveforms (data stutters, glitches). */
  loadPiece(composer, analysis, params) {
    this.composer = composer;
    this.params = params;
    const ctx = this.ensureContext(), sr = ctx.sampleRate;
    const { L } = analysis.maps, w = analysis.width, h = analysis.height, rows = analysis.grid.rows;
    this.dataBufs = []; this.dataBufsCrushed = [];
    for (let r = 0; r < rows; r++) {
      const y = Math.min(h - 1, Math.floor((r + 0.5) / rows * h));
      const hold = 2, len = w * hold;
      let mean = 0; for (let x = 0; x < w; x++) mean += L[y * w + x]; mean /= w;
      const b = ctx.createBuffer(1, len, sr), c = ctx.createBuffer(1, len, sr);
      const d = b.getChannelData(0), dc = c.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = Math.max(-1, Math.min(1, (L[y * w + Math.floor(i / hold)] - mean) * 2.4));
        const ci = Math.floor(i / 6) * 6;
        dc[i] = Math.round(Math.max(-1, Math.min(1, (L[y * w + Math.floor(ci / hold)] - mean) * 3)) * 3) / 3;
      }
      this.dataBufs.push(b); this.dataBufsCrushed.push(c);
    }
    this.stepDur = 60 / params.bpm / 4;
    this.barDur = this.stepDur * STEPS;
    this.swing = params.swing || 0;
  }

  /** One bus per layer: gain (mixer) → analyser (meter) → piece gain. */
  buildBuses() {
    const ctx = this.ctx;
    this.pieceGain = ctx.createGain(); this.pieceGain.gain.value = 0.7;
    this.pieceGain.connect(this.master);
    this.bus = {}; this.meter = {}; this.crush = {};
    for (const L of LAYERS) {
      const g = ctx.createGain(), an = ctx.createAnalyser();
      an.fftSize = 256;
      g.connect(an); an.connect(this.pieceGain);
      this.bus[L] = g; this.meter[L] = an;
      const cr = ctx.createWaveShaper(); cr.curve = this.crushCurve; cr.connect(g); this.crush[L] = cr;
    }
    this.applyMix();
  }

  // ── mixer ───────────────────────────────────────────────────
  setMute(L, on) { this.mute[L] = on; this.applyMix(); }
  setSolo(L, on) { this.solo[L] = on; this.applyMix(); }
  applyMix() {
    if (!this.bus) return;
    const anySolo = LAYERS.some((L) => this.solo[L]);
    for (const L of LAYERS) {
      const on = !this.mute[L] && (!anySolo || this.solo[L]);
      this.bus[L].gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.01);
    }
  }
  /** Live RMS level per layer (0..1) for the mixer meters. */
  levels() {
    const out = {};
    if (!this.meter) return out;
    const buf = this.levelBuf || (this.levelBuf = new Float32Array(256));
    for (const L of LAYERS) {
      this.meter[L].getFloatTimeDomainData(buf);
      let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
      out[L] = Math.sqrt(s / buf.length);
    }
    return out;
  }
  /** Layers that sounded within the last `win` seconds (heard time). */
  activeLayers(win = 2) {
    const t = this.heardTime();
    return LAYERS.filter((L) => this.lastHit[L] !== undefined && t - this.lastHit[L] < win && this.lastHit[L] <= t + 0.2);
  }

  start(startBar = 0) {
    const ctx = this.ensureContext();
    this.stopPiece();
    this.buildBuses();
    this.startTime = ctx.currentTime + 0.12 - startBar * this.barDur;
    this.nextStep = startBar * STEPS;
    this.events = [];
    this.lastHit = {};
    this.finished = false;
    this.playing = true;
    this.ticker.start();
    this.tick();
  }

  stopPiece() {
    this.playing = false;
    this.ticker.stop();
    if (this.pieceGain) {
      const g = this.pieceGain, t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.02);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, 400);
      this.pieceGain = null;
    }
    this.events = [];
  }

  async pause() { if (this.ctx) await this.ctx.suspend(); }
  async resume() { if (this.ctx) await this.ctx.resume(); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }

  heardTime() {
    if (!this.ctx) return 0;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return this.ctx.currentTime - Math.min(lat, 0.1);
  }

  /** Musical position at audio time t. */
  position(t = this.heardTime()) {
    if (this.startTime === undefined || !this.composer) return null;
    const C = this.composer;
    const s = Math.max(0, (t - this.startTime) / this.stepDur);
    const bar = Math.floor(s / STEPS);
    const loopBar = bar % C.loopBars;
    return { stepF: s, step: Math.floor(s) % STEPS, bar, barF: s / STEPS, loopBar, loopBarF: (s / STEPS) % C.loopBars, loop: Math.floor(bar / C.loopBars), beatPhase: (s / 4) % 1, section: C.sectionAt(loopBar) };
  }

  // ── scheduler ───────────────────────────────────────────────
  tick() {
    if (!this.playing || !this.ctx || this.ctx.state !== 'running') return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    for (;;) {
      const tStep = this.startTime + this.nextStep * this.stepDur;
      if (tStep >= horizon) break;
      const bar = Math.floor(this.nextStep / STEPS), stepInBar = this.nextStep % STEPS;
      if (!this.loopMode && bar >= this.composer.loopBars) { this.finished = true; break; }   // one shot: the piece is over
      const evs = this.composer.bar(bar);
      const barStart = this.startTime + bar * this.barDur;
      for (const ev of evs) {
        if (Math.floor(ev.step) !== stepInBar) continue;
        const swing = (Math.floor(ev.step) % 2 === 1) ? this.swing : 0;
        const t = barStart + (ev.step + swing) * this.stepDur;
        if (t < this.ctx.currentTime - 0.01) continue;
        this.play(ev, Math.max(t, this.ctx.currentTime));
      }
      this.nextStep++;
    }
    const old = this.heardTime() - 2;
    while (this.events.length && this.events[0].time < old) this.events.shift();
  }

  drain(t) {
    const out = [];
    while (this.events.length && this.events[0].time <= t) out.push(this.events.shift());
    return out;
  }

  play(ev, t) {
    if (!this.pieceGain) return;
    const L = layerOf(ev.type);
    const fn = this['v_' + ev.type];
    if (fn) fn.call(this, t, ev, this.bus[L], L);
    if (L) this.lastHit[L] = t;
    const e = { ...ev, time: t, layer: L };
    let i = this.events.length; while (i > 0 && this.events[i - 1].time > t) i--;
    this.events.splice(i, 0, e);
  }

  panner(pan, dest) {
    if (!this.ctx.createStereoPanner) return dest;
    const p = this.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); p.connect(dest); return p;
  }

  // ── voices ──────────────────────────────────────────────────
  /** KICK — deep clean sine kick: fast pitch drop + a separate impulse transient (v1). */
  v_kick(t, ev, out) {
    const ctx = this.ctx, root = this.params.root;
    const end = Math.min(60, Math.max(44, root * 1.25));
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(end * 3.6, t);
    o.frequency.exponentialRampToValueAtTime(end * 1.35, t + 0.025);
    o.frequency.exponentialRampToValueAtTime(end, t + 0.09);
    const v = ev.vel * 0.95, d = Math.max(0.12, ev.decay);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.0025);
    g.gain.setTargetAtTime(v * 0.6, t + 0.02, 0.05);
    g.gain.setTargetAtTime(0, t + 0.06, d / 4);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + d + 0.3);
    if (!ev.ghost) {
      const s = ctx.createBufferSource(), gc = ctx.createGain();
      s.buffer = this.clickBufs[0]; gc.gain.value = 0.35 * ev.vel; s.connect(gc); gc.connect(out); s.start(t);
    }
  }

  /** SUB — pure low sine pressure (v1), optionally gliding very slowly to `to`. */
  v_sub(t, ev, out) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    const dur = ev.dur * this.barDur;
    o.type = 'sine'; o.frequency.setValueAtTime(ev.freq, t);
    if (ev.to && ev.to !== ev.freq) o.frequency.exponentialRampToValueAtTime(ev.to, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + Math.min(0.8, dur * 0.3));
    g.gain.setValueAtTime(ev.vel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  /** SUB (pulse) — a gated sub sine between the kicks: the insistent pressure line. */
  v_pulse(t, ev, out) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    const dur = ev.dur * this.stepDur;
    o.type = 'sine'; o.frequency.setValueAtTime(ev.freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + 0.006);
    g.gain.setValueAtTime(ev.vel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02);
  }

  /** CLICK — the v1 click palette. */
  v_click(t, ev, out, L) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = this.clickBufs[(ev.variant || 0) % this.clickBufs.length];
    g.gain.value = ev.vel * 0.55;
    s.connect(g); g.connect(this.panner(ev.pan, ev.crush ? this.crush[L] : out));
    s.start(t);
  }

  /** NOISE — a short, precisely gated band-passed noise burst (v1). */
  v_noise(t, ev, out) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf;
    f.type = 'bandpass'; f.frequency.value = Math.min(12000, ev.freq); f.Q.value = ev.q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + 0.001);
    g.gain.setValueAtTime(ev.vel, t + ev.dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + ev.dur);       // a gate, not a tail
    s.connect(f); f.connect(g); g.connect(this.panner(ev.pan, out));
    s.start(t, ((ev.x || 0) * 1.7) % 1.8, ev.dur + 0.02);
  }

  /** DATA — image rows played as waveforms (v1 stutter) or telephone dial pulses (v1 clicks, 10 pps). */
  v_data(t, ev, out, L) {
    const ctx = this.ctx;
    if (ev.kind === 'dial') {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2800; lp.connect(this.panner(ev.pan, out));
      const period = Math.min(0.1, this.stepDur * 0.75);
      for (let k = 0; k < ev.count; k++) {
        const s = ctx.createBufferSource(), g = ctx.createGain();
        s.buffer = this.clickBufs[k % 2 ? 1 : 0]; g.gain.value = ev.vel * (k % 2 ? 0.8 : 1);
        s.connect(g); g.connect(lp); s.start(t + k * period);
      }
      return;
    }
    const buf = (ev.crush ? this.dataBufsCrushed : this.dataBufs)[ev.row % this.dataBufs.length];
    const rate = ev.rate * this.stepDur;
    const p = this.panner(ev.pan, ev.crush ? this.crush[L] : out);
    for (let k = 0; k < ev.count; k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf;
      const tk = t + k * rate, len = Math.min(rate * 0.85, buf.duration);
      g.gain.setValueAtTime(ev.vel * (1 - k / ev.count * 0.6), tk); g.gain.setValueAtTime(0, tk + len);
      s.connect(g); g.connect(p); s.start(tk, 0, len);
    }
  }

  /** GLITCH — the white-flash sound: a click cluster + a crushed data slice + a 20 ms gated noise slab. */
  v_glitch(t, ev, out, L) {
    const ctx = this.ctx, rng = makeRng(Math.floor(t * 1000));
    const n = ev.big ? 9 : ev.storm ? 3 : 5;
    const p = this.panner(ev.big ? 0 : ev.pan, out);
    for (let k = 0; k < n; k++) {              // clicks at 1/64-ish spacing, hard and dry
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = this.clickBufs[k % 2 ? 0 : (rng() < 0.5 ? 1 : 3)];
      g.gain.value = ev.vel * (0.7 - k * 0.04);
      s.connect(g); g.connect(k % 3 === 2 ? this.crush[L] : p); s.start(t + k * 0.0075 + rng() * 0.002);
    }
    const buf = this.dataBufsCrushed[(ev.row || 0) % this.dataBufsCrushed.length];
    for (let k = 0; k < (ev.big ? 4 : 2); k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf; s.playbackRate.value = 2;
      const tk = t + 0.004 + k * 0.022;
      g.gain.setValueAtTime(ev.vel * 0.3, tk); g.gain.setValueAtTime(0, tk + 0.016);
      s.connect(g); g.connect(this.crush[L]); s.start(tk, rng() * buf.duration * 0.5, 0.02);
    }
    const ns = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), ng = ctx.createGain();
    ns.buffer = this.noiseBuf; hp.type = 'highpass'; hp.frequency.value = 2500;
    const slab = ev.big ? 0.06 : 0.02;
    ng.gain.setValueAtTime(ev.vel * (ev.big ? 0.45 : 0.3), t); ng.gain.setValueAtTime(0, t + slab);
    ns.connect(hp); hp.connect(ng); ng.connect(p); ns.start(t, rng() * 1.5, slab + 0.01);
  }

  /** HUM — the machine hum of the map: three faint low sine partials, breathing slowly. */
  v_hum(t, ev, out) {
    const ctx = this.ctx, dur = ev.dur * this.barDur, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + Math.min(2.5, dur * 0.4));
    g.gain.setValueAtTime(ev.vel, t + dur * 0.75); g.gain.linearRampToValueAtTime(0, t + dur + 0.6);
    const am = ctx.createGain(); am.gain.value = 1; am.connect(g); g.connect(out);
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.11 + (ev.freq % 7) * 0.02; lg.gain.value = 0.35; lfo.connect(lg); lg.connect(am.gain);
    [[1, 1], [2, 0.32], [3, 0.12]].forEach(([k, a]) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = ev.freq * k; og.gain.value = a;
      o.connect(og); og.connect(am); o.start(t); o.stop(t + dur + 0.7);
    });
    lfo.start(t); lfo.stop(t + dur + 0.7);
  }

  /** RESONANCE — a valley rings: a slow low/mid sine and a twin 0.6 Hz away (beating), never a blip. */
  v_res(t, ev, out) {
    const ctx = this.ctx, dur = ev.dur * this.barDur, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(this.panner((ev.x || 0.5) * 1.2 - 0.6, out));
    for (const d of [0, 0.6]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = Math.min(420, ev.freq) + d; o.connect(g); o.start(t); o.stop(t + dur + 0.05); }
  }

  /** SCANNER — the read head: a few dry micro-ticks (impulse / noise tick), band-passed at the
   *  column's brightness, sometimes bit-crushed. Fine, minimal, glitchy — no tone. */
  v_scanner(t, ev, out, L) {
    const ctx = this.ctx, bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = ev.freq; bp.Q.value = 1.4;
    bp.connect(this.panner(ev.pan, ev.crush ? this.crush[L] : out));
    for (let k = 0; k < ev.ticks; k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = this.clickBufs[k % 2]; g.gain.value = ev.vel * (1 - k * 0.18);
      s.connect(g); g.connect(bp); s.start(t + k * ev.gap);
    }
  }

  /** PRESSURE — deep sub pressure: two sines a fraction of a hertz apart (a slow beating), long swell,
   *  optional slow glide. Felt more than heard. */
  v_pressure(t, ev, out) {
    const ctx = this.ctx, dur = ev.dur * this.barDur, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + dur * (ev.attack ?? 0.5));
    g.gain.setValueAtTime(ev.vel, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(out);
    for (const d of [0, ev.beat ?? 0.35]) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(ev.freq + d, t);
      if (ev.to) o.frequency.exponentialRampToValueAtTime(ev.to + d, t + dur);
      o.connect(g); o.start(t); o.stop(t + dur + 0.05);
    }
  }

  /** FIELD — a data texture: the photo's pixel rows cut into 6–14 ms crushed slivers, fired in a
   *  precise irregular stream (Ikeda-like), band-limited. Never a bed: it starts and stops hard. */
  v_field(t, ev, out, L) {
    const ctx = this.ctx, bp = ctx.createBiquadFilter(), rng = makeRng(Math.floor(t * 997) ^ ev.row);
    bp.type = 'bandpass'; bp.frequency.value = ev.freq; bp.Q.value = 0.9;
    bp.connect(this.panner(ev.pan, out));
    const n = ev.count, span = ev.dur * this.stepDur;
    for (let k = 0; k < n; k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = this.dataBufsCrushed[(ev.row + Math.floor(rng() * 3)) % this.dataBufsCrushed.length];
      const tk = t + (k / n) * span + rng() * span / n * 0.4, len = 0.006 + rng() * 0.008;
      g.gain.setValueAtTime(ev.vel * (0.6 + 0.4 * rng()), tk); g.gain.setValueAtTime(0, tk + len);
      s.connect(g); g.connect(k % 3 === 2 ? this.crush[L] : bp); s.start(tk, rng() * s.buffer.duration * 0.8, len + 0.002);
    }
  }

  /** CRASH — the end: the image is consumed. Click cluster + crushed data slab + noise + a deep sub drop. */
  v_crash(t, ev, out, L) {
    const ctx = this.ctx;
    this.v_glitch(t, { big: true, vel: 1, pan: 0, row: 16 }, out, L);
    const ns = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), ng = ctx.createGain();
    ns.buffer = this.noiseBuf; lp.type = 'lowpass'; lp.frequency.setValueAtTime(8000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.4);
    ng.gain.setValueAtTime(0.5, t); ng.gain.setValueAtTime(0.5, t + 0.12); ng.gain.linearRampToValueAtTime(0, t + 0.45);
    ns.connect(lp); lp.connect(ng); ng.connect(out); ns.start(t, 0.2, 0.5);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(24, t + 2.2);
    og.gain.setValueAtTime(0, t); og.gain.linearRampToValueAtTime(0.9, t + 0.004); og.gain.setTargetAtTime(0, t + 0.1, 0.6);
    o.connect(og); og.connect(out); o.start(t); o.stop(t + 3);
  }

  /** TONE — one very low, soft sine interval (no attack transient), once. */
  v_tone(t, ev, out) {
    const ctx = this.ctx, dur = ev.dur * this.barDur, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + 1.8);
    g.gain.setValueAtTime(ev.vel, t + dur * 0.55); g.gain.linearRampToValueAtTime(0, t + dur);
    g.connect(out);
    ev.freqs.forEach((f, k) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f; og.gain.value = k ? 0.6 : 1;
      o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  /** Interaction: a whisper of a low sine under the cursor — brightness → pitch, movement → level. */
  hover(lum, speed) {
    if (!this.pieceGain || !this.bus.HAND) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (!this.hoverOsc || this.hoverOut !== this.pieceGain) {
      if (this.hoverOsc) { try { this.hoverOsc.stop(); } catch (e) { /* */ } }
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 60; g.gain.value = 0;
      o.connect(g); g.connect(this.bus.HAND); o.start();
      this.hoverOsc = o; this.hoverGain = g; this.hoverOut = this.pieceGain;
    }
    const root = this.params ? this.params.root : 40;
    this.hoverOsc.frequency.setTargetAtTime(root * (1.5 + lum * 2.5), t, 0.08);
    this.hoverGain.gain.setTargetAtTime(Math.min(0.035, speed * 0.02), t, speed > 0.05 ? 0.05 : 0.4);
  }

  /** Interaction: a soft click when the cursor crosses one of the photo's strong edges. */
  edgeClick(x, strength) {
    if (!this.pieceGain) return;
    this.v_click(this.ctx.currentTime + 0.003, { vel: 0.08 + 0.18 * Math.min(1, strength), pan: x * 1.8 - 0.9, variant: 2 }, this.bus.HAND, 'HAND');
  }
}
