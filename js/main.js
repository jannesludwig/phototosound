// ─────────────────────────────────────────────────────────────
//  main.js — feed the system a photograph.
//  landing → reading (the photo is analysed, its terrain is built)
//  → the piece (the map is listened to and consumed) → the crash →
//  back to the landing, asking for a new image (or loop, if chosen).
//  Also: annotations on the map, the hand, rotation, the mixer.
// ─────────────────────────────────────────────────────────────
import { analyzeImage, rasterize } from './analysis.js';
import { extractStructures } from './structures.js';
import { preloadFaceDetector, detectFace } from './face.js';
import { buildMap, heightAt } from './map.js';
import { Composer, STEPS, LAYERS } from './audio/composer.js';
import { AudioEngine } from './audio/engine.js';
import { Visuals, VISUAL_LAYERS } from './visuals/engine.js';
import { Recorder } from './recorder.js';
import { DEMOS } from './demo.js';
import { smoothstep, clamp } from './rng.js';

const $ = (id) => document.getElementById(id);
const body = document.body;
const mobile = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600 || (navigator.hardwareConcurrency || 8) <= 4;
const quality = { mobile };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* */ } } };

const audio = new AudioEngine();
const visuals = new Visuals($('gl'), quality);
const recorder = new Recorder();
const overlay = $('overlay'), octx = overlay.getContext('2d');

const app = {
  state: 'landing', analysis: null, map: null, st: null, composer: null,
  intro: 0, readT: 0, readDur: 3.6, form: 0, energy: 0, paused: false,
  pointer: { x: 0, y: 0 }, generation: 0, yaw: 0, marks: [], notes: [],
};
const hashParams = new URLSearchParams(location.hash.slice(1));
audio.loopMode = store.get('p2s-loop') === '1' || hashParams.get('loop') === '1';

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
setTimeout(() => preloadFaceDetector(), 600);

// ── input: file / drop / demo ──────────────────────────────
// Picking and dropping are caught by the classic script in index.html (it always runs, also
// when this module is late); it hands files to __p2sLoad and queues them until we are ready.
$('drop').addEventListener('click', () => audio.unlock());      // gesture → unlock audio early (iOS)
$('drop').addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); } });
const demoBytes = (d) => new TextEncoder().encode('photo-to-sound/demo/' + d.name);
document.querySelectorAll('#demo button').forEach((b) => b.addEventListener('click', () => {
  audio.unlock();
  const d = DEMOS[+b.dataset.demo];
  begin(d.make(), d.name, demoBytes(d));
}));

function message(text, info = false) { const m = $('msg'); m.textContent = text || ''; m.hidden = !text; m.classList.toggle('info', !!info); }

/** Decode an image file robustly (Safari/WebKit: decode() can reject for large photos). */
async function decodeFile(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* try the next way */ }
    try { return await createImageBitmap(file); } catch (e) { /* try the next way */ }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  if (img.decode) { try { await img.decode(); return img; } catch (e) { /* fall back to onload */ } }
  await new Promise((res, rej) => {
    if (img.complete && img.naturalWidth) return res();
    img.onload = res; img.onerror = () => rej(new Error('decode failed'));
  });
  return img;
}
async function fileBytes(file) {
  if (file.arrayBuffer) return new Uint8Array(await file.arrayBuffer());
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => res(null); r.readAsArrayBuffer(file); });
}
async function loadFile(file) {
  message('');
  try {
    const [src, bytes] = await Promise.all([decodeFile(file), fileBytes(file).catch(() => null)]);
    if (!(src.naturalWidth || src.width)) throw new Error('empty image');
    begin(src, (file.name || 'photo').replace(/\.[^.]+$/, ''), bytes);
  } catch (e) {
    console.warn('could not read image', e);
    setState('landing');
    message('could not read this image — try a JPG or PNG');
  }
}
// ready: take files from the classic script (and any that arrived before this module ran)
window.__p2sLoad = (f) => loadFile(f);
for (const f of (window.__p2sQueue || []).splice(0)) loadFile(f);

