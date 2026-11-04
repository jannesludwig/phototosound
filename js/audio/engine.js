// ─────────────────────────────────────────────────────────────
//  audio/engine.js — synthesis, mix and sample-accurate scheduling.
//
//  Scheduler: a worker clock wakes every 25 ms and schedules every
//  16th step that falls inside the next 150 ms. Step times come from
//  the integer step index (start + n·stepDur): no drift. Each event
//  of the score is played here AND pushed onto a queue the visuals
//  read against the same (latency-compensated) audio clock.
//
//  Mix: drums ─┐
//       bass ──┤ (mono, ducked, saturated)
//       pads ──┤ (HP 140, LP sweep, ducked, dark reverb send)
//       tex ───┤ (HP 300, ducked)
//       fx ────┴─► master → HP 25 → tanh → limiter → out (+ recorder)
//  Tonal content stays below ~1.5 kHz; highs are only transients/noise.
// ─────────────────────────────────────────────────────────────
import { makeRng, hashInts } from '../rng.js';
import { STEPS } from '../score.js';

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

const tanhCurve = (drive, n = 2048) => { const c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); } return c; };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.playing = false;
    this.events = [];
    this.volume = 0.8;
    this.ticker = makeTicker(() => this.tick());
  }

  ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* */ }

    // master chain
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 25; hp.Q.value = 0.7;
    const sat = ctx.createWaveShaper(); sat.curve = tanhCurve(1.25); sat.oversample = '2x';
    const lim = this.limiter = ctx.createDynamicsCompressor();
    lim.threshold.value = -9; lim.knee.value = 3; lim.ratio.value = 14; lim.attack.value = 0.003; lim.release.value = 0.16;
    const trim = ctx.createGain(); trim.gain.value = 0.85;
    this.master.connect(hp); hp.connect(sat); sat.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
    this.recordDest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.recordDest) trim.connect(this.recordDest);

    // generated dark reverb (pads, tone, a little of the rims)
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeIR(3.2);
    this.reverbIn = ctx.createGain(); this.reverbIn.gain.value = 1;
    const revOut = ctx.createGain(); revOut.gain.value = 0.55;
    this.reverbIn.connect(this.reverb); this.reverb.connect(revOut); revOut.connect(this.master);

    // dub-ish filtered ping-pong for rims / pad stabs
    this.delayIn = ctx.createGain();
    const dl = this.delayL = ctx.createDelay(2), dr = this.delayR = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), merger = ctx.createChannelMerger(2);
    lp.type = 'lowpass'; lp.frequency.value = 2200; fb.gain.value = 0.38;
    this.delayIn.connect(lp); lp.connect(dl); dl.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1);
    const dOut = ctx.createGain(); dOut.gain.value = 0.5; merger.connect(dOut); dOut.connect(this.master);

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

  /** Stereo impulse response: decaying noise, darkened as it decays (underwater depth). */
  makeIR(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, len = Math.floor(sr * sec), rng = makeRng(0x1e5);
    const b = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len, k = 0.25 + 0.7 * (1 - t);              // the tail gets darker
        lp += (rng() * 2 - 1 - lp) * k * 0.35;
        d[i] = lp * Math.pow(1 - t, 2.4) * (i < sr * 0.012 ? i / (sr * 0.012) : 1);
      }
    }
    return b;
  }

  buildBuffers() {
    const ctx = this.ctx, sr = ctx.sampleRate, rng = makeRng(0xc0ffee);
    const mk = (len, fn, ch = 1) => { const b = ctx.createBuffer(ch, len, sr); for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = fn(i, i / sr, c); } return b; };
    this.noiseBuf = mk(sr * 2, () => rng() * 2 - 1);
    // the bright glitch clicks (kept from round 1)
    this.clickBufs = [
      mk(64, (i) => (i === 0 ? 1 : i === 1 ? -0.7 : i < 6 ? (rng() - 0.5) * 0.2 : 0)),
      mk(Math.floor(sr * 0.0012), (i, t) => (rng() * 2 - 1) * Math.exp(-t * 4000)),
      mk(Math.floor(sr * 0.002), (i, t) => Math.sin(2 * Math.PI * 6200 * t) * Math.exp(-t * 2200)),
      mk(Math.floor(sr * 0.003), (i, t) => (Math.sin(2 * Math.PI * 3100 * t) > 0 ? 0.6 : -0.6) * Math.exp(-t * 1400)),
    ];
    // crackle: sparse impulses of random size
    let lpc = 0;
    this.crackleBuf = mk(sr * 3, () => { const imp = rng() < 0.0009 ? (rng() * 2 - 1) * (0.3 + rng() * 0.7) : rng() < 0.004 ? (rng() - 0.5) * 0.15 : 0; lpc += (imp - lpc) * 0.6; return lpc; }, 2);
    // bitcrushed hiss: sample-and-hold (rate reduction) + 4-bit quantisation
    let hold = 0;
    this.hissBuf = mk(sr * 2, (i) => { if (i % 7 === 0) hold = Math.round((rng() * 2 - 1) * 7) / 7; return hold * 0.6; }, 2);
  }

  /** Per photo: image rows become tiny waveforms (stutters, grains, cursor scrub). */
  loadPiece(piece, analysis) {
    this.piece = piece;
    const ctx = this.ensureContext(), sr = ctx.sampleRate;
    const { L } = analysis.maps, w = analysis.width, h = analysis.height, rows = 32;
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
    this.stepDur = piece.stepDur;
    this.barDur = piece.barDur;
    this.swing = piece.swing;
  }

  /** Per-piece buses (dropped as a whole when a new photo arrives). */
  buildBuses() {
    const ctx = this.ctx;
    const G = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
    const out = this.pieceOut = G(0.72); out.connect(this.master);
    this.bus = {};
    this.bus.drums = G(0.95); this.bus.drums.connect(out);
    // bass: mono, ducked, low-passed, saturated
    this.duckBass = G(1); const bassLP = ctx.createBiquadFilter(); bassLP.type = 'lowpass'; bassLP.frequency.value = 1100;
    const bassSat = ctx.createWaveShaper(); bassSat.curve = tanhCurve(1.8); bassSat.oversample = '2x';
    this.bus.bass = G(0.8); this.bus.bass.channelCount = 1; this.bus.bass.channelCountMode = 'explicit';
    this.bus.bass.connect(bassSat); bassSat.connect(bassLP); bassLP.connect(this.duckBass); this.duckBass.connect(out);
    // pads: HP 140, cursor-swept LP, ducked, reverb send
    this.duckPad = G(1); const padHP = ctx.createBiquadFilter(); padHP.type = 'highpass'; padHP.frequency.value = 140;
    this.padLP = ctx.createBiquadFilter(); this.padLP.type = 'lowpass'; this.padLP.frequency.value = 1400; this.padLP.Q.value = 0.9;
    this.bus.pad = G(1.0); this.bus.pad.connect(padHP); padHP.connect(this.padLP); this.padLP.connect(this.duckPad); this.duckPad.connect(out);
    const padSend = G(0.5); this.padLP.connect(padSend); padSend.connect(this.reverbIn);
    // textures: HP 300, ducked, same cursor LP
    this.duckTex = G(1); const texHP = ctx.createBiquadFilter(); texHP.type = 'highpass'; texHP.frequency.value = 300;
    this.texLP = ctx.createBiquadFilter(); this.texLP.type = 'lowpass'; this.texLP.frequency.value = 7000;
    this.bus.tex = G(0.7); this.bus.tex.connect(texHP); texHP.connect(this.texLP); this.texLP.connect(this.duckTex); this.duckTex.connect(out);
    this.bus.fx = G(0.8); this.bus.fx.connect(out);
    // bitcrush stage for crushed events
    this.crush = ctx.createWaveShaper(); const cc = new Float32Array(4096); for (let i = 0; i < 4096; i++) { const x = i / 4095 * 2 - 1; cc[i] = Math.round(x * 7) / 7; } this.crush.curve = cc; this.crush.connect(this.bus.drums);
  }

  start(startBar = 0) {
    const ctx = this.ensureContext();
    this.stopPiece();
    this.buildBuses();
    this.startTime = ctx.currentTime + 0.12 - startBar * this.barDur;
    this.nextStep = startBar * STEPS;
    this.events = [];
    this.barCache = new Map();
    this.playing = true;
    this.ticker.start();
    this.tick();
  }

  stopPiece() {
    this.playing = false;
    this.ticker.stop();
    if (this.pieceOut) {
      const g = this.pieceOut, t = this.ctx.currentTime;
      g.gain.setTargetAtTime(0, t, 0.02);
      setTimeout(() => { try { g.disconnect(); } catch (e) { /* */ } }, 500);
      this.pieceOut = null;
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
  /** Position in bars (float) at audio time t. */
  barsAt(t = this.heardTime()) { return Math.max(0, (t - this.startTime) / this.barDur); }

  // ── scheduler ───────────────────────────────────────────────
  tick() {
    if (!this.playing || !this.ctx || this.ctx.state !== 'running') return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    for (;;) {
      const tStep = this.startTime + this.nextStep * this.stepDur;
      if (tStep >= horizon) break;
      const bar = Math.floor(this.nextStep / STEPS), stepInBar = this.nextStep % STEPS;
      let evs = this.barCache.get(bar);
      if (!evs) { evs = this.piece.bar(bar); this.barCache.set(bar, evs); if (this.barCache.size > 8) this.barCache.delete(this.barCache.keys().next().value); }
      const barStart = this.startTime + bar * this.barDur;
      for (const ev of evs) {
        if (Math.floor(ev.step) !== stepInBar) continue;
        const swing = (Math.floor(ev.step) % 2 === 1) ? this.swing : 0;
        // micro-timing: hats lay back, rims push, a seeded breath of humanisation
        const micro = ev.type === 'hat' ? 0.003 : ev.type === 'rim' ? -0.002 : 0;
        const human = (ev.type === 'hat' || ev.type === 'click') ? ((hashInts(bar, ev.step * 4 | 0) % 1000) / 1000 - 0.5) * 0.004 : 0;
        const t = barStart + (ev.step + swing) * this.stepDur + micro + human;
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
    if (!this.pieceOut) return;
    const fn = this['v_' + ev.type];
    if (fn) fn.call(this, t, ev);
    const e = { ...ev, time: t };
    let i = this.events.length; while (i > 0 && this.events[i - 1].time > t) i--;
    this.events.splice(i, 0, e);
  }

  // ── helpers ─────────────────────────────────────────────────
  pan(p, dest) {
    if (!this.ctx.createStereoPanner) return dest;
    const n = this.ctx.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p || 0)); n.connect(dest); return n;
  }
  env(g, t, a, peak, d, curve = 'exp') {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    if (curve === 'exp') g.gain.setTargetAtTime(0, t + a, d / 4);
    else g.gain.linearRampToValueAtTime(0, t + a + d);
  }
  noiseSrc(t, dur, offset = 0) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.start(t, offset % 1.8, dur + 0.05); return s;
  }
  /** Sidechain: duck pads / textures / bass at each kick (no native sidechain in Web Audio). */
  duck(t, amount = 1) {
    for (const [g, depth, rel] of [[this.duckPad, 0.32, 0.2], [this.duckTex, 0.45, 0.15], [this.duckBass, 0.7, 0.09]]) {
      const d = 1 - (1 - depth) * amount;
      g.gain.setTargetAtTime(d, t, 0.004);
      g.gain.setTargetAtTime(1, t + 0.035, rel / 3);
    }
  }

  // ── voices (v_<event type>) ─────────────────────────────────
  v_kick(t, ev) {
    const ctx = this.ctx, root = this.piece.root;
    const ch = ev.char || 'deep';
    const end = Math.min(60, Math.max(44, root * (root < 46 ? 1.25 : 1)));
    const P = { deep: [3.2, 0.03, 0.62, 0.0025], tight: [4.2, 0.018, 0.24, 0.0015], soft: [2.6, 0.04, 0.36, 0.006] }[ch];
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(end * P[0], t);
    o.frequency.exponentialRampToValueAtTime(end * 1.3, t + P[1]);
    o.frequency.exponentialRampToValueAtTime(end, t + P[1] * 3.5);
    const v = ev.vel * (ev.soft ? 0.6 : 0.95);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + P[3]);
    g.gain.setTargetAtTime(v * 0.65, t + 0.02, 0.04);
    g.gain.setTargetAtTime(0, t + 0.06, P[2] / 4);
    o.connect(g); g.connect(this.bus.drums);
    o.start(t); o.stop(t + P[2] + 0.4);
    if (!ev.ghost && ch !== 'soft') {
      const s = ctx.createBufferSource(), gc = ctx.createGain();
      s.buffer = this.clickBufs[0]; gc.gain.value = (ch === 'tight' ? 0.45 : 0.3) * ev.vel; s.connect(gc); gc.connect(this.bus.drums); s.start(t);
    }
    if (!ev.ghost) this.duck(t, ev.soft ? 0.5 : 1);
  }

  v_sub(t, ev) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    const dur = ev.dur * this.barDur;
    o.type = 'sine'; o.frequency.setValueAtTime(ev.freq, t);
    o2.type = 'sine'; o2.frequency.setValueAtTime(ev.freq * 2, t); g2.gain.value = 0.12;   // a whisper of 2nd harmonic: audible on small speakers
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + Math.min(1.2, dur * 0.3));
    g.gain.setValueAtTime(ev.vel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(this.bus.bass);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }

  /** Low 2-operator FM bass; the stroke's shape is its phrase. */
  v_bass(t, ev) {
    const ctx = this.ctx, f = ev.freq, dur = ev.dur * this.stepDur;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    const ratio = this.piece.f.flow > 0.4 ? 0.5 : this.piece.f.lineStrength > 0.5 ? 2 : 1;
    car.type = 'sine'; car.frequency.setValueAtTime(f, t);
    mod.type = 'sine'; mod.frequency.setValueAtTime(f * ratio, t);
    const idx = 1.2 + (ev.cutoff - 260) / 640 * 2.5;
    mg.gain.setValueAtTime(f * idx, t); mg.gain.setTargetAtTime(f * 0.25, t, Math.max(0.03, dur * 0.3));
    mod.connect(mg); mg.connect(car.frequency);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(Math.min(900, ev.cutoff * 1.6), t); lp.frequency.setTargetAtTime(Math.min(900, ev.cutoff), t, 0.05); lp.Q.value = 2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel * 0.55, t + 0.006);
    g.gain.setValueAtTime(ev.vel * 0.5, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
    car.connect(lp); lp.connect(g); g.connect(this.bus.bass);
    // sine sub an octave below for weight
    const s = ctx.createOscillator(), sg = ctx.createGain();
    s.type = 'sine'; s.frequency.setValueAtTime(f / 2, t);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(ev.vel * 0.35, t + 0.01); sg.gain.setValueAtTime(ev.vel * 0.3, t + dur * 0.85); sg.gain.linearRampToValueAtTime(0, t + dur + 0.05);
    s.connect(sg); sg.connect(this.bus.bass);
    for (const o of [car, mod, s]) { o.start(t); o.stop(t + dur + 0.1); }
  }

  /** Digital rim / "laser": a very short pitched burst (mid range) + noise tick. */
  v_rim(t, ev) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    const f = Math.min(1500, ev.freq);
    o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.7, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.008);
    this.env(g, t, 0.0008, ev.vel * 0.42, 0.045);
    const p = this.pan(ev.pan, this.bus.drums);
    o.connect(g); g.connect(p);
    const send = ctx.createGain(); send.gain.value = 0.18; g.connect(send); send.connect(this.delayIn);
    this.delayL.delayTime.setValueAtTime(this.stepDur * 3, t); this.delayR.delayTime.setValueAtTime(this.stepDur * 3, t);
    o.start(t); o.stop(t + 0.12);
    const n = this.noiseSrc(t, 0.01, ev.x * 1.3), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 1.4;
    this.env(ng, t, 0.0005, ev.vel * 0.25, 0.006);
    n.connect(bp); bp.connect(ng); ng.connect(p);
  }

  v_click(t, ev) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = this.clickBufs[(ev.variant || 0) % this.clickBufs.length];
    g.gain.value = ev.vel * (ev.reveal ? 0.5 : 0.55);
    s.connect(g); g.connect(this.pan(ev.pan, ev.crush ? this.crush : this.bus.drums));
    s.start(t);
  }

  v_snare(t, ev) {
    const ctx = this.ctx, bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.value = ev.clap ? 1500 : 2100; bp.Q.value = ev.clap ? 1.1 : 0.7;
    const n = this.noiseSrc(t, 0.3, t * 0.37);
    if (ev.clap) { // three spikes 10 ms apart, then the tail
      g.gain.setValueAtTime(0, t);
      for (let k = 0; k < 3; k++) { g.gain.setValueAtTime(ev.vel * 0.5, t + k * 0.01); g.gain.setTargetAtTime(ev.vel * 0.1, t + k * 0.01 + 0.001, 0.003); }
      g.gain.setValueAtTime(ev.vel * 0.42, t + 0.03); g.gain.setTargetAtTime(0, t + 0.031, 0.045);
    } else this.env(g, t, 0.001, ev.vel * 0.5, 0.17);
    n.connect(bp); bp.connect(g); g.connect(this.bus.drums);
    const send = ctx.createGain(); send.gain.value = 0.12; g.connect(send); send.connect(this.reverbIn);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    this.env(og, t, 0.001, ev.vel * 0.3, 0.07); o.connect(og); og.connect(this.bus.drums); o.start(t); o.stop(t + 0.2);
  }

  v_hat(t, ev) {
    const ctx = this.ctx, hp = ctx.createBiquadFilter(), g = ctx.createGain();
    hp.type = 'highpass'; hp.frequency.value = 7200;
    const d = ev.open ? 0.13 : 0.028;
    const n = this.noiseSrc(t, d + 0.05, ev.x * 1.7);
    this.env(g, t, 0.0007, ev.vel * 0.4, d);
    n.connect(hp); hp.connect(g); g.connect(this.pan(ev.pan, this.bus.drums));
  }

  /** Low, warm, slow pad: chords from the colour regions. Never sweet. */
  v_pad(t, ev) {
    const ctx = this.ctx, dur = ev.dur * this.barDur;
    const lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(ev.cutoff * 0.6, t); lp.frequency.linearRampToValueAtTime(ev.cutoff, t + dur * 0.5); lp.Q.value = 0.6;
    const atk = Math.min(dur * 0.4, 1.6 + (1 - (ev.warm ?? 0.5)) * 1.8);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + atk); g.gain.setValueAtTime(ev.vel, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    lp.connect(g); g.connect(this.bus.pad);
    ev.freqs.forEach((f, k) => {
      for (const [type, det, pan] of [[ev.warm > 0.55 ? 'triangle' : 'sawtooth', -7, -0.45], ['sawtooth', 6, 0.45]]) {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(f, t); o.detune.setValueAtTime(det + (k % 2 ? 3 : -3), t);
        og.gain.value = 0.62 / ev.freqs.length * (type === 'triangle' ? 1.6 : 1);
        o.connect(og); og.connect(this.pan(pan * (k % 2 ? 1 : 0.6), lp));
        o.start(t); o.stop(t + dur + 1.3);
      }
    });
  }

  v_tone(t, ev) {
    const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    o.type = 'sine'; o.frequency.value = ev.freq; o2.type = 'triangle'; o2.frequency.value = ev.freq; o2.detune.value = 4;
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const dur = ev.dur * this.barDur;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + 0.6); g.gain.setTargetAtTime(0, t + 1, dur / 4);
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(this.bus.fx);
    const send = ctx.createGain(); send.gain.value = 0.8; lp.connect(send); send.connect(this.reverbIn);
    o.start(t); o2.start(t); o.stop(t + dur + 1); o2.stop(t + dur + 1);
  }

  v_tex(t, ev) {
    const ctx = this.ctx, dur = ev.dur * this.barDur;
    if (ev.kind === 'grain') { this.grains(t, dur, ev); return; }
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = ev.kind === 'crackle' ? this.crackleBuf : this.hissBuf; s.loop = true;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(ev.vel, t + 0.3); g.gain.setValueAtTime(ev.vel, t + dur - 0.3); g.gain.linearRampToValueAtTime(0, t + dur);
    if (ev.kind === 'hiss') { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.5; s.connect(bp); bp.connect(g); } else s.connect(g);
    g.connect(this.bus.tex);
    s.start(t, (t * 0.731) % 1.5); s.stop(t + dur + 0.05);
  }

  /** Granular cloud from an image row (Hann-windowed grains). */
  grains(t, dur, ev, count = 18) {
    const ctx = this.ctx, buf = this.dataBufs[(ev.row || 0) % this.dataBufs.length];
    const rng = makeRng(hashInts(Math.floor(t * 100), ev.row || 0));
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400; lp.connect(this.pan(ev.pan, this.bus.tex));
    for (let k = 0; k < count; k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf; s.playbackRate.value = 0.35 + rng() * 0.5;
      const tk = t + rng() * dur, len = 0.02 + rng() * 0.03;
      g.gain.setValueAtTime(0, tk); g.gain.linearRampToValueAtTime(ev.vel, tk + len / 2); g.gain.linearRampToValueAtTime(0, tk + len);
      s.connect(g); g.connect(lp); s.start(tk, rng() * buf.duration * 0.8, len + 0.01);
    }
  }

  v_stutter(t, ev) {
    const ctx = this.ctx, buf = (ev.crush ? this.dataBufsCrushed : this.dataBufs)[ev.row % this.dataBufs.length];
    const rate = ev.rate * this.stepDur;
    const p = this.pan(ev.pan, ev.crush ? this.crush : this.bus.drums);
    for (let k = 0; k < ev.count; k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf; s.playbackRate.value = 0.5;   // an octave down: grit, not whistle
      const tk = t + k * rate, len = Math.min(rate * 0.85, buf.duration * 2);
      g.gain.setValueAtTime(ev.vel * (1 - k / ev.count * 0.6), tk); g.gain.setValueAtTime(0, tk + len);
      s.connect(g); g.connect(p); s.start(tk, 0, len);
    }
  }

  /** A structure appears: a soft tick in the mid range (stroke) or a low blip (contour level). */
  v_reveal(t, ev) {
    const ctx = this.ctx;
    if (ev.what === 'level') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = Math.min(400, ev.freq);
      this.env(g, t, 0.01, ev.vel * 0.5, 0.9);
      o.connect(g); g.connect(this.bus.fx);
      const send = ctx.createGain(); send.gain.value = 0.6; g.connect(send); send.connect(this.reverbIn);
      o.start(t); o.stop(t + 1.2);
      return;
    }
    this.v_rim(t, { ...ev, vel: ev.vel * 0.6, freq: Math.min(900, ev.freq) });
  }

  v_detach(t, ev) {
    const ctx = this.ctx, n = this.noiseSrc(t, 0.08, ev.x), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(ev.freq * 3, t); bp.frequency.exponentialRampToValueAtTime(ev.freq, t + 0.06); bp.Q.value = 6;
    this.env(g, t, 0.001, ev.vel * 0.5, 0.06);
    n.connect(bp); bp.connect(g); g.connect(this.pan(ev.pan, this.bus.tex));
  }

  v_fracture(t, ev) {
    const ctx = this.ctx, n = this.noiseSrc(t, 0.25, ev.x * 0.9), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.frequency.setValueAtTime(2400, t); bp.frequency.exponentialRampToValueAtTime(380, t + 0.18); bp.Q.value = 2.5;
    this.env(g, t, 0.002, ev.vel * 0.5, 0.16);
    n.connect(bp); bp.connect(g); g.connect(this.pan(ev.pan, this.bus.tex));
  }

  /** Peak impact: noise slab + sub drop + click, then black. */
  v_flash(t) {
    const ctx = this.ctx, n = this.noiseSrc(t, 0.8, 0.3), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(9000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.5);
    this.env(g, t, 0.001, 0.5, 0.45);
    n.connect(lp); lp.connect(g); g.connect(this.bus.fx);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.1);
    this.env(og, t, 0.002, 0.9, 1.2); o.connect(og); og.connect(this.bus.drums); o.start(t); o.stop(t + 1.6);
    const s = ctx.createBufferSource(), sg = ctx.createGain(); s.buffer = this.clickBufs[0]; sg.gain.value = 0.9; s.connect(sg); sg.connect(this.bus.drums); s.start(t);
  }

  // ── cursor: scrub, edge clicks, filter sweep ────────────────
  cursor(x, y, speed) {
    if (!this.pieceOut || !this.dataBufs) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const open = Math.min(1, speed / 1800);
    this.padLP.frequency.setTargetAtTime(1400 + open * 2600, t, 0.08);
    this.texLP.frequency.setTargetAtTime(7000 + open * 6000, t, 0.08);
    if (speed > 180) this.grains(t + 0.005, 0.06, { row: Math.floor(y * 31), vel: Math.min(0.08, speed / 30000), pan: x * 1.6 - 0.8 }, 2);
  }
  cursorIdle() {
    if (!this.padLP) return;
    const t = this.ctx.currentTime;
    this.padLP.frequency.setTargetAtTime(1400, t, 0.4); this.texLP.frequency.setTargetAtTime(7000, t, 0.4);
  }
  edgeClick(x, strength) {
    if (!this.pieceOut) return;
    this.v_click(this.ctx.currentTime + 0.003, { vel: 0.15 + 0.35 * Math.min(1, strength), pan: x * 1.8 - 0.9, variant: 2 });
  }
}
