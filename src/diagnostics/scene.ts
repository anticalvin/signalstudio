import type { EffectInstance, ProjectDoc, SceneNode } from '../doc/types';
import { DOC_VERSION } from '../doc/types';
import { defaultComp, defaultScene, makeNode, newEffect, type NodeInit } from '../doc/defaults';

/** Fixed seed, time and camera used by every diagnostic render. */
export const DIAG = { seed: 7, time: 1.5, dt: 1 / 60, width: 540, height: 675 } as const;

const node = (id: string, n: number, init: Omit<NodeInit, 'n' | 'id'>): SceneNode => makeNode({ ...init, id, n });

export interface DiagOptions {
  /** Show the text, colour and grid charts. Off for the reference-style studio frames. */
  charts?: boolean;
  /** Mark figures as tracked so Surveillance frames them (and nothing else). */
  trackFigures?: boolean;
}

/**
 * Deterministic diagnostic scene: two contrasting figures, rust sign, green monobloc chair,
 * shadow-only ground, plus (optionally) three test charts. Same camera and light every time.
 */
export function diagnosticDoc(opts: DiagOptions = {}): ProjectDoc {
  const charts = !!opts.charts;
  const track = !!opts.trackFigures;
  const nodes: SceneNode[] = [
    node('diag-ground', 1, { name: 'Ground', kind: 'primitive', asset: 'plane', ground: true, lock: true, rot: [-90, 0, 0], scl: [60, 60, 1] }),
    node('diag-fig-a', 2, { name: 'Figure A', kind: 'procedural', asset: 'figA', pos: [-1.6, 0, 0.3], rot: [0, 22, 0], mat: { color: '#24262a', rough: 0.85 }, track, label: 'Subject A' }),
    node('diag-fig-b', 3, { name: 'Figure B', kind: 'procedural', asset: 'figB', pos: [0.5, 0, 0.1], rot: [0, -12, 0], mat: { color: '#d8d2c4', rough: 0.85 }, track, label: 'Subject B' }),
    node('diag-chair', 4, { name: 'Chair', kind: 'procedural', asset: 'chair', pos: [2.5, 0, 0.4], rot: [0, -38, 0], scl: [1.15, 1.15, 1.15], mat: { color: '#2f9a55', rough: 0.45 } }),
    node('diag-sign', 5, { name: 'Priority sign', kind: 'procedural', asset: 'sign', pos: [-0.5, 0, -0.9], rot: [0, 12, 0], mat: { color: '#ffffff', rough: 0.85 } }),
    node('diag-chart-text', 6, { name: 'Text chart', kind: 'primitive', asset: 'chart-text', pos: [2.0, 3.2, -2.0], rot: [0, -12, 0], scl: [1.1, 1.45, 1], vis: charts, mode: 'unlit' }),
    node('diag-chart-colour', 7, { name: 'Colour chart', kind: 'primitive', asset: 'chart-colour', pos: [0.6, 0.38, 3.4], rot: [-10, 0, 0], scl: [1.2, 0.8, 1], vis: charts, mode: 'unlit' }),
    node('diag-chart-grid', 8, { name: 'Grid chart', kind: 'primitive', asset: 'chart-grid', pos: [-0.9, 3.4, -2.2], rot: [0, 0, 0], scl: [2, 1.5, 1], vis: charts, mode: 'unlit' }),
  ];
  return {
    v: DOC_VERSION, name: 'Diagnostic', nodes,
    scene: defaultScene(), comp: defaultComp(),
    cam: { p: [1.2, 2.6, 9.2], t: [0.5, 0.9, 0], z: 1, fov: 40 },
    fx: [],
  };
}

export type FrameName = 'clean' | 'selected' | 'depth' | 'surveillance' | 'surveillance-tight';

/** The five reference frames expressed as document variants of the diagnostic scene. */
export function frameDoc(frame: FrameName): ProjectDoc {
  const doc = diagnosticDoc({ trackFigures: frame.startsWith('surveillance') });
  const fx = (e: EffectInstance): void => { doc.fx.push(e); };
  switch (frame) {
    case 'clean': case 'selected': break;
    case 'depth': {
      const d = newEffect('depth');
      fx(d);
      break;
    }
    case 'surveillance': fx(newEffect('surv')); break;
    case 'surveillance-tight':
      fx(newEffect('surv'));
      doc.cam = { p: [-0.4, 1.7, 6.2], t: [-0.5, 1.0, 0], z: 1, fov: 40 };
      break;
  }
  return doc;
}
