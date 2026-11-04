# Test report: does every photo become its own piece?

This report covers 26 images:

- the 3 demo images (`js/demo.js`)
- 7 procedural test photographs designed to span the feature space (`js/testimages.js`: neon, silk, bauhaus, horizon, thicket, ice, figure)
- 16 classic OpenCV sample photos (lena, baboon, building, starry_night, sudoku, fruits, …)

The OpenCV photos were fetched from the OpenCV repository for local testing only and are **not committed**. The repository has no `/test-images` folder. Drop your own photos into one and run the same harness to extend this table.

Each image ran through the real pipeline in headless Chromium: analysis, structures, MediaPipe face detection + landmarks, MediaPipe classifier, mood, then the score of pass 1 and pass 2.

## 1. The photo's own structures

These are the forms each piece is built from. Every row is a different set of lines, points, regions and empty areas, so no two pieces share events.

| image | source | strokes | iso-contours | straight lines | corners | light points | colour regions | fragments | salient | void | face contours | analysis ms |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nocturne | demo | 68 | 27 | 0 | 96 | 24 | 2 | 592 | 1 | 85% | 0 | 207 |
| facade | demo | 105 | 220 | 24 | 220 | 0 | 6 | 648 | 8 | 0% | 0 | 249 |
| dune | demo | 3 | 15 | 22 | 161 | 0 | 6 | 492 | 8 | 3% | 0 | 241 |
| neon | procedural | 140 | 56 | 6 | 183 | 24 | 5 | 736 | 8 | 54% | 0 | 153 |
| silk | procedural | 43 | 71 | 24 | 176 | 0 | 6 | 800 | 8 | 30% | 0 | 205 |
| bauhaus | procedural | 5 | 9 | 21 | 13 | 0 | 6 | 202 | 8 | 0% | 0 | 159 |
| horizon | procedural | 2 | 13 | 3 | 3 | 0 | 6 | 152 | 8 | 0% | 0 | 162 |
| thicket | procedural | 140 | 220 | 0 | 220 | 24 | 5 | 774 | 3 | 0% | 0 | 162 |
| ice | procedural | 94 | 25 | 24 | 108 | 0 | 4 | 612 | 8 | 0% | 0 | 154 |
| figure | procedural | 8 | 4 | 3 | 6 | 0 | 2 | 196 | 8 | 83% | 15 | 128 |
| HappyFish.jpg | OpenCV sample | 41 | 36 | 24 | 67 | 0 | 6 | 530 | 8 | 0% | 0 | 98 |
| LinuxLogo.jpg | OpenCV sample | 15 | 6 | 6 | 44 | 14 | 2 | 360 | 8 | 84% | 0 | 91 |
| aero1.jpg | OpenCV sample | 140 | 165 | 11 | 220 | 0 | 6 | 744 | 8 | 0% | 0 | 144 |
| baboon.jpg | OpenCV sample | 140 | 130 | 12 | 220 | 24 | 6 | 782 | 8 | 0% | 0 | 294 |
| box_in_scene.png | OpenCV sample | 101 | 109 | 15 | 171 | 24 | 6 | 722 | 8 | 3% | 0 | 183 |
| building.jpg | OpenCV sample | 122 | 158 | 23 | 220 | 24 | 6 | 710 | 8 | 0% | 0 | 149 |
| fruits.jpg | OpenCV sample | 140 | 75 | 12 | 220 | 10 | 5 | 764 | 8 | 7% | 0 | 132 |
| graf1.png | OpenCV sample | 140 | 220 | 15 | 220 | 22 | 5 | 754 | 6 | 2% | 0 | 182 |
| home.jpg | OpenCV sample | 120 | 105 | 16 | 168 | 13 | 6 | 750 | 8 | 0% | 0 | 199 |
| lena.jpg | OpenCV sample | 111 | 113 | 24 | 162 | 24 | 5 | 728 | 8 | 0% | 15 | 143 |
| messi5.jpg | OpenCV sample | 80 | 190 | 17 | 129 | 10 | 6 | 704 | 8 | 5% | 0 | 96 |
| orange.jpg | OpenCV sample | 140 | 36 | 5 | 220 | 1 | 5 | 738 | 8 | 0% | 0 | 149 |
| pic3.png | OpenCV sample | 12 | 28 | 24 | 127 | 0 | 6 | 482 | 8 | 0% | 0 | 102 |
| smarties.png | OpenCV sample | 33 | 30 | 0 | 87 | 7 | 5 | 566 | 8 | 1% | 0 | 92 |
| starry_night.jpg | OpenCV sample | 140 | 155 | 18 | 220 | 24 | 6 | 756 | 8 | 0% | 0 | 129 |
| sudoku.png | OpenCV sample | 98 | 122 | 24 | 220 | 0 | 4 | 718 | 8 | 0% | 0 | 160 |

