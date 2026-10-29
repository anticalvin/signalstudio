import * as THREE from 'three';
import { BLUE_NOISE_B64, BLUE_NOISE_SIZE } from './blue-noise-data';

export { BLUE_NOISE_SIZE };

/** Decode the shipped void-and-cluster blue noise into 8-bit values (row-major, size x size). */
export function blueNoiseBytes(): Uint8Array {
  const bin = atob(BLUE_NOISE_B64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Tileable blue-noise threshold texture. Sampled in screen space with nearest filtering so it cannot shimmer. */
export function makeBlueNoiseTexture(): THREE.DataTexture {
  const v = blueNoiseBytes();
  const data = new Uint8Array(v.length * 4);
  for (let i = 0; i < v.length; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v[i]; data[i * 4 + 3] = 255; }
  const t = new THREE.DataTexture(data, BLUE_NOISE_SIZE, BLUE_NOISE_SIZE, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
