import * as THREE from 'three';
import type { CameraSettings, ProjectDoc, RenderMode, SceneNode } from '../doc/types';
import { PROCEDURAL, PRIMITIVES } from '../assets/procedural';
import { CHARTS, type ChartKey } from '../diagnostics/charts';
import type { AssetManager } from '../assets/manager';

export interface NodeObject {
  node: SceneNode;
  root: THREE.Group;
  content: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  buildKey: string;
  modeKey: string;
  modeMats: THREE.Material[];
}

const D2R = Math.PI / 180;

/** Stable colour for the "object ID" render mode. */
export function idColour(n: number): THREE.Color {
  const h = ((n * 0.61803398875) % 1 + 1) % 1;
  return new THREE.Color().setHSL(h, 0.75, 0.5);
}

/** Owns the three.js scene graph and keeps it in step with the project document. */
export class SceneWorld {
  readonly scene = new THREE.Scene();
  readonly camP = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  readonly camO = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = this.camP;
  readonly target = new THREE.Vector3(0.5, 0.9, 0);
  readonly objects = new Map<string, NodeObject>();
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xbbbbbb, 0.7);
  readonly key = new THREE.DirectionalLight(0xffffff, 1.1);
  readonly grid = new THREE.GridHelper(14, 14, 0xb8b8b8, 0xdadada);
  readonly depthUniforms = { uNear: { value: 1 }, uFar: { value: 20 } };
  private doc: ProjectDoc | null = null;
  private orthoH = 4;
  private ownedTextures: THREE.Texture[] = [];

  constructor(private renderer: THREE.WebGLRenderer, private assets?: AssetManager) {
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.5, far: 40 });
    this.key.shadow.bias = -0.0001;
    this.key.shadow.blurSamples = 20;
    this.grid.position.y = 0.002;
    this.scene.add(this.hemi, this.key, this.key.target, this.grid);
    this.scene.environment = this.makeEnvironment();
  }

  private makeEnvironment(): THREE.Texture {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: 0x777777, side: THREE.BackSide })));
    const pan = (x: number, y: number, z: number, sz: number, c: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz), new THREE.MeshBasicMaterial({ color: new THREE.Color(c, c, c), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m);
    };
    pan(0, 9, 0, 8, 3); pan(-9, 3, 5, 6, 2.5); pan(9, 2, -3, 5, 1.5);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const t = pm.fromScene(es, 0.04).texture;
    pm.dispose();
    return t;
  }

  /** Force every node to rebuild on the next apply (an asset finished loading). */
  invalidate(): void { for (const no of this.objects.values()) no.buildKey = ''; if (this.doc) this.apply(this.doc); }

  // ---- document sync -------------------------------------------------------------------------

  apply(doc: ProjectDoc): void {
    this.doc = doc;
    const live = new Set(doc.nodes.map((n) => n.id));
    for (const [id, no] of this.objects) if (!live.has(id)) this.remove(id, no);

    for (const node of doc.nodes) {
      let no = this.objects.get(node.id);
      if (!no) {
        no = { node, root: new THREE.Group(), content: null, meshes: [], buildKey: '', modeKey: '', modeMats: [] };
        no.root.userData.nodeId = node.id;
        this.objects.set(node.id, no);
        this.scene.add(no.root);
      }
      no.node = node;
      const key = [node.kind, node.asset, node.ground, JSON.stringify(node.mat)].join('|');
      if (key !== no.buildKey) { this.rebuild(no); no.buildKey = key; no.modeKey = ''; }
      const mk = node.mode + '|' + node.sil + '|' + node.mat.color;
      if (mk !== no.modeKey) { this.applyMode(no); no.modeKey = mk; }
    }
    // Parenting after all objects exist; order of `doc.nodes` is sibling order.
    for (const node of doc.nodes) {
      const no = this.objects.get(node.id)!;
      const parent = node.parent ? this.objects.get(node.parent)?.root : this.scene;
      if (no.root.parent !== parent && parent) parent.add(no.root);
      no.root.position.fromArray(node.pos);
      no.root.rotation.set(node.rot[0] * D2R, node.rot[1] * D2R, node.rot[2] * D2R);
      no.root.scale.fromArray(node.scl);
      no.root.visible = node.vis;
    }
    this.applySceneSettings(doc);
    this.applyCamera(doc.cam, doc.comp.w / doc.comp.h, doc.scene.ortho);
  }

  private applySceneSettings(doc: ProjectDoc): void {
    const s = doc.scene;
    this.scene.background = new THREE.Color(s.bg);
    this.scene.environment = s.env ? this.scene.environment : null;
    this.hemi.intensity = s.amb;
    this.key.intensity = s.key;
    this.key.color.set(s.keyCol);
    this.key.position.set(s.kx, s.ky, s.kz);
    this.key.castShadow = s.shadows;
    this.key.shadow.radius = s.shadowSoftness;
    this.grid.visible = s.grid;
    for (const no of this.objects.values()) {
      if (no.node.ground) for (const m of no.meshes) (m.material as THREE.ShadowMaterial).opacity = s.shadowOpacity;
    }
  }

  private rebuild(no: NodeObject): void {
    if (no.content) { no.root.remove(no.content); disposeTree(no.content); }
    no.content = null; no.meshes = [];
    const { node } = no;
    if (node.kind === 'group') return;
    const std = new THREE.MeshStandardMaterial({
      color: new THREE.Color(node.mat.color), roughness: node.mat.rough, metalness: node.mat.metal,
      emissive: new THREE.Color(node.mat.emis), emissiveIntensity: node.mat.emisI,
      transparent: node.mat.op < 1, opacity: node.mat.op,
    });
    let content: THREE.Object3D | null = null;
    if (node.ground) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ color: 0x000000, opacity: this.doc?.scene.shadowOpacity ?? 0.3 }));
      m.receiveShadow = true;
      content = m;
    } else if (node.kind === 'procedural' && node.asset && PROCEDURAL[node.asset]) {
      content = PROCEDURAL[node.asset].build(std);
    } else if (node.kind === 'glb' && node.asset) {
      const t = this.assets?.template(node.asset);
      if (!t) { this.assets?.request(node.asset, 'glb'); return; }
      content = t.clone(true);
      content.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => x.clone()) : m.material.clone(); });
    } else if (node.kind === 'image' && node.asset) {
      const im = this.assets?.image(node.asset);
      if (!im) { this.assets?.request(node.asset, 'image'); return; }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(im.aspect * 1.8, 1.8),
        new THREE.MeshStandardMaterial({ map: im.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }));
      m.position.y = 0.9;
      const g = new THREE.Group(); g.add(m); content = g;
    } else if (node.kind === 'primitive' && node.asset && node.asset in CHARTS) {
      const tex = CHARTS[node.asset as ChartKey]();
      this.ownedTextures.push(tex);
      content = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    } else if (node.kind === 'primitive' && node.asset && PRIMITIVES[node.asset]) {
      content = new THREE.Mesh(PRIMITIVES[node.asset](), std);
    } else {
      console.warn(`[world] no builder for node "${node.name}" (${node.kind}/${node.asset ?? '-'})`);
      return;
    }
    content.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        const m = o as THREE.Mesh;
        m.castShadow = !node.ground;
        m.receiveShadow = !!node.ground;
        m.userData.orig = m.material;
        if (node.kind === 'glb' || node.kind === 'image') { m.userData.shared = true; const mt = Array.isArray(m.material) ? m.material : [m.material]; for (const x of mt) for (const v of Object.values(x)) if (v && (v as THREE.Texture).isTexture) (v as any).userData.keep = true; }
        no.meshes.push(m);
      }
    });
    no.content = content;
    no.root.add(content);
  }

  private applyMode(no: NodeObject): void {
    for (const m of no.modeMats) m.dispose();
    no.modeMats = [];
    if (no.node.ground) return;
    const mode: RenderMode = no.node.mode;
    for (const m of no.meshes) {
      const orig = m.userData.orig as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      const map = (orig as THREE.MeshStandardMaterial).map ?? null;
      const color = (orig as THREE.MeshStandardMaterial).color ?? new THREE.Color(no.node.mat.color);
      let mat: THREE.Material;
      switch (mode) {
        case 'pbr': m.material = orig; continue;
        case 'unlit': mat = new THREE.MeshBasicMaterial({ color, map }); break;
        case 'flat': mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(no.node.mat.color) }); break;
        case 'clay': mat = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.9 }); break;
        case 'toon': mat = new THREE.MeshToonMaterial({ color, map }); break;
        case 'silhouette': mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(no.node.sil) }); break;
        case 'normal': mat = new THREE.MeshNormalMaterial(); break;
        case 'wireframe': mat = new THREE.MeshBasicMaterial({ color, wireframe: true }); break;
        case 'id': mat = new THREE.MeshBasicMaterial({ color: idColour(no.node.n) }); break;
        case 'depth': mat = this.depthMaterial(); break;
      }
      m.material = mat;
      no.modeMats.push(mat);
    }
  }

  private depthMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: this.depthUniforms,
      vertexShader: 'varying float vD; void main(){ vec4 v = modelViewMatrix*vec4(position,1.); vD=-v.z; gl_Position=projectionMatrix*v; }',
      fragmentShader: 'uniform float uNear,uFar; varying float vD; void main(){ float t = 1.-clamp((vD-uNear)/max(uFar-uNear,.001),0.,1.); gl_FragColor = vec4(vec3(t*t*(3.-2.*t)),1.); }',
    });
  }

  private remove(id: string, no: NodeObject): void {
    if (no.content) disposeTree(no.content);
    for (const m of no.modeMats) m.dispose();
    no.root.removeFromParent();
    this.objects.delete(id);
  }

  // ---- camera --------------------------------------------------------------------------------

  applyCamera(c: CameraSettings, aspect: number, ortho: boolean): void {
    this.target.fromArray(c.t);
    this.camP.fov = c.fov;
    this.camP.aspect = aspect;
    this.camP.position.fromArray(c.p);
    this.camP.zoom = c.z;
    this.camP.lookAt(this.target);
    this.camP.updateProjectionMatrix();
    if (ortho) {
      const d = this.camP.position.distanceTo(this.target);
      this.orthoH = Math.max(d * Math.tan((c.fov / 2) * D2R), 0.5);
      this.camO.position.copy(this.camP.position);
      this.camO.quaternion.copy(this.camP.quaternion);
      this.camO.left = -this.orthoH * aspect; this.camO.right = this.orthoH * aspect;
      this.camO.top = this.orthoH; this.camO.bottom = -this.orthoH;
      this.camO.zoom = c.z;
      this.camO.updateProjectionMatrix();
      this.camera = this.camO;
    } else this.camera = this.camP;
    this.camera.updateMatrixWorld(true);
  }

  // ---- queries -------------------------------------------------------------------------------

  /** Leaf nodes (renderable objects) at or beneath `id`. */
  leavesUnder(id: string): SceneNode[] {
    if (!this.doc) return [];
    const out: SceneNode[] = [];
    const walk = (nid: string) => {
      const n = this.doc!.nodes.find((x) => x.id === nid);
      if (!n) return;
      if (n.kind === 'group') this.doc!.nodes.filter((c) => c.parent === nid).forEach((c) => walk(c.id));
      else if (!n.ground) out.push(n);
    };
    walk(id);
    return out;
  }

  /** True when the node and every ancestor is visible. */
  isShown(id: string): boolean {
    let cur = this.doc?.nodes.find((n) => n.id === id);
    while (cur) {
      if (!cur.vis) return false;
      cur = cur.parent ? this.doc!.nodes.find((n) => n.id === cur!.parent) : undefined;
    }
    return true;
  }

  bounds(id: string): THREE.Box3 {
    const no = this.objects.get(id);
    this.scene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    if (!no) return box;
    box.setFromObject(no.root);
    return box;
  }

  dispose(): void {
    for (const [id, no] of [...this.objects]) this.remove(id, no);
    this.ownedTextures.forEach((t) => t.dispose());
  }
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh) return;
    if (!m.userData.shared) m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mt of mats) {
      if (!m.userData.shared) for (const v of Object.values(mt)) if (v && (v as THREE.Texture).isTexture && !(v as any).userData?.keep) (v as THREE.Texture).dispose();
      mt.dispose();
    }
    const orig = m.userData.orig as THREE.Material | undefined;
    if (orig && orig !== m.material) orig.dispose();
  });
}