// ── reading ────────────────────────────────────────────────
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function begin(src, name, signatureBytes = null) {
  const gen = ++app.generation;
  audio.stopPiece();
  if (recorder.active) await stopRecording();
  message('');
  const texCanvas = rasterize(src, mobile ? 1536 : 2048);
  const analysis = analyzeImage(texCanvas, signatureBytes);
  Object.assign(app, { analysis, map: null, composer: null, intro: 0, form: 0, readT: 0, paused: false, notes: [] });
  visuals.setPhoto(analysis, texCanvas);
  $('b-play').textContent = 'pause';
  $('r-sig').textContent = 'sig ' + analysis.signature;
  setState('reading');
  readoutLines = []; renderReadout(); placeReadout();

  // the photo's contours and face, while the scan line reads it
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  app.st = extractStructures(texCanvas, analysis.seed);
  const [face] = await Promise.all([detectFace(rasterize(src, 640)), wait(app.readDur * 1000)]);
  if (gen !== app.generation) return;
  Object.assign(analysis.features, face);

  // the sound map
  const map = app.map = buildMap(analysis);
  const P = map.params;
  pushReadout(`focal point: <span class="hot">${map.focal.kind}</span> ${fmt(map.focal.x)} ${fmt(map.focal.y)}`);
  pushReadout(`terrain: relief ${fmt(P.relief)} · ridges ${fmt(P.ridged)} · ${P.levels} levels${P.terraced > 0.2 ? ' · terraced' : ''}`);
  await wait(450);
  if (gen !== app.generation) return;
  const composer = app.composer = new Composer(analysis, map);
  const minutes = composer.loopBars * 16 * (60 / P.bpm / 4);
  pushReadout(`sound map: <span class="hot">${P.bpm.toFixed(1)} bpm · ${P.root.toFixed(2)} Hz · ${Math.floor(minutes / 60)}:${String(Math.round(minutes % 60)).padStart(2, '0')}</span>`);
  $('r-bpm').textContent = P.bpm.toFixed(1) + ' BPM';
  $('r-hz').textContent = P.root.toFixed(2) + ' Hz';
  $('r-map').textContent = `relief ${fmt(P.relief)} · ${P.levels} lv · ${map.focal.kind}`;
  await wait(1000);
  if (gen !== app.generation) return;

  audio.loadPiece(composer, analysis, P);
  visuals.stepDur = 60 / P.bpm / 4;
  visuals.beginMap(map, app.st);
  app.marks = map.marks.map((m, i) => ({ ...m, id: (m.kind[0].toUpperCase()) + i }));
  if (!audio.running) {
    const ok = await audio.unlock();
    if (!ok) { $('prompt').hidden = false; await new Promise((res) => { app.awaitTap = res; }); $('prompt').hidden = true; }
  }
  if (gen !== app.generation) return;
  const secLink = composer.sections.find((x) => x.name === (hashParams.get('section') || '').toUpperCase());
  const startBar = secLink ? secLink.start + +(hashParams.get('at') || 0) : +(hashParams.get('bar') || 0);
  if (startBar) app.form = 1;
  audio.start(startBar);
  setState('playing');
  showUI();
}

/** The piece is over (one shot): the image has been consumed. */
function endPiece() {
  app.generation++;
  audio.stopPiece();
  if (recorder.active) stopRecording();
  visuals.clearPhoto();
  setState('landing');
  $('readout').innerHTML = '';
  message('the image has been consumed · feed the system a new one', true);
}

