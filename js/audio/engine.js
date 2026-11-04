// ─────────────────────────────────────────────────────────────
//  engine.js — Web Audio synthesis + sample-accurate scheduling.
//
//  A worker-driven clock wakes every 25 ms and schedules every step
//  that falls within the next 150 ms. Step times are computed from
//  the integer step index (start + n·stepDur), so there is no drift.
//  Every scheduled sound is also pushed onto a queue that the visuals
//  read against the audio clock — picture and sound stay locked.
// ─────────────────────────────────────────────────────────────
import { makeRng } from '../rng.js';
import { STEPS, LOOP_BARS, sectionAt } from './composer.js';

const LOOKAHEAD = 0.15;   // seconds scheduled ahead
const TICK_MS = 25;       // scheduler wake-up interval

// A tiny worker gives us a timer that is not throttled like setInterval on busy main threads.
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
    this.events = [];       // visual event queue (sorted by time)
    this.volume = 0.8;
    this.ticker = makeTicker(() => this.tick());
  }

  /** Must be called from a user gesture the first time (iOS). */
  ensureContext() {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* not supported */ }

    // master: volume → limiter → out (+ recording tap)
    this.master = ctx.createGain(); this.master.gain.value = this.volume;
    const lim = this.limiter = ctx.createDynamicsCompressor();
    lim.threshold.value = -4; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
    const trim = ctx.createGain(); trim.gain.value = 0.95;
    this.master.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
    this.recordDest = ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
    if (this.recordDest) trim.connect(this.recordDest);

    // bitcrush bus: staircase waveshaper (≈ 4 bit)
    this.crushBus = ctx.createWaveShaper();
    const curve = new Float32Array(4096);
    for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.round(x * 7) / 7; }
    this.crushBus.curve = curve;
    this.crushBus.connect(this.master);

    // "space" for sustained sines: a short, dark, dry-ish ping-pong — not a wash
    this.delayIn = ctx.createGain(); this.delayIn.gain.value = 0;
    const dl = ctx.createDelay(1.5), dr = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    const merger = ctx.createChannelMerger(2);
    lp.type = 'lowpass'; lp.frequency.value = 3800; fb.gain.value = 0.32;
    this.delayL = dl; this.delayR = dr;
    this.delayIn.connect(lp); lp.connect(dl); dl.connect(dr); dr.connect(fb); fb.connect(dl);
    dl.connect(merger, 0, 0); dr.connect(merger, 0, 1); merger.connect(this.master);

    this.buildBuffers();
    return ctx;
  }

  /** Resume + play one silent buffer: unlocks audio on iOS / Safari. */
  async unlock() {
    const ctx = this.ensureContext();
    try {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource();
      s.buffer = b; s.connect(ctx.destination); s.start(0);
    } catch (e) { /* ignore */ }
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
    return ctx.state === 'running';
  }

  get running() { return this.ctx && this.ctx.state === 'running'; }

  buildBuffers() {
    const ctx = this.ctx, sr = ctx.sampleRate, rng = makeRng(0xc0ffee);
    const mk = (len, fn) => { const b = ctx.createBuffer(1, len, sr), d = b.getChannelData(0); for (let i = 0; i < len; i++) d[i] = fn(i, i / sr); return b; };
    this.noiseBuf = mk(sr * 2, () => rng() * 2 - 1);
    this.clickBufs = [
      mk(64, (i) => (i === 0 ? 1 : i === 1 ? -0.7 : i < 6 ? (rng() - 0.5) * 0.2 : 0)),                    // impulse
      mk(Math.floor(sr * 0.0012), (i, t) => (rng() * 2 - 1) * Math.exp(-t * 4000)),                         // noise tick
      mk(Math.floor(sr * 0.002), (i, t) => Math.sin(2 * Math.PI * 6200 * t) * Math.exp(-t * 2200)),        // ringing 6.2k
      mk(Math.floor(sr * 0.003), (i, t) => (Math.sin(2 * Math.PI * 3100 * t) > 0 ? 0.6 : -0.6) * Math.exp(-t * 1400)), // square blip
    ];
  }

  /** Per photo: image rows become tiny waveforms for the data stutters. */
  loadPiece(composer, analysis, params) {
    this.composer = composer;
    this.params = params;
    const ctx = this.ensureContext(), sr = ctx.sampleRate;
    const { L, } = analysis.maps; const w = analysis.width, h = analysis.height;
    const rows = analysis.grid.rows;
    this.dataBufs = []; this.dataBufsCrushed = [];
    for (let r = 0; r < rows; r++) {
      const y = Math.min(h - 1, Math.floor((r + 0.5) / rows * h));
      const hold = 2, len = w * hold;
      let mean = 0; for (let x = 0; x < w; x++) mean += L[y * w + x]; mean /= w;
      const b = ctx.createBuffer(1, len, sr), c = ctx.createBuffer(1, len, sr);
      const d = b.getChannelData(0), dc = c.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const v = (L[y * w + Math.floor(i / hold)] - mean) * 2.4;
        d[i] = Math.max(-1, Math.min(1, v));
        const ci = Math.floor(i / 6) * 6; // sample-rate reduction
        dc[i] = Math.round(Math.max(-1, Math.min(1, (L[y * w + Math.floor(ci / hold)] - mean) * 3)) * 3) / 3;
      }
      this.dataBufs.push(b); this.dataBufsCrushed.push(c);
    }
    const bpm = params.bpm;
    this.stepDur = 60 / bpm / 4;
    this.barDur = this.stepDur * STEPS;
  }

  setStyle(style) { this.style = style; }

  start(startBar = 0) {
    const ctx = this.ensureContext();
    this.stopPiece();
    this.pieceGain = ctx.createGain(); this.pieceGain.connect(this.master);
    this.startTime = ctx.currentTime + 0.12 - startBar * this.barDur;
    this.nextStep = startBar * STEPS;
    this.events = [];
    this.playing = true;
    this.ticker.start();
    this.tick();
  }

  /** Fade out and drop everything belonging to the current piece. */
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

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  /** Audio time as heard (compensating output latency). */
  heardTime() {
    if (!this.ctx) return 0;
    const lat = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    return this.ctx.currentTime - Math.min(lat, 0.1);
  }

  /** Musical position at audio time t. */
  position(t = this.heardTime()) {
    if (!this.playing && this.startTime === undefined) return null;
    const s = Math.max(0, (t - this.startTime) / this.stepDur);
    const bar = Math.floor(s / STEPS);
    const loopBar = bar % LOOP_BARS;
    return { stepF: s, step: Math.floor(s) % STEPS, bar, loopBar, loop: Math.floor(bar / LOOP_BARS), beatPhase: (s / 4) % 1, section: sectionAt(loopBar) };
  }

  // ── scheduler ───────────────────────────────────────────────
  tick() {
    if (!this.playing || !this.ctx || this.ctx.state !== 'running') return;
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    while (true) {
      const tStep = this.startTime + this.nextStep * this.stepDur;
      if (tStep >= horizon) break;
      const bar = Math.floor(this.nextStep / STEPS), stepInBar = this.nextStep % STEPS;
      if (stepInBar === 0 || !this.barEvents || this.barEventsIndex !== bar) {
        this.barEvents = this.composer.bar(bar); this.barEventsIndex = bar;
        this.barStyle = this.composer.styleFor(bar % LOOP_BARS);
      }
      const barStart = this.startTime + bar * this.barDur;
      for (const ev of this.barEvents) {
        if (Math.floor(ev.step) !== stepInBar) continue;
        // swing delays every odd 16th (rolling feel in FLOW)
        const swing = (Math.floor(ev.step) % 2 === 1) ? this.barStyle.swing : 0;
        const t = barStart + (ev.step + swing) * this.stepDur;
        if (t < this.ctx.currentTime - 0.01) continue; // late (tab was frozen) → skip
        this.play(ev, Math.max(t, this.ctx.currentTime));
      }
      this.nextStep++;
    }
    // keep the visual queue short
    const old = this.heardTime() - 2;
    while (this.events.length && this.events[0].time < old) this.events.shift();
  }

  /** Visual events between two audio times. */
  drain(t) {
    const out = [];
    while (this.events.length && this.events[0].time <= t) out.push(this.events.shift());
    return out;
  }

  // ── voices ──────────────────────────────────────────────────
  play(ev, t) {
    const out = this.pieceGain; if (!out) return;
    switch (ev.type) {
      case 'kick': this.kick(t, ev, out); break;
      case 'sub': this.sub(t, ev, out); break;
      case 'click': this.click(t, ev, out); break;
      case 'sine': this.sine(t, ev, out); break;
      case 'noise': this.noise(t, ev, out); break;
      case 'stutter': this.stutter(t, ev, out); break;
    }
    // visual queue (kept sorted; events arrive almost in order)
    const e = { ...ev, time: t };
    let i = this.events.length; while (i > 0 && this.events[i - 1].time > t) i--;
    this.events.splice(i, 0, e);
  }

  panner(pan, dest) {
    const ctx = this.ctx;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0)); p.connect(dest); return p; }
    return dest;
  }

  /** Deep clean sub kick: sine with a fast pitch drop + tiny transient. */
  kick(t, ev, out) {
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

  sub(t, ev, out) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    const dur = ev.dur * this.barDur;
    o.type = 'sine'; o.frequency.setValueAtTime(ev.freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + Math.min(0.6, dur * 0.3));
    g.gain.setValueAtTime(ev.vel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  click(t, ev, out) {
    const ctx = this.ctx, s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = this.clickBufs[ev.variant % this.clickBufs.length];
    g.gain.value = ev.vel * 0.55;
    s.connect(g); g.connect(this.panner(ev.pan, ev.crush ? this.crushBus : out));
    s.start(t);
  }

  sine(t, ev, out) {
    const ctx = this.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(ev.freq, t);
    const a = ev.long ? 0.012 : 0.002;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + a);
    if (ev.long) { g.gain.setValueAtTime(ev.vel, t + ev.dur * 0.5); g.gain.linearRampToValueAtTime(0, t + ev.dur); }
    else g.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur);
    const p = this.panner(ev.pan, out);
    o.connect(g); g.connect(p);
    const space = this.barStyle ? this.barStyle.space : 0;
    if (space > 0.05 && ev.long) {
      const send = ctx.createGain(); send.gain.value = space * 0.7; g.connect(send); send.connect(this.delayIn);
      this.delayIn.gain.value = 1;
      const beat = this.stepDur * 3; this.delayL.delayTime.setValueAtTime(beat, t); this.delayR.delayTime.setValueAtTime(beat, t);
    }
    o.start(t); o.stop(t + ev.dur + 0.05);
  }

  noise(t, ev, out) {
    const ctx = this.ctx, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = this.noiseBuf;
    f.type = 'bandpass'; f.frequency.value = Math.min(14000, ev.freq); f.Q.value = ev.q;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(ev.vel, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ev.dur);
    s.connect(f); f.connect(g); g.connect(this.panner(ev.pan, ev.crush ? this.crushBus : out));
    const off = (ev.x * 1.7) % 1.8;
    s.start(t, off, ev.dur + 0.02);
  }

  stutter(t, ev, out) {
    const ctx = this.ctx;
    const buf = (ev.crush ? this.dataBufsCrushed : this.dataBufs)[ev.row % this.dataBufs.length];
    const rate = ev.rate * this.stepDur;
    const p = this.panner(ev.pan, ev.crush ? this.crushBus : out);
    for (let k = 0; k < ev.count; k++) {
      const s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = buf;
      const tk = t + k * rate, len = Math.min(rate * 0.85, buf.duration);
      g.gain.setValueAtTime(ev.vel * (1 - k / ev.count * 0.6), tk);
      g.gain.setValueAtTime(0, tk + len);
      s.connect(g); g.connect(p);
      s.start(tk, 0, len);
    }
  }
}
