# Design: Photo to Sound, round 2

Problem from round 1: every photo went through one of six fixed templates.
Global averages chose the template and the template did the rest, so after
three photos everything looked and sounded alike.

**Principle:** *the image is the score.* The analysis extracts the photo's
actual structures: strokes, contours, lines, corners, light points, colour
regions, salient regions and empty regions. Each structure becomes **both** a
visual element and a sound source. A single **score object** schedules all of
them on one timeline (Henke's *Lumière*: one script for light and sound;
Ikeda: one event → one change). No two photos share the same structures, so
no two pieces can share the same events.

```
photo ─► analysis ─► structures + features + mood + content
                          │
                          ▼
                 score (per photo, per pass)
           tempo · key/mode · sections · tension
           instruments · vocabulary · signature
           timed events: reveal / detach / fracture / flash / …
             │                                   │
             ▼                                   ▼
 audio engine (lookahead)              visual engine (layers)
 voice per event ── same audio clock ── element per event
```

## 1. Analysis

The global features from round 1 stay (they are good descriptors). New
**structures** are added, all extracted on a 256 px copy unless stated
otherwise:

| Structure | Algorithm | Output | Used by |
|---|---|---|---|
| strokes | Sobel → NMS → hysteresis → 8-connected chain tracing → RDP | ≤ 140 polylines, each with length and mean edge strength | contour layer (self-drawing lines), bass phrases, rim/tick sounds |
| iso-contours | marching squares on blurred L at 5–9 quantile levels | polylines per level | contour layer and topography reveal |
| line segments | Hough with orientation-restricted voting, peaks walked into real covered runs | ≤ 24 segments with endpoints | barcode layer, rims, straight rhythm |
| corners | Shi–Tomasi, NMS, spacing ≥ 6 px | ≤ 220 keypoints with response | constellation, fragments (Delaunay), hats |
| light points | compact bright blobs on dark ground (512 px) | ≤ 60 points | constellation flashes, glitch clicks, orbit |
| colour regions | k-means (k = 6) in Lab-ish space on 96 px | label map, clusters (area, colour, centroid) | fragments (groups), pad harmony |
| fragments | Bowyer–Watson Delaunay over corners, edge samples and the border | ≤ 900 triangles, each with mean colour and cluster | fragment layer |
| saliency | centre–surround DoG on L, a and b | map + ≤ 8 salient regions | glitch emitters, stutters |
| voids | low-variance dark cells (32 × N grid) | void mask + fraction | silence, empty space |
| symmetry | mirror correlation (left–right, top–bottom) + radial | scores | rhythm symmetry, peak choice |
| colour metrics | colourfulness (Hasler–Süsstrunk), temperature (chroma-weighted R − B) | scalars | mood |
| face | MediaPipe FaceDetector, then FaceLandmarker (only if a face is found) | box + 478 landmarks + contour connections | face contours, intimacy |
| content | MediaPipe ImageClassifier (EfficientNet-Lite0 int8), keyword map | weights: portrait, city, nature, water, night, fabric, abstract | subtle bias on mood, vocabulary and instruments |

**Mood** (kept subtle) is a continuous vector plus the nearest named
prototype:

- `warmth` = colour temperature
- `energy` = edges, contrast, corner density, colourfulness, minus smoothness
- `darkness` = 1 − brightness
- `openness` = smoothness, voids, few edges, nature/water
- `intimacy` = face, organic subject

| Prototype | Condition | Mode | Pad | Tempo | Kick |
|---|---|---|---|---|---|
| warm / intimate | warmth, intimacy | Dorian, minor9 / sus2 voicings | triangle-saw, open filter | 108–116 | soft |
| cold / clinical | low warmth, lines/graphic | quartal (0 5 10 15), no thirds | sine-saw, narrow | 118–124 | tight |
| dark / mysterious | darkness | Phrygian, ♭2 colour | dark saw, low cutoff | 112–120 | deep, long |
| vast / calm | openness | Lydian / open fifths, add9 | slow, wide | 106–114 | soft, sparse |
| tense / dense | energy | Aeolian clusters + tritone | short, pulsing | 122–128 | tight, driven |

## 2. Score and dramaturgy (`js/score.js`)

The piece is about 3 minutes. Sections are measured in bars, computed from
target seconds that **vary per image**: for example, voids give a longer
Reading and Memory, energy gives a longer Build, and a face gives a longer
Afterglow. Each section also gets seeded jitter. Lengths round to even bars
and the total is normalised to 180 s ± 6.

