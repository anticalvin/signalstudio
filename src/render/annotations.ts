import * as THREE from 'three';
import type { EffectInstance, SceneNode } from '../doc/types';
import type { SceneWorld } from './world';

export interface ScreenBox { x0: number; y0: number; x1: number; y1: number }

const CORNERS = (b: THREE.Box3) => {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) out.push(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
  return out;
};

/** Project a node's world bounds to pixel space. Returns null when behind the camera or off screen. */
export function projectBox(world: SceneWorld, node: SceneNode, w: number, h: number): ScreenBox | null {
  const b = world.bounds(node.id);
  if (b.isEmpty()) return null;
  const cam = world.camera;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const v of CORNERS(b)) {
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera && v.clone().applyMatrix4(cam.matrixWorldInverse).z > -cam.near) return null;
    v.project(cam);
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
  }
  if (x1 < -1 || x0 > 1 || y1 < -1 || y0 > 1) return null;
  x0 = Math.max(x0, -1); x1 = Math.min(x1, 1); y0 = Math.max(y0, -1); y1 = Math.min(y1, 1);
  return { x0: ((x0 + 1) / 2) * w, x1: ((x1 + 1) / 2) * w, y0: ((1 - y1) / 2) * h, y1: ((1 - y0) / 2) * h };
}

/** Draw all enabled Surveillance annotation sets. Returns false when there is nothing to draw. */
export function drawAnnotations(
  g: CanvasRenderingContext2D, world: SceneWorld, fxs: EffectInstance[], nodes: (f: EffectInstance) => SceneNode[],
  w: number, h: number, compH: number,
): boolean {
  if (!fxs.length) return false;
  const k = h / compH;
  g.clearRect(0, 0, w, h);
  world.scene.updateMatrixWorld(true);
  world.camera.updateMatrixWorld(true);
  for (const f of fxs) {
    const p = f.params as Record<string, any>;
    const boxes = nodes(f)
      .filter((o) => world.isShown(o.id))
      .map((o) => ({ o, b: projectBox(world, o, w, h) }))
      .filter((x): x is { o: SceneNode; b: ScreenBox } => !!x.b);
    g.lineWidth = p.thick * k;
    g.strokeStyle = p.boxC;
    for (const { o, b } of boxes) {
      const pd = p.pad * k;
      const x0 = Math.max(b.x0 - pd, 0), y0 = Math.max(b.y0 - pd, 0), x1 = Math.min(b.x1 + pd, w), y1 = Math.min(b.y1 + pd, h);
      if (p.boxes) g.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
      const txt = [p.ids ? '#' + String(o.n).padStart(3, '0') : '', p.labels ? (o.label || o.name) : ''].filter(Boolean).join(' · ');
      if (!txt) continue;
      const fs = p.capSize * k;
      g.font = `${fs}px "Courier New", monospace`;
      const tw = g.measureText(txt).width, ph = fs * 1.45, pxl = fs * 0.5;
      const ty = p.capPos > 0.5 ? Math.max(y0 - ph, 0) : Math.min(y1, h - ph);
      g.fillStyle = p.boxC;
      if (p.caption) { g.fillRect(x0, ty, tw + pxl * 2, ph); g.fillStyle = '#fff'; g.fillText(txt, x0 + pxl, ty + ph * 0.7); }
      else g.fillText(txt, x0 + pxl * 0.4, ty + ph * 0.7);
    }
    if (p.lines && boxes.length > 1) {
      g.beginPath();
      boxes.forEach(({ b }, i) => { const x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
    }
  }
  return true;
}