let readoutLines = [];
function pushReadout(html) { readoutLines.push(html); renderReadout(); }
let readoutMax = 99;
function renderReadout() { $('readout').innerHTML = readoutLines.slice(-readoutMax).join('\n'); }
function placeReadout() {
  const el = $('readout');
  if (!visuals.photo) return;
  const r = visuals.imageRect(), LH = 16.5;
  const right = innerWidth - (r.x + r.w), below = innerHeight - (r.y + r.h);
  el.classList.remove('inset');
  if (right >= 230) { el.style.left = (r.x + r.w + 18) + 'px'; el.style.top = r.y + 'px'; readoutMax = Math.max(4, (innerHeight - r.y - 40) / LH | 0); }
  else if (below >= 110) { el.style.left = r.x + 'px'; el.style.top = (r.y + r.h + 22) + 'px'; readoutMax = Math.max(3, (below - 60) / LH | 0); }
  else { el.classList.add('inset'); el.style.left = (r.x + 10) + 'px'; el.style.top = (r.y + 10) + 'px'; readoutMax = Math.max(3, (r.h - 30) / LH | 0); }
  renderReadout();
}
const fmt = (x) => x.toFixed(2);
function readingLines(a) {
  const f = a.features;
  const pal = a.palette.map((c) => `<i class="sw" style="background:rgb(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0})"></i>`).join('');
  return [
    [0.02, `signature: <span class="hot">${a.signature}</span>`],
    [0.14, `luminance: ${fmt(f.brightness)} · contrast ${fmt(f.contrast)}`],
    [0.28, `edges: ${fmt(f.edgeDensity)} · lines ${fmt(f.lineStrength)}`],
    [0.42, `light points: ${f.pointCount} · radial ${fmt(f.circularity)}`],
    [0.56, `gradient: ${f.smoothness > 0.5 ? 'smooth' : 'textured'} ${fmt(f.smoothness)} · flow ${fmt(f.flow)}`],
    [0.7, `subject: ${f.face > 0 ? 'face ' + fmt(f.face) : 'none'}`],
    [0.84, `palette: ${pal}`],
  ];
}

// ── the hand: hover = force field, drag = rotate the map, still press = the photograph ──
let uiTimer = 0, holdTimer = 0;
function showUI() {
  body.classList.add('ui');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => { if (!$('controls').matches(':hover')) body.classList.remove('ui'); }, 2600);
}
const onUI = (e) => e.target.closest && e.target.closest('#controls, .corner, #mixer, #yaw');
function move(e) {
  const P = app.pointer, now = performance.now();
  const dt = Math.max(0.001, (now - (P.lt || 0)) / 1000);
  const x = e.clientX, y = e.clientY;
  if (app.state === 'playing' && !onUI(e) && P.lt && dt < 0.2) {
    if (P.down && !P.holding) setYaw(app.yaw + (x - P.lx) * 0.006);         // drag rotates the map
    else if (!P.down) { visuals.force(P.lx, P.ly, x, y, dt); edgeCrossing(P.lx, P.ly, x, y); }
    P.moved = (P.moved || 0) + Math.hypot(x - P.lx, y - P.ly);
    if (P.moved > 14 && holdTimer && !P.holding) { clearTimeout(holdTimer); holdTimer = 0; }
    if (P.holding) visuals.observe(x, y, true);
  }
  P.lx = x; P.ly = y; P.lt = now; P.x = x; P.y = y;
}
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
function release() {
  const P = app.pointer; P.holding = false; P.down = false;
  clearTimeout(holdTimer); holdTimer = 0;
  visuals.observe(P.x || 0, P.y || 0, false);
}
addEventListener('pointermove', (e) => { move(e); if (e.pointerType === 'mouse') showUI(); }, { passive: true });
addEventListener('pointerdown', (e) => {
  if (!app.paused) audio.unlock();
  if (app.awaitTap) { const r = app.awaitTap; app.awaitTap = null; r(); }
  const P = app.pointer; P.moved = 0; P.lx = P.x = e.clientX; P.ly = P.y = e.clientY; P.lt = performance.now();
  showUI();
  if (app.state !== 'playing' || onUI(e)) return;
  P.down = true;
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => { holdTimer = 0; P.holding = true; visuals.observe(P.x, P.y, true); }, 380);
});
addEventListener('pointerup', release);
addEventListener('pointercancel', release);
document.addEventListener('mouseleave', () => { release(); app.pointer.lt = 0; });
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input')) return;
  if (e.key === 'm' || e.key === 'M') toggleMixer();
  if (app.state === 'playing' && e.code === 'Space') { e.preventDefault(); togglePause(); }
});

