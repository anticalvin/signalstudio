# Prioritised backlog

1. **Signal Ink 2.0** (staged pipeline; contours split into external / depth / normal / luminance; halftone; print character; presets). Depends on 2 and 3 for shadows.
2. **Shadow-aware style path**: render the ground's shadow factor as its own buffer so it can be kept, hidden or inked per effect.
3. **Real assets**: import licensed sample models, build the two-figure demo composition, run the importer on them, add glTF-Transform optimisation and three-mesh-bvh picking.
4. **Coverage-pass caching** and a pass-count/time profile (measure before optimising).
5. **Surveillance as composition** (ink preset + annotation layer with offsets, brackets, occlusion rules).
6. **Per-object effect stack UI**: reorder, duplicate, reset, presets; separate render mode / object effects / shadow / annotation / output.
7. **Debug pass viewer** (beauty, depth, normals, IDs, coverage, shadow, ink masses, contours, dither).
8. **Analog split** (signal vs display model), then tiled export and parity tests.
9. **Combined gizmo**, text and shape layers, mobile pass.