## 2. Mood, content, tempo and rhythm

The mood columns are a 5-dimensional vector: warmth, energy, darkness, openness and intimacy. The named mood is the nearest of six prototypes. Content is the top label from the MediaPipe ImageNet classifier and the category it maps to. These are kept subtle: they bias the score but do not decide it.

| image | mood | w · e · d · o · i | content | bpm | mode | root Hz | kick | swing | click cycle |
|---|---|---|---|---:|---|---:|---|---:|---:|
| nocturne | dark / mysterious | 0.45 · 0.00 · 1.00 · 0.77 · 0.00 | loudspeaker 0.59 | 113.7 | phrygian | 55.0 | sparse/deep | 0.00 | 3 |
| facade | tense / dense | 0.59 · 0.96 · 0.27 · 0.00 · 0.08 | crossword puzzle 0.91 → abstract | 126.2 | aeolian | 41.2 | straight/tight | 0.00 | 5 |
| dune | vast / calm | 0.78 · 0.00 · 0.41 · 0.83 · 0.20 | volcano 0.21 → nature | 108.1 | lydian | 36.7 | half/soft | 0.01 | 7 |
| neon | dark / mysterious | 0.51 · 0.44 · 1.00 · 0.15 · 0.02 | scoreboard 0.41 → city | 116.4 | phrygian | 69.3 | sparse/deep | 0.00 | 3 |
| silk | dark / mysterious | 0.55 · 0.00 · 0.82 · 0.57 · 0.00 | conch 0.06 | 114.5 | phrygian | 65.4 | half/deep | 0.00 | 7 |
| bauhaus | vivid / restless | 0.86 · 0.67 · 0.00 · 0.04 · 0.01 | envelope 0.41 → abstract | 119.6 | mixolydian | 36.7 | straight/tight | 0.00 | 5 |
| horizon | vast / calm | 0.36 · 0.00 · 0.20 · 0.67 · 0.12 | cleaver 0.11 → water | 109.5 | lydian | 51.9 | half/soft | 0.03 | 3 |
| thicket | dark / mysterious | 0.56 · 0.34 · 0.70 · 0.19 · 0.00 | golf ball 0.34 → abstract | 113.9 | phrygian | 43.7 | sparse/deep | 0.00 | 5 |
| ice | cold / clinical | 0.38 · 0.34 · 0.00 · 0.12 · 0.04 | wall clock 0.13 → abstract | 121.8 | quartal | 51.9 | straight/tight | 0.00 | 3 |
| figure | warm / intimate | 0.70 · 0.00 · 1.00 · 0.95 · 0.90 | ping-pong ball 0.19 → night | 109.3 | dorian | 36.7 | sparse/deep | 0.07 | 3 |
| HappyFish.jpg | vivid / restless | 1.00 · 0.80 · 0.00 · 0.07 · 0.06 | mouse 0.38 → portrait | 120.7 | mixolydian | 36.7 | straight/tight | 0.00 | 5 |
| LinuxLogo.jpg | dark / mysterious | 0.50 · 0.12 · 1.00 · 0.39 · 0.12 | analog clock 0.29 → abstract | 114.4 | phrygian | 51.9 | sparse/deep | 0.04 | 5 |
| aero1.jpg | cold / clinical | 0.46 · 0.44 · 0.12 · 0.53 · 0.03 | seashore 0.39 → water | 121 | quartal | 55.0 | rolling/tight | 0.17 | 5 |
| baboon.jpg | vivid / restless | 0.71 · 0.50 · 0.24 · 0.17 · 0.05 | baboon 0.79 | 118.9 | mixolydian | 38.9 | rolling/tight | 0.17 | 5 |
| box_in_scene.png | tense / dense | 0.50 · 0.63 · 0.42 · 0.02 · 0.12 | ashcan 0.14 → abstract | 125.3 | aeolian | 51.9 | straight/tight | 0.00 | 3 |
| building.jpg | tense / dense | 0.53 · 1.00 · 0.18 · 0.00 · 0.07 | solar dish 0.07 → city | 126.6 | aeolian | 41.2 | straight/tight | 0.00 | 5 |
| fruits.jpg | vivid / restless | 0.83 · 0.55 · 0.51 · 0.14 · 0.06 | lemon 0.47 | 118.4 | mixolydian | 38.9 | rolling/tight | 0.18 | 7 |
| graf1.png | vivid / restless | 0.81 · 0.90 · 0.36 · 0.00 · 0.13 | crash helmet 0.50 → portrait | 119.6 | mixolydian | 36.7 | rolling/tight | 0.22 | 7 |
| home.jpg | tense / dense | 0.18 · 0.81 · 0.31 · 0.05 · 0.04 | monastery 0.31 → city | 126.3 | aeolian | 51.9 | straight/tight | 0.00 | 5 |
| lena.jpg | warm / intimate | 0.79 · 0.68 · 0.31 · 0.02 · 0.95 | cowboy hat 0.18 → fabric | 113.7 | dorian | 69.3 | rolling/soft | 0.21 | 3 |
| messi5.jpg | tense / dense | 0.60 · 0.55 · 0.52 · 0.15 · 0.08 | soccer ball 0.64 | 124.7 | aeolian | 41.2 | rolling/tight | 0.19 | 5 |
| orange.jpg | vivid / restless | 1.00 · 0.38 · 0.23 · 0.20 · 0.11 | orange 0.55 | 119.2 | mixolydian | 38.9 | straight/tight | 0.00 | 7 |
| pic3.png | vivid / restless | 0.53 · 0.58 · 0.00 · 0.03 · 0.07 | digital clock 0.22 → abstract | 120.3 | mixolydian | 51.9 | straight/tight | 0.00 | 5 |
| smarties.png | vivid / restless | 0.72 · 0.51 · 0.00 · 0.23 · 0.01 | hair slide 0.14 → night | 120.4 | mixolydian | 36.7 | straight/tight | 0.00 | 5 |
| starry_night.jpg | tense / dense | 0.30 · 0.74 · 0.46 · 0.06 · 0.00 | comic book 0.06 → abstract | 124.9 | aeolian | 51.9 | rolling/tight | 0.21 | 5 |
| sudoku.png | tense / dense | 0.50 · 0.61 · 0.40 · 0.00 · 0.00 | crossword puzzle 0.87 → abstract | 125.1 | aeolian | 43.7 | straight/tight | 0.00 | 5 |