// ── rotation: the thin slider on the right edge ────────────
function setYaw(rad) {
  app.yaw = Math.max(-Math.PI, Math.min(Math.PI, rad));
  visuals.setUserYaw(app.yaw);
  const t = (app.yaw / Math.PI + 1) / 2;          // 0 (bottom) … 1 (top)
  $('yaw-knob').style.top = `${(1 - t) * 100}%`;
  $('yaw-label').textContent = `${String(Math.round(app.yaw * 180 / Math.PI)).padStart(3, '0')}°`;
}
(() => {
  const el = $('yaw');
  const at = (e) => { const r = el.getBoundingClientRect(); setYaw(((1 - clamp((e.clientY - r.top) / r.height)) * 2 - 1) * Math.PI); };
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); el.classList.add('drag'); el.setPointerCapture?.(e.pointerId); at(e); });
  el.addEventListener('pointermove', (e) => { if (el.classList.contains('drag')) at(e); });
  const up = () => el.classList.remove('drag');
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('dblclick', () => setYaw(0));
  setYaw(0);
})();

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
  $('file').click();
});
$('b-vol').addEventListener('input', (e) => audio.setVolume(+e.target.value));
function updateLoopLabel() { $('b-loop').textContent = audio.loopMode ? 'loop' : 'once'; $('b-loop').classList.toggle('on', audio.loopMode); }
$('b-loop').addEventListener('click', () => { audio.loopMode = !audio.loopMode; store.set('p2s-loop', audio.loopMode ? '1' : '0'); updateLoopLabel(); });
updateLoopLabel();
if (!Recorder.supported()) $('b-rec').hidden = true;
$('b-rec').addEventListener('click', () => (recorder.active ? stopRecording() : startRecording()));
function startRecording() { if (!audio.recordDest) return; recorder.start($('gl'), audio.recordDest.stream); $('b-rec').classList.add('on'); }
async function stopRecording() {
  $('b-rec').classList.remove('on'); $('b-rec').textContent = 'rec';
  await recorder.stop(`photo-to-sound-${app.analysis?.signature || 'piece'}`);
}

