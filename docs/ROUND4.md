# Round 4: one mode, one signature

There are no worlds any more. Every photo becomes a **sound map**: a tilted
terrain of thin lines on black, with a scan line that crosses the terrain.
Whatever lies under the scan line decides what sounds. Every sound lights up
the place on the map that made it. The piece runs once, about 3 to 3.5
minutes, while the image is consumed. It ends with the only full-screen white
flash, then asks for a new image.

## How to give feedback

**The mixer.** Press **M**, or tap "photo → sound" in the top-left corner.

- There are two sections:
  - **sound**: every sound layer with a description, a live meter and an
    activity dot. The header shows how many layers are sounding right now.
  - **visual**: every visual layer, which can be muted or soloed the same way.
- **M** mutes a layer and **S** solos it. Visual solo also works across the
  terrain: soloing CONTOURS shows only the contour lines.
- **copy settings** copies the current mute and solo state as text, for
  example:

  ```
  photo→sound mixer · round 4 · sig 9c1f…  · once
  sound:  KICK=on  SUB=on  PULSE=mute  HUM=on  …
  visual: TERRAIN=on  CONTOURS=SOLO  WIREFRAME=on  …
  ```

  Paste that text into feedback so it is clear exactly what was heard and
  seen.

**What to name.** Name a layer, for example "HUM is too present in
LISTENING" or "EDGE FLASH should be shorter".

## The sound map (`js/map.js`)

The photo is read into a height field:

| Part | Comes from |
|---|---|
| **height** | blurred luminance plus the image's edges as ridges; terraced into plateaus for graphic images |
| **ridges** | hard edges (Sobel), softened |
| **texture** | local roughness |
| **valleys** | the lowest, flattest places |
| **focal point** | the single most salient place, which is also a summit of the map. It is an **eye** if a face is found (MediaPipe keypoint), otherwise the brightest **light**, otherwise the most **salient** cell |

A 64 × 32 grid summarises each column: mean and maximum height, the strongest
edge, roughness, and valley share. Percentile thresholds per image decide
what counts as a ridge, a hard edge or a glitch-grade edge. This keeps every
photo's map balanced, but no two photos sound alike.

Image features also set per-photo parameters:

| Parameter | Set by |
|---|---|
| relief (0.14–0.34) | contrast |
| tilt | seeded |
| contour levels (10–34) | tonal range |
| wire grid density | seeded |
| tempo (100–114 BPM) | brightness |
| root | brightness |
| kick decay | contrast |
| swing | seeded |
| accent colour | the image's palette |

## The arc

| Section | Bars | Scan | Sound | Image |
|---|---|---|---|---|
| **MAPPING** | 14–20 | one slow sweep, left → right | no beat; sub, sparse clicks on edges, transmission of the scanned columns | the terrain only exists where the scan has passed; wireframe state |
| **LISTENING** | 20–28 | ping-pong, 8 bars per sweep | slow: hum, valley resonances, **rare** kicks only on high ridges, a sub swell at the focal point | contours, little wire |
| **INTENSIFY** | 20–28 | 4–6 bars per sweep | denser: an irregular (Euclidean, never 4/4) kick, sub pulses, glitches on the hardest edges, whole phrases without a kick | fine contours, kicks flash the wire in, slicing (twice) |
| **CONSUMPTION** | 14–20 | 6 bars per sweep | the beat leaves; one low tone interval; the sub glides down | the image is consumed: lines break, the border crumbles, colour drains |
| **END** | 3 | — | the **crash**, then nothing | the only full-screen white flash; everything flashes once; black |

**Silence.** Each bar can be left silent by the composer, and some layers
skip whole phrases. A soft budget keeps at most 6 layers sounding at once.

**One shot or loop.**

- **One shot (default).** After the crash the app returns to the landing:
  "the image has been consumed · feed the system a new one".
- **Loop.** The `loop` toggle at the bottom (remembered on this device)
  starts the piece again from MAPPING instead.

## Rotation

The thin vertical slider on the right edge rotates the map (±180°).
Double-click it to reset. Click-dragging on the map rotates it too. A short
press-and-hold still reveals the photograph under the finger. The cursor's
force field still bends the terrain.

## Sound layers

The palette is the same as round 3. There are no pitched blips, no round
bass, no hiss beds and no bright tones. Each layer has its own bus, meter and
mute/solo.

