// ─────────────────────────────────────────────────────────────
//  main.js — the experience: landing → reading → playing.
//  Wires analysis, the composer, the audio engine and the visuals,
//  and draws the thin 2D overlay (scan line, read-head, observer).
// ─────────────────────────────────────────────────────────────
import { analyzeImage, rasterize } from './analysis.js';
import { preloadFaceDetector, detectFace } from './face.js';
import { chooseWorlds, pieceParams, WORLDS } from './worlds.js';
import { Composer, readWindow, LOOP_BARS, VOID_BAR, SECTIONS, STEPS } from './audio/composer.js';
import { AudioEngine } from './audio/engine.js';
import { Visuals } from './visuals/engine.js';
import { Recorder } from './recorder.js';
import { DEMOS } from './demo.js';
import { smoothstep, clamp } from './rng.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;
const quality = { mobile };

const audio = new AudioEngine();
const visuals = new Visuals($('gl'), quality);
const recorder = new Recorder();
const overlay = $('overlay'), octx = overlay.getContext('2d');

// app state
const app = {
  state: 'landing',
  analysis: null, choice: null, params: null, composer: null,
  intro: 0, readT: 0, readDur: 3.6, form: 0, energy: 0,
  manualWorld: null, paused: false, ticks: [],
  lastMove: 0, pointer: { x: 0, y: 0, active: false, touch: false },
  generation: 0,
};

const hashParams = new URLSearchParams(location.hash.slice(1));

// ── setup ──────────────────────────────────────────────────
function setState(s) {
  app.state = s;
  body.classList.remove('state-landing', 'state-reading', 'state-playing');
  body.classList.add('state-' + s);
}

function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  overlay.width = innerWidth * dpr; overlay.height = innerHeight * dpr;
  overlay.style.width = innerWidth + 'px'; overlay.style.height = innerHeight + 'px';
  octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  visuals.resize();
  placeReadout();
}
addEventListener('resize', resize);
resize();

// preload the face detector while the visitor looks at the empty screen
setTimeout(() => preloadFaceDetector(), 600);

