# Round 3: less is more

Round 3 returns to version 1 (PR #1) and refines it. Version 2 added a lot
and sounded and looked worse, so this round removed far more than it added.
`docs/V1_VS_V2.md` has the full inventory.

## How to give feedback on the sound

Press **M** to open the mixer. On a phone, tap "photo → sound" in the top-left
corner.

- Every sound layer is listed by name, with a short description, a live level
  meter and an activity dot.
- Layers this photo does not use are greyed out.
- **M** mutes a layer and **S** solos it. The mixer state is kept when you
  load a new photo.
- The header shows how many layers are sounding right now. The limit is 5.

To report a sound, name its layer, for example "DATA in RASTER pieces is too
much" or "the GLITCH slab is too bright".

## The sound layers

There are seven layers. Each photo uses four to six of them, and at most five
sound at the same time. In the 11 test pieces, at most 4–5 ever overlapped.

| Layer | What it is | When |
|---|---|---|
| **KICK** | sine kick: a fast pitch drop from about 3.6× to 1× of 44–60 Hz, plus a one-sample impulse transient (v1) | an insistent pattern repeated through BUILD and PEAK; a soft heartbeat at the start of FALL |
| **SUB** | clean sub sine (v1). Either a **drone** (one note per 4-bar phrase, gliding very slowly) or **pulses** (gated sub notes between the kicks) | everywhere except the end of SILENCE |
| **CLICK** | the v1 click palette: one-sample impulse, noise tick, 6.2 kHz ring, 3.1 kHz square. Euclidean patterns from the photo's columns, panned by x | sparse in INTRO, growing in BUILD, full in PEAK, thinning in FALL |
| **NOISE** | short, precisely gated band-passed noise bursts (v1). No tails, no beds | second half of BUILD and PEAK, only if the photo calls for it |
| **DATA** | transmission sounds: the photo's pixel rows played as waveforms (v1 data stutter), or **dial pulses** (v1 clicks at telephone pulse rate) | end of INTRO, late BUILD, PEAK, only if the photo calls for it |
| **GLITCH** | the white-flash sound: a cluster of v1 clicks + a crushed data slice + a 20 ms gated noise slab. **Every GLITCH is one white flash on screen.** | structural accents: one in INTRO, every 8 bars in BUILD, every phrase in PEAK, a storm before the collapse, and the big one at the collapse |
| **TONE** | one very low, soft sine interval (root × 2 and × 3, about 75–175 Hz), with a slow attack | once per loop, right after the collapse (the emotional moment) |

## The arc (about 3 minutes, lengths vary per photo)

| Section | Sound | Image |
|---|---|---|
| INTRO | sub + sparse clicks, one glitch, data at the end (if any) | the primary world forms out of the photo |
| BUILD | the kick arrives alone, then its pattern; clicks grow; NOISE/DATA join in the second half | hypnotic: one world, quanta flash on glitches |
| PEAK | at most 5 layers; glitch accents every phrase; NOISE and DATA alternate by phrase | dense; ends in a glitch storm |
| *collapse* | one huge glitch, then a silent bar | white flash; every contour of the photo snaps in at once; the whole photograph coheres for one bar |
| FALL | kick gone after a heartbeat; TONE appears once; clicks thin out; the sub glides down | the accent world appears softly; the primary fades |
| SILENCE | a last sub breath, a few clicks, then nothing | fade to black |

Patterns are fixed for each 4-bar phrase, and each bar changes at most one
detail. That repetition is what makes it hypnotic.

## What changes from photo to photo

The variation comes from choosing and arranging layers, not from adding
sounds. The world (one per photo, from the v1 analysis) sets:

- the kick pattern: 4/4, half-time, or 1 + 11
- the sub mode: drone or pulse, and which steps the pulses use
- the data kind: stutter or dial
- swing, click density, how much silence, and the glitch rate

The photo's features decide whether NOISE and/or DATA exist at all. Tempo and
root come from brightness, and the click patterns come from the photo's own
columns.

## What was removed

**Sound:**

- all pitched blips and pings: the high sine tones from v1, and the rims and
  reveal ticks from v2 (the "düp-düp / XP" sound in the first 20 s)
- the FM bass (round, rubbery)
- pads and chords, reverb and delay
- snare, clap and hats
- continuous crackle, hiss and grain beds
- the v2 memory tone (200–400 Hz), replaced by the very low TONE

**Visuals:**

- the v2 layer stack: constellation, fragments mosaic, pixel-sort bands,
  barcode lines, glitch rectangles, self-drawing and permanent contours,
  face-landmark outlines
- v2 machinery: score, mood, classifier, signature moments, ghost photo,
  tension uniforms

## Restored from v1

- the audio engine and its voices: kick, sub, the click buffers, noise
  bursts, data stutter, 4-bit crush, limiter
- the composer core: the 64 × 32 image grid scanned by the sequencer,
  Euclidean patterns, world styles
- the six worlds (DISSOLUTION, RASTER, ORBIT, TOPOGRAPHY, FLOW, MATRIX) and the
  world selection
- one primary world per photo; the accent world appears only while the piece
  falls away (at most 2–3 visual systems on screen)
- the full-image re-coherence once per loop (now the "collapse"), the reading
  scan, the readouts and the world selector

## Kept from v2

- the hand: the force field (now byte-encoded for older Safari/iOS), clicks
  when crossing strong edges, and hold-to-reveal
- `structures.js`, trimmed to edge strokes, iso-contours and straight segments
- deep links `#section=PEAK&at=4`, and the reading text fitting small screens

## New, but minimal

- **Quanta.** The photo's own contours never stay on screen. On sound events
  they flash for a few frames:
  - as fragments
  - as tunneled (jumped) copies
  - as superposed ghosts
  - flickering by probability

  At the collapse, all of them snap in at once.
- **Quantum motion inside the worlds:**
  - DISSOLUTION particles tunnel on events and have faint superposed ghosts.
  - ORBIT particles jump between rings on kicks.
  - FLOW streaks teleport along the field.
- **White flashes.** Every GLITCH sound gets a frame-counted white flash
  (full white or white bands).
- **Upload.** The Safari/WebKit upload and drag & drop fixes (see below).

## Safari upload and drag & drop

- A classic inline script always runs, even if the app module fails or loads
  late. It cancels `dragenter`, `dragover` and `drop` on the whole window and
  queues files until the app is ready.
- Dropped files with an empty MIME type, which WebKit often delivers from
  Photos or Finder, are accepted by extension. The old handler silently
  ignored them.
- Decoding falls back from `createImageBitmap` to `img.decode()` to
  `img.onload`, because Safari's `decode()` can reject large photos.
- Failures are shown as a message instead of being silent.

Tested in headless Chromium:

- the file picker with a 26 MP photo
- a drop of a file with an empty type (all drag events cancelled, no
  navigation)
- a broken file (an error message is shown)

**Not tested:** Safari (macOS and iOS) and Firefox. Their engines could not be
downloaded in this environment. Please check both upload paths on a Mac and
an iPhone.
