import * as THREE from 'three';
import type { EffectInstance, EffectType, ProjectDoc, SceneNode } from '../doc/types';
import { EFFECTS } from '../effects/registry';
import { CRT_PARAMS } from '../effects/crt-params';
import { crtFragment, effectFragment, SHADERS } from './programs';
import { BLUE_NOISE_SIZE, makeBlueNoiseTexture } from './noise';
import { drawAnnotations } from './annotations';
import type { SceneWorld } from './world';

export interface FrameParams {
  /** Seconds. Always supplied by the caller so stills are reproducible. */
  time: number;
  dt: number;
  seed: number;
}

const HALF = {
  type: THREE.HalfFloatType, format: THREE.RGBAFormat,
  minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
};

/**
 * Frame structure:
 *   beauty (MSAA, linear half float)
 *   -> geometry pass (R view depth, G object id, BA view normal xy; nearest)
 *   -> one fragment program per enabled effect, masked by object id
 *   -> annotation overlay (2D canvas)
 *   -> analog CRT
 *   -> sRGB blit to the screen or an 8-bit export target
 */
export class RenderGraph {
  private rtBeauty: THREE.WebGLRenderTarget;
  private rtGeo: THREE.WebGLRenderTarget;
  private rtPing: THREE.WebGLRenderTarget[];
  private rtHistA: THREE.WebGLRenderTarget;
  private rtHistB: THREE.WebGLRenderTarget;
  private histValid = false;
  private fsq: THREE.Mesh;
  private fsScene = new THREE.Scene();
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private passes = new Map<string, THREE.ShaderMaterial>();
  private crtMat: THREE.ShaderMaterial;
  private blitMat: THREE.ShaderMaterial;
  private overlayMat: THREE.ShaderMaterial;
  private geoMats = new Map<number, THREE.ShaderMaterial>();
  private blue = makeBlueNoiseTexture();
  private rtCover: THREE.WebGLRenderTarget;
  private coverMats = new WeakMap<THREE.Mesh, { white: THREE.ShaderMaterial; black: THREE.ShaderMaterial }>();
  private plainWhite = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  private plainBlack = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  private annoCanvas = document.createElement('canvas');
  private annoTex = new THREE.CanvasTexture(this.annoCanvas);
  private dummy = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  private colourCache = new Map<string, THREE.Color>();
  width = 4;
  height = 4;

  constructor(private renderer: THREE.WebGLRenderer, private world: SceneWorld) {
    this.rtBeauty = new THREE.WebGLRenderTarget(4, 4, { ...HALF, samples: 4 });
    this.rtGeo = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.rtPing = [0, 1].map(() => new THREE.WebGLRenderTarget(4, 4, { ...HALF, depthBuffer: false }));
    this.rtHistA = new THREE.WebGLRenderTarget(4, 4, { ...HALF, depthBuffer: false });
    this.rtHistB = new THREE.WebGLRenderTarget(4, 4, { ...HALF, depthBuffer: false });
    this.dummy.needsUpdate = true;
    // 8-bit is enough for a coverage mask; MSAA resolve gives fractional edge values.
    this.rtCover = new THREE.WebGLRenderTarget(4, 4, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: 4 });

