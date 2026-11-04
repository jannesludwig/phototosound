// ─────────────────────────────────────────────────────────────
//  face.js — MediaPipe Tasks Vision face detection (lazy, optional).
//  The model runs locally in the browser via WASM; only the library
//  and model weights are downloaded. The photo never leaves the page.
//  If anything fails (offline, blocked CDN) we simply report no face.
// ─────────────────────────────────────────────────────────────
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

let detectorPromise = null;

/** Start loading the detector early (called on page load, idle). */
export function preloadFaceDetector() {
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
    const fileset = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
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
      // keypoints (normalised): right eye, left eye, nose tip, mouth, right ear, left ear
      keypoints: (d.keypoints || []).map((k) => ({ x: k.x > 1 ? k.x / W : k.x, y: k.y > 1 ? k.y / H : k.y })),
    })).filter((f) => f.score > 0.45).sort((a, b) => b.w * b.h - a.w * a.h);
    if (!faces.length) return none;
    const f = faces[0];
    return { face: f.score, faceSize: Math.min(1, f.w * f.h), faceBox: { x: f.x, y: f.y, w: f.w, h: f.h }, faceKeypoints: f.keypoints, faces };
  } catch (e) {
    console.warn('[face] detection failed:', e);
    return none;
  }
}
