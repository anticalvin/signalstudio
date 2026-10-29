import * as THREE from 'three';

type Mat = THREE.MeshStandardMaterial;

const cyl = (a: number, b: number, h: number) => new THREE.CylinderGeometry(a, b, h, 16);
const sph = (r: number) => new THREE.SphereGeometry(r, 20, 14);
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function part(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
  const q = new THREE.Mesh(geo, m);
  q.position.set(x, y, z);
  q.rotation.set(rx, ry, rz);
  g.add(q);
  return q;
}

const std = (c: string, r = 0.8) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c), roughness: r });

function limb(g: THREE.Object3D, m: THREE.Material, a: number[], b: number[], r0: number, r1: number) {
  const A = new THREE.Vector3(...(a as [number, number, number]));
  const B = new THREE.Vector3(...(b as [number, number, number]));
  const d = B.clone().sub(A);
  const q = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, d.length(), 14), m);
  q.position.copy(A).add(B).multiplyScalar(0.5);
  q.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(q);
}

function blob(g: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const q = part(g, new THREE.SphereGeometry(1, 20, 14), m, x, y, z);
  q.scale.set(sx, sy, sz);
}

interface FigureOpts { shorts?: boolean; trousers?: boolean; hood?: boolean; wrap?: boolean }

function figure(m: THREE.Material, o: FigureOpts) {
  const g = new THREE.Group();
  const skin = std('#c99a7f'), dark = std('#18181a', 0.9), grey = std('#72767b', 0.95);
  blob(g, skin, 0, 1.27, 0, 0.17, 0.3, 0.1);
  blob(g, o.trousers || o.shorts ? m : skin, 0, 0.95, 0, 0.165, 0.13, 0.1);
  limb(g, skin, [0, 1.5, 0], [0, 1.64, 0], 0.05, 0.045);
  blob(g, skin, 0, 1.74, 0.01, 0.088, 0.112, 0.1);
  for (const s of [-1, 1]) {
    const sh = [s * 0.19, 1.5, 0], el = [s * 0.26, 1.22, 0.03], hd = [s * 0.28, 0.94, 0.1];
    limb(g, skin, sh, el, 0.05, 0.04);
    limb(g, skin, el, hd, 0.04, 0.032);
    blob(g, skin, hd[0], hd[1] - 0.03, hd[2], 0.035, 0.05, 0.03);
    blob(g, skin, sh[0], sh[1], sh[2], 0.055, 0.055, 0.055);
    const hip = [s * 0.09, 0.93, 0], an = [s * 0.09, 0.09, 0];
    if (o.trousers) limb(g, m, hip, an, 0.1, 0.14);
    else {
      limb(g, m, hip, [s * 0.09, 0.62, 0.01], 0.095, 0.085);
      limb(g, skin, [s * 0.09, 0.64, 0.01], an, 0.065, 0.045);
      blob(g, skin, s * 0.09, 0.5, 0.02, 0.06, 0.06, 0.06);
    }
    part(g, box(0.1, 0.07, 0.27), dark, s * 0.09, 0.04, 0.06);
  }
  if (o.hood) { blob(g, grey, 0, 1.74, -0.035, 0.125, 0.15, 0.125); blob(g, grey, 0, 1.55, -0.01, 0.23, 0.09, 0.14); }
  if (o.wrap) { blob(g, grey, 0, 1.75, 0, 0.108, 0.125, 0.108); limb(g, grey, [0, 1.7, 0.04], [0, 1.5, 0.07], 0.09, 0.06); blob(g, grey, 0, 1.52, 0.02, 0.2, 0.07, 0.12); }
  return g;
}

