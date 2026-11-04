# Photo to Sound

A photograph becomes a **sound map**: a tilted terrain of thin lines on
black, with a scan line that crosses it and sonifies what lies beneath. Every
sound lights up the place on the map that made it. The image is consumed over
a slow, experimental piece of about 3 to 3.5 minutes. The piece ends with
one white flash, the crash, then asks for a new image.

References are Alva Noto, Ryoji Ikeda and Raster-Noton. The look is
technical and organic, like an alien organism made of technology.

A hash of the file seeds every choice, so the same photo always produces the
same piece. Everything runs in the browser and the photo is never uploaded.
Only three.js, MediaPipe and the face model are downloaded from CDNs.

**Round 4** replaced the six worlds with this single visual language. See
`docs/ROUND4.md` for every sound and visual layer, the arc, and the tests.
Earlier rounds are described in `docs/ROUND3.md` and `docs/V1_VS_V2.md`.

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
| `#section=INTENSIFY&at=4` | jumps to bar 4 of a section |
| `#bar=40` | jumps to a bar |
| `#loop=1` | starts in loop mode |

## Experience

1. **Landing.** A black screen, one line, a near-invisible drop zone, and
   `demo i ii iii`.
2. **Reading.** The photo appears and is analysed. Small readouts name the
   focal point, the terrain and the sound map.
3. **The piece** runs once by default:

| Section | Sound | Image |
|---|---|---|
| MAPPING | no beat: sub, sparse clicks, the scanned columns transmitted as data | the photo folds into a terrain; the first sweep maps it |
| LISTENING | slow: hum, valley resonances, rare kicks on ridges | contours; the orbit breathes at the focal point |
| INTENSIFY | denser: irregular kicks, sub pulses, glitches; phrases without a beat | fine contours, wire flashes, local flares, rare slicing |
| CONSUMPTION | the beat leaves, one low tone, the sub glides down | lines break, the border crumbles, colour drains |
| END | the crash, then nothing | the only full-screen white flash |

After the crash the landing returns and asks for a new image. The **loop**
toggle at the bottom plays the piece again instead.

**The hand.**

- The slider on the right edge rotates the map. Click-dragging on the map
  rotates it too.
- Moving the cursor bends the terrain as a force field, which springs back.
- Crossing a strong edge makes a click.
- A still press reveals the original photo under the finger.

**Controls** appear on hover or tap: pause, new, volume, rec (WebM) and loop.

**M opens the mixer:** every sound and visual layer, with mute, solo, live
meters and a **copy settings** button.

## Image → map → sound

| Image | Map | Sound when the scan line crosses it |
|---|---|---|
| hard edges | ridges | CLICK; the hardest give a GLITCH |
| bright, high ground | high ridges | KICK (rare and irregular, never 4/4) |
| rough texture | rough ground | NOISE bursts; particles break off the border |
| dark, flat areas | valleys | space, RESONANCE |
| eye, light or most salient point | the focal summit | a SUB swell; the orbit rings breathe |
| each column | the scanned column | TRANSMISSION (rows as bits), DATA |

**Per-photo parameters:**

| Image feature | Sets |
|---|---|
| contrast | relief, kick decay |
| tonal range | number of contour levels |
| brightness | tempo (100–114 BPM) and root |
| edge density | click density, section lengths |
| graphic or flat images | terraced into plateaus, and keep more wireframe |

**Sound layers:** KICK, SUB, PULSE, HUM, RESONANCE, CLICK, NOISE, DATA,
TRANSMISSION, GLITCH, TONE, CRASH. There is a soft budget of 6 sounding at
once.

**Visual layers:** TERRAIN, CONTOURS, WIREFRAME, RIDGES, SCAN, FLARES,
DEFORM, DECAY, EDGE FLASH, ORBIT, CRUMBLE, SLICING, ANNOTATIONS, CRASH,
HAND.

**Timing.**

- A worker clock schedules 150 ms ahead from integer step indices, so nothing
  drifts.
- Every scheduled sound also goes to a queue that the visuals read against
  the same audio clock (one event → one place on the map).

## Files

```
index.html              page, import map, always-on upload/drop script (Safari fix)
css/style.css           gallery black, hairlines, monospace; yaw slider; mixer
js/main.js              flow, UI, annotations overlay, the hand, rotation, mixer
js/analysis.js          features, grid, palette, signature
js/structures.js        edge strokes, iso-contours, straight segments
js/face.js              MediaPipe face detection (box + eye keypoints)
js/map.js               the sound map: height, ridges, texture, focal point, params
js/audio/composer.js    the arc, the scan, map → events, silence, layer budget
js/audio/engine.js      voices, per-layer buses, scheduler, limiter, one-shot/loop
js/visuals/engine.js    renderer, photo → terrain, projection, layer toggles, crash flash
js/visuals/terrain.js   the terrain: contours, wire, ridges, scan, flares, deform, decay
js/visuals/edges.js     EDGE FLASH
js/visuals/orbit.js     ORBIT around the focal point
js/visuals/crumble.js   CRUMBLE: border particles
js/visuals/slicing.js   SLICING: rare quantum slices
js/visuals/field.js     the hand's force field
js/visuals/common.js    shared GLSL (terrain height + pose), layer base
js/demo.js              three procedural demo images
Test_Images/            test photos
docs/                   ROUND4 (current), ROUND3, V1_VS_V2, TEST (round 3), research
```
