# Test report, round 3

This report covers 11 photos: the 3 procedural demos and the 8 photos in `Test_Images/`. Each one ran through the real pipeline in headless Chromium (analysis, structures, MediaPipe face detection, world choice, composer). For every piece the whole loop was composed and checked for:

- which layers exist
- how many layers **sound at the same time**: every event occupies its layer for its real duration (sub and tone sustain for bars, kicks ring for their decay, data bursts for their length)
- which event types occur at all

| photo | world (primary × accent) | face | BPM | root Hz | layers in this piece | sub | kick steps | data | arc (bars) | loop | glitches | max layers at once |
|---|---|---:|---:|---:|---|---|---|---|---|---:|---:|---:|
| nocturne | ORBIT Ã— TOPOGRAPHY | 0 | 113.2 | 38.9 | KICK SUB CLICK GLITCH | drone | 0.8 | â€“ | 20-32-16-12-8 | 187 s | 24 | 4 |
| facade | RASTER Ã— MATRIX | 0 | 122.4 | 46.3 | KICK SUB CLICK GLITCH DATA NOISE | pulse | 0.4.8.12 | dial | 16-32-16-12-8 | 165 s | 24 | 4 |
| dune | TOPOGRAPHY Ã— RASTER | 0 | 120.2 | 43.7 | KICK SUB CLICK GLITCH NOISE | drone | 0.10 | â€“ | 16-28-20-12-8 | 168 s | 25 | 5 |
| Dancer.jpg | RASTER Ã— FLOW | 0 | 116.7 | 41.2 | KICK SUB CLICK GLITCH DATA NOISE | pulse | 0.4.8.12 | dial | 20-32-20-12-8 | 189 s | 28 | 4 |
| bw.jpg | ORBIT Ã— RASTER | 0 | 113.7 | 41.2 | KICK SUB CLICK GLITCH DATA | drone | 0.8 | dial | 20-32-16-12-8 | 186 s | 23 | 4 |
| portrait_man.jpg | DISSOLUTION Ã— FLOW | 0.94 | 118.4 | 43.7 | KICK SUB CLICK GLITCH | drone | 0.8 | â€“ | 20-28-20-16-8 | 186 s | 24 | 4 |
| portrait_woman_dreamy.jpg | DISSOLUTION Ã— RASTER | 0.97 | 122.5 | 49.0 | KICK SUB CLICK GLITCH | drone | 0.8 | â€“ | 16-32-20-16-8 | 180 s | 26 | 4 |
| tea1.jpg | RASTER Ã— FLOW | 0 | 119.9 | 41.2 | KICK SUB CLICK GLITCH DATA NOISE | pulse | 0.4.8.12 | dial | 16-32-16-12-8 | 168 s | 26 | 5 |
| tea2.jpg | FLOW Ã— RASTER | 0 | 119 | 43.7 | KICK SUB CLICK GLITCH DATA NOISE | pulse | 0.4.8.12 | stutter | 16-32-20-12-8 | 177 s | 23 | 4 |
| ulkin.jpg | MATRIX Ã— RASTER | 0 | 127.1 | 49.0 | KICK SUB CLICK GLITCH DATA | pulse | 0.4.8.12 | stutter | 16-32-20-12-8 | 166 s | 31 | 4 |
| white.jpg | ORBIT Ã— RASTER | 0 | 114.2 | 38.9 | KICK SUB CLICK GLITCH DATA | drone | 0.8 | dial | 20-28-20-12-8 | 185 s | 22 | 4 |

The arc columns are INTRO-BUILD-PEAK-FALL-SILENCE. Every piece also has TONE once, right after the collapse.

## Checks

- **Layer budget (≤ 5 at once):** the maximum over all 11 pieces is 5.
- **No pitched blips:** the only event types that occur in any piece are `click`, `data`, `glitch`, `kick`, `noise`, `pulse`, `sub`, `tone`. There are no sine blips, rims, pads, bass lines, snares, hats or noise beds.
- **Variety from selection, not addition:**
  - the 11 photos use 6 different primary worlds
  - 4 different layer sets
  - 3 kick patterns (4/4, half-time, 1 + 11), 2 sub modes, 2 data kinds
  - tempo 113.2–127.1 BPM
- **Faces:** both portraits are detected (0.94 / 0.97) and get DISSOLUTION, where the face holds together the longest.
- **Loop length:** 165–189 s (about 3 minutes).
- **White flash sync:**
  - Every GLITCH event triggers one frame-counted white flash (full white or white bands), verified by freezing the renderer on the event frame.
  - At the collapse, the photograph coheres for one bar, verified by suspending the audio clock inside that bar.
- **Upload paths (Chromium):** file picker with a 26 MP photo, a drop of a file with an empty MIME type (all drag events cancelled, no navigation), and a broken file (an error message is shown).
- **Mixer:** mute sets the layer bus gain to 0, and solo leaves only that layer.

## Not verified here

- **Safari (macOS and iOS) and Firefox.** Their engines cannot be installed in this environment.
- **Listening.** The structure, layer budget and event types are verified, but the music was not heard. Use the mixer (**M**) to name what should go.
- **Real-GPU frame rate.** The headless renderer is software-only, and adaptive resolution is in place.
