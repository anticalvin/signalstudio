import * as THREE from 'three';
import { migrate } from './doc/migrate';
import type { StudioApp } from './app';
import type { EditorStore } from './editor/store';
import { DIAG, frameDoc, diagnosticDoc, type FrameName } from './diagnostics/scene';

declare global { interface Window { awaken: ReturnType<typeof buildApi> } }

function buildApi(app: StudioApp, store: EditorStore, shell: { refresh(): void }) {
  const fp = { time: DIAG.time, dt: DIAG.dt, seed: DIAG.seed };
  const b64 = async (c: HTMLCanvasElement) => {
    const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return {
    ready: true as const,
    DIAG,
    /** Load one of the reference-frame documents (or the chart variant) into the editor. */
    loadFrame(name: FrameName | 'charts') {
      store.load(name === 'charts' ? { ...diagnosticDoc({ charts: true }) } : frameDoc(name));
      store.select(null);
      shell.refresh();
    },
    /** Render the current doc through the export path at a fixed size; returns PNG base64. */
    async renderPng(width: number = DIAG.width, height: number = DIAG.height) {
      return b64(app.renderToCanvas(width, height, fp));
    },
    /** Render with editor overlays onto the visible canvas and return it as PNG base64. */
    async renderOverlayPng() {
      app.renderNow(fp, true);
      return b64(app.canvas);
    },
    /** Load an arbitrary project document (after migration). */
    loadDoc(raw: unknown) { store.load(migrate(raw)); store.select(null); shell.refresh(); },
    /** Render a deliberately invalid program so the error-reporting path can be tested. */
    injectBrokenShader() {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        vertexShader: 'void main(){ gl_Position = vec4(position,1.); }',
        fragmentShader: 'void main(){ gl_FragColor = vec4(this_is_not_defined); }',
      }));
      const sc = new THREE.Scene(); sc.add(mesh);
      app.renderer.setRenderTarget(null);
      app.renderer.render(sc, new THREE.OrthographicCamera());
    },
    /** Pixel position (canvas drawing-buffer space) of a node's projected bounds centre and its 8 box corners. */
    screenInfo(id: string) {
      const box = app.world.bounds(id);
      const cam = app.world.camera;
      cam.updateMatrixWorld(true);
      const W = app.canvas.width, H = app.canvas.height;
      const proj = (v: THREE.Vector3) => { const p = v.clone().project(cam); return { x: ((p.x + 1) / 2) * W, y: ((1 - p.y) / 2) * H }; };
      const corners = [];
      for (let i = 0; i < 8; i++) corners.push(proj(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)));
      const rect = app.canvas.getBoundingClientRect();
      const c = proj(box.getCenter(new THREE.Vector3()));
      return { corners, center: c, client: { x: rect.left + (c.x / W) * rect.width, y: rect.top + (c.y / H) * rect.height } };
    },
    /** A deliberately awkward scan-like GLB: centimetres, off-centre, floating, single-sided, no normals. */
    async makeMessyGlb(): Promise<number[]> {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const geo = new THREE.BoxGeometry(40, 170, 30);
      geo.deleteAttribute('normal');
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xb08060, side: THREE.FrontSide, transparent: true, opacity: 1 }));
      mesh.position.set(500, 300, -200);
      const root = new THREE.Group(); root.add(mesh);
      const buf = await new Promise<ArrayBuffer>((res, rej) => new GLTFExporter().parse(root, (r) => res(r as ArrayBuffer), rej, { binary: true }));
      return Array.from(new Uint8Array(buf));
    },
    select(id: string | null) { store.select(id); app.requestRender(); },
    /** Raw RGBA pixels of the export path as a flat array, for statistics inside the page. */
    pixels(width: number = DIAG.width, height: number = DIAG.height) {
      const c = app.renderToCanvas(width, height, fp);
      return c.getContext('2d')!.getImageData(0, 0, width, height).data;
    },
    compileAll() { const programs = app.compileAll(); return { programs, errors: app.shaderErrors.map((e) => e.log) }; },
    programSources: () => app.programSources(),
    shaderErrors: () => app.shaderErrors.map((e) => e.log),
    store, app,
  };
}

export function installTestApi(app: StudioApp, store: EditorStore, shell: { refresh(): void }): void {
  window.awaken = buildApi(app, store, shell);
}