// ── input: file / drop / demo ──────────────────────────────
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
$('drop').addEventListener('click', () => audio.unlock());      // gesture → unlock audio early (iOS)
$('drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) body.classList.remove('dragging'); });
addEventListener('drop', (e) => {
  e.preventDefault(); body.classList.remove('dragging');
  const f = [...(e.dataTransfer?.files || [])].find((x) => /image\/(jpeg|png)/.test(x.type));
  if (f) loadFile(f);
});
document.querySelectorAll('#demo button').forEach((b) => b.addEventListener('click', () => {
  audio.unlock();
  const d = DEMOS[+b.dataset.demo];
  begin(d.make(), d.name, demoBytes(d));
}));
const demoBytes = (d) => new TextEncoder().encode('photo-to-sound/demo/' + d.name);

async function loadFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const bytes = new Uint8Array(await file.arrayBuffer());
    begin(img, file.name.replace(/\.[^.]+$/, ''), bytes);
  } catch (e) {
    console.warn('could not read image', e);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

// ── reading ────────────────────────────────────────────────
async function begin(src, name, signatureBytes = null) {
  const gen = ++app.generation;
  audio.stopPiece();
  if (recorder.active) await stopRecording();
  app.name = name;
  // the texture (sharp) and the analysis copy (small)
  const texCanvas = rasterize(src, mobile ? 1536 : 2048);
  const analysis = analyzeImage(texCanvas, signatureBytes);
  app.analysis = analysis; app.choice = null; app.composer = null;
  app.intro = 0; app.form = 0; app.readT = 0; app.paused = false; app.manualWorld = hashParams.get('world');
  visuals.setPhoto(analysis, texCanvas);
  $('b-play').textContent = 'pause';
  $('r-sig').textContent = 'sig ' + analysis.signature;
  setState('reading');
  placeReadout();
  readoutLines = []; renderReadout();

  // face detection runs on a ≤640px copy while the scan line passes
  const faceCanvas = rasterize(src, 640);
  const [face] = await Promise.all([detectFace(faceCanvas), wait(app.readDur * 1000)]);
  if (gen !== app.generation) return;
  Object.assign(analysis.features, face);
  pushReadout(subjectLine(analysis.features));

  // the world this photograph chooses
  const choice = chooseWorlds(analysis.features, analysis.seed);
  if (app.manualWorld && WORLDS.includes(app.manualWorld)) overrideChoice(choice, app.manualWorld);
  const params = pieceParams(analysis, choice);
  app.choice = choice; app.params = params;
  await wait(500);
  if (gen !== app.generation) return;
  pushReadout(`world: <span class="hot">${choice.primary} × ${choice.secondary}</span>`);
  $('r-bpm').textContent = params.bpm.toFixed(1) + ' BPM';
  $('r-hz').textContent = params.root.toFixed(2) + ' Hz';
  updateWorldLabel();
  await wait(1100);
  if (gen !== app.generation) return;

  app.composer = new Composer(analysis, params, choice.primary, choice.secondary, choice.accent);
  audio.loadPiece(app.composer, analysis, params);
  visuals.beginWorlds(params, choice);

  if (!audio.running) {           // dropped without a gesture (or iOS) → ask for one tap
    const ok = await audio.unlock();
    if (!ok) { $('prompt').hidden = false; await new Promise((res) => { app.awaitTap = res; }); $('prompt').hidden = true; }
  }
  if (gen !== app.generation) return;
  const startBar = +(hashParams.get('bar') || 0);   // debug: jump into the piece
  if (startBar) app.form = 1;
  audio.start(startBar);
  setState('playing');
  showUI();
}

function overrideChoice(choice, world) {
  if (choice.primary === world) return;
  const second = choice.primary;
  choice.secondary = second; choice.primary = world;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// readout lines appear while the scan line passes
let readoutLines = [];
function pushReadout(html) { readoutLines.push(html); renderReadout(); }
function renderReadout() { $('readout').innerHTML = readoutLines.join('\n'); }
function placeReadout() {
  const el = $('readout');
  if (!visuals.photo) return;
  const r = visuals.imageRect();
  const right = innerWidth - (r.x + r.w), below = innerHeight - (r.y + r.h);
  el.classList.remove('inset');
  if (right >= 200) { el.style.left = (r.x + r.w + 18) + 'px'; el.style.top = r.y + 'px'; }
  else if (below >= 175) { el.style.left = r.x + 'px'; el.style.top = (r.y + r.h + 22) + 'px'; }
  else { el.classList.add('inset'); el.style.left = (r.x + 10) + 'px'; el.style.top = (r.y + 10) + 'px'; } // over the photo
}
const fmt = (x) => x.toFixed(2);
function subjectLine(f) {
  return f.face > 0 ? `subject: <span class="hot">face ${fmt(f.face)}</span>` : `subject: ${f.organic > 0.35 ? 'organic ' + fmt(f.organic) : 'none'}`;
}
// short lines revealed at scan progress p
function readingLines(a) {
  const f = a.features;
  const pal = a.palette.map((c) => `<i class="sw" style="background:rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})"></i>`).join('');
  return [
    [0.02, `signature: <span class="hot">${a.signature}</span>`],
    [0.13, `luminance: ${fmt(f.brightness)} · contrast ${fmt(f.contrast)}`],
    [0.25, `structure: ${f.lineStrength > 0.4 ? 'linear' : 'diffuse'} ${fmt(f.lineStrength)} ${f.lineOrientation === 'h' ? '—' : '|'}`],
    [0.37, `luminance points: ${f.pointCount}`],
    [0.49, `radial: ${fmt(f.circularity)} · flow ${fmt(f.flow)}`],
    [0.61, `gradient: ${f.smoothness > 0.5 ? 'smooth' : 'textured'} ${fmt(f.smoothness)}`],
    [0.73, `flatness: ${fmt(f.flatness)} · colours ${f.colorCount}`],
    [0.85, `palette: ${pal}`],
  ];
}

// ── observation + UI visibility ────────────────────────────
let uiTimer = 0, obsTimer = 0;
function showUI() {
  body.classList.add('ui');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { if (!$('controls').matches(':hover') && $('worlds').hidden) body.classList.remove('ui'); }, 2600);
}
function onPointer(e, active) {
  app.pointer.x = e.clientX; app.pointer.y = e.clientY; app.pointer.touch = e.pointerType !== 'mouse';
  if (app.state !== 'playing') return;
  if (e.target.closest && e.target.closest('#controls, .corner')) { visuals.observe(e.clientX, e.clientY, false); return; }
  visuals.observe(e.clientX, e.clientY, active);
  app.pointer.active = active;
  clearTimeout(obsTimer);
  // mouse: observation lasts while moving; touch: while touching
  if (active && e.pointerType === 'mouse') obsTimer = setTimeout(() => { visuals.observe(app.pointer.x, app.pointer.y, false); app.pointer.active = false; }, 900);
}
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' || e.buttons) onPointer(e, true); if (e.pointerType === 'mouse') showUI(); }, { passive: true });
addEventListener('pointerdown', (e) => {
  if (!app.paused) audio.unlock();     // first tap unlocks audio (iOS) — but never un-pauses
  if (app.awaitTap) { const r = app.awaitTap; app.awaitTap = null; r(); }
  onPointer(e, true); showUI();
});
addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') onPointer(e, false); });
addEventListener('pointercancel', (e) => onPointer(e, false));
document.addEventListener('mouseleave', () => visuals.observe(app.pointer.x, app.pointer.y, false));
addEventListener('keydown', (e) => {
  if (app.state !== 'playing') return;
  if (e.code === 'Space') { e.preventDefault(); togglePause(); }
});

// ── controls ───────────────────────────────────────────────
async function togglePause() {
  app.paused = !app.paused;
  $('b-play').textContent = app.paused ? 'play' : 'pause';
  if (app.paused) await audio.pause(); else await audio.resume();
}
$('b-play').addEventListener('click', togglePause);
$('b-new').addEventListener('click', async () => {
  app.generation++;
  if (recorder.active) await stopRecording();
  audio.stopPiece();
  if (app.paused) { app.paused = false; audio.resume(); }
  visuals.clearPhoto();
  setState('landing');
  $('readout').innerHTML = '';
  $('worlds').hidden = true;
  $('file').click();
});
$('b-vol').addEventListener('input', (e) => audio.setVolume(+e.target.value));
if (!Recorder.supported()) $('b-rec').hidden = true;
$('b-rec').addEventListener('click', () => (recorder.active ? stopRecording() : startRecording()));
function startRecording() {
  if (!audio.recordDest) return;
  recorder.start($('gl'), audio.recordDest.stream);
  $('b-rec').classList.add('on');
}
async function stopRecording() {
  $('b-rec').classList.remove('on'); $('b-rec').textContent = 'rec';
  await recorder.stop(`photo-to-sound-${app.analysis?.signature || 'piece'}`);
}

// hidden world selector (click the world name, bottom right)
$('r-world').addEventListener('click', () => {
  const ul = $('worlds');
  if (!ul.hidden) { ul.hidden = true; return; }
  ul.innerHTML = '';
  for (const w of ['auto', ...WORLDS]) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.textContent = w.toLowerCase();
    if ((w === 'auto' && !app.manualWorld) || w === app.manualWorld) b.classList.add('on');
    b.addEventListener('click', () => { switchWorld(w === 'auto' ? null : w); ul.hidden = true; });
    li.appendChild(b); ul.appendChild(li);
  }
  ul.hidden = false;
});
function switchWorld(world) {
  if (!app.analysis || !app.choice) return;
  app.manualWorld = world;
  const auto = chooseWorlds(app.analysis.features, app.analysis.seed);
  const c = { ...auto };
  if (world) overrideChoice(c, world);
  app.choice = c;
  visuals.setWorlds(c.primary, c.secondary, c.accent);
  app.composer?.setWorlds(c.primary, c.secondary, c.accent);
  updateWorldLabel();
}
function updateWorldLabel() {
  const c = app.choice; if (!c) return;
  $('r-world').textContent = `${c.primary} × ${c.secondary}`;
}