// ── mixer (M): sound + visual layers, mute / solo, copy settings ──
const SOUND_INFO = {
  KICK: 'sine kick on the ridges · irregular', SUB: 'sub pressure under the scan', PULSE: 'gated sub pulses (intensify)',
  HUM: 'machine hum of the map', RESONANCE: 'valleys ring: slow low sines', CLICK: 'hard edges crossed by the scan',
  NOISE: 'rough texture: gated bursts', DATA: 'image rows as data / dial pulses', TRANSMISSION: 'scanned columns sent as data',
  GLITCH: 'hardest edges: digital glitch', TONE: 'one low interval (consumption)', CRASH: 'the end: the image is consumed',
};
const VISUAL_INFO = {
  TERRAIN: 'the whole terrain mesh', CONTOURS: 'contour lines (3 densities)', WIREFRAME: 'wireframe state', RIDGES: 'ridge hatching on edges',
  SCAN: 'scan line + afterglow', FLARES: 'local flares per sound event', DEFORM: 'ripples, spikes, tears, erosion', DECAY: 'consumption: crumbling, breaking',
  'EDGE FLASH': 'hard edges flash (frames)', ORBIT: 'rings at the focal point (sub)', CRUMBLE: 'border particles drift away', SLICING: 'rare quantum slicing',
  ANNOTATIONS: 'labels on the map', CRASH: 'the final white flash', HAND: 'cursor force field',
};
const mixer = { rows: {}, open: false };
function mixRow(box, name, info, isSound) {
  const row = document.createElement('div'); row.className = 'mx-row';
  row.innerHTML = `<span class="mx-dot"></span><span class="mx-name">${name}</span><span class="mx-desc">${info}</span><span class="mx-meter"><i></i></span><button title="mute">M</button><button title="solo">S</button>`;
  const [mB, sB] = row.querySelectorAll('button');
  const get = () => (isSound ? { mute: !!audio.mute[name], solo: !!audio.solo[name] } : visuals.vis[name]);
  mB.addEventListener('click', () => { const v = !get().mute; if (isSound) audio.setMute(name, v); else visuals.setVisual(name, 'mute', v); mB.classList.toggle('on', v); });
  sB.addEventListener('click', () => { const v = !get().solo; if (isSound) audio.setSolo(name, v); else visuals.setVisual(name, 'solo', v); sB.classList.toggle('on', v); });
  box.appendChild(row);
  return { row, dot: row.querySelector('.mx-dot'), bar: row.querySelector('.mx-meter i') };
}
for (const L of LAYERS) mixer.rows[L] = mixRow($('mx-rows'), L, SOUND_INFO[L], true);
for (const V of VISUAL_LAYERS) mixer.rows['v:' + V] = mixRow($('mx-vis'), V, VISUAL_INFO[V], false);
function toggleMixer() { mixer.open = !mixer.open; $('mixer').hidden = !mixer.open; }
$('r-title').addEventListener('click', toggleMixer);
$('mx-copy').addEventListener('click', async () => {
  const state = (m, s) => (s ? 'SOLO' : m ? 'mute' : 'on');
  const text = [
    `photo→sound mixer · round 4 · sig ${app.analysis?.signature || '-'} · ${audio.loopMode ? 'loop' : 'once'}`,
    'sound:  ' + LAYERS.map((L) => `${L}=${state(audio.mute[L], audio.solo[L])}`).join('  '),
    'visual: ' + VISUAL_LAYERS.map((V) => `${V}=${state(visuals.vis[V].mute, visuals.vis[V].solo)}`).join('  '),
  ].join('\n');
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch (x) { /* */ } ta.remove();
  }
  $('mx-copy').textContent = ok ? 'copied' : 'copy failed'; window.__mixerText = text;
  setTimeout(() => { $('mx-copy').textContent = 'copy settings'; }, 1400);
});
function updateMixer() {
  if (!mixer.open) return;
  const lv = audio.levels(), act = audio.activeLayers(0.15);
  for (const L of LAYERS) {
    const r = mixer.rows[L];
    r.dot.classList.toggle('hit', act.includes(L));
    r.bar.style.width = Math.min(100, (lv[L] || 0) * 260) + '%';
  }
  for (const V of VISUAL_LAYERS) mixer.rows['v:' + V].row.classList.toggle('off', !visuals.visOn(V));
  $('mx-count').textContent = `${audio.activeLayers(2).length} sounding`;
}

// ── the piece, frame by frame ──────────────────────────────
let last = performance.now(), lastReadout = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const a = app.analysis;
  if (app.state === 'reading' || app.state === 'playing') app.intro = Math.min(1, app.intro + dt * 1.6);
  if (app.state === 'reading') {
    app.readT += dt;
    const p = app.readT / app.readDur;
    for (const [at, line] of readingLines(a)) if (p >= at && !readoutLines.includes(line)) pushReadout(line);
  }
  let st = null, pos = null, low = 0;
  if (app.state === 'playing' && audio.stepDur && app.composer) {
    const C = app.composer;
    pos = audio.position();
    const lb = pos.loopBarF, sec = pos.section;
    const scan = C.scanAt(lb);
    scan.dir = scan.sweep % 2 === 0 ? 1 : -1;
    app.form = Math.max(app.form, smoothstep(0, 2.5, pos.barF));                  // the photograph folds into a terrain
    const cons = C.sections[3], int = C.sections[2];
    const decay = smoothstep(int.start + int.bars * 0.6, int.start + int.bars, lb) * 0.15 + smoothstep(cons.start, C.endBar, lb) * 0.85;
    const fade = 1 - smoothstep(C.endBar + 0.05, C.endBar + 0.6, lb);
    app.energy += (sec.energy - app.energy) * Math.min(1, dt * 0.6);
    const lv = audio.levels();
    low = clamp(((lv.SUB || 0) + (lv.PULSE || 0) * 0.8 + (lv.HUM || 0) * 1.5 + (lv.KICK || 0) * 0.4) * 5);
    st = { section: sec.name, energy: app.energy, scan, decay, form: app.form, fade };
    for (const ev of audio.drain(audio.heardTime())) { visuals.trigger(ev); note(ev, now); }
    // one shot: after the crash the system asks for a new image
    if (!audio.loopMode && lb >= C.endBar + 1.6 && pos.loop === 0) { endPiece(); return; }
  }
  visuals.frame({ dt, playing: !app.paused, intro: app.intro, low, state: st });
  drawOverlay(now, pos, st);
  if (now - lastReadout > 66) { lastReadout = now; updateCorners(pos); updateMixer(); }
}
requestAnimationFrame(frame);