## 3. Instruments, visual vocabulary, signature and form

In the tables below:

- **Instruments** are the voices that exist for this photo. Each voice has an amount computed from features, and a voice below 0.25 does not exist.
- **Vocabulary** lists the layers that enter as A > B > C, for pass 1 and then pass 2, which mutates.
- **Signature** is the peak moment for pass 1 / pass 2.
- **Sections** are the bar counts of Reading – Decomposition – Build – Peak – Afterglow – Memory.

| image | instruments | vocabulary (pass 1) | vocabulary (pass 2) | signature | sections (bars) | duration |
|---|---|---|---|---|---|---:|
| nocturne | kick, click, hat, bass, sub, pad, hiss, stutter | orbit › topography › constellation | topography › constellation › fragments | NETWORK/STRATA | 12-16-20-14-16-10 | 186 s |
| facade | kick, click, hat, rim, snare, bass, sub, crackle, stutter | barcode › fragments › matrix | fragments › matrix › constellation | GRID/NETWORK | 8-18-28-16-16-10 | 183 s |
| dune | kick, click, rim, bass, sub, pad, stutter | topography › fragments › barcode | fragments › barcode › constellation | STRATA/RECONSTRUCT | 10-16-18-14-16-8 | 182 s |
| neon | kick, click, hat, rim, snare, bass, sub, crackle, hiss, stutter | constellation › orbit › barcode | orbit › barcode › fragments | NETWORK/GRID | 10-14-22-16-14-10 | 177 s |
| silk | kick, click, hat, rim, bass, sub, pad, hiss | fragments › topography › barcode | topography › barcode › constellation | STRATA/NETWORK | 10-16-20-12-16-10 | 176 s |
| bauhaus | kick, click, hat, rim, snare, bass, sub, crackle, stutter | matrix › barcode › fragments | barcode › fragments › topography | GRID/RECONSTRUCT | 8-16-26-14-14-8 | 173 s |
| horizon | kick, click, rim, bass, sub, pad, grain, stutter | topography › fragments › barcode | fragments › barcode › orbit | STRATA/GRID | 8-16-22-14-14-8 | 180 s |
| thicket | kick, click, hat, snare, bass, sub, pad, crackle, hiss | constellation › fragments › orbit | fragments › orbit › sort | NETWORK/SWEEP | 8-16-24-14-14-10 | 181 s |
| ice | kick, click, hat, rim, snare, bass, sub, crackle, stutter | barcode › fragments › matrix | fragments › matrix › constellation | GRID/RECONSTRUCT | 10-16-26-14-14-10 | 177 s |
| figure | kick, click, sub, pad, hiss, grain | particles › topography › fragments | topography › fragments › flow | RECONSTRUCT/STRATA | 12-12-18-10-18-10 | 176 s |
| HappyFish.jpg | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | fragments › barcode › matrix | barcode › matrix › sort | GRID/SWEEP | 8-16-26-16-14-10 | 179 s |
| LinuxLogo.jpg | kick, click, hat, rim, bass, sub, pad, crackle, hiss, grain, stutter | orbit › barcode › constellation | barcode › constellation › topography | NETWORK/GRID | 14-14-20-14-14-10 | 180 s |
| aero1.jpg | kick, click, hat, rim, snare, bass, sub, pad, crackle, grain, stutter | topography › flow › fragments | flow › fragments › sort | SWEEP/STRATA | 10-16-26-14-16-10 | 182 s |
| baboon.jpg | kick, click, hat, rim, snare, bass, sub, pad, crackle, grain, stutter | fragments › constellation › flow | constellation › flow › sort | SWEEP/NETWORK | 10-16-24-16-14-10 | 182 s |
| box_in_scene.png | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | barcode › flow › constellation | flow › constellation › sort | SWEEP/GRID | 10-18-26-16-14-10 | 180 s |
| building.jpg | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | barcode › flow › sort | flow › sort › constellation | SWEEP/GRID | 8-18-30-16-16-10 | 186 s |
| fruits.jpg | kick, click, hat, rim, snare, bass, sub, pad, crackle, grain, stutter | fragments › flow › sort | flow › sort › constellation | SWEEP/NETWORK | 10-18-22-14-14-10 | 178 s |
| graf1.png | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | flow › sort › fragments | sort › fragments › barcode | SWEEP/NETWORK | 10-18-24-14-14-10 | 181 s |
| home.jpg | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | fragments › barcode › constellation | barcode › constellation › sort | SWEEP/GRID | 10-18-26-14-16-10 | 179 s |
| lena.jpg | kick, click, hat, rim, snare, bass, sub, pad, crackle, grain | particles › flow › fragments | flow › fragments › barcode | RECONSTRUCT/SWEEP | 8-16-20-12-18-10 | 177 s |
| messi5.jpg | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | flow › fragments › sort | fragments › sort › constellation | SWEEP/NETWORK | 10-18-26-14-14-10 | 177 s |
| orange.jpg | kick, click, hat, rim, snare, bass, sub, pad, crackle, grain, stutter | fragments › barcode › topography | barcode › topography › constellation | RECONSTRUCT/GRID | 8-16-24-16-16-10 | 181 s |
| pic3.png | kick, click, hat, rim, snare, bass, sub, crackle, stutter | matrix › barcode › fragments | barcode › fragments › constellation | GRID/SWEEP | 10-18-22-14-16-8 | 176 s |
| smarties.png | kick, click, hat, snare, bass, sub, pad, crackle, grain, stutter | fragments › matrix › topography | matrix › topography › constellation | GRID/SWEEP | 8-16-26-16-14-10 | 179 s |
| starry_night.jpg | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | flow › sort › fragments | sort › fragments › constellation | SWEEP/NETWORK | 10-16-24-18-16-10 | 181 s |
| sudoku.png | kick, click, hat, rim, snare, bass, sub, crackle, grain, stutter | barcode › flow › sort | flow › sort › matrix | GRID/SWEEP | 10-18-24-18-14-10 | 180 s |