| Section | Target | Sound | Image |
|---|---|---|---|
| READING | ≈ 0:00–0:20 | sub drone, single clicks and ticks, near silence | the photo dims to a ghost; strokes draw themselves, contours appear level by level, points light one by one, **each with its own sound** |
| DECOMPOSITION | –0:55 | the pulse enters (kick on 1, then the full pattern), first bass | the lead vocabulary takes the image apart; strokes detach and drift on beats |
| BUILD | –1:40 | hats, rims, snare, bass phrases, textures; filters open; fills every 8 bars | the second and third vocabularies enter at ⅓ and ⅔; tension rises steadily, with a micro-arc every 8 bars |
| PEAK | –2:10 | full track, polyrhythmic clicks, stutters | the **signature moment** (below), ending in a white flash on the downbeat, then black |
| AFTERGLOW | –2:40 | kick gone or a soft heartbeat; pad chords derived from the palette; sub notes | elements fall away (gravity, decay), only lines remain |
| MEMORY | –3:00 | one tone, then silence | a faint ghost of the photo, then black |

The **tension curve** `T(t) ∈ [0, 1]` is piecewise per section: Reading
0.05→0.15, Decomposition 0.2→0.45, Build 0.45→0.85 plus a micro-arc every
8 bars, Peak 0.9→1, Afterglow 0.35→0.15, Memory 0.1→0. Both engines read
`T`. In sound it drives filter cutoff, layer density, ghost notes and FM index.
In image it drives drift distance, line brightness, glitch rate and terrain
tilt.

**Signature moments.** One is chosen per image, ranked by the features with
seeded tie-breaking:

| Moment | Chosen by | What happens |
|---|---|---|
| RECONSTRUCT | face, organic, fragments | all fragments and particles fly back and the photo assembles itself from its own pieces |
| GRID | lines, graphic | every vertex and point snaps to a grid; the matrix fills |
| NETWORK | points, night | the constellation links every point; links pulse on 16ths |
| SWEEP | flow, texture | a full pixel-sort sweep runs down the image |
| STRATA | smooth gradients | contour levels separate in depth, then collapse flat |

**Loop with mutation.** Pass `p` uses `seed' = hash(seed, p)`. Section lengths
are re-jittered, the vocabulary order rotates (the lead can change to the
second-ranked layer), the signature moment moves to the next-ranked one, and
patterns rotate. The same photo therefore gives the same *sequence* of passes,
but no pass repeats the previous one.

**One-to-one.** Every timed structural action (reveal contour *i*, light
point *j*, detach stroke *k*, slide cluster *c*, flash region *r*) is created
by the score with an exact step. The audio engine schedules its sound at that
step, and the visual layer reads the same time from per-element attributes,
`progress = (pieceTime − t_i) / d_i`, against the same audio clock. The sync
is guaranteed by construction, not by analysing the audio.

## 3. Sound (`js/audio/engine.js`)

**Removed:** all high sine tones and the high-register harmonic sets. Tonal
content stays below about 1.5 kHz. Highs exist only as clicks, transients and
noise.

**Voices** (all synthesised, no samples):

| Voice | Design | Driven by |
|---|---|---|
| kick | sine, pitch 3.6× → 1.35× → 1× over 90 ms, plus a separate impulse click. Characters: deep, tight, soft. | contrast (weight), mood (character) |
| sub | sine notes with slow attack, mono, sidechained | drone in Reading, notes in Afterglow |
| bass | 2-op FM (ratio 0.5/1/2 from the image), index envelope scaled by tension → LP ≤ 900 Hz → tanh | phrases from **strokes**: y-profile → scale degree, curvature → note placement |
| rim | 1–6 ms sine/triangle burst at 400–1600 Hz with a pitch drop, plus a noise tick | **line segments** (endpoint x → step) and contour reveals |
| click | 1–64-sample impulse buffers, hard pan by x (the liked Alva Noto click) | **light points** and corners, always with a visual flash |
| snare / clap | BP noise at 1.2–2.5 kHz, clap = 3 spikes 10 ms apart, plus a 180 Hz body | energy, Build/Peak only |
| hat / shaker | HP noise at 6–9 kHz, 10–60 ms, swing | **corner x-histogram** → which steps |
| pad | per voice 2 detuned saws/triangles → LP 300–1300 Hz, attack 1.5–4 s, dark generated reverb | chords from the **colour clusters** (hue → scale degree), mode from mood |
| textures | crackle, bitcrushed hiss, granular image-row grains, buffer stutters | detail, darkness, flow, saliency |
| tone | one soft low-mid sine/triangle (≈ 200–400 Hz) | Memory |

**Per-image instrumentation.** Each voice has an *amount* computed from
features. Voices under a threshold do not exist for this photo. Examples:

