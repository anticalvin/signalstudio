# Verification loop

Nothing in this project is "done" unless a test or an artifact in `/artifacts` shows it.

## Run it

```bash
npm run typecheck      # tsc
npm test               # vitest: migration, history, registry, static GLSL validation (glslangValidator)
npm run test:e2e       # builds, serves on :4317, drives headless Chromium on SwiftShader (software WebGL2)
npm run test:update-goldens   # rewrite tests/goldens after a reviewed, intended visual change
```

`npm run test:e2e` writes every frame to `/artifacts` (`frame1-clean.png`, `frame2-selected.png`,
`frame3-depth.png`, `frame4-surveillance.png`, `frame5-surveillance-tight.png`, `diagnostic-charts.png`,
`colour-chart-flat.png`, `mobile-375.png`) plus `*.diff.png` on any golden mismatch.

## The diagnostic scene (`src/diagnostics/scene.ts`)

Fixed ids, positions, camera, light, seed (7) and time (1.5 s): two contrasting figures (dark / light clothing),
a rust sign, a green monobloc chair, a shadow-only ground, and optionally a text chart, a 24-patch colour chart and a
high-contrast grid/zone-plate chart. `frameDoc(name)` turns it into each reference frame.

## What is asserted, per frame

| Frame | Assertions (all measured on pixels) |
| --- | --- |
| 1 Clean | four corners >= 253 luminance; band below the shadows >= 99.9 % paper white (no floor); shadow is grey (150-245), never black, with depth > 25 and adjacent-pixel step < 35 (soft); sign R > B; chair G > R, B; byte-identical on repeat |
| 2 Selected | all 8 projected box corners are dark dots (>= 7/8) and were not before selecting; >= 80 saturated gizmo pixels appear; Clean hides it |
| 3 Depth | corners, floor and shadow regions < 4/255; output is grey (chroma <= 2); nearest object (chair) is >= 30 levels lighter than the farthest (sign) |
| 4 Surveillance | <= 3 % non-annotation pixels are mid-grey (1-bit); crimson boxes only around tracked figures (none beyond x = 330 where the chair is); caption strips >= 8 rows tall containing white lettering; speck density on paper between 0.05 % and 2 % |
| 5 Tight | boxes move and are >= 1.3x taller than frame 4; all inside the frame |
| Colour | 24 chart patches reproduce within +-3 per channel through the full linear -> sRGB path |
| Regression | export is byte-identical whether or not the preview rendered first, and after an export at another size |

## Tolerances

Goldens use `pixelmatch` with per-pixel threshold **0.1** and a maximum differing-pixel fraction of **0.5 %**
(`DEFAULT_TOLERANCE` in `tests/e2e/helpers.ts`). That absorbs driver-level anti-aliasing noise and rejects visible change.
Goldens were generated on macOS (arm64) with Chromium on SwiftShader. They have **not** yet been verified to match on
Linux CI; if they do not, regenerate them there once and commit those.

## What this does NOT prove

- The five reference screenshots (`/reference`) were **not available** when this was built. Every assertion above comes from
  the written description of the frames, applied to procedural stand-in figures. No claim of visual equivalence to the
  real references is made. When the images are added, add a perceptual comparison against them (see "Next").
- Procedural figures are not scanned people.

## Shader safety

- `tests/unit/glsl.test.ts` assembles each program with three.js' WebGL2 prefix and runs `glslangValidator`
  (required when `CI` is set).
- `tests/e2e/shaders.spec.ts` renders with each effect in a real browser and fails on any recorded shader error. A
  deliberately broken program proves errors reach the on-screen banner (`#errors`) instead of being swallowed.
