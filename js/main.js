// ─────────────────────────────────────────────────────────────
//  main.js — the performance: landing → reading → playing.
//  analysis + structures + face + content + mood → score → both
//  engines on one audio clock. Also: the thin 2D overlay, the UI,
//  and the hand (force field, cursor sound, hold-to-observe).
// ─────────────────────────────────────────────────────────────
import { analyzeImage, rasterize } from './analysis.js';
import { extractStructures } from './structures.js';
import { preloadFaceDetector, detectFace, faceLandmarks } from './face.js';
import { preloadClassifier, classifyContent } from './classify.js';
import { deriveMood } from './mood.js';
import { planPiece, LAYERS, STEPS } from './score.js';
import { AudioEngine } from './audio/engine.js';
import { Visuals } from './visuals/engine.js';
import { Recorder } from './recorder.js';
import { DEMOS } from './demo.js';
import { clamp } from './rng.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;
const quality = { mobile };

const audio = new AudioEngine();
const visuals = new Visuals($('gl'), quality);
const recorder = new Recorder();
const overlay = $('overlay'), octx = overlay.getContext('2d');

const app = {
  state: 'landing', analysis: null, st: null, piece: null, mood: null,
  intro: 0, readT: 0, readDur: 4.2, paused: false, ticks: [], generation: 0,
  pointer: { x: 0, y: 0, lx: 0, ly: 0, lt: 0, down: false, moved: 0 },
};
const hashParams = new URLSearchParams(location.hash.slice(1));

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

// models load while the visitor looks at the empty screen
setTimeout(() => { preloadFaceDetector(); setTimeout(preloadClassifier, 1500); }, 600);

// ── input: file / drop / demo ──────────────────────────────
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f); e.target.value = ''; });
$('drop').addEventListener('click', () => audio.unlock());
$('drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (!e.relatedTarget) body.classList.remove('dragging'); });
addEventListener('drop', (e) => {
  e.preventDefault(); body.classList.remove('dragging');
  const f = [...(e.dataTransfer?.files || [])].find((x) => /image\/(jpeg|png)/.test(x.type));
  if (f) loadFile(f);
});
const demoBytes = (d) => new TextEncoder().encode('photo-to-sound/demo/' + d.name);
document.querySelectorAll('#demo button').forEach((b) => b.addEventListener('click', () => {
  audio.unlock();
  const d = DEMOS[+b.dataset.demo];
  begin(d.make(), d.name, demoBytes(d));
}));

async function loadFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.decoding = 'async'; img.src = url; await img.decode();
    const bytes = new Uint8Array(await file.arrayBuffer());
    begin(img, file.name.replace(/\.[^.]+$/, ''), bytes);
  } catch (e) { console.warn('could not read image', e); }
  finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ── reading ────────────────────────────────────────────────
