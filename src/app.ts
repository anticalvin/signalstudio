import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { ProjectDoc } from './doc/types';
import { SceneWorld } from './render/world';
import { RenderGraph, type FrameParams } from './render/graph';
import { EditorStore } from './editor/store';
import { canvasToBlob, maxSingleShot, targetToCanvas } from './export/export';
import { allProgramSources } from './render/programs';
import { AssetManager } from './assets/manager';

export interface ShaderError { program: string; log: string }

const QUALITY_PR = [0.75, 1.5, 2];

function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff'; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
  return new THREE.CanvasTexture(c);
}

/** Wires the store, world, render graph, camera/gizmo controls and the on-canvas selection overlay. */
export class StudioApp {
  readonly renderer: THREE.WebGLRenderer;
  readonly world: SceneWorld;
  readonly graph: RenderGraph;
  readonly assets = new AssetManager();
  readonly shaderErrors: ShaderError[] = [];
  readonly overlay = new THREE.Scene();
  readonly orbit: OrbitControls;
  readonly gizmo: TransformControls;
  clean = false;
  bypass = false;
  private box = new THREE.Box3();
  private boxPos = new Float32Array(24);
  private boxAttr = new THREE.BufferAttribute(this.boxPos, 3);
  private boxGroup = new THREE.Group();
  private raf = 0;
  private dirty = true;
  private appliedDoc: ProjectDoc | null = null;
  private lastDocJson = '';
  private frameTime = 0;
  private lastTick = performance.now();
  private onError: Array<(e: ShaderError) => void> = [];
  private disposed = false;
  private userCamera = false;