- many corners → dense hats and clicks
- large voids → more silent bars and fewer layers
- strong lines → straight 4/4, rims on the grid, no swing
- flow / blur → shuffle 0.1–0.22, rolling ghost kicks
- warm palette → warmer pad (triangle, higher cutoff)
- face → sparse, soft kick, more pad
- graphic → stutters and crush

**Rhythm.**

- Kick styles: straight, broken, rolling, half and sparse.
- Clicks run a polyrhythmic cycle of 3, 5 or 7 steps against 16
  (Bretschneider).
- Micro-timing: swing per style, small per-voice offsets (hats +3 ms, rims
  −2 ms), and seeded humanisation of ±2 ms.
- Fills on the last bar of 8-bar phrases. Mutes and dropouts follow the void
  fraction. Silence before every section boundary.

**Mix.**

- Buses: drums, bass (mono), pads, textures, fx.
- Sidechain by gain automation scheduled at each kick: pads −8 dB, textures
  −6 dB, bass −3 dB, release 120–220 ms.
- Saturation: tanh on the bass and lightly on the master.
- EQ: HP 150 Hz on pads and textures, LP on pads, HP on hats.
- Master: HP 25 Hz → compressor/limiter → output, with headroom for
  Chromium's automatic make-up gain.

## 4. Visuals (`js/visuals/`)

There are no more fixed worlds. Each photo gets a **vocabulary**: a weighted
set of *layers*, each built from the photo's own structures and behaviours
(Reas: element = form + behaviour).

| Layer | Form (from the image) | Behaviour |
|---|---|---|
| contours | strokes + iso-contours | draw themselves along their arc length, then detach and drift, and bend under the force field |
| topography | luminance height field (the user's favourite) | contour levels revealed one by one, terrain tilt, strata separation, waves on the kick, glow on bass notes |
| constellation | corners + light points + Delaunay neighbours | points light up with clicks; fine links draw between them |
| fragments | Delaunay triangles in image colours, grouped by colour cluster | assemble like a low-poly photo, fracture, clusters slide on beats, reassemble |
| sort | rows/columns sorted inside edge intervals (CPU) | revealed band by band, with scanlines displaced by edge strength |
| barcode | Hough segments extended to the frame edge | the segment's own luminance as binary bars, flashing with rims |
| glitch | salient regions | block displacement, RGB split and duplication on stutters; dark voids stay empty |
| particles | the pixel grid | dissolution into luminous points, with the face holding longest |
| flow | streamlines of the structure-tensor field | streaks carrying the photo's colours |
| matrix | the quantised cell grid | data cells that flip and leak; displaced and flipped by the field |
| orbit | light points | rings and Keplerian particles, knocked out of orbit by the field |

**Vocabulary per photo.**

- Reading always uses *contours + constellation*, because the image's own
  structures are what get revealed.
- A lead layer (A) enters in Decomposition, then B at ⅓ of Build and C at ⅔.
  A, B and C are the top-weighted layers.
- Glitch acts as an accent wherever saliency is high.
- The weights come from features, so a facade, a portrait and a night sky get
  disjoint vocabularies.

**Aesthetic rules.** Black ground; the photo's own colours plus white and one
cold accent; 1 px lines; no blur; no kitsch glow.

## 5. Interaction (Lieberman: lines with mass)

- The cursor or finger is a force field. A CPU spring grid (64 × 40 cells:
  displacement + velocity, spring k, damping c, neighbour diffusion) covers
  the view. Movement injects velocity along the cursor's path, scaled by its
  speed and with a radial push. The grid is uploaded each frame as a
  half-float texture, and every layer displaces its vertices (or its lookup
  coordinates) by it.
  - Results: a wake, inertia and spring-back. Matrix cells flip where the
    displacement is large, and orbit points are knocked out and swing back.
- Sound:
  - granular scrub of the image row under the cursor, scaled by speed
  - a click when the path crosses a strong edge (sampled from the edge map)
  - the pad/texture low-pass opens with cursor speed
- **Hold** (≈ 350 ms still press) reveals the original photo under the finger
  (the old "observation").

## 6. Performance

- Desktop budget: ≤ 6k contour segments, ≤ 900 fragments, ≤ 400 points,
  ≤ 24k particles, ≤ 10k streaks, at most 5 visible layers at a time. Hidden
  layers are not rendered.
- Mobile: roughly half of everything, DPR ≤ 1.5, plus adaptive resolution.
- Heavy analysis (≈ 150–400 ms) runs during the reading scan. The models load
  lazily while the landing screen is idle.
