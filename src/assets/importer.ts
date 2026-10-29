import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export interface ImportReport {
  scaleFactor: number;
  size: [number, number, number];
  meshes: number;
  fixes: string[];
}

/** Unit factors tried in order when a file's size is implausible for metres. */
const UNIT_FACTORS = [1, 0.01, 0.001, 100];

/**
 * Normalise a parsed glTF scene to metres, grounded (min y = 0) and centred on x/z, and repair
 * the material problems common in scans. The whole file stays one logical object.
 */
export function normalise(root: THREE.Object3D): { object: THREE.Group; report: ImportReport } {
  const fixes: string[] = [];
  let meshes = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    if (!m.geometry.attributes.normal) { m.geometry.computeVertexNormals(); fixes.push(`${m.name || 'mesh'}: computed normals`); }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats as THREE.MeshStandardMaterial[]) {
      if (mat.side !== THREE.DoubleSide) { mat.side = THREE.DoubleSide; fixes.push('double-sided'); }
      // Scans often ship BLEND on fully opaque textures, which sorts badly and drops shadows.
      if (mat.transparent && mat.opacity >= 1 && !mat.alphaMap) { mat.transparent = false; mat.depthWrite = true; fixes.push('opaque material marked transparent'); }
      if (mat.map) mat.map.anisotropy = 8;
      mat.needsUpdate = true;
    }
    m.castShadow = true;
  });

  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  if (!isFinite(max) || max <= 0) throw new Error('Model has no visible geometry');
  let factor = UNIT_FACTORS.find((f) => max * f >= 0.05 && max * f <= 10);
  if (factor === undefined) factor = 1.8 / max;
  if (factor !== 1) fixes.push(`scaled ×${+factor.toPrecision(4)} to metres`);

  const inner = new THREE.Group();
  inner.add(root);
  inner.scale.setScalar(factor);
  const wrap = new THREE.Group();
  wrap.add(inner);
  wrap.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(wrap);
  const c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y, -c.z);
  wrap.updateMatrixWorld(true);
  const fin = new THREE.Box3().setFromObject(wrap).getSize(new THREE.Vector3());
  return { object: wrap, report: { scaleFactor: factor, size: fin.toArray() as [number, number, number], meshes, fixes: [...new Set(fixes)] } };
}

export async function parseGlb(buf: ArrayBuffer) {
  const gltf = await new GLTFLoader().parseAsync(buf.slice(0), '');
  return normalise(gltf.scene);
}