/** Data / glitch / transmission sounds leave a short-lived technical note on the map. */
function note(ev, now) {
  if (ev.x === undefined) return;
  const hex = () => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
  let text = null;
  if (ev.type === 'glitch') text = `ERR ${hex()}`;
  else if (ev.type === 'transmission') text = `TX ${ev.bits.slice(0, 12).join('')}`;
  else if (ev.type === 'data') text = ev.kind === 'dial' ? `DIAL ${ev.count}` : `DATA ${hex()}`;
  else if (ev.type === 'res') text = `RES ${ev.freq.toFixed(1)} Hz`;
  else if (ev.type === 'sub' && ev.focus) text = `FOCUS ${ev.freq.toFixed(1)} Hz`;
  if (text) app.notes.push({ x: ev.x, y: ev.y, text, t: now, life: ev.type === 'res' ? 1600 : 650 });
}

function updateCorners(pos) {
  if (!pos) return;
  const sec = pos.section;
  $('r-sec').textContent = `${String(sec.index + 1).padStart(2, '0')} ${sec.name} ${String(sec.barInSection + 1).padStart(2, '0')}/${sec.bars}`;
  $('r-pos').textContent = `bar ${String(pos.loopBar + 1).padStart(3, '0')}/${app.composer.loopBars} · ${audio.loopMode ? 'loop' : 'once'}`;
  if (recorder.active) $('b-rec').textContent = `rec ${recorder.seconds.toFixed(0)}s`;
  const [ix, iy] = visuals.screenToImage(app.pointer.x || 0, app.pointer.y || 0);
  const h = app.map ? heightAt(app.map, clamp(ix), clamp(iy)) : 0;
  $('r-xy').textContent = `x ${clamp(ix).toFixed(3)} y ${clamp(iy).toFixed(3)} h ${h.toFixed(2)}`;
}