    this.fsq = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.fsScene.add(this.fsq);
    const vs = SHADERS.fullscreenVert;
    const base = { vertexShader: vs, depthTest: false, depthWrite: false };
    this.crtMat = new THREE.ShaderMaterial({
      ...base, fragmentShader: crtFragment(),
      uniforms: {
        tScene: { value: null }, tPrev: { value: null }, u_res: { value: new THREE.Vector2(4, 4) },
        u_time: { value: 0 }, u_seed: { value: 7 }, u_dt: { value: 0.016 }, u_hasPrev: { value: 0 },
        ...Object.fromEntries(CRT_PARAMS.map((p) => ['u_' + p.id, { value: p.def }])),
      },
    });
    this.blitMat = new THREE.ShaderMaterial({ ...base, fragmentShader: SHADERS.blit, uniforms: { t: { value: null }, tc: { value: null }, op: { value: 1 } } });
    this.overlayMat = new THREE.ShaderMaterial({ ...base, fragmentShader: SHADERS.overlay, uniforms: { tIn: { value: null }, tOv: { value: this.annoTex } } });
    this.annoCanvas.width = this.annoCanvas.height = 4;
  }

  setSize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;
    for (const rt of [this.rtBeauty, this.rtGeo, this.rtCover, ...this.rtPing, this.rtHistA, this.rtHistB]) rt.setSize(w, h);
    this.crtMat.uniforms.u_res.value.set(w, h);
    this.histValid = false;
  }

  /** Material for an effect type, built lazily. Surveillance shares ink's body with its own parameter set. */
  pass(type: EffectType): THREE.ShaderMaterial {
    let m = this.passes.get(type);
    if (m) return m;
    const uni: Record<string, THREE.IUniform> = {
      tIn: { value: null }, tGeo: { value: null }, tBlue: { value: this.blue }, tCover: { value: this.rtCover.texture }, blueN: { value: BLUE_NOISE_SIZE },
      res: { value: new THREE.Vector2(4, 4) }, k: { value: 1 }, op: { value: 1 }, mAll: { value: 1 }, seed: { value: 7 },
    };
    for (const p of EFFECTS[type].params) uni['u_' + p.id] = { value: p.kind === 'col' ? new THREE.Color() : p.def };
    m = new THREE.ShaderMaterial({ vertexShader: SHADERS.fullscreenVert, fragmentShader: effectFragment(type), uniforms: uni, depthTest: false, depthWrite: false });
    m.name = `effect-${type}`;
    this.passes.set(type, m);
    return m;
  }

  private geoMat(n: number): THREE.ShaderMaterial {
    let m = this.geoMats.get(n);
    if (!m) {
      m = new THREE.ShaderMaterial({
        vertexShader: SHADERS.geoVert, fragmentShader: SHADERS.geoFrag, side: THREE.DoubleSide,
        uniforms: { id: { value: n }, hasMap: { value: 0 }, map: { value: this.dummy } },
      });
      this.geoMats.set(n, m);
    }
    return m;
  }

  private colour(hex: string): THREE.Color {
    let c = this.colourCache.get(hex);
    if (!c) { c = new THREE.Color(hex); this.colourCache.set(hex, c); }
    return c;
  }

  /** Nodes an effect applies to. Groups expand to their descendant leaves. */
  targetNodes(doc: ProjectDoc, f: EffectInstance): SceneNode[] {
    const t = f.target;
    if (t.type === 'object') return t.ids.flatMap((id) => this.world.leavesUnder(id));
    if (t.type === 'group') return t.group ? this.world.leavesUnder(t.group) : [];
    return doc.nodes.filter((n) => n.kind !== 'group' && !n.ground);
  }

  private annotationNodes(doc: ProjectDoc, f: EffectInstance): SceneNode[] {
    return f.target.type === 'scene' ? doc.nodes.filter((o) => o.track && !o.ground && o.kind !== 'group') : this.targetNodes(doc, f);
  }

  /** Near/far bracketing the visible objects so the nearest reads light and the farthest dark. */
  depthRange(doc: ProjectDoc): [number, number] {
    const cam = this.world.camera;
    this.world.scene.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    let mn = Infinity, mx = -Infinity;
    const v = new THREE.Vector3();
    for (const o of doc.nodes) {
      if (o.kind === 'group' || o.ground || !this.world.isShown(o.id)) continue;
      const b = this.world.bounds(o.id);
      if (b.isEmpty()) continue;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(cam.matrixWorldInverse);
        mn = Math.min(mn, -v.z); mx = Math.max(mx, -v.z);
      }
    }
    if (mn > mx) return [5, 14];
    const pad = Math.max((mx - mn) * 0.12, 0.2);
    return [Math.max(mn - pad, 0.01), mx + pad];
  }

  private geometryPass(): void {
    const w = this.world;
    const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const hidden: [THREE.Object3D, boolean][] = [];
    for (const no of w.objects.values()) {
      if (no.node.ground) { hidden.push([no.root, no.root.visible]); no.root.visible = false; continue; }
      if (no.node.kind === 'group') continue;
      for (const m of no.meshes) {
        const gm = this.geoMat(no.node.n);
        const map = no.node.kind === 'image' ? (m.userData.orig as THREE.MeshStandardMaterial).map : null;
        // Alpha-tested cut-outs need their own material instance so the map uniform is per object.
        const mat = map ? this.geoMat(no.node.n + 0.5) : gm;
        if (map) { mat.uniforms.id.value = no.node.n; mat.uniforms.hasMap.value = 1; mat.uniforms.map.value = map; }
        saved.push([m, m.material]); m.material = mat;
      }
    }
    const bg = w.scene.background, env = w.scene.environment, gridVis = w.grid.visible;
    w.scene.background = null; w.scene.environment = null; w.grid.visible = false;
    const auto = this.renderer.shadowMap.autoUpdate;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setRenderTarget(this.rtGeo);
    this.renderer.clear();
    this.renderer.render(w.scene, w.camera);
    for (const [m, mat] of saved) m.material = mat;
    for (const [o, v] of hidden) o.visible = v;
    w.scene.background = bg; w.scene.environment = env; w.grid.visible = gridVis;
    this.renderer.shadowMap.autoUpdate = auto;
  }

  /**
   * Antialiased coverage of the given nodes: targeted meshes white, every other mesh black, same camera and
   * depth test as the beauty pass. MSAA resolve yields fractional edge coverage; occlusion by non-targeted
   * objects is exact; the ground (shadow catcher) and background stay black.
   */
  private coveragePass(ids: Set<string>): void {
    const w = this.world;
    const saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
    const hidden: [THREE.Object3D, boolean][] = [];
    for (const no of w.objects.values()) {
      if (no.node.ground) { hidden.push([no.root, no.root.visible]); no.root.visible = false; continue; }
      if (no.node.kind === 'group') continue;
      const white = ids.has(no.node.id);
      for (const m of no.meshes) {
        const map = no.node.kind === 'image' ? (m.userData.orig as THREE.MeshStandardMaterial).map : null;
        let mat: THREE.Material = white ? this.plainWhite : this.plainBlack;
        if (map) {
          let pair = this.coverMats.get(m);
          if (!pair) {
            // Pure 0/1 output gated only by the texture's alpha; RGB of the cut-out must not leak into coverage.
            const mk = (c: number) => new THREE.ShaderMaterial({
              vertexShader: SHADERS.geoVert, side: THREE.DoubleSide, uniforms: { map: { value: map }, c: { value: c } },
              fragmentShader: 'uniform sampler2D map; uniform float c; varying vec2 vU; void main(){ if (texture2D(map, vU).a < .5) discard; gl_FragColor = vec4(vec3(c), 1.); }',
            });
            pair = { white: mk(1), black: mk(0) };
            this.coverMats.set(m, pair);
          }
          mat = white ? pair.white : pair.black;
        }
        saved.push([m, m.material]); m.material = mat;
      }
    }
    const bg = w.scene.background, env = w.scene.environment, gridVis = w.grid.visible;
    w.scene.background = null; w.scene.environment = null; w.grid.visible = false;
    const auto = this.renderer.shadowMap.autoUpdate, shadows = this.renderer.shadowMap.enabled;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setRenderTarget(this.rtCover);
    this.renderer.clear();
    this.renderer.render(w.scene, w.camera);
    for (const [m, mat] of saved) m.material = mat;
    for (const [o, v] of hidden) o.visible = v;
    w.scene.background = bg; w.scene.environment = env; w.grid.visible = gridVis;
    this.renderer.shadowMap.autoUpdate = auto; this.renderer.shadowMap.enabled = shadows;
  }

  private runEffect(doc: ProjectDoc, f: EffectInstance, src: THREE.Texture, dst: THREE.WebGLRenderTarget, fp: FrameParams): void {
    const m = this.pass(f.type), u = m.uniforms, t = f.target;
    u.tIn.value = src; u.tGeo.value = this.rtGeo.texture;
    u.res.value.set(this.width, this.height);
    u.k.value = this.height / doc.comp.h;
    u.op.value = f.opacity;
    u.seed.value = fp.seed;
    const whole = t.type === 'scene' || t.type === 'output';
    // Silhouette fills object coverage even when it targets the whole scene; other effects treat a
    // whole-scene target as the entire frame (background included).
    const useCover = !whole || f.type === 'silhouette';
    u.mAll.value = useCover ? 0 : 1;
    if (useCover) this.coveragePass(new Set(this.targetNodes(doc, f).map((n) => n.id)));
    for (const p of EFFECTS[f.type].params) {
      const v = f.params[p.id];
      if (p.kind === 'col') (u['u_' + p.id].value as THREE.Color).copy(this.colour(String(v)));
      else u['u_' + p.id].value = +v;
    }
    if (f.type === 'depth' && +f.params.auto) {
      const [near, far] = this.depthRange(doc);
      u.u_near.value = near; u.u_far.value = far;
    }
    this.fsq.material = m;
    this.renderer.setRenderTarget(dst);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  /**
   * Render one frame of `doc` into `output` (null = the canvas). Preview and export both call this.
   * Callers must have set the drawing size with `setSize` and applied the doc to the world.
   */
  render(doc: ProjectDoc, fp: FrameParams, output: THREE.WebGLRenderTarget | null, bypass = false): void {
    const r = this.renderer;
    const w = this.world;
    w.depthUniforms.uNear.value = this.depthRange(doc)[0];
    w.depthUniforms.uFar.value = this.depthRange(doc)[1];
    const on = bypass ? [] : doc.fx.filter((f) => f.enabled);
    const isOut = (f: EffectInstance) => f.target.type === 'output';
    const stack = [...on.filter((f) => f.type !== 'crt' && !isOut(f)), ...on.filter((f) => f.type !== 'crt' && isOut(f))];
    const crt = on.find((f) => f.type === 'crt');

    r.autoClear = true;
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.rtBeauty);
    r.render(w.scene, w.camera);

    if (stack.some((f) => f.type !== 'grade')) this.geometryPass();
    let cur = this.rtBeauty.texture;
    let k = 0;
    for (const f of stack) {
      const dst = this.rtPing[k++ % 2];
      this.runEffect(doc, f, cur, dst, fp);
      cur = dst.texture;
    }

    const survs = stack.filter((f) => f.type === 'surv');
    if (survs.length) {
      if (this.annoCanvas.width !== this.width || this.annoCanvas.height !== this.height) {
        this.annoCanvas.width = this.width; this.annoCanvas.height = this.height;
        // three.js allocates immutable texture storage on first upload; a resized source needs a fresh one.
        this.annoTex.dispose();
      }
      drawAnnotations(this.annoCanvas.getContext('2d')!, w, survs, (f) => this.annotationNodes(doc, f), this.width, this.height, doc.comp.h);
      this.annoTex.needsUpdate = true;
      this.overlayMat.uniforms.tIn.value = cur;
      this.fsq.material = this.overlayMat;
      const dst = this.rtPing[k++ % 2];
      r.setRenderTarget(dst);
      r.render(this.fsScene, this.fsCam);
      cur = dst.texture;
    }

    this.blitMat.uniforms.tc.value = cur;
    this.blitMat.uniforms.op.value = crt ? crt.opacity : 1;
    if (crt) {
      const u = this.crtMat.uniforms;
      for (const p of CRT_PARAMS) u['u_' + p.id].value = +crt.params[p.id];
      u.u_time.value = fp.time; u.u_dt.value = fp.dt; u.u_seed.value = fp.seed;
      u.u_hasPrev.value = this.histValid ? 1 : 0;
      u.tScene.value = cur; u.tPrev.value = this.rtHistA.texture;
      this.fsq.material = this.crtMat;
      r.setRenderTarget(this.rtHistB);
      r.render(this.fsScene, this.fsCam);
      this.blitMat.uniforms.t.value = this.rtHistB.texture;
    } else this.blitMat.uniforms.t.value = cur;

    this.fsq.material = this.blitMat;
    r.setRenderTarget(output);
    r.render(this.fsScene, this.fsCam);
    if (crt) { [this.rtHistA, this.rtHistB] = [this.rtHistB, this.rtHistA]; this.histValid = true; } else this.histValid = false;
  }

  /** Force-compile every program and return their names. Compile errors surface through renderer.debug.onShaderError. */
  compileAll(): string[] {
    const names: string[] = [];
    for (const t of Object.keys(EFFECTS) as EffectType[]) {
      if (t === 'crt') continue;
      this.fsq.material = this.pass(t);
      this.renderer.compile(this.fsScene, this.fsCam);
      names.push(`effect-${t}`);
    }
    for (const [name, m] of [['crt', this.crtMat], ['blit', this.blitMat], ['overlay', this.overlayMat], ['geometry', this.geoMat(1)]] as const) {
      this.fsq.material = m;
      this.renderer.compile(this.fsScene, this.fsCam);
      names.push(name);
    }
    return names;
  }

  dispose(): void {
    for (const rt of [this.rtBeauty, this.rtGeo, this.rtCover, ...this.rtPing, this.rtHistA, this.rtHistB]) rt.dispose();
    for (const m of [...this.passes.values(), ...this.geoMats.values(), this.crtMat, this.blitMat, this.overlayMat]) m.dispose();
    this.blue.dispose(); this.plainWhite.dispose(); this.plainBlack.dispose(); this.annoTex.dispose(); this.dummy.dispose();
  }
}
