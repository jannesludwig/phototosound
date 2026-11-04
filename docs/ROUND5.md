# Round 5: the map comes alive

Round 4's photo-to-map transformation and the scan stay, but after the first
scan nothing new happened. Round 5 turns the piece into a story with three
phases:

1. **The scan reads the image.** What it hears is recorded.
2. **The map comes alive** as a technical organism.
3. **The organism overloads and erodes**, ending in the crash.

Every rhythm in phase 2 comes from the geometry of the photograph. The photo
itself stays visible on the map, most clearly at the epicenter.

## Fixes

1. **TRANSMISSION is gone.** It is replaced by **SCANNER**: the read head
   ticks each time the scan line enters a new column. Each tick is 1–4 dry
   micro-ticks (impulse and noise tick from the v1 palette), band-passed at
   that column's brightness and sometimes bit-crushed. There is no tone.
2. **The photo tilts with the map.**
   - The photo is drawn on the terrain itself, with the same surface, pose
     and relief, instead of on a flat plane.
   - When the map tilts back into 3D, the photo tilts with it and lifts into
     relief.
   - Ahead of the scan line the photo lies on the terrain. Behind it, only
     contour lines remain. The photo morphs into the map as it is read.
3. **No flat photo flashes.**
   - SLICING, the flat 2D photo in the centre of the screen, is removed.
   - Every appearance of the photo is now drawn on the terrain, in its
     perspective and rotation: the epicenter core, single pixels, local
     reveals and memory ghosts.
   - Hold-to-reveal now finds the map point under the finger on the posed
     terrain.

## The story

A bar lasts 240 / BPM seconds, about 2.1–2.4 s at 100–114 BPM. The whole
piece lasts 173–218 s. It runs once by default; the loop toggle stays.

| Phase | Bars | ≈ Time | Sound | Image |
|---|---|---|---|---|
| **READING** | 14–20 | 30–48 s | sub, edge clicks, SCANNER ticks, valley resonances. Everything the scan hears is **recorded** | the photo lies on the terrain ahead of the scan and turns into contours behind it |
| **AWAKENING** | 3 | ≈ 7 s | the scan ends: a last sub breath, the read head's final echoes, a faint hum, near silence. Then the **first heartbeat**, on beat 3 of the last bar | the scan line fades; the heart's rings appear at the epicenter; the first wave runs out |
| **LIFE** | 40–52 | 85–125 s | the organism grows; layers enter one by one (timeline below) | heart, waves, nerves, peaks; erosion late; 2 superpositions |
| **DECAY** | 12–16 | 26–38 s | overload and erosion: the heart slows and stumbles, peaks fall asleep, nerves die, the rhythm fragments, one low TONE, the sub glides down, noise bursts | an erosion front eats inward, the relief is worn down, branches die from the leaves, the border crumbles. The photo at the epicenter is the last thing to go |
| **END** | 3 | ≈ 7 s | **CRASH**: big glitch, low-passed noise, sub drop from 90 to 24 Hz | the only full-screen white flash; back to the upload screen |

### LIFE, bar by bar (fraction of LIFE)

| From | What enters |
|---|---|
| 0 | **HEART**: one lub-dub per bar; each lub sends a wave and a nerve impulse |
| 0.06 | **NERVES**: the network starts to grow from the heart. Nodes appear in order of path length until 0.8, so the rhythm builds up as the network grows |
| 0.20 → 0.60 | **PEAKS** awaken one by one, nearest to the heart first, each pulsing in its own period. **INTERFERENCE** starts as soon as two sources exist |
| 0.30 | the heart doubles (two lub-dubs per bar); **MEMORY** fragments enter (every 4 bars, every 2 from 0.6); nerve leaves at the hardest edges can **GLITCH** |
| 0.44 | **SUPERPOSITION** #1: the heart holds its breath for a bar, ghost states flicker, then they collapse on a KICK + GLITCH |
| 0.45 → 0.92 | **KICK** where a heart lub and a peak pulse land on the same step |
| 0.75 | **EROSION**: the first light drains downhill (every 2 bars) |
| 0.80 | **SUPERPOSITION** #2 (a third comes early in DECAY for about 60 % of images) |

