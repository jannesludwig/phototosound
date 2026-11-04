# Round 6: "The Transmission"

The user sacrifices a photograph. It is beamed into another dimension:

1. measured
2. decomposed into its spectra
3. dissolved into entropy
4. absorbed by a singularity

Only debris remains.

This round **combines the best of all earlier rounds** instead of inventing
a new style:

| Part | Restored from |
|---|---|
| sound engine | the end of round 4 (`92012af`) |
| the five spectra | the v1 worlds, as they stood at the end of round 3 (`c99d1f2`) |
| world weights, per-photo params, sound styles | round 3 |
| the terrain and its morph | rounds 4 and 5 |

New code is limited to:

- the journey planner
- the act composer
- the entropy / singularity / debris field
- the slicing pass
- the lens

Research notes: `docs/RESEARCH_R6.md`.

## The acts

The piece runs once by default; the loop toggle stays. A bar is 240 / BPM
seconds, about 2.1–2.4 s.

| Act | Bars | Image | Sound |
|---|---|---|---|
| **0 OFFERING** | (≈ 6 s) | the photo, **intact, the only time**, while it is analysed; readouts name the focal point, terrain, sound map and the chosen spectra | silence |
| **1 MEASUREMENT** | 12–18 | the terrain tilts back with the photo on it; one slow scan line measures it; behind the scan the **photo lies underneath the flowing contour lines** in the map's perspective; low-opacity annotations | sparse, clinical (round 4): sub, the read head's dry ticks (SCANNER), clicks on hard edges, valleys ring, late dial read-outs |
| **2 DECOMPOSITION** | 28–38 | the camera pulls back; the terrain flattens onto the image plane and the image is decomposed into **2–3 of its spectra** (RASTER, ORBIT, DISSOLUTION, FLOW, MATRIX), each with its own camera angle, overlapping briefly | each spectrum has its own sound state (round 3's styles, no kicks): clicks from the image's columns, data, field textures, irregular sub pulses or a gliding drone |
| **3 ENTROPY** | 14–18 | one particle field: every point a pixel of the photo, Brownian with a drift; the photo's structures emerge and vanish; two superpositions (ghost copies flicker, then collapse on a strong beat); Ikeda bands on some glitches | the densest: Brownian clicks, noise, data and field textures, irregular pulses, pressure building |
| **4 ABSORPTION** | 6–8 | the points fall into the focal point, nearest first, in a tightening spiral; it becomes a **singularity** (a black disc, one thin ring); the camera falls with them | one low tone, then **only sub pressure** falling toward 22 Hz, then silence |
| **END** | 3 | the **crash**, the only full-screen flash; then **only debris**: sparse, colourless, broken shards, sinking. The intact photo never returns. Then the upload screen | CRASH, then nothing |

### Transitions

- **Morph.** The terrain flattens back onto the image plane while the first
  spectrum grows from the same pixels.
- **Overlap.** Spectra overlap for about a bar.
- **Quantum slicing.** At every cut, the rendered frame is cut into
  horizontal bands, displaced against each other for about 0.5 s, with
  hairlines and a few dropped rows.
- **Breath before a cut.** The bar before each cut falls silent after beat
  3.

**The round-5 bug is fixed.** The photo used to pop up intact before the
end: as the terrain faded, the offering plane showed through. Now the
offering plane retires for good once the piece passes bar 1.

## How the image decides its journey (`js/journey.js`)

| Decision | From |
|---|---|
| **Which spectra** | round 3's world weights (TOPOGRAPHY is now act 1). DISSOLUTION: faces, portraits, organic. RASTER: lines, architecture. ORBIT: light points, circles. FLOW: motion, fabric. MATRIX: graphic, flat. The top 2 are chosen, or 3 when the third is close (> 60 % of the first) |
| **Their order** | order → chaos: MATRIX → RASTER → ORBIT → FLOW → DISSOLUTION, so the decomposition itself moves toward entropy |
| **Their length** | 8 bars each, plus the rest of act 2 by weight |
| **Act lengths** | MEASUREMENT from brightness; DECOMPOSITION from detail + edge density; ENTROPY from edge density + detail; ABSORPTION seeded |
| **Camera** | how far it pulls back (1.18–1.45×), a tilt and roll per spectrum, the yaw drift in entropy, how close it falls (0.62–0.8) |
| **Colour** | the accent is the photo's most saturated palette colour, lifted. Lines, cells and particles carry the photo's own colours |
| **Tempo and root** | from brightness (100–114 BPM) |
| **Terrain** | relief, levels, wire density |
| **Densities and speeds** | raster rows and fill, matrix columns, orbit rings, flow speed |
| **Singularity** | sits at the **focal point**: an eye (MediaPipe), the brightest light, or the most salient place |
| **Sound** | each spectrum's style decides click density, data kind (dial or stutter), field textures, noise, crush, swing, silence, and drone or pulses |

Everything is seeded from the image signature: the same photo always makes
the same piece.

### Tests

Headless Chromium; the composer over all test images and the demos.

| Image | Focal | Spectra (bars) | BPM | Acts (bars) | Duration | Max layers | Clicks | Pulses | Kicks | Glitches |
|---|---|---|---|---|---|---|---|---|---|---|
| Dancer | salient | MATRIX 8 → RASTER 14 → FLOW 12 | 103.8 | 14-34-18-8-3 | 178 s | 5 | 346 | 141 | 6 | 16 |
| bw | light | RASTER 16 → ORBIT 22 | 101.6 | 14-38-18-6-3 | 187 s | 6 | 340 | 88 | 5 | 14 |
| portrait_man | **eye** | FLOW 16 → DISSOLUTION 20 | 104.4 | 14-36-18-6-3 | 177 s | 5 | 325 | 84 | 5 | 12 |
| portrait_woman_dreamy | **eye** | RASTER 16 → DISSOLUTION 20 | 108.8 | 16-36-18-6-3 | 174 s | 6 | 337 | 91 | 5 | 11 |
| tea1 | salient | RASTER 18 → FLOW 18 | 106.3 | 16-36-18-8-3 | 183 s | 5 | 418 | 141 | 5 | 16 |
| tea2 | salient | RASTER 18 → FLOW 18 | 105.9 | 14-36-18-8-3 | 179 s | 5 | 410 | 140 | 5 | 15 |
| ulkin | salient | MATRIX 18 → RASTER 18 | 113.2 | 14-36-18-6-3 | 163 s | 5 | 423 | 154 | 5 | 12 |
| white | light | RASTER 12 → ORBIT 12 → FLOW 10 | 101.3 | 16-34-16-6-3 | 178 s | 5 | 277 | 105 | 6 | 11 |
| demo nocturne | light | MATRIX 8 → RASTER 8 → ORBIT 16 | 100.1 | 14-32-16-8-3 | 175 s | 5 | 240 | 92 | 6 | 13 |
| demo facade | salient | RASTER 28 → DISSOLUTION 10 | 108.3 | 16-38-18-6-3 | 180 s | 6 | 421 | 120 | 5 | 15 |
| demo dune | salient | RASTER 16 → DISSOLUTION 14 | 108.3 | 16-30-14-6-3 | 153 s | 5 | 272 | 81 | 5 | 12 |

- With the offering, a piece lasts about 2.7–3.3 minutes.
- **Kicks are only single impacts** at the cuts and the superposition
  collapses: 5–6 per piece, never a beat.

**Rendered in the browser:**

- The DECOMPOSITION act looks clearly different for each of the six photos.
- Each act was rendered (MEASUREMENT, each spectrum, ENTROPY, ABSORPTION,
  END/debris), plus the slicing cut, the lens, the act jumps and copy
  settings. No page errors.

## Interaction (cursor only, no clicking)

| Interaction | What it does |
|---|---|
| **Quantum lens** | Where the cursor rests (it grows over about a second), the current state collapses: spectra withdraw their elements, entropy particles fall back to where they came from. A **glimpse of the measured photo** appears in their place: desaturated, fine scanlines, one hairline ring. In act 1 the lens reveals the photo on the terrain under the cursor. It never opens in ABSORPTION or END |
| **Force** | lines, cells and particles are pushed aside and spring back with inertia (the round-2/3 force field) |
| **Local sonification** (HAND) | a whisper of a low sine whose pitch follows the brightness under the cursor and whose level follows its movement; fine clicks when it crosses hard edges |
| **Rotation** | dragging rotates the map in act 1; the slider on the right edge too |

The piece is complete without any interaction.

## Sound

The base is round 4's engine and palette. Changes:

- **Removed:** TRANSMISSION, round 5's heartbeat bass and regular kicks.
- **Kept from round 5:** SCANNER.
- **Pulses are sparse Euclidean fragments** (3–5 in 16), re-rotated every
  phrase.

The sound state of each act:

| Act | Sound state |
|---|---|
| MEASUREMENT | sparse, clinical |
| DECOMPOSITION | clicks, data and rhythmic fragments, per spectrum |
| ENTROPY | densest, up to 7 layers |
| ABSORPTION | only sub pressure, then silence |

### Sound layers

| Layer | What it is |
|---|---|
| **SUB** | clean low sine: under the scan (act 1); a slowly gliding drone (DISSOLUTION, ORBIT) |
| **PULSE** | short gated sub notes in sparse Euclidean fragments (RASTER, FLOW, MATRIX; ENTROPY at Brownian times) |
| **PRESSURE** | *new*: deep sub pressure; two sines a fraction of a hertz apart (slow beating), long swell, optional glide (ENTROPY, ABSORPTION) |
| **HUM** | faint three-partial machine hum (drone spectra) |
| **RESONANCE** | a valley rings: slow low sine pair |
| **CLICK** | the v1 clicks: edges under the scan (act 1), Euclidean from the image's columns (act 2), Brownian storms (act 3) |
| **NOISE** | short, precisely gated band-passed noise bursts at rough places |
| **DATA** | the photo's pixel rows as waveforms (stutter), or telephone dial pulses |
| **FIELD** | *new*: a data texture; the pixel rows cut into 6–14 ms crushed slivers in a precise irregular stream; starts and stops hard, never a bed |
| **SCANNER** | the read head: 1–4 dry micro-ticks, band-passed at the column's brightness |
| **GLITCH** | click cluster + crushed data slice + noise slab; at the cuts (with slicing), hard edges, some with Ikeda bands in ENTROPY |
| **KICK** | single impacts only: each cut, each superposition collapse |
| **TONE** | one very low sine interval, at the start of ABSORPTION |
| **CRASH** | the end: big glitch, low-passed noise, sub drop from 90 to 24 Hz |
| **HAND** | the cursor's whisper and edge clicks |

### Visual layers

| Layer | What it is |
|---|---|
| **TERRAIN** | act 1: the measured terrain (rounds 4 and 5) |
| **CONTOURS** | contour lines in the photo's colours |
| **WIREFRAME** | wire state |
| **RIDGES** | hatching on hard edges |
| **SCAN** | the scan line |
| **FLARES** | local light per sound event |
| **DEFORM** | ripples, spikes, tears |
| **PHOTO** | the photo under the flowing lines (act 1) |
| **REVEAL** | photo patches where sounds happen (act 1) |
| **EDGE FLASH** | hard edges for a few frames (act 1) |
| **MATRIX** | spectrum: data cells, flipping and reordering (v1) |
| **RASTER** | spectrum: scanlines and barcode stripes that shift and stretch (v1, thinner lines) |
| **ORBIT** | spectrum: rings around the brightest points, ripples (v1) |
| **FLOW** | spectrum: streaks along the image's structure-tensor field (v1) |
| **DISSOLUTION** | spectrum: luminous pixel particles that tunnel (v1) |
| **ENTROPY** | act 3: the particle field |
| **SUPERPOSITION** | ghost copies of the field, collapsing on a strong beat |
| **SINGULARITY** | act 4: the black disc and its ring |
| **DEBRIS** | what remains after the crash |
| **SLICING** | the cut transition |
| **LENS** | the cursor's lens |
| **DATA STRIP** | one thin barcode at the bottom edge: the measured columns, the spectrum's edges, noise, collapsing to the singularity |
| **ANNOTATIONS** | labels on the map (act 1 only) |
| **CRASH** | the final white flash |
| **HAND** | the cursor's force field |

## Mixer (press M)

| Section | Contents |
|---|---|
| **acts** | OFFERING, MEASUREMENT, DECOMPOSITION, ENTROPY, ABSORPTION, END. The current act is marked; **go** jumps there |
| **sound** | all 15 layers: mute, solo, meters |
| **visual** | all 25 layers: mute, solo |

**copy settings** copies the journey (spectra, act lengths, current act) and
every mute/solo state as text.

**Deep links:**

| Link | What it does |
|---|---|
| `#section=ENTROPY&at=4` | jumps to bar 4 of an act |
| `#spectra=FLOW,ORBIT` | forces the spectra |
| `#loop=1` | starts in loop mode |
| `#demo=ii` | loads a demo image |

## Review against the three priorities

**Aesthetics.**

- Cut or kept out: round 5's heart rings, peaks, nerves, erosion, crumble,
  the photo core, pixels and waves; annotations outside act 1; mid-piece
  full-screen flashes.
- RASTER's lines were thinned so no spectrum shows the photo intact.
- Each act has one protagonist.

**Sound.**

- Round 5's song elements are gone.
- No kick pattern anywhere.
- Silence before every cut, and ABSORPTION is only pressure.

**Atmosphere.** Darkness, scale and finality:

- the camera pulls back as the image is decomposed and falls into the
  singularity
- one white frame
- the debris and its silence

## Not verified here

- **Listening on speakers**, which matters most for this round. The voices
  are restored from round 4, and PRESSURE and FIELD are new.
- **Safari and Firefox:** their engines cannot be installed here. The
  Safari upload code is unchanged.
- **Frame rate on a real GPU.** ENTROPY draws 22,000 points (9,000 on
  mobile). The slicing pass renders the frame twice for half a second.
  Headless software rendering ran at 13–48 fps depending on the act.
