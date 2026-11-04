# Photo to Sound

A photograph crosses into another dimension and becomes a 3-minute
audiovisual piece: raw, hypnotic, dark and minimal, built from the most basic
materials. References are Alva Noto (*Unieqav*, "Uni Mia"), Ryoji Ikeda and
Raster-Noton.

The app reads what is in the image and chooses how it dissolves and how it
sounds. A hash of the file seeds every choice, so the same photo always
produces the same piece. Everything runs in the browser and the photo is never
uploaded. Only three.js, MediaPipe and the face model are downloaded from
CDNs.

Round 3 returned to the first version and reduced it. See `docs/ROUND3.md`
(what was removed, restored and kept, and the layer names) and
`docs/V1_VS_V2.md`.

## Run

The site is static, with no build step and `index.html` at the root (ready for
GitHub Pages).

```bash
python3 -m http.server 8000
```

**Deep links for testing:**

- `#demo=ii` loads demo ii.
- `#world=FLOW` forces the world.
- `#section=PEAK&at=4` or `#bar=40` jumps into the piece.

## Experience

1. **Landing.** A black screen, one line, a near-invisible drop zone, and
   `demo i ii iii`.
2. **Reading.** The photo appears sharp. A scan line passes while small
   readouts name what the analysis finds, ending with the world.
3. **The piece**, about 3 minutes, then it loops:

| Section | Sound | Image |
|---|---|---|
| INTRO | sub and sparse clicks | the photo's world forms |
| BUILD | the kick arrives alone, then repeats insistently; clicks grow | hypnotic, one world |
| PEAK | at most 5 layers; glitch accents; a storm | dense; white glitch flashes |
| *collapse* | one huge glitch, then a silent bar | white flash; the photograph coheres for one bar |
| FALL | a heartbeat, one very low tone interval, thinning clicks, the sub gliding down | the accent world appears softly |
| SILENCE | a last breath, then nothing | black |

**The hand.**

- Moving the cursor or finger cuts through the piece as a force field. Things
  bend, flip and get knocked aside, then spring back.
- Crossing a strong edge of the photo makes a click.
- A still press reveals the original photo under the finger.

**Controls** appear on hover or tap: pause, new, volume, and rec (WebM). Click
the world name (bottom right) to switch worlds. **M opens the sound mixer.**

## Image → world (the visual hand)

Each photo gets **one** world from its features:

| World | Chosen by | What it does |
|---|---|---|
| **DISSOLUTION** | faces, portraits, organic subjects | luminous pixel particles in the photo's colours; the face holds longest; particles tunnel on sound events and have faint superposed ghosts |
| **RASTER** | straight lines, architecture, horizons | scanlines and barcode stripes that shift on the beat and stretch beyond the frame |
| **ORBIT** | stars, lights, water, circular forms | rings around the brightest points; each kick sends a ripple; particles jump between orbits |
| **TOPOGRAPHY** | smooth gradients, landscapes, sky | brightness as a height map: contour lines on a breathing terrain |
| **FLOW** | motion, blur, fabric | streaks along the image's structure-tensor field, teleporting on glitches |
| **MATRIX** | flat, graphic, abstract | data cells, binary digits, flipping and reordering cells |

On top of the world, the **quanta** are the photo's own contours (edge strokes,
iso-lines, straight lines). They never stay on screen: they appear for a few
frames on sound events as fragments, displaced (tunneled) copies and
superposed ghosts, flickering by probability. At the collapse they all snap
in at once.

**Every GLITCH sound is one white flash:** full white on accents, Ikeda-style
white bands otherwise. Images use black, white, one cold accent, and their own
colours sparingly.

## Image → sound

There are seven layers, with at most five sounding at once. Each photo uses a
small, distinct set, and press **M** to see and solo them.

| Layer | Sound |
|---|---|
| KICK | sine kick with a fast pitch drop + an impulse transient |
| SUB | clean sub sine: slow drone, or gated pulses between the kicks |
| CLICK | the v1 clicks (impulse, noise tick, 6.2 kHz ring, 3.1 kHz square) |
| NOISE | short, precisely gated band-passed noise bursts *(only some photos)* |
| DATA | pixel rows played as waveforms, or telephone dial pulses *(only some photos)* |
| GLITCH | click cluster + crushed data slice + 20 ms noise slab, always with a white flash |
| TONE | one very low sine interval, once, after the collapse |

**Mappings:**

| Image | Sound |
|---|---|
| world | kick pattern (4/4, half-time, 1 + 11), sub mode (drone or pulse), data kind (stutter or dial), swing, click density, silence, glitch rate |
| brightness | tempo (112–128 BPM) and root (≈ 37–58 Hz) |
| contrast | kick weight and decay |
| edge density | click count and micro double-clicks |
| saturation / edges / graphic | whether the NOISE and DATA layers exist at all |
| image grid (64 × 32) | the sequencer reads 16 columns across the width and a band of 8 rows that scans top → bottom over the loop; columns → steps (Euclidean), x → pan |

**Repetition.** Patterns are fixed per 4-bar phrase, and each bar changes at
most one detail. Silence is part of the composition.

**Timing.**

- A worker clock schedules 150 ms ahead. Step times come from integer step
  indices, so nothing drifts.
- Every scheduled sound also goes to a queue that the visuals read against the
  same audio clock (one event → one visual action).

## Files

```
index.html              page, import map, always-on upload/drop script
css/style.css           gallery black, hairlines, monospace; mixer
js/main.js              flow, UI, overlay, the hand, mixer
js/analysis.js          features, grid, palette, signature
js/structures.js        edge strokes, iso-contours, straight segments
js/face.js              MediaPipe face detection
js/worlds.js            features → world, sound styles, seeded params
js/audio/composer.js    the arc, phrase patterns, layer budget
js/audio/engine.js      voices, per-layer buses, scheduler, limiter
js/visuals/engine.js    renderer, world mix, white flashes, collapse
js/visuals/quanta.js    contour flashes (superposition, tunneling, collapse)
js/visuals/field.js     the hand's force field
js/visuals/*.js         the six worlds + shared GLSL
js/demo.js              three procedural demo images
Test_Images/            test photos
docs/                   ROUND3, V1_VS_V2, TEST, research and round-2 design
```