| Layer | What it is | What on the map makes it sound |
|---|---|---|
| **KICK** | sine kick: a fast pitch drop to 44–60 Hz plus a short impulse transient | the scan crossing a **high ridge** (rare, LISTENING); an irregular Euclidean pattern in INTENSIFY, with phrases left empty; almost gone in CONSUMPTION; none in MAPPING |
| **SUB** | clean low sine pressure, gliding slowly | the mean height under the scan, every 2 bars; a **swell** when the scan crosses the **focal point** (the orbit breathes) |
| **PULSE** | short gated sub notes between the kicks | INTENSIFY only, on the steps the kick leaves free |
| **HUM** | the machine hum of the map: three faint low sine partials (1×, 2×, 3×) with a slow amplitude LFO | a long held layer every 4 bars in LISTENING, INTENSIFY and early CONSUMPTION; pitched from the map's root |
| **RESONANCE** | a slow low sine plus a twin 0.6 Hz away (beating); swells and fades, never a blip | the scan crossing a **valley** or flat ground |
| **CLICK** | the v1 clicks (impulse, noise tick, 6.2 kHz ring, 3.1 kHz square), some bit-crushed | the scan crossing a **hard edge** in the image; density follows edge density |
| **NOISE** | short, precisely gated band-passed noise bursts (a gate, not a tail) | **rough texture** under the scan; band frequency from the texture |
| **DATA** | image pixel rows played as waveforms (stutter), or telephone dial pulses | phrase accents in the scanned column: the pixel row at its strongest edge, or dial pulses counting its mean height |
| **TRANSMISSION** | soft FSK: a triangle wave switching 330/495 Hz at 28 ms per bit, low-passed at 900 Hz | the scanned column **read as data**: each of its 32 rows becomes a bit (brighter than the column's mean → 1). Every other bar in MAPPING, now and then in LISTENING and CONSUMPTION |
| **GLITCH** | click cluster + crushed data slice + a 20 ms gated noise slab | the **hardest edges** (above the image's glitch threshold); the strongest ones also trigger SLICING |
| **TONE** | one very low, soft sine interval, with no attack | once, at the start of CONSUMPTION |
| **CRASH** | the end: a large glitch, a low-passed noise burst, and a sub drop from 90 to 24 Hz | once, END bar 0 |

**Hand.** Crossing a strong edge with the cursor makes a soft CLICK (on the
CLICK bus).

## Visual layers

Black ground, thin lines, the photo's colours used sparingly as tints. The
hold-to-reveal shows the original photo. Every visual layer can be toggled in
the mixer.

| Layer | What it is | Reacts to |
|---|---|---|
| **TERRAIN** | the whole sound-map mesh: the photo as a tilted terrain. Its height **breathes** with the low end | SUB, KICK (the low end) |
| **CONTOURS** | contour lines at three densities: main, index (every 5th, heavier) and fine (INTENSIFY). Lines fade on steep slopes so nothing burns white | line intensity follows the low end |
| **WIREFRAME** | the wireframe state: a grid draped on the terrain. Strong while mapping, nearly gone in LISTENING, flashed in by kicks in INTENSIFY, returning in CONSUMPTION. Graphic images keep more wire | KICK |
| **RIDGES** | hatching on the image's hard edges, the ridges of the map | CLICK, GLITCH |
| **SCAN** | the scan line (the probe) and its afterglow. Its first sweep maps the terrain | — (it is the sequencer) |
| **FLARES** | a local light at the exact place of each sound: a small edge spark (click), a contour band flaring at that height with the scan segment burning white (glitch), a region flickering (noise, data, transmission), a ring running out from the ridge (kick), a slow glow (resonance, focal sub) | every event |
| **DEFORM** | local deformation: kick ripples from the ridge that sounded, a spike where an edge clicked, a horizontal tear on a glitch, jitter on noise, erosion as the image is consumed | KICK, CLICK, GLITCH, NOISE |
| **DECAY** | consumption: the border breaks away, lines break into dashes, colour drains, over CONSUMPTION and END | the arc |
| **EDGE FLASH** | the image's own edges drawn on the terrain, only for **2–6 frames**, never permanent and never drawn slowly. A click flashes one nearby edge, a glitch 3–6 edges with accent copies, and the crash all of them at once | CLICK, GLITCH, CRASH |
| **ORBIT** | dashed rings and a pulse ring, lying on the terrain around the **single focal point** only. Radius and brightness follow the sub | SUB (focus swell), TONE |
| **CRUMBLE** | particles breaking off the **outer edge** of the terrain and drifting away. A trickle at first, more as the image is consumed, bursts on noise | NOISE, the arc |
| **SLICING** | quantum slicing: the photograph appears flat for 0.85 s, cut into displaced horizontal slices. **Rare**: two in INTENSIFY, one at the start of CONSUMPTION | the strongest GLITCHes |
| **ANNOTATIONS** | small, low-opacity labels: coordinate ticks, landmarks (ridge, edge, valley, focal) with coordinates, elevation and the frequency of that region, the SCAN probe readout (x · height · edge), and short notes at the place of an event (ERR, TX bits, DATA/DIAL, RES Hz, FOCUS Hz) | they **flicker** with DATA; notes come from GLITCH, TRANSMISSION, DATA, RESONANCE, focal SUB |
| **CRASH** | the only full-screen white flash, at the very end (frame-counted, so it is never missed) | CRASH |
| **HAND** | the cursor's force field: the terrain bends around the hand and springs back | the cursor |

## What was removed

- The six worlds (DISSOLUTION, RASTER, ORBIT, TOPOGRAPHY, FLOW, MATRIX) and
  the world selector. TOPOGRAPHY became the whole piece; ORBIT, DISSOLUTION
  (as CRUMBLE), the contour flashes (as EDGE FLASH) and the quantum slicing
  survive as subtle add-ons.
- All mid-piece white flashes. Glitches are now local events on the map.
- The 4/4 build-up and the "collapse" moment. The arc is now
  MAPPING → LISTENING → INTENSIFY → CONSUMPTION → END.
- The endless loop as the default.
- Files: `js/worlds.js` and `js/visuals/{dissolution,raster,flow,matrix,topography,quanta}.js`.
  The old ORBIT world file was replaced by the new `orbit.js` add-on.

## Kept

- The round-3 sound palette and voices, the scheduler (worker clock,
  150 ms lookahead, integer step indices), the per-layer buses and the
  limiter.
- The **Safari upload fix**: the inline classic script for drop and the file
  input, accepting an empty MIME type by extension, and the decode
  fallbacks. Unchanged.
- The hand (force field, edge clicks, hold-to-reveal), recording (WebM) and
  the demo images.

## Tests

The composer was run over the 8 Test_Images and the 3 demo images (headless
Chromium). "Max layers" counts overlapping layers, including held sounds.

| Image | Focal | BPM | Arc (bars) | Duration | Max layers | Kicks | Clicks | Glitches |
|---|---|---|---|---|---|---|---|---|
| Dancer | salient | 103.8 | 18-20-24-14-3 | 183 s | 7 | 64 | 139 | 20 |
| bw | light | 101.6 | 18-20-24-14-3 | 187 s | 6 | 49 | 157 | 27 |
| portrait_man | **eye** | 104.4 | 16-20-24-18-3 | 186 s | 7 | 51 | 140 | 21 |
| portrait_woman_dreamy | **eye** | 108.8 | 18-24-24-18-3 | 192 s | 6 | 46 | 152 | 28 |
| tea1 | salient | 106.3 | 18-20-24-16-3 | 183 s | 5 | 40 | 124 | 24 |
| tea2 | salient | 105.9 | 16-24-24-18-3 | 193 s | 6 | 68 | 161 | 24 |
| ulkin | salient | 113.2 | 16-24-24-18-3 | 180 s | 6 | 61 | 175 | 23 |
| white | light | 101.3 | 18-24-24-16-3 | 201 s | 6 | 39 | 113 | 19 |
| demo nocturne | light | 100.1 | 16-24-20-18-3 | 194 s | 6 | 41 | 156 | 23 |
| demo facade | salient | 108.3 | 18-24-28-14-3 | 193 s | 6 | 50 | 92 | 13 |
| demo dune | salient | 108.3 | 20-24-20-18-3 | 188 s | 6 | 38 | 102 | 17 |

**Results:**

- No kicks in MAPPING for any image.
- The crash appears exactly once per piece.
- The soft 6-layer budget is exceeded briefly (7) in two pieces, when a held
  HUM or RESONANCE overlaps a phrase.

**Checked in the browser (headless Chromium):**

- The terrains are clearly different per image: the ulkin grid of plateaus,
  the dune ridges, the portrait's eye contours, the white triangle peak.
- The portraits put the orbit on the eye.
- Slider and drag rotation both work.
- In one-shot mode the crash fires once, then the landing returns with the
  message.
- Loop mode continues into a second MAPPING.
- Mixer mute and solo work for sound and visual layers, and copy settings
  puts the text on the clipboard.

**Not verified here:**

- Safari and Firefox (their engines could not be installed in this
  environment). The Safari upload code path is unchanged from round 3.
- Listening on real speakers.
- Frame rate on a real GPU. Headless software rendering runs at about
  13–14 fps.

## Deep links (testing)

| Link | What it does |
|---|---|
| `#demo=ii` | loads a demo image |
| `#section=INTENSIFY&at=4` | jumps to bar 4 of a section |
| `#bar=40` | jumps to a bar |
| `#loop=1` | starts in loop mode |
