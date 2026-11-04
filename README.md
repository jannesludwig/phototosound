# Photo to Sound

A photograph crosses into another dimension and becomes a 3-minute
audiovisual performance: precise, digital, cold and beautiful, with a beat you
can nod to. References are Alva Noto's *Unieqav*, Ryoji Ikeda, Raster-Noton,
Kurokawa and Quayola.

**The image is the score.** The app extracts the photo's actual forms: its
strokes, contours, straight lines, corners, points of light, colour regions,
salient regions and empty areas. Each one becomes **both a visual element and
a sound**, scheduled on one timeline:

- a stroke draws itself with a soft tick, then detaches with a filtered noise
  tick
- a point of light flashes with a click
- a colour region slides apart with a noise burst
- a straight line extended across the screen flashes with a rim

Every photo has different structures, so every photo becomes a different
piece. A hash of the file seeds every choice, so the same photo always gives
the same piece. Each loop pass mutates, so the piece never repeats itself.

Everything runs locally in the browser and the photo is never uploaded. Only
the libraries and model weights are downloaded: three.js and MediaPipe Tasks
Vision from jsDelivr, and the model files from Google's model storage.

## Run

The site is static, with no build step and `index.html` at the root (ready for
GitHub Pages).

```bash
python3 -m http.server 8000
```

**Deep links for testing:**

- `#demo=ii` loads demo ii.
- `#section=PEAK&at=4` starts 4 bars into the peak.
- `#bar=40` starts at bar 40.
- `#layer=fragments` forces the lead layer.

`tools/report.html` runs the full analysis and score on the built-in images or
on your own photos and prints a comparison table (see `docs/TEST.md`).

## The performance

| | Section | ≈ time | Sound | Image |
|---|---|---|---|---|
| 1 | **Reading** | 0:00–0:20 | sub drone, single clicks and ticks | the photo dims to a ghost; its strokes, face contours and contour levels draw themselves one by one; points light up |
| 2 | **Decomposition** | –0:55 | the pulse enters, first bass phrases | the lead layer takes the image apart; strokes detach and drift on beats |
| 3 | **Build** | –1:40 | hats, rims, snare, bass, textures; filters open; fills every 8 bars | the second and third layers enter; tension rises steadily |
| 4 | **Peak** | –2:10 | full track, polyrhythmic clicks, stutters | the **signature moment**, then a white flash into black |
| 5 | **Afterglow** | –2:40 | low pads from the photo's colours, sub notes, a soft heartbeat | elements fall away |
| 6 | **Memory** | –3:00 | one tone, then silence | a faint ghost of the photo |

- **Section lengths vary per photo.** For example, empty dark areas give a
  longer Reading and Memory, dense images a longer Build, and faces a longer
  Afterglow.
- **A tension curve drives both engines.** In sound it sets filter cutoff,
  density and FM index; in image it sets drift, brightness, glitch rate and
  terrain tilt.
- **The signature moment** is chosen from the image:
  - RECONSTRUCT: the photo rebuilds itself from its fragments.
  - GRID: everything snaps to a grid.
  - NETWORK: every point is linked.
  - SWEEP: a full pixel-sort sweep.
  - STRATA: contour terraces separate in depth.

**The hand.**

- The cursor or finger is a force field. Lines bend around it, cells flip,
  points are knocked out of orbit, fragments are pushed aside, and everything
  springs back with inertia.
- The effect scales with speed.
- Sound reacts: a granular scrub of the image row under the cursor, a filter
  that opens with speed, and clicks when crossing strong edges.
- A still press (hold) reveals the original photo under the finger.

**UI.** Corner readouts show the signature, BPM, root, mode, section, tension,
bar and pass, the vocabulary and the mood. Controls appear on hover or tap:
pause, new, volume and rec (WebM of image and sound). Click the vocabulary
(bottom right) to choose which layer leads. Space toggles pause.

## Analysis → structures

All analysis is at most 256 px (light points at 512 px). See `js/analysis.js`
and `js/structures.js`.

| | Method |
|---|---|
| strokes | Sobel → non-max suppression → hysteresis; 8-connected chains → RDP polylines |
| contours | marching squares on smoothed luminance at quantile levels |
| straight lines | Hough with orientation-checked runs, so they are real segments with endpoints |
| corners | Shi–Tomasi with spacing |
| light points | compact bright blobs on dark ground |
| colour regions | k-means in an opponent colour space; connected components |
| fragments | Bowyer–Watson Delaunay over corners and stroke points, coloured by the pixels underneath |
| salient regions | centre–surround in L, a, b |
| voids | dark, flat cells |
| symmetry, colourfulness, temperature | mirror correlation; Hasler–Süsstrunk; chroma-weighted R − B |
| face + landmarks | MediaPipe FaceDetector, then FaceLandmarker contours (only when a face exists) |
| content | MediaPipe ImageClassifier (EfficientNet-Lite0 int8, ImageNet) → portrait, city, nature, water, night, fabric, abstract |
| global features | brightness, contrast, saturation, hue, edge density, line strength (Hough coverage), smoothness, structure-tensor flow, flatness, colour count, palette |
| pixel sorting | rows and columns sorted inside edge/brightness intervals (ASDF-style) |