// ── the 2D overlay: scan during reading; annotations on the map ──
function drawOverlay(now, pos, st) {
  const W = innerWidth, H = innerHeight;
  octx.clearRect(0, 0, W, H);
  const a = app.analysis;
  if (!a || app.state === 'landing') return;
  octx.lineWidth = 1;
  octx.font = '8px ui-monospace, Menlo, monospace';
  if (app.state === 'reading') {
    const r = visuals.imageRect(), p = clamp(app.readT / app.readDur), y = r.y + r.h * p;
    const g = octx.createLinearGradient(0, y - 40, 0, y);
    g.addColorStop(0, 'rgba(127,230,255,0)'); g.addColorStop(1, 'rgba(127,230,255,0.08)');
    octx.fillStyle = g; octx.fillRect(r.x, y - 40, r.w, 40);
    octx.fillStyle = 'rgba(235,250,255,0.9)'; octx.fillRect(r.x - 12, y, r.w + 24, 1);
    octx.fillStyle = 'rgba(232,238,242,0.45)';
    octx.fillText((p * a.height * 8 | 0).toString().padStart(4, '0'), r.x + r.w + 16, y + 3);
    return;
  }
  if (!st || !app.map || !visuals.visOn('ANNOTATIONS') || st.fade < 0.05) return;
  const P = app.map.params, al = (st.fade ?? 1) * Math.min(1, app.form);
  const flick = visuals.env.data > 0.3 && Math.random() < 0.5 ? 0.25 : 1;    // data sounds make the labels flicker
  // map frame: coordinate ticks along two edges
  octx.fillStyle = `rgba(232,238,242,${0.28 * al * flick})`; octx.strokeStyle = `rgba(232,238,242,${0.22 * al})`;
  for (let k = 0; k <= 4; k++) {
    const t = k / 4;
    const [x0, y0] = visuals.project(t, 1, 0), [x1, y1] = visuals.project(0, t, 0);
    if (!st.scan.mapping || t <= st.scan.reveal) { octx.beginPath(); octx.moveTo(x0, y0); octx.lineTo(x0, y0 + 5); octx.stroke(); octx.fillText(t.toFixed(2), x0 - 8, y0 + 14); }
    octx.beginPath(); octx.moveTo(x1, y1); octx.lineTo(x1 - 5, y1); octx.stroke(); octx.fillText(t.toFixed(2), x1 - 30, y1 + 3);
  }
  // landmarks: peaks, valleys, edges, the focal point — elevation and the frequency they sound at
  for (const m of app.marks) {
    if (st.scan.mapping && m.x > st.scan.reveal) continue;
    const [x, y, z] = visuals.project(m.x, m.y, 0.01);
    if (z > 1) continue;
    const near = Math.abs(m.x - st.scan.x) < 0.04;                              // under the scan: it sounds
    const freq = P.root * (2 + Math.round(m.h * 6));
    const a1 = (near ? 0.85 : 0.38) * al * flick;
    octx.strokeStyle = `rgba(232,238,242,${a1})`; octx.fillStyle = `rgba(232,238,242,${a1})`;
    octx.beginPath(); octx.moveTo(x - 3, y); octx.lineTo(x + 3, y); octx.moveTo(x, y - 3); octx.lineTo(x, y + 3); octx.moveTo(x + 2, y - 2); octx.lineTo(x + 12, y - 12); octx.stroke();
    octx.fillText(`${m.id} ${m.kind}`, x + 14, y - 16);
    octx.fillText(`${m.x.toFixed(3)} ${m.y.toFixed(3)}`, x + 14, y - 7);
    octx.fillText(`h ${m.h.toFixed(2)} · ${freq.toFixed(1)} Hz`, x + 14, y + 2);
  }
  // the scan probe: where the listening line meets the far edge of the map
  if (visuals.visOn('SCAN')) {
    const [x, y] = visuals.project(st.scan.x, 0, 0.02);
    const col = app.map.col[Math.min(63, Math.floor(st.scan.x * 64))];
    octx.fillStyle = `rgba(235,250,255,${0.6 * al})`;
    octx.fillText(`SCAN ${st.scan.x.toFixed(3)} · h̄ ${col.hMean.toFixed(2)} · e ${col.eMax.toFixed(2)}`, x + 6, y - 6);
  }
  // short notes where data, glitches and resonances happen
  app.notes = app.notes.filter((n) => now - n.t < n.life);
  for (const n of app.notes) {
    const [x, y] = visuals.project(n.x, n.y, 0.02);
    const k = 1 - (now - n.t) / n.life;
    octx.fillStyle = `rgba(235,250,255,${0.55 * k * al * (Math.random() < 0.15 ? 0.3 : 1)})`;
    octx.fillText(n.text, x + 5, y + 10);
  }
}

// ── deep links: #demo=ii  #section=INTENSIFY&at=4  #bar=40  #loop=1 ─
if (hashParams.get('demo')) {
  const d = DEMOS.find((x) => x.id === hashParams.get('demo'));
  if (d) setTimeout(() => begin(d.make(), d.name, demoBytes(d)), 300);
}
window.__p2s = { app, audio, visuals, recorder };
