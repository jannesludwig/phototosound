# Photo to Sound

A photograph becomes a **sound map**: a tilted terrain of thin lines on
black. A scan line reads it once, and what it hears is recorded. Then the map
**comes alive** as a technical, quantum-mechanical organism:

- a heart beats at the photo's focal point
- the other peaks pulse in their own periods
- nerves grow from the heart and click when impulses arrive
- waves interfere

Finally the organism overloads and erodes, and the piece ends with one white
flash, the crash. Every rhythm comes from the geometry of the image, and
every sound lights up the place on the map that made it. The photo stays
visible on the terrain, most clearly at the epicenter.

References are Alva Noto, Ryoji Ikeda and Raster-Noton. The look is
technical, organic, dark and minimal.

A hash of the file seeds every choice, so the same photo always produces the
same piece. Everything runs in the browser and the photo is never uploaded.
Only three.js, MediaPipe and the face model are downloaded from CDNs.

See `docs/ROUND5.md` for the story and its timing, how each system is derived
from the image, and every layer name. Earlier rounds are in `docs/ROUND4.md`,
`docs/ROUND3.md` and `docs/V1_VS_V2.md`.

## Run

The site is static, with no build step and `index.html` at the root (ready for
GitHub Pages).

```bash
python3 -m http.server 8000
```

**Deep links for testing:**

| Link | What it does |
|---|---|
| `#demo=ii` | loads a demo image |
| `#section=LIFE&at=20` | jumps to bar 20 of a section |
| `#bar=40` | jumps to a bar |
| `#loop=1` | starts in loop mode |

## Experience

1. **Landing.** A black screen, one line, a near-invisible drop zone, and
   `demo i ii iii`.
2. **Analysis.** The photo appears and is analysed. Readouts name the focal
   point, the terrain and the sound map.
3. **The piece**, about 3 to 3.5 minutes, runs once by default:

| Phase | Sound | Image |
|---|---|---|
| READING | sub, edge clicks, the read head's dry ticks (recorded) | the photo tilts back into 3D and morphs into contour lines behind the scan |
| AWAKENING | near silence, then the first heartbeat | the heart's rings appear at the epicenter |
| LIFE | heart, nerves, peaks, interference, memory, kicks; erosion late. Layers enter one by one, at most ~6 | waves, growing circuit traces with impulses, pulsing peaks; the photo held at the epicenter; 2 superpositions |
| DECAY | the heart stumbles, peaks sleep, the rhythm fragments, one low tone, erosion ticks | an erosion front eats inward; nerves die from the leaves; the core goes last |
| END | the crash | the only full-screen white flash, then back to the upload screen |

The **loop** toggle at the bottom plays the piece again instead of asking for
a new image.

**The hand.**

- The slider on the right edge rotates the map, and so does click-dragging.
- The cursor bends the terrain as a force field.
- Crossing a strong edge makes a click.
- A still press reveals the photo on the terrain under the finger.

**Controls** appear on hover or tap: pause, new, volume, rec (WebM) and loop.

**M opens the mixer:**

- **systems**: one switch per system (HEARTBEAT, POLYRHYTHM, INTERFERENCE,
  NERVOUS SYSTEM, MEMORY, EROSION, SUPERPOSITION, PHOTO ON MAP)
- every **sound** and **visual** layer, with mute, solo and meters
- **copy settings**

## Image → organism → sound

| From the image | System | Sound |
|---|---|---|
| focal point (eye, light, most salient place) | the heart, the epicenter | HEART: sub lub-dub; waves run out |
| other summits (height → period, position → phase) | peaks, a polyrhythm in a 2-bar cycle | PEAKS: low sine knocks |
| hard edges, ridges, rough places, linked from the heart | the nervous system (circuit traces) | NERVES: clicks / noise grains when impulses arrive; path length = timing |
| where two waves meet | interference | INTERFERENCE: crushed click doublet + noise slab |
| what the scan heard while reading | memory | MEMORY: re-sequenced, crushed fragments |
| steepest descent from peaks into valleys | erosion | EROSION: fine ticks on arrival |
| brightness | tempo (100–114 BPM) and root | — |

**Timing.**

- A worker clock schedules 150 ms ahead from integer step indices, with
  micro-timing from the geometry.
- Every scheduled sound also goes to a queue that the visuals read against
  the same audio clock (one event → one place on the map).

## Files

```
index.html              page, import map, always-on upload/drop script (Safari fix)
css/style.css           gallery black, hairlines, monospace; yaw slider; mixer
js/main.js              flow, UI, annotations overlay, the hand, rotation, mixer (systems)
js/analysis.js          features, grid, palette, signature
js/structures.js        edge strokes, iso-contours, straight segments
js/face.js              MediaPipe face detection (box + eye keypoints)
js/map.js               the sound map: height, ridges, texture, focal point, params
js/organism.js          heart, peaks, nerve tree, erosion streams — derived from the map
js/audio/composer.js    the story (READING → AWAKENING → LIFE → DECAY → END), all systems
js/audio/engine.js      voices, per-layer buses, scheduler, limiter, one-shot/loop
js/visuals/engine.js    renderer, photo → terrain, projection, phase mix, layer toggles, crash
js/visuals/terrain.js   terrain, photo core/pixels/reveal, waves, interference, flares, superposition
js/visuals/orbit.js     HEART rings and PEAKS markers
js/visuals/nerves.js    NERVES: circuit traces and impulses
js/visuals/erosion.js   EROSION: light draining downhill
js/visuals/edges.js     EDGE FLASH
js/visuals/crumble.js   CRUMBLE: border particles in decay
js/visuals/field.js     the hand's force field
js/visuals/common.js    shared GLSL (terrain height + pose), layer base
js/demo.js              three procedural demo images
Test_Images/            test photos
docs/                   ROUND5 (current), ROUND4, ROUND3, V1_VS_V2, TEST (round 3), research
```
