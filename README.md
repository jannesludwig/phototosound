# Photo to Sound — "The Transmission"

You sacrifice a photograph. It is beamed into another dimension: measured,
decomposed into its spectra, dissolved into entropy and absorbed by a
singularity. Only debris remains.

The piece lasts about 3 minutes and runs once:

| Act | What happens |
|---|---|
| 0 OFFERING | the photo, intact, the only time |
| 1 MEASUREMENT | the photo tilts into a terrain of contour lines and one scan line measures it |
| 2 DECOMPOSITION | the image is split into 2–3 of its spectra (RASTER, ORBIT, DISSOLUTION, FLOW, MATRIX), chosen by the image |
| 3 ENTROPY | everything becomes one Brownian particle field |
| 4 ABSORPTION | it falls into a singularity at the photo's focal point |
| END | one white flash, then debris |

References are Ryoji Ikeda, Alva Noto, Ryoichi Kurokawa and Robert Henke.
The look is technical, mystical, dark, raw and minimal.

A hash of the file seeds every choice, so the same photo always produces the
same piece, and different photos take different journeys. Everything runs in
the browser and the photo is never uploaded. Only three.js, MediaPipe and the
face model are downloaded from CDNs.

See `docs/ROUND6.md` for the acts, how the image decides the journey, the
interaction, and every layer name, and `docs/RESEARCH_R6.md` for the
research. Earlier rounds are in `docs/ROUND5.md`, `docs/ROUND4.md`,
`docs/ROUND3.md` and `docs/V1_VS_V2.md`.

## Run

The site is static, with no build step and `index.html` at the root (ready for
GitHub Pages).

```bash
python3 -m http.server 8000
```

**Deep links for testing:**

| Link | What it does |
|---|---|
| `#demo=ii` | loads a demo image |
| `#section=ENTROPY&at=4` | jumps to bar 4 of an act |
| `#spectra=FLOW,ORBIT` | forces the spectra |
| `#bar=40` | jumps to a bar |
| `#loop=1` | starts in loop mode |

## Interaction

- **The cursor is an observer.** Where it rests, the state collapses and a
  glimpse of the measured photo appears.
- **The cursor is a force.** Lines, cells and particles are pushed aside
  and spring back.
- **The cursor has a sound.** A whisper of a low sine follows the brightness
  under it, and fine clicks mark hard edges.
- **Rotation.** Dragging rotates the map in act 1.

**Controls** appear on hover: pause, new, volume, rec (WebM) and once/loop.
**M** opens the mixer (acts with jumps, every sound and visual layer, copy
settings).

## Files

```
index.html               page, import map, always-on upload/drop script (Safari fix)
css/style.css            gallery black, hairlines, monospace; yaw slider; mixer
js/main.js               flow, UI, the hand (lens, force, whisper), overlay, data strip, mixer
js/analysis.js           features, grid, palette, signature
js/structures.js         edge strokes, iso-contours, straight segments
js/face.js               MediaPipe face detection (box + eye keypoints)
js/map.js                the sound map: height, ridges, texture, focal point, params
js/journey.js            the image decides its journey: spectra, order, act lengths, camera, colour
js/audio/composer.js     the acts: MEASUREMENT, DECOMPOSITION, ENTROPY, ABSORPTION, END
js/audio/engine.js       round-4 voices + SCANNER, PRESSURE, FIELD, HAND; buses, scheduler
js/visuals/engine.js     conducts the acts: camera, morphs, slicing, lens, crash
js/visuals/terrain.js    act 1: terrain, contours, scan, the photo underneath
js/visuals/edges.js      EDGE FLASH (act 1)
js/visuals/field.js      the hand's force field
js/visuals/common.js     terrain GLSL (height + pose), layer base
js/spectra/*.js          the v1 worlds (RASTER, ORBIT, DISSOLUTION, FLOW, MATRIX), restored; their GLSL
js/spectra/entropy.js    act 3–4: the particle field, superposition, singularity, debris
js/demo.js               three procedural demo images
Test_Images/             test photos
docs/                    ROUND6 (current), RESEARCH_R6, ROUND5, ROUND4, ROUND3, V1_VS_V2, research
```