  constructor(readonly canvas: HTMLCanvasElement, private viewport: HTMLElement, readonly store: EditorStore) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    // Shader compile failures are recorded and surfaced in the UI; they are never swallowed.
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const log = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)].filter(Boolean).join('\n');
      const err = { program: 'unknown', log };
      this.shaderErrors.push(err);
      console.error('[shader]', log);
      this.onError.forEach((fn) => fn(err));
    };
    this.world = new SceneWorld(this.renderer, this.assets);
    this.assets.onReady = () => { this.lastDocJson = ''; this.world.invalidate(); this.requestRender(); };
    void this.assets.refreshList();
    this.graph = new RenderGraph(this.renderer, this.world);

    this.orbit = new OrbitControls(this.world.camP, canvas);
    this.orbit.enableDamping = false;
    // Camera state is only written back to the document during a user gesture. Programmatic
    // updates (document load, undo) must never be overwritten by the controls' own state.
    this.orbit.addEventListener('start', () => { this.userCamera = true; });
    this.orbit.addEventListener('change', () => { if (this.userCamera) this.syncCameraToDoc(); });
    this.orbit.addEventListener('end', () => { this.userCamera = false; store.commit(); });

    this.gizmo = new TransformControls(this.world.camP, canvas);
    this.gizmo.setSize(0.9);
    this.overlay.add(this.gizmo.getHelper());
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (!e.value) store.commit();
    });
    this.gizmo.addEventListener('objectChange', () => this.syncGizmoToDoc());

    this.buildSelectionBox();
    this.installPicking();
    store.subscribe(() => this.requestRender());
    new ResizeObserver(() => this.resize()).observe(viewport);
    this.resize();
    this.loop();
  }

  onShaderError(fn: (e: ShaderError) => void): void { this.onError.push(fn); }

  // ---- selection overlay ---------------------------------------------------------------------

  private buildSelectionBox(): void {
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x111111, depthTest: false }));
    lines.geometry.setAttribute('position', this.boxAttr);
    lines.geometry.setIndex([0, 1, 1, 3, 3, 2, 2, 0, 4, 5, 5, 7, 7, 6, 6, 4, 0, 4, 1, 5, 2, 6, 3, 7]);
    const pts = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({
      color: 0x111111, size: 8, sizeAttenuation: false, depthTest: false, map: dotTexture(), alphaTest: 0.5, transparent: true,
    }));
    pts.geometry.setAttribute('position', this.boxAttr);
    lines.frustumCulled = pts.frustumCulled = false;
    this.boxGroup.add(lines, pts);
    this.boxGroup.visible = false;
    this.overlay.add(this.boxGroup);
  }

  private updateSelectionOverlay(): void {
    const sel = this.store.selected;
    const no = sel && this.world.objects.get(sel.id);
    if (!sel || !no || !sel.vis || this.clean || sel.ground) {
      this.boxGroup.visible = false;
      this.gizmo.detach();
      return;
    }
    this.box.setFromObject(no.root);
    for (let i = 0; i < 8; i++) {
      this.boxPos[i * 3] = i & 1 ? this.box.max.x : this.box.min.x;
      this.boxPos[i * 3 + 1] = i & 2 ? this.box.max.y : this.box.min.y;
      this.boxPos[i * 3 + 2] = i & 4 ? this.box.max.z : this.box.min.z;
    }
    this.boxAttr.needsUpdate = true;
    this.boxGroup.visible = !this.box.isEmpty();
    this.gizmo.camera = this.world.camera;
    if (sel.lock) this.gizmo.detach();
    else if (this.gizmo.object !== no.root) this.gizmo.attach(no.root);
  }

  private syncGizmoToDoc(): void {
    const sel = this.store.selected;
    const no = sel && this.world.objects.get(sel.id);
    if (!sel || !no) return;
    const R2D = 180 / Math.PI;
    sel.pos = no.root.position.toArray() as [number, number, number];
    sel.rot = [no.root.rotation.x * R2D, no.root.rotation.y * R2D, no.root.rotation.z * R2D];
    sel.scl = no.root.scale.toArray() as [number, number, number];
    this.store.touch();
  }

  private syncCameraToDoc(): void {
    const c = this.store.doc.cam;
    c.p = this.world.camP.position.toArray() as [number, number, number];
    c.t = this.orbit.target.toArray() as [number, number, number];
    c.z = this.world.camP.zoom;
    this.requestRender();
  }

  private installPicking(): void {
    let down: { x: number; y: number } | null = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || this.gizmo.dragging) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4) return;
      this.store.select(this.pick(e.clientX, e.clientY));
    });
  }

  /** Raycast against renderable meshes; returns the owning leaf node id. */
  pick(clientX: number, clientY: number): string | null {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.world.camera);
    const meshes: THREE.Mesh[] = [];
    for (const no of this.world.objects.values()) if (!no.node.ground && no.root.visible && this.world.isShown(no.node.id)) meshes.push(...no.meshes);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) if (o.userData.nodeId) return o.userData.nodeId as string;
    return null;
  }

  // ---- sizing --------------------------------------------------------------------------------

  /** Largest box of the composition's aspect that fits the viewport. */
  fit(): [number, number] {
    const { comp } = this.store.doc;
    const sw = Math.max(this.viewport.clientWidth - 12, 2), sh = Math.max(this.viewport.clientHeight - 12, 2);
    const a = comp.w / comp.h;
    let w = sw, h = w / a;
    if (h > sh) { h = sh; w = h * a; }
    return [Math.max(Math.floor(w), 2), Math.max(Math.floor(h), 2)];
  }

  resize(): void {
    const [w, h] = this.fit();
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.min(dpr, QUALITY_PR[this.store.doc.scene.q] ?? 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const b = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.graph.setSize(b.x, b.y);
    this.appliedDoc = null;
    this.requestRender();
  }

  // ---- frame loop ----------------------------------------------------------------------------

  requestRender(): void { this.dirty = true; }

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastTick) / 1000, 0.1);
    this.lastTick = now;
    const animated = this.store.doc.fx.some((f) => f.enabled && f.type === 'crt');
    if (!this.dirty && !animated) return;
    this.dirty = false;
    this.frameTime += dt;
    this.drawPreview({ time: this.frameTime, dt, seed: 7 });
  };

  private syncWorld(): void {
    const json = JSON.stringify(this.store.doc);
    if (json !== this.lastDocJson || this.appliedDoc !== this.store.doc) {
      this.world.apply(this.store.doc);
      if (!this.userCamera) { this.orbit.target.fromArray(this.store.doc.cam.t); this.orbit.update(); }
      this.lastDocJson = json;
      this.appliedDoc = this.store.doc;
    }
  }

  drawPreview(fp: FrameParams): void {
    this.syncWorld();
    this.graph.render(this.store.doc, fp, null, this.bypass);
    if (!this.clean) {
      this.updateSelectionOverlay();
      this.renderer.autoClear = false;
      this.renderer.clearDepth();
      this.renderer.render(this.overlay, this.world.camera);
      this.renderer.autoClear = true;
    } else {
      this.gizmo.detach();
    }
  }

  /** Synchronous, deterministic render used by tests. Includes editor overlays only when `overlays` is set. */
  renderNow(fp: FrameParams, overlays = false): void {
    const prevClean = this.clean;
    this.clean = !overlays;
    this.drawPreview(fp);
    this.clean = prevClean;
  }

  // ---- import --------------------------------------------------------------------------------

  /** Render a small preview of a normalised object on neutral grey. */
  thumbnail(obj: THREE.Object3D, size = 96): string {
    const sc = new THREE.Scene();
    sc.background = new THREE.Color(0x2a2a2a);
    sc.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    const dl = new THREE.DirectionalLight(0xffffff, 2); dl.position.set(2, 3, 4); sc.add(dl);
    const c = obj.clone(true); sc.add(c);
    const b = new THREE.Box3().setFromObject(c), ctr = b.getCenter(new THREE.Vector3()), r = Math.max(...b.getSize(new THREE.Vector3()).toArray(), 0.1);
    const cam = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    cam.position.set(ctr.x + r * 0.9, ctr.y + r * 0.3, ctr.z + r * 2.4); cam.lookAt(ctr);
    const rt = new THREE.WebGLRenderTarget(size, size);
    this.renderer.setRenderTarget(rt); this.renderer.render(sc, cam);
    const canvas = targetToCanvas(this.renderer, rt);
    this.renderer.setRenderTarget(null); rt.dispose();
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  /** Import a .glb/.gltf or image, add it to the scene as one object. Throws with a user-readable message. */
  async importFile(file: File) {
    const res = await this.assets.importFile(file, (o) => this.thumbnail(o));
    const node = this.store.addNode({ name: res.name, kind: res.type, asset: res.id, mat: { color: '#ffffff' }, ...(res.type === 'image' ? { faceCam: false } : {}) });
    return { node, report: res.report };
  }

  // ---- export --------------------------------------------------------------------------------

  /**
   * Render the document through the same graph at an arbitrary size and encode a PNG.
   * No editor overlays. Time and seed are explicit, so repeated calls are identical.
   */
  async exportPng(width: number, height: number, fp: FrameParams): Promise<Blob> {
    const c = this.renderToCanvas(width, height, fp);
    return canvasToBlob(c);
  }

  renderToCanvas(width: number, height: number, fp: FrameParams, doc: ProjectDoc = this.store.doc): HTMLCanvasElement {
    const max = maxSingleShot(this.renderer);
    if (width > max || height > max) throw new Error(`Export ${width}x${height} exceeds the single-shot limit of ${max}px (tiled export arrives in M6)`);
    const prevW = this.graph.width, prevH = this.graph.height;
    const rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
    try {
      this.graph.setSize(width, height);
      this.world.apply(doc);
      this.appliedDoc = null;
      this.graph.render(doc, fp, rt, false);
      return targetToCanvas(this.renderer, rt);
    } finally {
      rt.dispose();
      this.graph.setSize(prevW, prevH);
      this.appliedDoc = null;
      this.requestRender();
    }
  }

  /** Compile every program and return names; errors are in `shaderErrors`. */
  compileAll(): string[] { return this.graph.compileAll(); }
  programSources(): Record<string, { vertex: string; fragment: string }> { return allProgramSources(); }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.orbit.dispose(); this.gizmo.dispose();
    this.graph.dispose(); this.world.dispose(); this.renderer.dispose();
  }
}
