# Photo to Sound

A photograph crosses into another dimension and becomes a cryptic, rhythmic
audiovisual piece: precise, digital, cold, and something you can nod to.

The app reads what is in the image and decides how it dissolves and how it
sounds, so every photo turns into a different piece. The same photo always
produces the same piece: a hash of the file is the seed for every random choice.

Everything runs in the browser. Your photo is never uploaded. Only the
libraries (three.js, MediaPipe) and the face-detection model weights are
downloaded from public CDNs.

## Run

This is a static site with no build step. Serve the folder and open `index.html`:

```bash
python3 -m http.server 8000
```

To deploy on GitHub Pages, publish the repository root (`index.html` is at the
top level).

Deep links for testing: `#demo=ii` loads demo ii, `#world=FLOW` forces a
primary world, and `#bar=56` starts at a given bar (here, the breakdown).

## The experience

1. **Landing.** A black screen, one line of monospace text, an almost
   invisible drop zone, and `demo i ii iii`.
2. **Reading.** The photo appears sharp. A scan line passes over it while
   the readouts list what the analysis found, ending with the world, for
   example `world: DISSOLUTION × RASTER`.
3. **Crossing over.** Over the first bars the image turns into its world,
   and the visuals are driven by the music.
4. **Observation.** Moving the mouse or touching the screen collapses the
   area around the pointer back into the original photo, like a quantum
   state that collapses when it is observed. Let go and it dissolves again.
   Once per loop, in the silent bar at the end of the breakdown, the whole
   image re-coheres on its own.

Controls appear on hover or tap: pause, new, volume, and `rec`, which exports
a WebM of the picture with its sound. To switch worlds by hand, click the
world name in the bottom-right corner. Space toggles pause.

## Image analysis (`js/analysis.js`, `js/face.js`)

The analysis runs on a copy of the photo at most 192 px wide. Light points are
detected on a 512 px copy, and faces on a 640 px copy.

| Feature | Method |
|---|---|
| Face presence, size, position | MediaPipe Tasks Vision face detector (BlazeFace), run locally in WASM |
| Straight-line strength, orientation | Hough lines scored by *coverage*: the share of each line's length inside the frame that is covered by matching edges, minus the chance level at that angle. Real lines score close to 1, and dense texture stays near 0. |
| Edge orientation histogram | Sobel gradients in 18 bins. Horizontal and vertical dominance. |
| Light points | Small, compact, bright blobs on a darker background (stars, city lights, reflections on water): count and spread |
| Radial symmetry | Edge pixels vote for circle centres along their gradient. Peak against mean. |
| Smoothness | Tonal range present, but little high-frequency (Laplacian) detail |
| Flow / motion | Structure tensor: the share of the image covered by strongly oriented texture, damped for flat graphics |
| Flatness, colour count | Share of perfectly flat (non-dark) pixels, number of 4-bit colour bins |
| Tone | Brightness, contrast (σ), chroma-weighted saturation, circular mean hue, a 5-colour k-means palette |
| Signature | A 53-bit hash of the file bytes. It seeds every random choice. |

## Image → world (`js/worlds.js`)

Each world gets a weight. The highest weight is the **primary** world and the
second highest is the **accent**. The accent stays a faint trace and takes
over during the breakdown.

| World | Triggered by | What happens |
|---|---|---|
| **DISSOLUTION** | face (score × size), warm organic subject, centred detail | The image becomes luminous pixel particles in their source colours. They lift off in a seeded order, light first. The face holds together longest. |
| **RASTER** | straight-line coverage, horizontal/vertical dominance | Scanlines along the dominant orientation shift in 1/16 steps on the beat, stretch their edge pixels beyond the frame, pixelate, and turn into barcode data stripes. |
| **ORBIT** | many light points on dark ground, radial symmetry | Concentric rings and rotating arcs around the brightest points, and particles on Keplerian orbits. Each kick sends out a ripple. |
| **TOPOGRAPHY** | smooth gradients, few edges | Luminance becomes a height map: contour lines on a wireframe terrain that tilts out of the picture plane and breathes. Kicks send waves across it. |
| **FLOW** | large areas of coherent, streaky texture | Thin streaks travel along the structure-tensor field and take the colours they pass over. They surge on each beat. |
| **MATRIX** | flat areas, few colours, contrast | Data cells: quantised colour blocks, binary digits (1 = brighter than the image mean), dots. Cells flip on each step, rows reorder on noise bursts, bands stutter, and rows leak out of the frame as bit streams. |

