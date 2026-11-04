# Research notes

These are working notes for Photo to Sound, round 2. They combine web research
(sources at the end), knowledge of the records and works themselves, and
standard signal-processing practice. Where a statement is my own analysis of
the music rather than a documented fact, it says so ("listening analysis").
Live web pages could not be fetched from this environment (only search
summaries), so some points rely on general knowledge of the catalogue.

---

## 1. Sound

### 1.1 Alva Noto (Carsten Nicolai), the Uni series

**Context.** *Unitxt* (2008), *Univrs* (2011) and *Unieqav* (2018) form the
"Uni" trilogy. It is Nicolai's personal reading of club music: a "universal
language" built from test tones, data and the grid. In interviews he describes
*Unitxt* as "really in the 120 bpm grid", while *Univrs* starts at 133.333 bpm
and moves through 125, 124 and 128 bpm, so it is "not so static". **Tempo is a
compositional parameter, not a constant.** *Unieqav* (Noton, 2018) closes the
series. Reviewers describe "Uni Mia" as the point where "an increase in
tension is registered", with "laser-like sounds over a heavy beat" and "warm
synth clouds" moving through, and with Robert-Henke-like low-end "pressure
systems".

**Listening analysis: how a Uni track is built.**

- **One cell, many states.** A track is usually a single rhythmic cell, often
  1 or 2 bars long, that is never really repeated identically. Every few bars
  one parameter changes: a click moves by a 32nd, a filter opens by a fraction,
  a layer drops for a bar. Development comes from *subtraction and
  displacement* more than from addition.
- **Sub/kick.** The kick is almost a pure sine burst. It has a very short
  pitch drop (roughly 150 Hz down to 45–55 Hz within 20–40 ms) and a click
  transient that is a separate event. The low end is felt more than heard. Its
  tail is either cut dry (short gate) or sustained as a *sub pulse* that turns
  into a bass note. In *Unieqav* the sub carries the harmony: long low notes
  under the grid, often sidechained so they "breathe" with the kick (the
  "pressure systems").
- **Clicks.** These are single-sample or few-sample impulses, DC steps and
  very short sine bursts (0.5–3 ms) with no envelope shaping, so the listener
  hears the spectrum of the step itself. They are hard-panned and placed on a
  32nd/64th grid. Their spectral brightness comes from their shortness, not
  from tonal height. This is the "Alva Noto" signature the user likes.
- **Mid-range "lasers".** Short pitched blips in the 400 Hz–2 kHz range, often
  with a pitch glide or ring modulation. They act like rimshots in a techno
  kit, not like melodies.
- **Noise.** Band-passed white noise bursts stand in for snares and hats.
  Bitcrushed or sample-rate-reduced noise and digital errors (buffer repeats,
  dropouts) work as texture.
- **Harmony (Unieqav).** Sparse, slow pad clouds in the low-mid register.
  Detuned, filtered, with a slow attack and a long release. They sit *behind*
  the rhythm and are often ducked by it. The emotion comes from one chord
  change every 8–16 bars.
- **Silence.** Hard mutes of everything except the sub for a half bar or a
  whole bar, and "drop-outs" where the grid continues silently and the return
  lands exactly on the 1. Silence is used as a rhythmic value.
- **Arrangement over time.** The entry is the click cell alone or a
  sub-drone. The kick enters after 16–32 bars. Layers then enter on 8/16-bar
  boundaries, with a breakdown around the 2/3 mark (pad and sub only), a
  return, and an end that subtracts back to the cell. Tracks run 5–7 minutes,
  but the *density curve* is that of a 3-minute pop arc stretched out.