async function begin(src, name, signatureBytes = null) {
  const gen = ++app.generation;
  audio.stopPiece();
  if (recorder.active) await stopRecording();
  const texCanvas = rasterize(src, mobile ? 1536 : 2048);
  const analysis = analyzeImage(texCanvas, signatureBytes);
  Object.assign(app, { analysis, st: null, piece: null, mood: null, intro: 0, readT: 0, paused: false, ticks: [] });
  visuals.setPhoto(analysis, texCanvas);
  $('b-play').textContent = 'pause';
  $('r-sig').textContent = 'sig ' + analysis.signature;
  setState('reading');
  readoutLines = []; renderReadout(); placeReadout();

  await nextFrame();                                         // let the photo appear first
  const st = app.st = extractStructures(texCanvas, analysis.seed);
  const faceCanvas = rasterize(src, 640);
  const facePromise = detectFace(faceCanvas).then(async (face) => ({ face, lm: face.face ? await faceLandmarks(faceCanvas) : null }));
  const contentPromise = classifyContent(rasterize(src, 320));
  const [{ face, lm }, cls] = await Promise.all([facePromise, contentPromise, wait(app.readDur * 1000)]);
  if (gen !== app.generation) return;
  Object.assign(analysis.features, face);
  pushReadout(face.face > 0 ? `subject: <span class="hot">face ${fmt(face.face)}</span>${lm ? ` · ${lm.strokes.length} contours` : ''}` : `subject: ${analysis.features.organic > 0.35 ? 'organic ' + fmt(analysis.features.organic) : 'none'}`);
  if (cls.labels.length) pushReadout(`content: ${cls.labels[0].name} ${fmt(cls.labels[0].score)}${cls.top ? ' → ' + cls.top : ''}`);
  const mood = app.mood = deriveMood(analysis.features, st, cls.content);
  pushReadout(`mood: <span class="hot">${mood.name}</span>`);
  await wait(450);
  if (gen !== app.generation) return;
  const piece = app.piece = planPiece(analysis, st, mood, cls.content);
  const pl = piece.pass(0);
  pushReadout(`score: ${piece.bpm.toFixed(1)} bpm · ${piece.mode} · ${pl.sections.map((s) => s.bars).join('/')}`);
  pushReadout(`vocabulary: <span class="hot">${pl.vocab.join(' · ')}</span> → ${pl.signature.toLowerCase()}`);
  $('r-bpm').textContent = piece.bpm.toFixed(1) + ' BPM';
  $('r-hz').textContent = piece.root.toFixed(2) + ' Hz · ' + piece.mode;
  await wait(1300);
  if (gen !== app.generation) return;

  visuals.setPiece(piece, { st, face: lm });
  const forced = hashParams.get('layer'); if (forced && LAYERS.includes(forced)) visuals.forceLead(forced);
  audio.loadPiece(piece, analysis);
  if (!audio.running) {
    const ok = await audio.unlock();
    if (!ok) { $('prompt').hidden = false; await new Promise((res) => { app.awaitTap = res; }); $('prompt').hidden = true; }
  }
  if (gen !== app.generation) return;
  // deep link: #bar=40 or #section=PEAK (+ #at=bars into it)
  const sec = pl.sections.find((x) => x.name === (hashParams.get('section') || '').toUpperCase());
  audio.start(sec ? sec.start + +(hashParams.get('at') || 0) : +(hashParams.get('bar') || 0));
  setState('playing');
  updateWorldLabel();
  showUI();
}

let readoutLines = [];
function pushReadout(html) { readoutLines.push(html); renderReadout(); }
function renderReadout() { $('readout').innerHTML = readoutLines.join('\n'); }
function placeReadout() {
  const el = $('readout');
  if (!visuals.photo) return;
  const r = visuals.imageRect();
  const right = innerWidth - (r.x + r.w), below = innerHeight - (r.y + r.h);
  el.classList.remove('inset');
  if (right >= 220) { el.style.left = (r.x + r.w + 18) + 'px'; el.style.top = r.y + 'px'; }
  else if (below >= 215) { el.style.left = r.x + 'px'; el.style.top = (r.y + r.h + 22) + 'px'; }
  else { el.classList.add('inset'); el.style.left = (r.x + 10) + 'px'; el.style.top = (r.y + 10) + 'px'; }
}
const fmt = (x) => x.toFixed(2);
function readingLines(a, st) {
  const f = a.features;
  const lines = [[0.02, `signature: <span class="hot">${a.signature}</span>`],
    [0.1, `luminance: ${fmt(f.brightness)} · contrast ${fmt(f.contrast)}`]];
  if (!st) return lines;
  const pal = a.palette.map((c) => `<i class="sw" style="background:rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})"></i>`).join('');
  return lines.concat([
    [0.2, `strokes: ${st.strokes.length} · contours ${st.contours.lines.length}`],
    [0.3, `lines: ${st.segments.length} · corners ${st.corners.length}`],
    [0.4, `luminance points: ${a.points.length}`],
    [0.5, `regions: ${st.regions.distinct} · fragments ${st.fragments.length}`],
    [0.6, `salient: ${st.salient.peaks.length} · void ${(st.voids.fraction * 100).toFixed(0)}%`],
    [0.7, `flow: ${fmt(f.flow)} · smooth ${fmt(f.smoothness)}`],
    [0.8, `colour: ${st.colour.temperature >= 0 ? 'warm' : 'cold'} ${fmt(Math.abs(st.colour.temperature))} · vivid ${fmt(st.colour.colourfulness)}`],
    [0.9, `palette: ${pal}`],
  ]);
}

