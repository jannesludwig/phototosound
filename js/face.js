// ─────────────────────────────────────────────────────────────
//  face.js — MediaPipe Tasks Vision face detection (lazy, optional).
//  The model runs locally in the browser via WASM; only the library
//  and model weights are downloaded. The photo never leaves the page.
//  If anything fails (offline, blocked CDN) we simply report no face.
// ─────────────────────────────────────────────────────────────
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const LANDMARK_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let detectorPromise = null, landmarkerPromise = null, visionPromise = null;

/** The MediaPipe vision bundle + WASM fileset (shared by all tasks). */
export function loadVision() {
  if (!visionPromise) visionPromise = (async () => {
    const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    return { vision, fileset };
  })();
  return visionPromise;
}

/** Start loading the detector early (called on page load, idle). */
export function preloadFaceDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const { vision, fileset } = await loadVision();
    const make = (delegate) => vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'IMAGE',
      minDetectionConfidence: 0.45,
    });
    try { return await make('GPU'); } catch (e) { return await make('CPU'); }
  })().catch((e) => { console.warn('[face] detector unavailable:', e); return null; });
  return detectorPromise;
}

/**
 * Detect faces in a canvas. Resolves to
 * { face: score 0..1, faceSize: area fraction, faceBox: {x,y,w,h} in 0..1 } (zeros when none).
 * Never rejects; times out after `timeout` ms.
 */
export async function detectFace(canvas, timeout = 7000) {
  const none = { face: 0, faceSize: 0, faceBox: null, faces: [] };
  const timer = new Promise((res) => setTimeout(() => res('timeout'), timeout));
  const det = await Promise.race([preloadFaceDetector(), timer]);
  if (!det || det === 'timeout') return none;
  try {
    const result = det.detect(canvas);
    const W = canvas.width, H = canvas.height;
    const faces = (result.detections || []).map((d) => ({
      score: d.categories?.[0]?.score ?? 0,
      x: d.boundingBox.originX / W, y: d.boundingBox.originY / H,
      w: d.boundingBox.width / W, h: d.boundingBox.height / H,
    })).filter((f) => f.score > 0.6).sort((a, b) => b.w * b.h - a.w * a.h);
    if (!faces.length) return none;
    const f = faces[0];
    return { face: f.score, faceSize: Math.min(1, f.w * f.h), faceBox: { x: f.x, y: f.y, w: f.w, h: f.h }, faces };
  } catch (e) {
    console.warn('[face] detection failed:', e);
    return none;
  }
}

/** Face landmarks (478 points) → the face's own contour strokes. Loaded only when a face exists. */
export async function faceLandmarks(canvas, timeout = 8000) {
  try {
    if (!landmarkerPromise) landmarkerPromise = (async () => {
      const { vision, fileset } = await loadVision();
      const make = (delegate) => vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: LANDMARK_MODEL, delegate }, runningMode: 'IMAGE', numFaces: 2 });
      try { return { vision, lm: await make('GPU') }; } catch (e) { return { vision, lm: await make('CPU') }; }
    })();
    const res = await Promise.race([landmarkerPromise, new Promise((r) => setTimeout(() => r(null), timeout))]);
    if (!res) return null;
    const { vision, lm } = res;
    const out = lm.detect(canvas);
    if (!out.faceLandmarks || !out.faceLandmarks.length) return null;
    const F = vision.FaceLandmarker;
    const sets = { oval: F.FACE_LANDMARKS_FACE_OVAL, lips: F.FACE_LANDMARKS_LIPS, leftEye: F.FACE_LANDMARKS_LEFT_EYE, rightEye: F.FACE_LANDMARKS_RIGHT_EYE, leftBrow: F.FACE_LANDMARKS_LEFT_EYEBROW, rightBrow: F.FACE_LANDMARKS_RIGHT_EYEBROW, leftIris: F.FACE_LANDMARKS_LEFT_IRIS, rightIris: F.FACE_LANDMARKS_RIGHT_IRIS };
    const strokes = [];
    for (const pts of out.faceLandmarks) {
      for (const [name, conns] of Object.entries(sets)) {
        if (!conns) continue;
        // connections are {start, end} pairs; chain them into polylines
        for (const poly of chainConnections(conns)) strokes.push({ name, pts: poly.map((i) => [pts[i].x, pts[i].y]), face: true });
      }
    }
    const points = out.faceLandmarks[0].filter((_, i) => i % 6 === 0).map((p) => ({ x: p.x, y: p.y }));
    return { strokes, points };
  } catch (e) {
    console.warn('[face] landmarks unavailable:', e);
    return null;
  }
}

function chainConnections(conns) {
  const next = new Map();
  for (const c of conns) next.set(c.start, c.end);
  const starts = [...next.keys()].filter((k) => ![...next.values()].includes(k));
  const seeds = starts.length ? starts : [conns[0].start];
  const polys = [];
  const used = new Set();
  for (const s0 of seeds) {
    const poly = [s0]; let cur = s0;
    while (next.has(cur) && !used.has(cur)) { used.add(cur); cur = next.get(cur); poly.push(cur); if (cur === s0) break; }
    if (poly.length > 2) polys.push(poly);
  }
  return polys;
}