**Xerrox (2007–2020).** These records are built from copy processing of found
material such as muzak and advertising music: "copies from copies" with
"shifts, stretches, zooms and ratio adjustments" until the source becomes
unrecognisable. The result is long, slow, warm, degraded harmonic fields. This
is the model for **the Afterglow pad**: a source (here, the image's palette)
copied, smeared and degraded until only the emotional colour is left.

**Sakamoto + Alva Noto (*Vrioon* 2002, *Insen* 2005, *Revep*, *utp_*,
*Summvs* 2011).** Sakamoto played sparse, "sustain-drenched" piano and
Nicolai treated it with crisp clicks, glitches and sine tones. Recordings were
exchanged remotely, and *Insen* used real-time processing. The lesson for this
project is **contrast between one soft, slow, human, tonal layer and a
precise, quantised, inhuman digital layer.** The emotion lives in the space
between the two.

**Live shows.** The visuals are "software-generated test images" manipulated
in real time "by audio signals", described as "a very strong colourful line
system based on audio distortions". The studio built custom software to "play
sound and at the same time synchronize to the real-time visuals". For
*Unieqav*, custom hardware triggers video in real time from the performance
audio. **One event leads to one visual change, with no smoothing or
interpretation layer between them.**

### 1.2 Ryoji Ikeda (*datamatics*, *test pattern*, *superposition*)

- ***test pattern*** converts any data (text, sound, photos, video) into
  binary black-and-white barcodes, "tightly synchronised" with the audio
  signal. The CD/LP is built from sine tones and noise bursts across the full
  frequency range, at velocities that work "as a test record for audio
  equipment".
- ***datamatics*** shows data as pure structure: scrolling matrices of numbers,
  point clouds, and 1-pixel lines at full contrast. The aesthetic rules are a
  black ground, white, one accent colour at most, no gradients, no blur, and
  time quantised to frames.
- ***superposition*** (2012) is a 65-minute performance about quantum
  mechanics. It uses ten or more synchronised screens, scatter plots that
  resemble collision data, flashing constants, and text alternately shown and
  hidden, as a visual echo of superposition. Human performers are part of the
  system.
- **Listening analysis.** Ikeda's sound is extreme: sine tones at the edge of
  hearing, white-noise slabs and clicks. His *dynamics* are binary, either full
  on or silent, and cuts are sample-accurate. The *high* sine tones are what
  this project should **not** copy (the user hears them as kitsch). His
  structure, cut discipline and one-to-one sync are what to take.

### 1.3 The wider Raster-Noton / minimal circle

- **Byetone (Olaf Bender).** Byetone takes "his tone generators for a very
  noisy trip through minimal techno". He is groove-oriented, with saturated
  square/pulse basses, distorted kicks and a strong 4/4. Lesson: **saturation
  and the groove make the minimalism physical.**
- **Frank Bretschneider.** "Reduction, precise rhythmic patterns and sine-wave
  textures" and "funk-based minimal techno work-outs". He uses polyrhythmic
  click patterns (3 against 4, 5 against 8) built from very few sounds.
  Lesson: **polyrhythm from Euclidean-style patterns of different lengths.**
- **Kangding Ray.** "Techno with impeccable sound design", "part celestial
  drone, part industrial thud". He has deep, long kicks, wide filtered noise,
  and harmonic drones under hard rhythm. Lesson: **a drone bed plus industrial
  transient design.**
- **Dub techno (Basic Channel lineage).** These are cousins of the "underwater
  depth" in *Uni Mia*. The chord stab is a short-attack chord through a
  filtered delay ("delay is an inseparable part"), with sidechain "so the kick
  can punch through the ambient textures". It has a thumpy kick plus a separate
  deep sine sub with few notes, and hiss and crackle as texture. The typical
  tempo is 118–130 BPM.

### 1.4 Sound techniques we can use (all in Web Audio)

| Element | Technique |
|---|---|
| Sine sub kick | `OscillatorNode` with an exponential frequency ramp (≈ 3.5× → 1.35× → 1× of 44–60 Hz) and a gain envelope with a separate impulse click |
| Sub pulse / bass | Sine plus a 2-operator FM bass (carrier at the note, modulator ratio 0.5/1/2, decaying index) → low-pass ≤ 900 Hz → `tanh` saturation |
| Rim / laser | 0.5–8 ms sine or triangle burst at 400–1600 Hz with a fast pitch drop, plus a band-passed noise tick |
| Glitch click | A 1–64 sample impulse buffer with no envelope, hard-panned (keep the existing one) |
| Noise snare / clap | White noise → band-pass at 1.2–2.5 kHz, multi-tap envelope (3 spikes 8–12 ms apart for a clap), plus a short 180 Hz sine body |
| Hats / shakers | Noise → high-pass at 6–9 kHz, 10–60 ms, velocity and swing per step |
| Crackle | Sparse random impulses, low-passed at 3 kHz, in a pre-rendered buffer |
| Bitcrushed hiss | Pre-rendered noise with sample-and-hold (rate reduction) and quantisation |
| Granular noise / scrub | Many 10–40 ms grains from a buffer (image rows rendered as audio) with a Hann window |
| Digital errors | Repeating a 5–30 ms slice of a buffer 3–12 times (stutter), and buffer dropouts |
| Pad / chord | 2–3 detuned saw/triangle oscillators per voice → low-pass (300–1200 Hz) → slow attack (1–4 s) → dark generated reverb (exponentially decaying noise impulse response, low-passed) |
| Sidechain | Web Audio has no sidechain input on `DynamicsCompressorNode`, so use **gain automation scheduled at each kick time** on the pad, texture and bass buses (dip to 0.25–0.5, release 80–220 ms) |
| Saturation | `WaveShaperNode` with a tanh curve (oversample `'2x'`) |
| Mono sub | Bass and kick are never panned. A low-pass at about 120 Hz on a sub-only path, with the rest high-passed |
| Limiter | `DynamicsCompressorNode` (fast attack, high ratio) before the output. Chromium applies automatic make-up gain, so gain staging must leave headroom. |
| Timing | A lookahead scheduler: a worker clock every 25 ms, 100–150 ms ahead, with times computed from integer step indices so nothing drifts |

---

## 2. Visual

### 2.1 Carsten Nicolai (visual work)

He works with test images, interference patterns (moiré), grid systems, and
the *visualisation of sound as physical phenomenon* (*milch*, *snow noise*,
*unidisplay*). His live line systems are distorted by the audio signal itself.
**Lesson: the image's own structure is the test pattern, and the sound
distorts it.**

### 2.2 Ryoji Ikeda

Binary contrast, 1-px lines, barcodes, data matrices, scanning scrolls, and
flicker at audio rate. Every visual event has a sound and vice versa.
**Lesson: the barcode / extended-line vocabulary, and strict one-to-one
events.**

### 2.3 Ryoichi Kurokawa

"Capturing nature and distorting it to reconstruct it again is one of the
pillars of my creative process." His works (*unfold* with ESA/NASA star
formation data, *syn_*, *ground.alt*, *subassemblies* with 3D laser scans of
ruins) are **deconstruction then reconstruction** of real recorded material.
Image and sound are composed as one timeline, with "different time design" per
layer. **Lesson: dramaturgy. The source must be recognisable at the start and
at the end, and the middle is its decomposition.**