// ── frame loop ─────────────────────────────────────────────
let last = performance.now(), lastReadout = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const a = app.analysis;
  let s = { dt, playing: !app.paused, form: 0, cohere: 0, energy: 0, brk: 0, stepF: 0, beatPhase: 0, intro: 0 };

  if (app.state === 'reading' || app.state === 'playing') {
    app.intro = Math.min(1, app.intro + dt * 1.6);
    s.intro = app.intro;
  }
  if (app.state === 'reading') {
    app.readT += dt;
    const p = app.readT / app.readDur;
    for (const [at, line] of readingLines(a)) if (p >= at && !readoutLines.includes(line)) pushReadout(line);
  }

  let pos = null;
  if (app.state === 'playing' && audio.stepDur) {
    pos = audio.position();
    const barF = pos.stepF / STEPS, loopBarF = barF % LOOP_BARS;
    // form: the photograph crosses over during the first bars, then stays crossed
    app.form = Math.max(app.form, smoothstep(0.25, 6, barF));
    // the void: once per loop the full image briefly re-coheres
    const cohere = smoothstep(VOID_BAR - 0.4, VOID_BAR + 0.05, loopBarF) * (1 - smoothstep(VOID_BAR + 1, VOID_BAR + 1.45, loopBarF));
    const brk = smoothstep(56, 58, loopBarF) * (1 - smoothstep(VOID_BAR, VOID_BAR + 1, loopBarF));
    app.energy += (pos.section.energy - app.energy) * Math.min(1, dt * 0.8);
    s = { ...s, form: app.form, cohere, brk, energy: app.energy, stepF: pos.stepF, beatPhase: pos.beatPhase };
    // audio events → visuals (against the heard clock)
    for (const ev of audio.drain(audio.heardTime())) {
      visuals.trigger(ev);
      if (ev.type === 'click' || ev.type === 'stutter') app.ticks.push({ x: ev.x, y: ev.y, t: now });
    }
  }
  visuals.frame(s);
  drawOverlay(now, pos);

  if (now - lastReadout > 66) { lastReadout = now; updateCorners(pos); }
}
requestAnimationFrame(frame);

