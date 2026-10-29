# AWAKEN Signal Studio

Browser-based 3D composition and rendering instrument: import objects, compose a studio frame, give each object its own
render treatment and effects, add object-linked graphics, export a still that matches the preview.
Workflow: ASSETS → SCENE → OBJECTS → RENDER MODES → EFFECTS → COMPOSITION → OUTPUT.

Status: **M1 complete** (see below). WebGL2, Three.js 0.186, TypeScript, Vite, Vitest, Playwright.

```bash
npm install
npx playwright install chromium
npm run dev          # http://localhost:5173
npm run ci           # typecheck, unit tests, build, end-to-end
```

## Layout

```
src/doc/          project document: types, defaults, versioned migration (v1-v3 prototype -> v4)
src/effects/      parameter schemas, registry, stack constraints (no GLSL here)
src/render/       scene world, render graph, programs (GLSL in shaders/), annotations, noise
src/assets/       procedural figures/props (all original work); licences in /assets/LICENSES.md
src/editor/       store: selection, undo/redo history
src/export/       render-target readback and PNG encoding
src/ui/           shell, panels, schema-driven controls (sliders; knobs only for analog parameters)
src/diagnostics/  the fixed diagnostic scene, reference-frame documents, test charts
tests/unit        vitest        tests/e2e  Playwright        tests/goldens  regression images
legacy/           the original single-file prototype (kept for reference)
```

## Render graph

beauty (MSAA, half-float, linear) → geometry pass (R view depth, G object id, BA view normal; nearest) →
one fragment program per effect, masked by an **ID-indexed lookup texture** (256 objects, no per-pass cap) →
annotation overlay (2D canvas) → analog CRT → sRGB blit. Preview and export call the same `RenderGraph.render`;
pixel-sized parameters are in composition units (`k = outputHeight / compositionHeight`).

## M1 status

Done and verified: scaffold, port of the prototype's render graph/effects/render modes/document/history,
document migration, diagnostic scene, Playwright verification loop, static + runtime shader validation,
goldens for all five frames, determinism and colour-fidelity tests. See `docs/VERIFICATION.md`.

Not done (later milestones): model import (M2), antialiased masks / shadow mask / void-and-cluster blue noise (M3),
tuned Signal Ink and Surveillance look (M4), combined gizmo / text and shape layers (M5), CRT stage split, tiled export,
preview/export parity (M6), mobile/accessibility pass, performance budget, context-loss recovery (M7).
Dropped from the prototype for now: per-object animation, the image-plane cut-out path, GLB import, effect presets.