/** Deterministic rust texture: layered value noise, no Math.random. */
export function rustTexture(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  const hash = (x: number, y: number) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vn = (x: number, y: number, f: number) => {
    const fx = x / f, fy = y / f, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
    const s = (t: number) => t * t * (3 - 2 * t);
    const a = hash(ix, iy), b = hash(ix + 1, iy), c2 = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
    return a + (b - a) * s(tx) + (c2 - a) * s(ty) + (a - b - c2 + d) * s(tx) * s(ty);
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = 0.5 * vn(x, y, 48) + 0.3 * vn(x, y, 16) + 0.2 * vn(x, y, 5);
    const k = Math.min(Math.max((n - 0.35) * 2.2, 0), 1);
    const i = (y * size + x) * 4;
    img.data[i] = 120 + 85 * k;
    img.data[i + 1] = 52 + 40 * k;
    img.data[i + 2] = 28 + 18 * k;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export interface ProceduralDef {
  name: string;
  build: (m: Mat) => THREE.Object3D;
}

export const PROCEDURAL: Record<string, ProceduralDef> = {
  figA: { name: 'Figure · hood', build: (m) => figure(m, { shorts: true, hood: true }) },
  figB: { name: 'Figure · wrap', build: (m) => figure(m, { trousers: true, wrap: true }) },
  mannequin: {
    name: 'Mannequin',
    build: (m) => {
      const g = new THREE.Group();
      part(g, sph(0.11), m, 0, 1.66, 0); part(g, cyl(0.04, 0.045, 0.1), m, 0, 1.55, 0);
      part(g, cyl(0.17, 0.13, 0.58), m, 0, 1.22, 0); part(g, sph(0.14), m, 0, 0.9, 0);
      for (const s of [-1, 1]) {
        part(g, cyl(0.04, 0.035, 0.6), m, s * 0.25, 1.22, 0, 0, 0, s * 0.08); part(g, sph(0.04), m, s * 0.29, 0.9, 0);
        part(g, cyl(0.075, 0.055, 0.85), m, s * 0.1, 0.45, 0); part(g, box(0.09, 0.06, 0.22), m, s * 0.1, 0.03, 0.05);
      }
      return g;
    },
  },
  chair: {
    name: 'Monobloc chair',
    build: (m) => {
      const g = new THREE.Group();
      part(g, box(0.5, 0.05, 0.48), m, 0, 0.45, 0);
      const bk = new THREE.Group();
      bk.position.set(0, 0.62, -0.23); bk.rotation.x = -0.14; g.add(bk);
      part(bk, box(0.5, 0.05, 0.04), m, 0, 0.3, 0); part(bk, box(0.5, 0.04, 0.04), m, 0, -0.02, 0);
      for (let i = -3; i <= 3; i++) part(bk, box(0.03, 0.32, 0.025), m, i * 0.07, 0.14, 0);
      for (const s of [-1, 1]) { part(g, box(0.04, 0.04, 0.42), m, s * 0.27, 0.64, -0.02); part(g, box(0.04, 0.2, 0.04), m, s * 0.27, 0.54, 0.17); }
      for (const x of [-0.2, 0.2]) for (const z of [-0.19, 0.19]) {
        const l = part(g, new THREE.CylinderGeometry(0.022, 0.032, 0.43, 10), m, x * 1.1, 0.22, z * 1.1);
        l.rotation.z = -x * 0.4; l.rotation.x = z * 0.35;
      }
      return g;
    },
  },
  sign: {
    name: 'Priority sign',
    build: (m) => {
      const g = new THREE.Group();
      part(g, new THREE.CylinderGeometry(0.028, 0.028, 2.2, 10), std('#5a3b2c', 0.9), 0, 1.1, 0);
      const rust = new THREE.MeshStandardMaterial({ map: rustTexture(), color: m.color, roughness: 0.85, metalness: 0.15 });
      part(g, box(0.64, 0.64, 0.035), rust, 0, 2.05, 0, 0, 0, Math.PI / 4);
      part(g, box(0.46, 0.46, 0.04), std('#b8862a', 0.7), 0, 2.05, 0.004, 0, 0, Math.PI / 4);
      return g;
    },
  },
  wall: { name: 'Wall', build: (m) => { const g = new THREE.Group(); part(g, box(4, 2.6, 0.15), m, 0, 1.3, 0); return g; } },
  column: {
    name: 'Column',
    build: (m) => {
      const g = new THREE.Group();
      part(g, cyl(0.25, 0.25, 3), m, 0, 1.5, 0); part(g, box(0.7, 0.15, 0.7), m, 0, 0.075, 0); part(g, box(0.7, 0.15, 0.7), m, 0, 2.925, 0);
      return g;
    },
  },
  steps: {
    name: 'Steps',
    build: (m) => {
      const g = new THREE.Group();
      part(g, box(2, 0.15, 1.2), m, 0, 0.075, 0); part(g, box(2, 0.15, 0.8), m, 0, 0.225, -0.2); part(g, box(2, 0.15, 0.4), m, 0, 0.375, -0.4);
      return g;
    },
  },
};

export const PRIMITIVES: Record<string, () => THREE.BufferGeometry> = {
  cube: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.7, 48, 32),
  plane: () => new THREE.PlaneGeometry(1, 1),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1.2, 40),
  torus: () => new THREE.TorusGeometry(0.6, 0.2, 24, 72),
  cone: () => new THREE.ConeGeometry(0.6, 1.2, 40),
  knot: () => new THREE.TorusKnotGeometry(0.5, 0.16, 160, 18),
};