### Events per pass

Every event is both a sound and a visual action: a reveal draws a line, a click flashes a point, a detach releases a stroke, a fracture slides a colour region, and a rim flashes a barcode line.

| image | reveal | click | kick | bass | hat | rim | snare | pad | detach | fracture | stutter | tex |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| nocturne | 45 | 250 | 127 | 158 | 0 | 0 | 0 | 14 | 68 | 13 | 18 | 34 |
| facade | 33 | 175 | 249 | 213 | 471 | 212 | 68 | 8 | 92 | 22 | 21 | 40 |
| dune | 12 | 101 | 111 | 158 | 0 | 159 | 0 | 15 | 6 | 16 | 13 | 1 |
| neon | 39 | 267 | 137 | 170 | 398 | 177 | 59 | 7 | 69 | 18 | 17 | 67 |
| silk | 39 | 101 | 117 | 134 | 61 | 155 | 0 | 13 | 69 | 16 | 0 | 33 |
| bauhaus | 12 | 129 | 228 | 153 | 60 | 190 | 63 | 7 | 10 | 20 | 42 | 36 |
| horizon | 9 | 198 | 130 | 126 | 0 | 175 | 0 | 14 | 4 | 17 | 15 | 21 |
| thicket | 33 | 197 | 143 | 183 | 497 | 0 | 59 | 14 | 79 | 18 | 0 | 69 |
| ice | 39 | 247 | 228 | 174 | 261 | 190 | 62 | 7 | 84 | 19 | 23 | 36 |
| figure | 19 | 162 | 96 | 0 | 0 | 0 | 0 | 15 | 14 | 13 | 0 | 49 |
| HappyFish.jpg | 33 | 160 | 239 | 202 | 232 | 210 | 67 | 7 | 72 | 20 | 35 | 68 |
| LinuxLogo.jpg | 28 | 126 | 119 | 139 | 15 | 147 | 0 | 13 | 27 | 15 | 21 | 90 |
| aero1.jpg | 39 | 158 | 241 | 188 | 485 | 186 | 62 | 16 | 84 | 19 | 12 | 68 |
| baboon.jpg | 39 | 198 | 246 | 190 | 220 | 195 | 63 | 14 | 80 | 18 | 16 | 69 |
| box_in_scene.png | 39 | 307 | 248 | 174 | 283 | 196 | 67 | 7 | 88 | 22 | 25 | 62 |
| building.jpg | 33 | 207 | 268 | 210 | 524 | 217 | 73 | 8 | 95 | 24 | 23 | 72 |
| fruits.jpg | 39 | 112 | 228 | 178 | 203 | 174 | 57 | 14 | 77 | 20 | 18 | 58 |
| graf1.png | 39 | 135 | 239 | 184 | 391 | 182 | 57 | 7 | 84 | 19 | 20 | 62 |
| home.jpg | 39 | 167 | 238 | 190 | 318 | 183 | 62 | 8 | 86 | 22 | 21 | 62 |
| lena.jpg | 33 | 257 | 195 | 135 | 74 | 154 | 49 | 14 | 71 | 16 | 0 | 59 |
| messi5.jpg | 39 | 165 | 244 | 193 | 140 | 193 | 63 | 7 | 88 | 22 | 17 | 65 |
| orange.jpg | 33 | 92 | 231 | 192 | 255 | 200 | 63 | 15 | 80 | 18 | 23 | 61 |
| pic3.png | 21 | 150 | 225 | 178 | 224 | 168 | 56 | 8 | 24 | 20 | 25 | 36 |
| smarties.png | 33 | 165 | 235 | 200 | 192 | 0 | 67 | 15 | 65 | 19 | 36 | 64 |
| starry_night.jpg | 39 | 216 | 259 | 206 | 418 | 222 | 67 | 8 | 80 | 18 | 21 | 67 |
| sudoku.png | 39 | 178 | 248 | 207 | 317 | 217 | 66 | 7 | 84 | 20 | 26 | 66 |

