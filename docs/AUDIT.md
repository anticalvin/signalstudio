# Audit (Phase 1) and open-source evaluation

Based on reading and running the code in this repository, not on README claims. Verified items cite a test.

## Render graph (actual)

```
beauty (MSAA 4x, half-float linear)
  -> geometry pass (R view depth, G object id, BA view normal xy; nearest; ground excluded)      [src/render/graph.ts geometryPass]
  -> per object-targeted effect: coverage pass (targeted=white, others=black, MSAA 4x, same depth) [coveragePass]  <- new
  -> effect program (depth | silhouette | ink | surv | grade), mixed by coverage * opacity
  -> annotation overlay (2D canvas texture) -> CRT (monolithic) -> sRGB blit (screen or 8-bit export target)
```

## Findings

| # | System | Current implementation | Defects / limitations | Visual consequence | Severity | Recommended solution | OSS | Complexity |
|---|---|---|---|---|---|---|---|---|
| 1 | Object masks | **Was:** nearest-sampled ID buffer, 8-bit LUT. **Now:** MSAA coverage pass per effect | Was hard-edged and lost thin geometry. Fixed (tests: `masking.spec.ts`). Remaining: one extra scene render per object effect (no cache); transparent/BLEND materials are treated as opaque in coverage | Jagged object cut-outs; pole dropouts (fixed) | Critical -> fixed; perf open (Medium) | Cache coverage by target set; share across effects; coverage from a single MRT pass | none needed | M |
| 2 | Blue noise | **Was:** high-pass white noise, mislabelled. **Now:** shipped 128x128 void-and-cluster (`scripts/gen-blue-noise.mjs`), spectrum-tested | Fixed. 8-bit ranks (256 levels over 16384 cells) limit very smooth gradients | Clumping / streaks in stipple (fixed, seen in frame 4) | High -> fixed | 16-bit noise texture if banding appears | blue-noise-rust (study; MIT) | S |
| 3 | Signal Ink | One monolithic shader: exposure, contrast, Sobel luminance edges, ID/depth/normal edges mixed into one `l`, grain, speckle, dither | No separate stages; edges cannot be controlled independently; large shapes collapse to black blobs (visible on figures); no halftone, no error diffusion, no print character, dither pattern in screen space only | Looks like thresholded noise, not a print process | **Critical (primary quality gap)** | Staged passes: tone -> ink mass -> contours (external/depth/normal/luma separate) -> detail -> dither -> print | webgl-outlines (study; MIT, stale since 2022), ditherwave (reference; MIT) | L |
| 4 | Shadows | Ground is a `ShadowMaterial`, excluded from ID/coverage, so a character's shadow is never touched by that character's effect (verified: shadow pixels unchanged under Ink) | No way to stylise a shadow deliberately; no contact shadow; VSM can light-bleed; shadow cannot be isolated as its own pass | Shadows stay grey under 1-bit styles (reference shows black stipple) | High | Shadow-only pass (ground rendered with shadow factor as luminance) feeding its own ink treatment; contact shadows via accumulative approach | drei-vanilla (study/adapt; MIT) | M |
| 5 | Surveillance | `BODY.surv = BODY.ink` (same shader) + canvas annotations; boxes from projected `Box3` | Duplicates Ink instead of composing; no corner brackets, offsets, occlusion rules; bounds are AABB so rotated objects over-frame | Boxes bigger than subjects | Medium | Surveillance = ink preset + annotation layer with per-object offsets | none | M |
| 6 | CRT / analog | 1 shader mixing display, composite and source-media artefacts | Vertical hold steps on at 0.0001; mask pitch in output pixels (not resolution independent); no composite signal model | Preview != export at other sizes | High | Split into signal and display stages (M6) | Cathode-Retro (study only; BSL-1.0 requires notice if copied) | L |
| 7 | Asset import | Custom GLTFLoader wrapper: metres, grounding, double-sided, normals, alpha fix, IndexedDB, thumbnails (tested on a *generated* GLB only) | Never run on a real scan; no progress or external-texture handling; no optimisation; no sub-mesh selection; picking is brute-force raycast | Unknown on heavy assets | High | Test with licensed sample assets; add gltf-transform dedupe/prune/resize; three-mesh-bvh for picking | glTF-Transform (adopt, MIT), meshoptimizer (adopt via gltf-transform), three-mesh-bvh (adopt, MIT), KTX-Software (study) | M |
| 8 | Selection / gizmo | `TransformControls`, one mode at a time | Reference shows rotate rings + arrows together | Workflow gap | Medium | Compose two controls or custom gizmo (M5) | none | M |
| 9 | Effect UI | Flat list; add/remove/enable only | No reorder, duplicate, reset, presets; object-effects and output-effects not separated in the list; no debug pass viewer | Misleading single list | High | Per-object stack, separate sections (Render mode / Object effects / Shadow / Annotations / Output) | Tweakpane (dev panels only) | M |
| 10 | Export | One shot to an 8-bit target | Capped at `MAX_TEXTURE_SIZE`; no tiling; no transparent background | Cannot export large | Medium | Tiled render with shifted projection | none | M |
| 11 | Perf / memory | Fixed pass set; shader materials cached; RTs resized not reallocated | Not profiled; coverage pass adds a render per effect; no context-loss recovery | Unknown | Medium | Profile first | — | M |
| 12 | Dead / misleading code | `smooth` silhouette param (smoothing now intrinsic) removed; `RenderGraph.targetNodes` ok | `sil` node field, `blend` field, `Constraint` severity unused in render; "Track" checkbox only matters for scene-wide Surveillance | Misleading controls | Low | Remove or surface | — | S |
| 13 | Bundle | 660 kB single chunk | no splitting | slower first load | Low | dynamic import of importer/exporter | — | S |