Per-photo seeded parameters (density, speed, line thickness, ring spacing,
contour count, grid size, accent colour) make two photos in the same world
look different.

## Image → sound (`js/audio/composer.js`, `js/audio/engine.js`)

| Image | Sound |
|---|---|
| Brightness | Tempo (112–128 BPM) and root frequency (≈37–58 Hz, in semitones) |
| Contrast | Weight and decay of the sub kick |
| Edge density | Number of clicks and micro-glitches |
| Saturation | Number and colour of band-passed noise bursts |
| Hue | The harmonic set used for the high sine tones |
| Grid columns | The 16 sequencer steps. Euclidean patterns are built from column data and rotated by the brightest or edgiest column. |
| Grid rows | Pitch of the sine blips (higher in the image = higher pitch) |
| x position of source pixels | Stereo pan |
| Image rows | Played as tiny waveforms in the data stutters |

The image is a 64 × 32 grid. In each bar the sequencer reads a band of 8 rows
across 16 columns spread over the full width. The band scans from top to
bottom over one loop, so the pattern keeps changing as the piece reads down
the photo.

**The world shapes the rhythm.**

- RASTER: a strict four-on-the-floor grid
- ORBIT: pulsing half-time with long sines and a short, dark ping-pong echo
- DISSOLUTION: sparse and fragile
- MATRIX: glitchy, with dropouts, stutters and bitcrush
- TOPOGRAPHY: slow, with a long kick and deep sub movement
- FLOW: rolling and swung, with ghost kicks

**Structure.** One loop is 88 bars, about 3 minutes:
`INTRO 16 → BEAT 16 → FULL 24 → BREAKDOWN 16 → RETURN 16`, then it loops.
The last breakdown bar is silence while the image re-coheres. The kick
returns on the downbeat and the image dissolves again.

**Palette.** Everything is synthesised with no samples: a deep clean sub kick,
sharp digital clicks, pure high sine tones, band-passed noise bursts, data
stutters and an occasional 4-bit crush. Silence is part of the composition.
There is no reverb wash. A master limiter catches the peaks.

**Timing.** A worker-driven clock schedules 150 ms ahead. Step times are
computed from the integer step index, so nothing drifts. Every scheduled sound
also goes onto a queue that the visuals read against the audio clock (with the
output latency compensated), so picture and sound stay locked.

**Visual reactions.** The kick pulses the field, clicks make sharp sparks at
their source pixel, sines make a fine shimmer, and noise makes interference
and scatter.

## Files

```
index.html            page + import map
css/style.css         gallery black, hairlines, monospace
js/main.js            flow: landing → reading → playing, UI, 2D overlay
js/analysis.js        feature vector, grid, maps, signature
js/face.js            MediaPipe face detection (lazy, optional)
js/worlds.js          features → world weights, sound styles, seeded params
js/demo.js            three procedural test images
js/rng.js             hashing, seeded PRNG, Euclidean rhythms
js/recorder.js        WebM export (canvas + master bus)
js/audio/composer.js  deterministic score from the image grid
js/audio/engine.js    voices, lookahead scheduler, limiter
js/visuals/engine.js  three.js renderer, photo plane, world blending
js/visuals/*.js       the six worlds + shared GLSL
```

The demo images are procedural: **i** *nocturne* (stars, a halo, light on
water) → ORBIT, **ii** *facade* (a grid of windows) → RASTER, **iii** *dune*
(soft layered gradients) → TOPOGRAPHY.

Mobile: particle counts and resolution are reduced, and rendering resolution
drops automatically when frames are slow. Audio unlocks on the first tap, and
on iOS the audio session is set to playback.