## 4. Diversity summary (26 images)

- **Moods** (6 distinct): vivid / restless ×8, tense / dense ×7, dark / mysterious ×5, vast / calm ×2, cold / clinical ×2, warm / intimate ×2
- **Modes** (6): mixolydian ×8, aeolian ×7, phrygian ×5, lydian ×2, quartal ×2, dorian ×2
- **Kick styles** (4): straight ×11, rolling ×7, sparse ×5, half ×3
- **Tempo**: 108.1–126.6 BPM, 24 distinct values
- **Lead layer** (8): fragments ×7, barcode ×5, topography ×3, flow ×3, orbit ×2, constellation ×2, matrix ×2, particles ×2
- **Full A › B › C vocabularies**: 21 distinct out of 26
- **Signature moments** (5): SWEEP ×9, GRID ×7, NETWORK ×4, STRATA ×3, RECONSTRUCT ×3
- **Instrument sets**: 13 distinct out of 26
- **Pass 2 vs pass 1**: the vocabulary order, the signature and the section lengths change for every image, so a loop never repeats itself.

Even when two photos share a vocabulary, the pieces still differ in tempo, mode, root, sections and seeded parameters, and they are built from different strokes, points and regions.
## 5. Performance and timing

All measurements are from headless Chromium with SwiftShader, which is a *software* GPU. Frame rates in this environment say nothing about a real GPU. CPU-side costs and audio scheduling are measured exactly.

