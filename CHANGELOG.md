# Changelog

## Unreleased
### Fixed
- Object masks are now antialiased coverage from an MSAA pass with the beauty pass's depth test (was a nearest-sampled ID lookup). Thin geometry no longer drops out; occlusion by other objects is exact.
- Scene-wide Silhouette keeps filling only object coverage.
- Blue-noise dither uses a shipped void-and-cluster texture (was high-pass white noise labelled as blue noise).
### Removed
- Silhouette "Edge smoothing" option (coverage is always antialiased).
### Tests
- Spectral tests for the blue noise; occlusion (chair in front / behind), thin-pole continuity and shadow-preservation tests for object masks.

## M2
GLB/GLTF import, IndexedDB store, thumbnails, alpha-tested image planes.

## M1
Scaffold, prototype port, verification loop, goldens.