function updateCorners(pos) {
  if (!pos) return;
  const sec = pos.section;
  $('r-sec').textContent = `${String(sec.index + 1).padStart(2, '0')} ${sec.name} ${String(sec.barInSection + 1).padStart(2, '0')}/${sec.bars}`;
  $('r-pos').textContent = `bar ${String(pos.loopBar + 1).padStart(2, '0')}/${LOOP_BARS} · step ${String(pos.step + 1).padStart(2, '0')}`;
  if (recorder.active) $('b-rec').textContent = `rec ${recorder.seconds.toFixed(0)}s`;
  const o = visuals.obs;
  const r = visuals.imageRect();
  const ix = clamp((app.pointer.x - r.x) / r.w), iy = clamp((app.pointer.y - r.y) / r.h);
  $('r-xy').textContent = `x ${ix.toFixed(3)}  y ${iy.toFixed(3)}  ψ ${(1 - o.s).toFixed(2)}`;
}

// ── 2D overlay: scan line, detections, read-head, observer ─
function drawOverlay(now, pos) {
  const W = innerWidth, H = innerHeight;
  octx.clearRect(0, 0, W, H);
  const a = app.analysis;
  if (!a || app.state === 'landing') return;
  const r = visuals.imageRect();
  octx.lineWidth = 1;

  if (app.state === 'reading') {
    const p = clamp(app.readT / app.readDur);
    const y = r.y + r.h * p;
    // scan line + faint after-glow
    const g = octx.createLinearGradient(0, y - 40, 0, y);
    g.addColorStop(0, 'rgba(127,230,255,0)'); g.addColorStop(1, 'rgba(127,230,255,0.08)');
    octx.fillStyle = g; octx.fillRect(r.x, y - 40, r.w, 40);
    octx.fillStyle = 'rgba(235,250,255,0.9)'; octx.fillRect(r.x - 12, y, r.w + 24, 1);
    octx.font = '9px ui-monospace, Menlo, monospace'; octx.fillStyle = 'rgba(232,238,242,0.45)';
    octx.fillText((p * a.height * 8 | 0).toString().padStart(4, '0'), r.x + r.w + 16, y + 3);
    // light points as they are passed
    octx.strokeStyle = 'rgba(232,238,242,0.55)';
    for (const pt of a.points.slice(0, 16)) {
      if (pt.y > p) continue;
      const [x, yy] = visuals.imageToScreen(pt.x, pt.y);
      octx.beginPath(); octx.moveTo(x - 4, yy); octx.lineTo(x + 4, yy); octx.moveTo(x, yy - 4); octx.lineTo(x, yy + 4); octx.stroke();
    }
  }
  // face brackets (once known)
  const fb = a.features.faceBox;
  if (fb && (app.state === 'reading' || (app.form < 0.6))) {
    const [x0, y0] = visuals.imageToScreen(fb.x, fb.y), [x1, y1] = visuals.imageToScreen(fb.x + fb.w, fb.y + fb.h);
    const L = Math.min(14, (x1 - x0) * 0.2);
    octx.strokeStyle = `rgba(127,230,255,${0.8 * (1 - app.form)})`;
    octx.beginPath();
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
      octx.moveTo(cx, cy + sy * L); octx.lineTo(cx, cy); octx.lineTo(cx + sx * L, cy);
    }
    octx.stroke();
  }

  if (app.state === 'playing' && pos) {
    const fade = 0.55;
    // read-head: which rows (band) and which columns the sequencer reads
    const win = readWindow(pos.loopBar, a.grid);
    const yb0 = r.y + win.band / a.grid.rows * r.h, yb1 = r.y + (win.band + 8) / a.grid.rows * r.h;
    octx.strokeStyle = `rgba(232,238,242,${0.35 * fade})`;
    octx.beginPath(); octx.moveTo(r.x - 10, yb0); octx.lineTo(r.x - 4, yb0); octx.lineTo(r.x - 4, yb1); octx.lineTo(r.x - 10, yb1); octx.stroke();
    const ty = r.y + r.h + 9;
    for (let i = 0; i < STEPS; i++) {
      const x = r.x + (win.cols[i] + 0.5) / a.grid.cols * r.w;
      const on = i === pos.step;
      octx.fillStyle = on ? 'rgba(235,250,255,0.9)' : `rgba(232,238,242,${0.18 * fade})`;
      octx.fillRect(Math.round(x), ty, 1, on ? 6 : 3);
    }
    // clicks leave a tiny cross at their source pixel for a moment
    app.ticks = app.ticks.filter((t) => now - t.t < 220);
    for (const t of app.ticks) {
      const [x, y] = visuals.imageToScreen(t.x, t.y);
      const al = 1 - (now - t.t) / 220;
      octx.strokeStyle = `rgba(255,255,255,${0.6 * al})`;
      octx.beginPath(); octx.moveTo(x - 3, y); octx.lineTo(x + 3, y); octx.moveTo(x, y - 3); octx.lineTo(x, y + 3); octx.stroke();
    }
    // observer: a hairline circle and coordinates
    const o = visuals.obs;
    if (o.s > 0.02) {
      const rad = visuals.shared.uObsR.value / 2 * H;
      const [cx, cy] = [(o.sx / visuals.view.aspect + 1) / 2 * W, (1 - o.sy) / 2 * H];
      octx.strokeStyle = `rgba(232,238,242,${0.22 * o.s})`;
      octx.beginPath(); octx.arc(cx, cy, rad, 0, Math.PI * 2); octx.stroke();
      octx.fillStyle = `rgba(232,238,242,${0.5 * o.s})`;
      octx.font = '9px ui-monospace, Menlo, monospace';
      octx.fillText(`ψ→|x⟩ ${clamp((cx - r.x) / r.w).toFixed(3)} ${clamp((cy - r.y) / r.h).toFixed(3)}`, cx + rad * 0.72 + 6, cy - rad * 0.72);
    }
  }
}

// ── debug / deep links: #demo=ii  #world=RASTER ────────────
if (hashParams.get('demo')) {
  const d = DEMOS.find((x) => x.id === hashParams.get('demo'));
  if (d) setTimeout(() => begin(d.make(), d.name, demoBytes(d)), 300);
}
// expose for debugging in the console
window.__p2s = { app, audio, visuals, recorder };
