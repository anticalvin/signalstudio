import type {
  CameraSettings, CompositionSettings, EffectInstance, EffectType, Material, ProjectDoc,
  SceneNode, SceneSettings, Vec3,
} from './types';
import { DOC_VERSION } from './types';
import { effectDefaults, EFFECTS } from '../effects/registry';

/** Short random id. Tests that need determinism pass their own via `makeNode`'s `id`. */
export const uid = (): string => Math.random().toString(36).slice(2, 9);

export function nextObjectNumber(nodes: SceneNode[]): number {
  return nodes.reduce((m, o) => Math.max(m, o.n), 0) + 1;
}

export const defaultMaterial = (): Material => ({
  color: '#ffffff', rough: 0.5, metal: 0, emis: '#000000', emisI: 1, wire: false, op: 1,
});

export interface NodeInit extends Partial<Omit<SceneNode, 'mat'>> {
  mat?: Partial<Material>;
  name: string;
  kind: SceneNode['kind'];
  n: number;
}

export function makeNode(init: NodeInit): SceneNode {
  const { mat, ...rest } = init;
  return {
    id: uid(), parent: null, mode: 'pbr', vis: true, lock: false, ground: false,
    label: '', track: false, faceCam: false, sil: '#000000',
    pos: [0, 0, 0], rot: [0, 0, 0], scl: [1, 1, 1],
    ...rest,
    mat: { ...defaultMaterial(), ...mat },
  };
}

export const defaultScene = (): SceneSettings => ({
  bg: '#ffffff', amb: 0.2, key: 1.05, keyCol: '#ffffff', kx: -4, ky: 8, kz: -2,
  shadows: true, shadowOpacity: 0.32, shadowSoftness: 9, env: true, grid: false, ortho: false, q: 1,
});

export const defaultComp = (): CompositionSettings => ({ w: 1080, h: 1350, ar: '4:5' });
export const defaultCam = (): CameraSettings => ({ p: [1.2, 2.6, 9.2], t: [0.5, 0.9, 0], z: 1, fov: 40 });

export function newEffect(type: EffectType, target?: EffectInstance['target']): EffectInstance {
  const def = EFFECTS[type];
  return {
    id: uid(), type, enabled: true, opacity: 1, blend: 'normal',
    target: target ?? { type: def.targets.includes('scene') ? 'scene' : def.targets[0], ids: [], group: '' },
    params: effectDefaults(type),
  };
}

export function emptyDoc(): ProjectDoc {
  return { v: DOC_VERSION, name: 'Untitled', nodes: [], scene: defaultScene(), comp: defaultComp(), cam: defaultCam(), fx: [] };
}

export const groundNode = (n: number): SceneNode => makeNode({
  n, name: 'Ground', kind: 'primitive', asset: 'plane', ground: true, lock: true,
  rot: [-90, 0, 0], scl: [60, 60, 1] as Vec3, mat: { color: '#ffffff', rough: 1 },
});