A soft budget allows at most 6 sound layers to start in one bar. Across all
test images, at most 5–7 layers overlap. HUM is only in early LIFE, so the
atmosphere gives way as the rhythm builds.

## The epicenter

The focal point is the epicenter of everything. It is the eye if a face is
found (MediaPipe keypoint), otherwise the brightest light, otherwise the most
salient place.

- The **heart** sits there.
- The **nerves** grow from there.
- The **photo** stays most visible there.
- In DECAY it is the **last** thing to decay.

## How each system is derived from the image (`js/organism.js`)

| System | Derived from |
|---|---|
| **Heart** | the focal point. Its pitch is the map's root (from brightness) |
| **Peaks** | 3–5 local maxima of the height grid, away from the heart and from each other; more peaks for ridged images. **Period** (in 16ths, inside a 2-bar cycle so they lock into a groove) comes from height + position: 5, 6, 7, 9, 10, 11, 12 or 14. **Phase** comes from x. **Pitch** comes from height (root × 1.5–3, i.e. 55–170 Hz). They **awaken** by distance from the heart and fall **asleep** in reverse order. Fast peaks rest every other 2-bar cycle |
| **Waves** | every lub (strength 1) and every peak pulse (0.6) sends a ring at 0.03 image heights per 16th step, dying out at 0.55 |
| **Interference** | for each pair of pulses from different sources, the composer computes where and when their wavefronts meet (`s = (d + v·Δt)/2`), quantized to a 16th. At most 1–2 accents per bar |
| **Nerves** | 20–36 nodes: the hardest edges (more for edge-dense photos), high ridges, the roughest places and the peaks. They are linked into a tree from the heart (Prim, at most 3 branches per node) and routed as **circuit traces** (45° then straight). **Impulse arrival** = path length / speed, with the farthest node at about 22 steps, quantized to the 16th grid with ±0.2 step micro-timing. Deep nodes fire on every other impulse. Each arrival sounds by node type: edge → click, ridge/peak → square click, rough place → noise grain, leaf at a glitch-grade edge → GLITCH |
| **Memory** | the click and SCANNER events of each READING bar, replayed rotated, reversed or as a half-bar stutter, crushed. The first event drags the pixel row it was heard on (data stutter) |
| **Erosion** | steepest-descent paths on the height grid from peaks and high ridges into valleys. Travel time = length / speed (4–32 steps), so the light arrives with its tick |
| **Superposition** | fixed moments (44 % and 80 % of LIFE, sometimes DECAY bar 3); ghost offsets in yaw (±0.1 rad) and height (±30 %) |

## The photo on the map

All of this is drawn on the terrain, so it is always in the map's perspective
and rotation.

| Layer | What it does |
|---|---|
| **Gradient** | near the epicenter, a faint part of the photo stays recognizable (the core). Further out it breaks into pixel dissolution (photo-coloured squares, sparser with distance), then pure contour lines |
| **Coloured lines** | the contour lines carry the photo's colours at their position; colour grows with the energy of LIFE and drains in DECAY |
| **Pixels** | single pixels of the photo sit at their original positions and glow when a wave, flare or interference passes there |
| **Local reveal** | on nerve arrivals, peak pulses, kicks and memory events, a small patch of the photo appears at that spot and fades |
| **Decay** | the epicenter core is the last thing to go |

## Limits

**Visual.** At most 3–4 systems are clearly visible at once:

| Phase | Visible |
|---|---|
| READING | terrain, scan |
| AWAKENING | terrain, heart |
| LIFE | terrain, heart/waves, nerves, peaks; erosion only late; superposition only for a bar |
| DECAY | terrain eroding, erosion, fading nerves and heart, the crumbling border |

**Every event is local.** Every sound event has a visible, localized
consequence at its place on the map, and every visible event has a sound.

