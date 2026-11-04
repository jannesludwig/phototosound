# v1 vs v2

- **v1** is the first merged version: PR #1, merge commit `8dd145f`, head `9a48ae5`.
- **v2** is round 2: PR #2, merge commit `2d8772c`.

This document lists what each version contained, what changed between them,
and what round 3 keeps.

## Sound layers

| Layer | v1 | v2 | Round 3 |
|---|---|---|---|
| **Kick** | sine, pitch 3.6× → 1.35× → 1× of 44–60 Hz, an impulse click transient, decay set by the world | three characters (deep / tight / soft) plus ghost kicks; same core | **v1 kick**, with world-dependent decay. Ghost kicks are kept, sparingly. |
| **Sub** | sine drone, 2 bars, slow attack, ratio from the image (1, 4/3, 9/8, 3/2) | sine + 2nd harmonic, used for the Reading drone and Afterglow notes | **v1 sub** as a single-note pulsing sub line, slowly moving, with the pressure from the low end |
| **Clicks** | 4 buffers (1-sample impulse, noise tick, 6.2 kHz ringing, 3.1 kHz square blip), Euclidean from image columns, x → pan, micro-glitch double clicks | the same buffers, placed in a polyrhythm from light points / corners | **v1 clicks** (the palette that worked) |
| **High sine blips** | 1–12 kHz sine tones, pitch from the image rows (harmonic set from hue); long sines for ORBIT | removed | **removed** (no pitched blips) |
| **Noise bursts** | white noise → band-pass → 15–90 ms envelope, saturation → amount | the same, plus snare / clap / hats | **v1 noise bursts** only (short, gated) |
| **Data stutter** | an image row played as a waveform, retriggered 3–9× (crushed variant) | the same, played an octave down | **v1 data stutter** |
| **Bitcrush** | 4-bit waveshaper bus | per-piece waveshaper | **v1** (used only on gated events) |
| **Space delay** | short ping-pong on long ORBIT sines | dub ping-pong on rims | removed (no sines left to feed it) |
| FM bass | — | 2-op FM bass phrases from strokes | **removed** ("round, warm, rubbery") |
| Rims / "lasers" | — | 400–1600 Hz pitched bursts from lines | **removed** (pitched blips) |
| Reveal ticks | — | pitched ticks (260–780 Hz) and low sine blips on every reveal in the first 20 s | **removed** (the "düp-düp / XP" sound) |
| Snare / clap | — | band-passed noise with a 180 Hz body | removed |
| Hats | — | HP noise on corner steps | removed (v1 noise bursts cover the role) |
| Pads | — | detuned saw/triangle chords plus a generated reverb | **removed** (sweet, warm, overstated) |
| Crackle / hiss / grain beds | — | continuous texture loops | **removed** (no continuous noise beds) |
| Memory tone | — | 200–400 Hz sine/triangle | replaced by **Tone**: one very low sine interval (root + fifth, ≈ 40–110 Hz), briefly, at the emotional moment |
| Impact | — | noise slab + 90 → 30 Hz drop | kept in reduced form as part of **Glitch** at the one intense moment |
| Cursor sound | — | grain scrub, filter sweep, edge clicks | only the edge-crossing click remains |
| Mix | limiter only | sidechain, saturation, EQ, mono bass bus | v1 chain + per-layer buses (for the mixer) + a limiter |

**New in round 3**, with no new instruments, only re-use of the v1 materials:

- **Glitch** turns the "white flash + digital glitch" into a structural accent: v1 click cluster + crushed data stutter + a 20 ms gated noise slab, always with a white flash on screen.
- **Mixer** is a debug panel on the `M` key, with mute and solo per layer.

## Visual systems

| System | v1 | v2 | Round 3 |
|---|---|---|---|
| Worlds | 6 worlds (DISSOLUTION, RASTER, ORBIT, TOPOGRAPHY, FLOW, MATRIX) chosen by image weights; primary + accent world, accent takes over in the breakdown | no worlds; up to 6 layers mixed from 11 per image | **v1 worlds restored**: one primary world per image (one hand); the accent world appears only while the piece falls away |
| Photo plane / observation | the cursor collapses the area back to the photo; the full image re-coheres once per loop | hold-to-reveal plus a ghost photo in Reading / Memory | **v1 collapse** (once per loop, now at the intense moment) + hold-to-reveal |
| Contours | — (topography iso-lines only) | self-drawing strokes, face-landmark outlines, permanent lines | **reworked into "quanta"**: image contours appear only as flashes for a few frames (displaced copies, fragments, interference), then vanish. No face tracing, no pen drawing. |
| Constellation | — | points + Delaunay links | removed |
| Fragments (Delaunay mosaic) | — | colour triangles that fracture | removed |
| Pixel sort / barcode / glitch rects | RASTER had barcode stripes | separate layers | removed as separate layers (RASTER keeps its v1 stripes) |
| Force field (cursor) | — | spring grid used by all layers | kept (interaction, not decoration) |
| White flash | — | once, at the peak | **kept and used more**: every Glitch event flashes white, one to one |
| Ghost / tension / signature moments | — | many global uniforms | removed; v1 re-coherence acts as the "collapse" |
| Analysis | global features, face detection | + structures, classifier, mood, landmarks | v1 analysis + strokes/contours from `structures.js` (for quanta and edge clicks only); classifier, mood and landmarks removed |