// ── the hand: force field, cursor sound, hold-to-observe ───
let uiTimer = 0, holdTimer = 0;
function showUI() {
  body.classList.add('ui');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { if (!$('controls').matches(':hover') && $('worlds').hidden) body.classList.remove('ui'); }, 2600);
}
const onUI = (e) => e.target.closest && e.target.closest('#controls, .corner');
function move(e) {
  const P = app.pointer, now = performance.now();
  const dt = Math.max(0.001, (now - P.lt) / 1000);
  const x = e.clientX, y = e.clientY;
  if (app.state === 'playing' && !onUI(e) && P.lt && dt < 0.2) {
    visuals.force(P.lx, P.ly, x, y, dt);
    const speed = Math.hypot(x - P.lx, y - P.ly) / dt;
    const [ix, iy] = visuals.screenToImage(x, y);
    if (ix >= 0 && iy >= 0 && ix <= 1 && iy <= 1) {
      audio.cursor(ix, iy, speed);
      edgeCrossing(P.lx, P.ly, x, y);
    }
    P.moved += Math.hypot(x - P.lx, y - P.ly);
    if (P.moved > 14 && holdTimer && !P.holding) { clearTimeout(holdTimer); holdTimer = 0; }
    if (P.holding) visuals.observe(x, y, true);
  }
  P.lx = x; P.ly = y; P.lt = now; P.x = x; P.y = y;
}
/** A soft click whenever the path crosses one of the photo's strong edges. */
function edgeCrossing(x0, y0, x1, y1) {
  const st = app.st; if (!st) return;
  const steps = Math.min(24, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
  let prev = null;
  for (let k = 0; k <= steps; k++) {
    const [ix, iy] = visuals.screenToImage(x0 + (x1 - x0) * k / steps, y0 + (y1 - y0) * k / steps);
    if (ix < 0 || iy < 0 || ix >= 1 || iy >= 1) continue;
    const m = st.edgeMag[Math.floor(iy * st.edgeH) * st.edgeW + Math.floor(ix * st.edgeW)];
    const on = m > 0.35;
    if (prev === false && on) { audio.edgeClick(ix, m); break; }
    prev = on;
  }
}
addEventListener('pointermove', (e) => { move(e); if (e.pointerType === 'mouse') showUI(); }, { passive: true });
addEventListener('pointerdown', (e) => {
  if (!app.paused) audio.unlock();
  if (app.awaitTap) { const r = app.awaitTap; app.awaitTap = null; r(); }
  const P = app.pointer; P.down = true; P.moved = 0; P.lx = e.clientX; P.ly = e.clientY; P.lt = performance.now();
  showUI();
  if (app.state !== 'playing' || onUI(e)) return;
  clearTimeout(holdTimer);
  // a still press reveals the photograph under the finger
  holdTimer = setTimeout(() => { holdTimer = 0; P.holding = true; visuals.observe(P.x ?? e.clientX, P.y ?? e.clientY, true); }, 380);
  P.x = e.clientX; P.y = e.clientY;
});
function release() {
  const P = app.pointer; P.down = false; P.holding = false;
  clearTimeout(holdTimer); holdTimer = 0;
  visuals.observe(P.x, P.y, false);
  audio.cursorIdle();
}
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
document.addEventListener('mouseleave', () => { release(); app.pointer.lt = 0; });
addEventListener('keydown', (e) => { if (app.state === 'playing' && e.code === 'Space') { e.preventDefault(); togglePause(); } });

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
function startRecording() { if (!audio.recordDest) return; recorder.start($('gl'), audio.recordDest.stream); $('b-rec').classList.add('on'); }
async function stopRecording() {
  $('b-rec').classList.remove('on'); $('b-rec').textContent = 'rec';
  await recorder.stop(`photo-to-sound-${app.analysis?.signature || 'piece'}`);
}

// hidden selector (click the vocabulary, bottom right): choose which layer leads
$('r-world').addEventListener('click', () => {
  const ul = $('worlds');
  if (!ul.hidden) { ul.hidden = true; return; }
  ul.innerHTML = '';
  for (const w of ['auto', ...LAYERS]) {
    const li = document.createElement('li'), b = document.createElement('button');
    b.textContent = w;
    if ((w === 'auto' && !visuals.forced) || w === visuals.forced) b.classList.add('on');
    b.addEventListener('click', () => { visuals.forceLead(w === 'auto' ? null : w); ul.hidden = true; updateWorldLabel(); });
    li.appendChild(b); ul.appendChild(li);
  }
  ul.hidden = false;
});
function updateWorldLabel(plan) {
  const p = plan || app.piece?.pass(0); if (!p) return;
  const v = visuals.forced ? [visuals.forced, ...p.vocab.filter((x) => x !== visuals.forced).slice(0, 2)] : p.vocab;
  $('r-world').textContent = v.join(' · ');
}

// ── frame loop ─────────────────────────────────────────────
let last = performance.now(), lastReadout = 0, lastPass = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const a = app.analysis;
  if (app.state === 'reading' || app.state === 'playing') app.intro = Math.min(1, app.intro + dt * 1.6);
  if (app.state === 'reading') {
    app.readT += dt;
    const p = app.readT / app.readDur;
    for (const [at, line] of readingLines(a, app.st)) if (p >= at && !readoutLines.includes(line)) pushReadout(line);
  }
  let state = null, barsF = 0;
  if (app.state === 'playing' && app.piece) {
    barsF = audio.barsAt();
    state = app.piece.state(barsF);
    if (state.pass !== lastPass) { lastPass = state.pass; updateWorldLabel(state.plan); }
    for (const ev of audio.drain(audio.heardTime())) {
      visuals.trigger(ev);
      if (ev.type === 'click' || ev.type === 'rim' || ev.type === 'stutter') app.ticks.push({ x: ev.x, y: ev.y, t: now });
    }
  }
  visuals.frame({ dt, playing: !app.paused, intro: app.intro, state, stepF: barsF * STEPS, beatPhase: (barsF * 4) % 1 });
  drawOverlay(now, state, barsF);
  if (now - lastReadout > 66) { lastReadout = now; updateCorners(state, barsF); }
}
requestAnimationFrame(frame);