## Mixer (press **M**)

**Systems** (sound and visual together, one switch each):

- HEARTBEAT
- POLYRHYTHM
- INTERFERENCE
- NERVOUS SYSTEM
- MEMORY
- EROSION
- SUPERPOSITION
- PHOTO ON MAP

**copy settings** copies a systems line, a sound line and a visual line.

### Sound layers

All layers stay within the palette: sub pressure, low sines, clicks, gated
noise, glitches. There are no pitched blips, no round bass, no hiss beds and
no bright tones.

| Layer | What it is |
|---|---|
| **HEART** | the epicenter beats: a sub sine thump (fast drop from 1.6× to the root) with a quiet 2nd partial; lub, then a softer dub |
| **PEAKS** | a summit pulses: a short low sine knock (55–170 Hz, 25 ms pitch drop, ~35 ms decay) + a quiet impulse |
| **NERVES** | an impulse arrives at a node: a v1 click (edge: impulse/ring, ridge/peak: square), or a 10–30 ms gated noise grain at rough places |
| **INTERFERENCE** | two waves meet: a click doublet (one crushed) + a 10 ms band-passed noise slab |
| **MEMORY** | the scan's recorded clicks, re-sequenced and crushed; the first one drags its pixel row (data stutter) |
| **EROSION** | light arrives in a valley: 2–4 very fine high-passed noise ticks |
| **KICK** | sine kick where heart and peak coincide, and at each collapse |
| **SUB** | sub pressure under the scan (READING), a breath (AWAKENING), gliding down (DECAY) |
| **HUM** | faint 3-partial machine hum (AWAKENING, early LIFE, once in DECAY) |
| **RESONANCE** | slow low sine pair (beating) in valleys: READING; erosion arriving in deep valleys in DECAY |
| **SCANNER** | the read head (replaces TRANSMISSION) |
| **CLICK** | hard edges under the scan (READING) |
| **NOISE** | overload: gated noise bursts at rough places (DECAY) |
| **GLITCH** | nerve leaves at the hardest edges; each collapse |
| **TONE** | one very low sine interval, once, at DECAY bar 1 |
| **CRASH** | the end |

### Visual layers

