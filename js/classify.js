// ─────────────────────────────────────────────────────────────
//  classify.js — a rough idea of the content, kept subtle.
//  MediaPipe ImageClassifier (EfficientNet-Lite0, int8, ImageNet
//  labels) runs locally; its labels are mapped by keyword to seven
//  content categories that gently bias mood, vocabulary and sound.
// ─────────────────────────────────────────────────────────────
import { loadVision } from './face.js';

const MODEL = 'https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/int8/1/efficientnet_lite0.tflite';

const KEYWORDS = {
  portrait: ['wig', 'lipstick', 'sunglass', 'mask', 'bonnet', 'face powder', 'hair spray', 'groom', 'bow tie', 'neck brace', 'beard', 'band aid', 'stethoscope', 'sweatshirt', 'suit'],
  city: ['skyscraper', 'street', 'traffic', 'parking', 'streetcar', 'trolleybus', 'cab', 'church', 'mosque', 'palace', 'monastery', 'triumphal arch', 'bridge', 'viaduct', 'library', 'cinema', 'prison', 'tile roof', 'dome', 'grille', 'fence', 'barn', 'restaurant', 'planetarium', 'patio', 'window', 'sliding door', 'bannister', 'turnstile', 'limousine', 'minivan', 'police van', 'scoreboard', 'tram', 'pole', 'water tower', 'obelisk', 'altar', 'cassette'],
  nature: ['valley', 'alp', 'volcano', 'cliff', 'promontory', 'sandbar', 'geyser', 'daisy', 'mushroom', 'hay', 'rapeseed', 'corn', 'acorn', 'fungus', 'bolete', 'agaric', 'leaf', 'pot', 'tree', 'hip', 'buckeye', 'ear', 'slipper', 'stinkhorn', 'earthstar', 'hen-of-the-woods', 'bee', 'butterfly', 'bird', 'jay', 'heron', 'fox', 'wolf', 'deer', 'monkey'],
  water: ['seashore', 'lakeside', 'boathouse', 'fountain', 'breakwater', 'dam', 'canoe', 'speedboat', 'paddle', 'liner', 'schooner', 'wreck', 'yawl', 'catamaran', 'trimaran', 'fireboat', 'gondola', 'lifeboat', 'coral reef', 'scuba', 'snorkel', 'submarine', 'pier', 'container ship', 'aircraft carrier', 'water'],
  night: ['spotlight', 'candle', 'torch', 'lampshade', 'jack-o', 'fire screen', 'planetarium', 'radio telescope', 'matchstick', 'stage'],
  fabric: ['jersey', 'kimono', 'gown', 'velvet', 'wool', 'cardigan', 'trench coat', 'fur coat', 'miniskirt', 'stole', 'abaya', 'cloak', 'poncho', 'sarong', 'brassiere', 'bikini', 'maillot', 'apron', 'quilt', 'handkerchief', 'feather boa', 'mitten', 'sock', 'shower curtain', 'dishrag', 'pajama', 'vestment', 'overskirt', 'hoopskirt', 'military uniform', 'lab coat'],
  abstract: ['jigsaw', 'maze', 'honeycomb', 'web site', 'crossword', 'envelope', 'chain mail', 'window screen', 'doormat', 'prayer rug', 'book jacket', 'comic book', 'screen', 'monitor', 'television', 'oscilloscope', 'menu', 'packet', 'rule', 'slide rule', 'digital clock', 'pinwheel', 'binder', 'tray'],
};

let classifierPromise = null;

export function preloadClassifier() {
  if (classifierPromise) return classifierPromise;
  classifierPromise = (async () => {
    const { vision, fileset } = await loadVision();
    const make = (delegate) => vision.ImageClassifier.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL, delegate }, maxResults: 10, runningMode: 'IMAGE' });
    return await make('CPU');   // one image, once: CPU is fast enough and works everywhere
  })().catch((e) => { console.warn('[classify] unavailable:', e); return null; });
  return classifierPromise;
}

/** → { labels: [{name, score}], content: {portrait, city, nature, water, night, fabric, abstract}, top } */
export async function classifyContent(canvas, timeout = 9000) {
  const empty = { labels: [], content: Object.fromEntries(Object.keys(KEYWORDS).map((k) => [k, 0])), top: null };
  const c = await Promise.race([preloadClassifier(), new Promise((r) => setTimeout(() => r(null), timeout))]);
  if (!c) return empty;
  try {
    const res = c.classify(canvas);
    const cats = res.classifications?.[0]?.categories || [];
    const labels = cats.map((k) => ({ name: (k.displayName || k.categoryName || '').toLowerCase(), score: k.score }));
    const content = { ...empty.content };
    for (const l of labels) for (const [cat, words] of Object.entries(KEYWORDS)) {
      if (words.some((w) => l.name.includes(w))) content[cat] += l.score;
    }
    for (const k in content) content[k] = Math.min(1, content[k] * 1.6);
    const top = Object.entries(content).sort((a, b) => b[1] - a[1])[0];
    return { labels, content, top: top[1] > 0.08 ? top[0] : null };
  } catch (e) {
    console.warn('[classify] failed:', e);
    return empty;
  }
}
