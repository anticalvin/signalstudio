import * as THREE from 'three';

/**
 * Approximate blue noise: high-pass filtered white noise, rank-mapped to a flat histogram.
 * This is NOT void-and-cluster. M3 replaces it with a shipped void-and-cluster asset.
 */
export function makeApproxBlueNoise(size = 64): THREE.DataTexture {
  const n = size * size;
  const a = new Float32Array(n);
  let sd = 12345;
  const rnd = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < n; i++) a[i] = rnd();
  const b = new Float32Array(n);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let sum = 0, ws = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const w = Math.exp(-(dx * dx + dy * dy) / 4.5);
      sum += w * a[((y + dy + size) % size) * size + ((x + dx + size) % size)];
      ws += w;
    }
    b[y * size + x] = a[y * size + x] - sum / ws;
  }
  const order = [...b.keys()].sort((i, j) => b[i] - b[j]);
  const data = new Uint8Array(n * 4);
  order.forEach((i, r) => {
    const v = Math.round((r / (n - 1)) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