| Layer | What it is |
|---|---|
| **TERRAIN** | the whole terrain mesh |
| **CONTOURS** | contour lines at 3 densities, in the photo's colours |
| **WIREFRAME** | wire state: strong while reading, almost gone in LIFE |
| **RIDGES** | hatching on hard edges |
| **SCAN** | the scan line (READING) |
| **FLARES** | local light at every sound event |
| **DEFORM** | ripples, spikes, tears, jitter |
| **DECAY** | the erosion front, broken lines, colour drain |
| **PHOTO CORE** | the photo at the epicenter → pixel dissolution |
| **PIXELS** | single photo pixels that glow with sound |
| **REVEAL** | photo patches where sounds happen |
| **HEART** | rings at the epicenter; a ring per lub |
| **WAVES** | heart and peak waves across the contour lines |
| **PEAKS** | a ring and a cross on each awake summit, flashing on its pulses |
| **INTERFERENCE** | lines where waves cross; fringes on each accent |
| **NERVES** | circuit traces, impulses and node squares |
| **MEMORY** | a ghost of the scan line where it heard the replayed sound |
| **EROSION** | light particles running downhill |
| **SUPERPOSITION** | ghost states, then the collapse |
| **EDGE FLASH** | the photo's hard edges for 2–6 frames (clicks, glitches, crash) |
| **CRUMBLE** | border particles, only as the image is consumed |
| **ANNOTATIONS** | coordinates, landmarks, and notes at event places (P# AWAKE, INT, MEM, \|ψ⟩, COLLAPSE, ERR, RES) |
| **CRASH** | the final white flash |
| **HAND** | the cursor's force field |

## Tests

Headless Chromium, the composer over all 8 Test_Images and the 3 demos.
**Events/bar** is the average over LIFE of heart, peak, nerve, interference,
memory and kick events.

| Image | Focal | BPM | Arc (bars) | Duration | Max layers | Peak periods | Nodes | Streams | Superpositions | Events/bar | Kicks | Memory | Erosion |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Dancer | salient | 103.8 | 18-3-52-16-3 | 213 s | 7 | 6/5/9/10 | 28 | 19 | 3 | 13.7 | 14 | 44 | 6 |
| bw | light | 101.6 | 18-3-52-16-3 | 217 s | 5 | 6/7/14/9 | 29 | 8 | 3 | 13.3 | 8 | 37 | 6 |
| portrait_man | **eye** | 104.4 | 16-3-52-16-3 | 207 s | 5 | 5/7/11/6/12 | 29 | 13 | 3 | 15.7 | 25 | 63 | 6 |
| portrait_woman_dreamy | **eye** | 108.8 | 18-3-52-14-3 | 199 s | 6 | 14/5/6/7/9 | 32 | 16 | 3 | 15.5 | 30 | 49 | 6 |
| tea1 | salient | 106.3 | 18-3-52-12-3 | 199 s | 5 | 5/6/7/10/12 | 31 | 16 | 2 | 15.8 | 29 | 57 | 6 |
| tea2 | salient | 105.9 | 16-3-52-16-3 | 204 s | 7 | 10/7/12/11/5 | 31 | 18 | 2 | 15.1 | 14 | 64 | 6 |
| ulkin | salient | 113.2 | 16-3-52-14-3 | 187 s | 6 | 6/5/7/9/12 | 36 | 6 | 2 | 15.6 | 19 | 54 | 6 |
| white | light | 101.3 | 18-3-52-16-3 | 218 s | 6 | 7/6/14/11 | 27 | 7 | 2 | 13.5 | 2 | 57 | 6 |
| demo nocturne | light | 100.1 | 16-3-48-14-3 | 201 s | 6 | 6/9/7/11 | 28 | 16 | 2 | 13.9 | 18 | 38 | 5 |
| demo facade | salient | 108.3 | 18-3-52-14-3 | 199 s | 5 | 6/14/5/11/7 | 33 | 5 | 3 | 15.5 | 38 | 53 | 6 |
| demo dune | salient | 108.3 | 20-3-40-12-3 | 173 s | 5 | 5/6/7/14 | 20 | 14 | 2 | 14.0 | 14 | 36 | 4 |

**Results:**

- Every piece has exactly one crash.
- READING records 16–20 bars of material for MEMORY.
- In every image the LIFE layers enter in the planned order.

**Checked in the browser (headless Chromium):**

- The photo tilts and lifts with the map, and dissolves into contours behind
  the scan.
- In LIFE, the face stays recognizable at the epicenter; waves, nerves with
  impulses and node squares, and peak rings are visible.
- Superposition shows the doubled ghost terrain, then a single state after
  the collapse.
- DECAY eats from the outside in, with the core last.
- One-shot returns to the upload screen after the crash; loop mode restarts
  at READING.
- Mixer: systems, mute and solo, and copy settings all work.
- No page errors.

**Not verified here:**

- Listening on speakers. The new voices were designed within the palette
  but nobody has heard them yet. The density of LIFE (13–16 events per bar
  on average) is the first thing to tune by ear. The mixer's systems
  switches make that easy.
- Safari and Firefox (their engines cannot be installed in this
  environment). The Safari upload code is unchanged.
- Frame rate on a real GPU. The terrain shader does more per pixel now
  (waves, flares, photo lookups), and superposition draws the terrain three
  times for one bar. Headless software rendering runs at about 13–15 fps,
  as in round 4.

## Deep links (testing)

| Link | What it does |
|---|---|
| `#section=LIFE&at=20` | jumps to bar 20 of a section (READING, AWAKENING, LIFE, DECAY, END) |
| `#bar=40` | jumps to a bar |
| `#loop=1` | starts in loop mode |
| `#demo=ii` | loads a demo image |