| scenario | JS per frame (median / p95) | scheduled events in 8 s | min lead before playback | late events | scheduler tick (median / p95) | layers | DPR |
|---|---|---:|---:|---:|---|---:|---:|
| desktop 1280×800 · facade PEAK | 0.10 / 0.20 ms | 154 | 122.8 ms | 0 | 25.0 / 28.7 ms | 6 | 1.0 |
| desktop 1280×800 · nocturne BUILD | 0.10 / 0.20 ms | 47 | 121.2 ms | 0 | 25.0 / 27.9 ms | 5 | 1.0 |
| desktop 1280×800 · dune PEAK | 0.10 / 0.20 ms | 51 | 122.6 ms | 0 | 25.0 / 26.8 ms | 6 | 1.0 |
| desktop · flow layer forced (14k CPU streaks) | 0.50 / 0.90 ms | 41 | 95.3 ms | 0 | 25.0 / 28.1 ms | 7 | 1.0 |
| iPhone 13 emulation · facade PEAK | 0.10 / 0.20 ms | 154 | 119.9 ms | 0 | 25.0 / 27.7 ms | 6 | 1.5 |

**Scheduling.**

- A worker clock runs every 25 ms and looks 150 ms ahead.
- Every sound was scheduled at least 95 ms before it played, and none was late.
- Step times are computed from the integer step index (`start + n · stepDur`), so there is no cumulative drift.
- Visual events are released against the same audio clock, with output latency compensated.

**Frame budget.**

- The JS side (score state, layer updates, force field, uploads) costs well under 1 ms per frame, so the GPU sets the frame rate.
- **Desktop budget:** at most 6 layers are visible at a time, plus ≤ 6k contour segments, ≤ 900 fragments, ≤ 260 points, ≤ 38k particles and ≤ 14k streaks. Hidden layers are not drawn.
- **Mobile:** about half of everything, DPR capped at 1.5, and the resolution drops automatically if frames stay above ~24 ms for two seconds.

**Analysis cost.** Structures take 85–290 ms per photo at 256 px (section 1). They run once, while the scan line passes. Face detection and classification run in parallel on separate small copies.

**Audio levels** were measured on the master bus:

| section | peak into the limiter | RMS | energy balance |
|---|---:|---:|---|
| Peak | 0.85 | −12.4 dB | sub 72 % / low-mid 28 % |
| Afterglow | — | −24 dB | pad ≈ sub (50 / 50) |

There are about 12 dB between Peak and Afterglow. Tonal energy above 1.5 kHz is negligible by design: highs come only from clicks, hats and noise.

## 6. Not verified here

- **Real-GPU frame rate**, desktop and phone. SwiftShader cannot show it, so it needs a check on real devices. The adaptive-resolution fallback is in place.
- **Listening.** Levels and spectra were measured, but the music was not heard in this environment.
- **iOS audio unlock** on a real iPhone, and **WebM export**. Headless capture produces no video frames, even for a plain 2D canvas.

## 7. Re-run

Serve the repository root and open `tools/report.html`. Click "run built-in images" or pick your own photos. The page runs the same pipeline locally and prints this table.