### 2.4 Quayola

In *Strata*, custom algorithms run on high-resolution footage and paintings
(cathedral vaults, Rubens). "Triangulation algorithms" turn paint into a
cracking mesh, a "splintered symphony of geometric shapes" that "abstracts
the source material without destroying it". *Captives* is non-finito: form
emerging from a block and endlessly morphing. **Lesson: Delaunay triangulation
of the image's own keypoints, coloured by the pixels underneath. Fragments
fracture and reassemble, and the image is never replaced by unrelated
geometry.**

### 2.5 Robert Henke (*Lumière*)

Lasers are driven by the same scripting system as the synthesis: "the shapes
projected by the laser were scripted to connect with the same scripting
language he wrote on his synthesizer". Light and sound are "synced perfectly",
performed live rather than pre-rendered. **Lesson: one score object drives
both engines.**

### 2.6 Zach Lieberman, Casey Reas, Tyler Hobbs

- **Lieberman.** Gestural line drawing, lines that draw themselves, and
  physics on drawn lines (springs, decay). **Lesson: the force-field
  interaction. Lines have mass, bend around the hand and spring back.**
- **Reas (*Process Compendium*).** A system is made of *Elements* (a form plus
  behaviours) that interact. Visual complexity emerges from simple behaviours
  ("move in a straight line", "deviate when touching", "constrain to
  surface"). **Lesson: a vocabulary of primitives (form + behaviour), weighted
  per image, instead of fixed templates.**
- **Hobbs (*Flow Fields*, Fidenza).** A grid of angles over the canvas, curves
  traced through it, careful choice of start points, angle binning for
  "angular" variants, and collision avoidance and varied stroke scale as the
  main sources of quality. **Lesson: trace streamlines from the image's own
  structure-tensor field, with seeded start points from edges, and limit
  overlap.**

### 2.7 Pixel sorting (Kim Asendorf, *ASDF Pixel Sort*, 2010)

Modes are white, black, bright and dark. Pixels are sorted only inside
*intervals* bounded by brightness thresholds (for example, start where
brightness > 127 and stop at < 223). The common recipe is "sort vertically,
then horizontally". **Lesson: sort along rows or columns inside intervals
delimited by edges or thresholds. This is done once on the CPU at analysis
resolution, then revealed band by band on the GPU in sync with sound.**

### 2.8 Generative contour and line art

Marching squares on a smoothed scalar field gives iso-lines (topographic
maps, Joy-Division-style ridgelines, which this project avoids copying).
Canny-style edge linking into polylines, simplified with Ramer–Douglas–Peucker,
produces drawable strokes. Polylines carry an arc-length parameter for
draw-on animation.

---

## 3. In-browser techniques

| Need | Technique |
|---|---|
| Edges | Sobel → non-maximum suppression → hysteresis (Canny-lite) on a 256 px copy |
| Edge strokes | Trace 8-connected chains through the thin edge map → polylines → RDP simplification |
| Contours | Marching squares on blurred luminance at quantile levels |
| Lines | Hough transform with orientation-restricted voting. Each peak is converted into actual *segments* by walking the line and collecting covered runs. |
| Corners | Shi–Tomasi (minimum eigenvalue of the structure tensor) with non-maximum suppression and minimum spacing |
| Segmentation | k-means in a perceptual colour space (Lab-ish), k = 5–8, then connected components |
| Fragments | Delaunay (Bowyer–Watson) over keypoints, edge samples and border points, with triangles coloured by the mean colour underneath |
| Saliency | Centre–surround difference of Gaussians in L, a and b at two scales |
| Colourfulness | Hasler & Süsstrunk (2003): σ_rgyb + 0.3·μ_rgyb |
| Colour temperature | Mean (R − B) weighted by chroma, plus the hue histogram |
| Face + landmarks | MediaPipe FaceDetector (BlazeFace), then FaceLandmarker (478 points) only when a face exists |
| Content | MediaPipe ImageClassifier (EfficientNet-Lite0 int8, ImageNet classes), keyword-mapped to portrait, city, nature, water, night, fabric and abstract. The guide warns that `classify()` is synchronous and blocks the UI, so run it once during reading. |
| Physics | A CPU spring grid (displacement + velocity per cell, damping, neighbour diffusion), uploaded every frame as a half-float texture that every shader samples |
| Lines / points | three.js `LineSegments` with per-vertex arc length (draw-on in the shader), and `Points` with shader-sized sprites |
| Pixel sort | Computed on the CPU per image (sorted rows and columns inside edge intervals), then masked per band in a fragment shader |

---

## Sources

- [Unieqav (Wikipedia)](https://en.wikipedia.org/wiki/Unieqav), [Tiny Mix Tapes review](https://www.tinymixtapes.com/music-review/alva-noto-unieqav), [RA review](https://es-mx.ra.co/reviews/22363), [Brainwashed review](https://brainwashed.com/index.php/reviews-easyblog/alva-noto-qunieqavq), [Soundohm](https://cdn.soundohm.com/product/unieqav), [Debaser review](https://en.debaser.it/alva-noto/unieqav/review)
- [ATTN interview: Carsten Nicolai](https://www.attnmagazine.co.uk/interview-carsten-nicolai-alva-noto/), [Univrs (Wikipedia)](https://en.wikipedia.org/wiki/Univrs), [FACT: Alva Noto, univrsal sound](https://factmag.com/2012/01/20/alva-noto-univrsal-sound)
- [Berliner Festspiele: unitxt / univrs performance](https://www.berlinerfestspiele.de/en/maerzmusik/programm/2011/kalender/unitxt-univrs-alva-noto), [Derivative: raster-noton deploys TouchDesigner](https://derivative.ca/community-post/raster-noton-deploys-touchdesigner/60814), [CDM: UNIEQAV](https://cdm.link/tag/unieqav)
- [Forma: Xerrox](https://forma.org.uk/projects/xerrox), [Ensemble Modern: Xerrox Vol. 4](https://www.ensemble-modern.com/en/projects/alva-noto-xerrox-vol-4-2021), [Barbican Xerrox programme](https://www.barbican.org.uk/sites/default/files/documents/2023-04/260423_Xerrox%20Selected_digital%20programme_1.pdf)
- [igloo: Summvs review](https://igloomag.com/reviews/alva-noto-ryuichi-sakamoto-summvs-raster-noton), [Exclaim: Summvs](https://exclaim.ca/music/article/alva_noto_ryuichi_sakamoto-summvs), [Classical Source: Insen live](https://www.classicalsource.com/concert/ryuichi-sakamoto-alva-noto-insen/)
- [YCAM datamatics release](https://special.ycam.jp/datamatics/dl/datamatics_release_en.pdf), [ISEA: test pattern](https://isea-archives.siggraph.org/?p=49063), [PopMatters: Test Pattern](https://popmatters.com/66695-ryoji-ikeda-test-pattern-2496095977.html), [Vinyl Factory: Ikeda overview](https://thevinylfactory.com/features/data-as-spectacle-a-ryoji-ikeda-overview/), [Plus Maths: superposition](https://plus.maths.org/content/superposition-ryoji-ikeda), [superposition (PDF)](https://epidemic.net/Ikeda-superposition/superposition-E.pdf)
- [RA: Byetone, Plastic Star](https://ra.co/reviews/5118), [Amoeba: Byetone bio](https://amoeba.com/byetone/artist/188794/bio), [RA: Kangding Ray, The Pentaki Slopes](https://ra.co/reviews/12202), [Exclaim: Kangding Ray, Stabil](https://exclaim.ca/music/article/kangding_ray-stabil), [Musique Machine reviews (Bretschneider)](https://www.musiquemachine.com/reviews/reviews_template.php?id=2778)
- [Attack Magazine: Basic Channel style dub techno](https://www.attackmagazine.com/technique/beat-dissected/basic-channel-style-dub-techno/), [Attack: dub techno synth chords](https://www.attackmagazine.com/technique/synth-secrets/dub-techno-synth-chords/), [Melodigging: dub techno](https://www.melodigging.com/genre/dub-techno)
- [Elektra: Ryoichi Kurokawa](https://www.elektramontreal.ca/bian2021-ryoichi-kurokawa), [Clot: Kurokawa](https://clotmag.com/?p=9098), [MUTEK: Kurokawa](https://mutek.org/en/artists/ryoichi-kurokawa)
- [Hyperallergic: Quayola fractures a Roman cathedral](https://hyperallergic.com/quayola-roman-cathedral/), [CAN: Captives](https://www.creativeapplications.net/featured/captives-cg-geological-formations-as-life-size-unfinished-sculptures/), [Vice: Quayola, Iconographies](https://www.vice.com/en/article/quayola-talks-iconographies)
- [Ableton: Robert Henke, Lumière](https://www.ableton.com/fr/blog/robert-henke-lumiere-lasers-interview), [Gray Area: Lumière II](https://grayarea.org/?p=28617)
- [Tyler Hobbs: essays](https://www.tylerxhobbs.com/words), [flow fields notes](https://marcinklimek.github.io/posts/2024-01-03-flow-fields)
- [ASDF Pixel Sort notes (Processing forum)](https://discourse.processing.org/t/asdf-pixel-sort-with-different-sections-color-threshold/43416), [pixelsort (PyPI)](https://pypi.org/project/pixelsort/)
- [MediaPipe Image Classifier for Web](https://developers.google.com/edge/mediapipe/solutions/vision/image_classifier/web_js)
- [Web Audio ducking (Packt)](https://hub.packtpub.com/?p=8571), [Web Audio: no sidechain input (PhET issue)](https://github.com/phetsims/tambo/issues/172)