## Fixed in this increment
Rows 1, 2 and the silhouette half of 12. Everything else is open and ordered in `docs/BACKLOG.md`.

## Open-source evaluation (licences and activity read from the GitHub API on 2026-10-29)

| Project | Licence | Last push | Problem it solves | Verdict | Cost / notes |
|---|---|---|---|---|---|
| webgl-outlines | MIT | 2022-12 | Depth+normal contour weighting | **Study / adapt** the idea (Sobel on depth, normal-weighted) into Ink stage 3; code is a small demo, unmaintained | No dependency |
| blue-noise-rust | MIT | 2026-10 | Blue-noise generation | **Study**; we generate with our own void-and-cluster script and ship the data | None at runtime |
| glTF-Transform | MIT | 2026-10 | dedupe, prune, resize textures, meshopt | **Adopt** in the importer (lazy-loaded) | ~+150-300 kB lazy; must verify in browser |
| drei-vanilla | MIT | 2026-02 | Accumulative/contact shadows | **Study / adapt** the accumulation technique; no R3F | Needs a plain-three port |
| Cathode-Retro | BSL-1.0 | 2025-12 | Composite video + CRT model | **Study** the signal chain; reimplement; keep BSL notice if any code is derived | C++/HLSL, not WebGL |
| ditherwave | MIT | 2026-04 | Dither/halftone algorithms | **Reference** for halftone/ordered variants | None |
| postprocessing (pmndrs) | Zlib | 2026-10 | Pass merging, SMAA, bloom | **Reject for now**: own graph already does object-masked passes; would duplicate it | +~100 kB |
| three.js | MIT | 2026-10 | Renderer | In use (0.186) | — |
| meshoptimizer | MIT | 2026-10 | Mesh compression | **Adopt via glTF-Transform** | WASM |
| KTX-Software | NOASSERTION (check file) | 2026-10 | KTX2/Basis textures | **Study**; defer until texture memory is measured | Needs a transcoder |
| glTF-Sample-Assets | none at repo level, per-asset licences | 2026-10 | Test models | **Use** selected assets after reading each asset's licence | Record in `assets/LICENSES.md` |
| glTF-Sample-Models | none; **archived** 2023 | — | Old test models | **Reject**; use Sample-Assets | — |
| three-mesh-bvh | MIT | 2026-10 | Fast raycast on dense meshes | **Adopt** for picking when real scans are in | ~+30 kB |
| Tweakpane | MIT | 2026-03 | Dev parameter panels | **Adopt for a dev-only diagnostics panel**, not product UI | dev only |
| Playwright / Vitest | Apache-2.0 / MIT | current | Tests | In use | — |

Licences for KTX-Software and the Sample Assets need a per-file read before any redistribution.