function updateCorners(st, barsF) {
  if (!st) return;
  $('r-sec').textContent = `${String(st.si + 1).padStart(2, '0')} ${st.section} ${String(st.sb + 1).padStart(2, '0')}/${st.bars} · T ${st.tension.toFixed(2)}`;
  $('r-pos').textContent = `bar ${String(Math.floor(barsF) + 1).padStart(3, '0')} · step ${String(Math.floor(barsF * STEPS) % STEPS + 1).padStart(2, '0')} · pass ${st.pass + 1}`;
  if (recorder.active) $('b-rec').textContent = `rec ${recorder.seconds.toFixed(0)}s`;
  const [ix, iy] = visuals.screenToImage(app.pointer.x || 0, app.pointer.y || 0);
  $('r-xy').textContent = `${app.mood?.name || ''} · x ${clamp(ix).toFixed(3)} y ${clamp(iy).toFixed(3)}`;
}

// ── 2D overlay: scan line, face brackets, step ticks, hold circle ──
function drawOverlay(now, st, barsF) {
  const W = innerWidth, H = innerHeight;
  octx.clearRect(0, 0, W, H);
  const a = app.analysis;
  if (!a || app.state === 'landing') return;
  const r = visuals.imageRect();
  octx.lineWidth = 1;
  if (app.state === 'reading') {
    const p = clamp(app.readT / app.readDur), y = r.y + r.h * p;
    const g = octx.createLinearGradient(0, y - 40, 0, y);
    g.addColorStop(0, 'rgba(127,230,255,0)'); g.addColorStop(1, 'rgba(127,230,255,0.08)');
    octx.fillStyle = g; octx.fillRect(r.x, y - 40, r.w, 40);
    octx.fillStyle = 'rgba(235,250,255,0.9)'; octx.fillRect(r.x - 12, y, r.w + 24, 1);
    octx.font = '9px ui-monospace, Menlo, monospace'; octx.fillStyle = 'rgba(232,238,242,0.45)';
    octx.fillText((p * a.height * 8 | 0).toString().padStart(4, '0'), r.x + r.w + 16, y + 3);
    // what the machine finds, as the line passes
    if (app.st) {
      octx.strokeStyle = 'rgba(232,238,242,0.5)';
      for (const c of app.st.corners.slice(0, 60)) { if (c.y > p) continue; const [x, yy] = visuals.imageToScreen(c.x, c.y); octx.strokeRect(x - 1.5, yy - 1.5, 3, 3); }
      octx.strokeStyle = 'rgba(127,230,255,0.55)';
      for (const s of app.st.segments) { if (Math.min(s.y1, s.y2) > p) continue; const [x0, y0] = visuals.imageToScreen(s.x1, s.y1), [x1, y1] = visuals.imageToScreen(s.x2, s.y2); octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x1, y1); octx.stroke(); }
    }
  }
  const fb = a.features.faceBox;
  if (fb && (app.state === 'reading' || (st && st.si === 0))) {
    const [x0, y0] = visuals.imageToScreen(fb.x, fb.y), [x1, y1] = visuals.imageToScreen(fb.x + fb.w, fb.y + fb.h);
    const L = Math.min(14, (x1 - x0) * 0.2);
    octx.strokeStyle = 'rgba(127,230,255,0.7)';
    octx.beginPath();
    for (const [cx, cy, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) { octx.moveTo(cx, cy + sy * L); octx.lineTo(cx, cy); octx.lineTo(cx + sx * L, cy); }
    octx.stroke();
  }
  if (app.state === 'playing' && st) {
    // the 16 steps of the bar and the tension of the piece, as hairlines under the image
    const ty = r.y + r.h + 9, step = Math.floor(barsF * STEPS) % STEPS;
    for (let i = 0; i < STEPS; i++) {
      octx.fillStyle = i === step ? 'rgba(235,250,255,0.9)' : 'rgba(232,238,242,0.12)';
      octx.fillRect(Math.round(r.x + (i + 0.5) / STEPS * r.w), ty, 1, i === step ? 6 : 3);
    }
    octx.fillStyle = 'rgba(127,230,255,0.35)';
    octx.fillRect(r.x, ty + 9, r.w * st.tension, 1);
    app.ticks = app.ticks.filter((t) => now - t.t < 220);
    for (const t of app.ticks) {
      if (t.x === undefined) continue;
      const [x, y] = visuals.imageToScreen(t.x, t.y), al = 1 - (now - t.t) / 220;
      octx.strokeStyle = `rgba(255,255,255,${0.55 * al})`;
      octx.beginPath(); octx.moveTo(x - 3, y); octx.lineTo(x + 3, y); octx.moveTo(x, y - 3); octx.lineTo(x, y + 3); octx.stroke();
    }
    const o = visuals.obs;
    if (o.s > 0.02) {
      const rad = visuals.shared.uObsR.value / 2 * H;
      const cx = (o.sx / visuals.view.aspect + 1) / 2 * W, cy = (1 - o.sy) / 2 * H;
      octx.strokeStyle = `rgba(232,238,242,${0.22 * o.s})`;
      octx.beginPath(); octx.arc(cx, cy, rad, 0, Math.PI * 2); octx.stroke();
      octx.fillStyle = `rgba(232,238,242,${0.5 * o.s})`; octx.font = '9px ui-monospace, Menlo, monospace';
      octx.fillText(`ψ→|x⟩ ${clamp((cx - r.x) / r.w).toFixed(3)} ${clamp((cy - r.y) / r.h).toFixed(3)}`, cx + rad * 0.72 + 6, cy - rad * 0.72);
    }
  }
}

// ── deep links: #demo=ii  #layer=fragments  #bar=40 ────────
if (hashParams.get('demo')) {
  const d = DEMOS.find((x) => x.id === hashParams.get('demo'));
  if (d) setTimeout(() => begin(d.make(), d.name, demoBytes(d)), 300);
}
window.__p2s = { app, audio, visuals, recorder };