**Mood** is a subtle vector: warmth, energy, darkness, openness and intimacy.
The nearest named prototype is one of warm / intimate, cold / clinical,
dark / mysterious, vast / calm, tense / dense, or vivid / restless.

## Image → sound

The voice set is deep minimal techno: three kick characters, sub, a 2-operator
FM bass, digital rims, the bright glitch clicks, noise snare/clap, hats, low
pads, crackle, bitcrushed hiss, granular image grains, data stutters, an impact
and a memory tone.

There are **no high sine tones**. Tonal content stays below about 1.5 kHz, and
highs come only from transients and noise.

| Image | Sound |
|---|---|
| mood | tempo range (106–128) and mode (Dorian, quartal, Phrygian, Lydian, Aeolian, Mixolydian) |
| dominant hue | root (≈ 37–69 Hz) |
| colour regions (by area, hue) | the pad chords (never sweet: open voicings) |
| strokes | bass phrases: the stroke's vertices are the notes, its height is the pitch |
| straight lines | rims: endpoints → steps, angle → pitch; lines also mean straight 4/4 |
| corners (x-histogram) | which 16ths carry hats |
| light points / corners | clicks in a 3-, 5- or 7-step polyrhythm, each flashing its point |
| salient regions | data stutters (the image row played as a waveform) |
| contrast | weight of the kick |
| darkness | deep, long kick; hiss |
| flow / blur | shuffle and ghost kicks |
| face, intimacy | sparse, soft kick; more pad; longer afterglow |
| voids | silence: mutes and fewer layers |
| detail, warmth | crackle |
| x position of any source | stereo pan |

Each voice has an *amount* computed from the photo. A voice below the threshold
does not exist for that photo, which is why instrument sets differ.

**Mix.**

- **Ducking:** pads, textures and bass are sidechained by gain automation
  scheduled at each kick.
- **Low end:** the bass bus is mono and saturated, and the reverb is a dark
  generated impulse response on pads and tone only.
- **Master:** high-pass, light tanh saturation, then a limiter.

**Timing.**

- A worker clock schedules 150 ms ahead. Step times come from integer step
  indices, so nothing drifts.
- Every scheduled sound also goes to a queue that the visuals read against the
  same audio clock.

## Image → visual vocabulary

There are no fixed worlds. The score picks a weighted vocabulary of layers for
each photo (A, B, C enter in Decomposition and at ⅓ and ⅔ of the Build), plus
contours and a constellation in the Reading.

| Layer | Built from | Weighted by |
|---|---|---|
| contours | strokes, face contours, iso-contours | always |
| constellation | light points, corners, landmarks, Delaunay links | corners, points, night |
| topography | luminance height field | smoothness, openness, nature/water |
| fragments | Delaunay mosaic grouped by colour region | colour regions, colourfulness, faces |
| sort | pixel-sorted bands | flow, detail, fabric |
| barcode | straight lines extended to the screen edge | line strength, city |
| particles | pixel grid (the face holds longest) | face, organic |
| flow | structure-tensor streamlines | flow, fabric |
| matrix | quantised data cells | graphic, abstract |
| orbit | rings and orbits around light points | points on dark ground, radial forms |
| glitch | salient regions | saliency |

## Files

```
index.html               page + import map
css/style.css            gallery black, hairlines, monospace
js/main.js               flow, UI, overlay, the hand
js/analysis.js           global features, palette, signature
js/structures.js         strokes, contours, lines, corners, regions, fragments, saliency, voids, sort
js/face.js               MediaPipe face detection + landmarks
js/classify.js           MediaPipe image classifier → content
js/mood.js               mood vector + prototype
js/score.js              the shared timeline: plan, sections, tension, events
js/audio/engine.js       voices, mix, scheduler, cursor sound
js/visuals/engine.js     renderer, layer orchestration, flash, ghost
js/visuals/field.js      cursor force field (spring grid)
js/visuals/*.js          the layers + shared GLSL
js/demo.js               three demo images (i nocturne, ii facade, iii dune)
js/testimages.js         seven procedural test photographs
tools/report.html        analysis/score comparison table
docs/RESEARCH.md         research notes
docs/DESIGN.md           design decisions
docs/TEST.md             test report: features, moods, instruments, vocabularies, timing
```
