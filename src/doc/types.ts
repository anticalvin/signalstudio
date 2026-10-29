export type Vec3 = [number, number, number];

export const DOC_VERSION = 4;

export type RenderMode =
  | 'pbr' | 'unlit' | 'flat' | 'clay' | 'toon'
  | 'silhouette' | 'depth' | 'normal' | 'wireframe' | 'id';

export const RENDER_MODES: RenderMode[] = [
  'pbr', 'unlit', 'flat', 'clay', 'toon', 'silhouette', 'depth', 'normal', 'wireframe', 'id',
];

export type NodeKind = 'group' | 'procedural' | 'primitive' | 'glb' | 'image' | 'text' | 'shape';

export interface Material {
  color: string;
  rough: number;
  metal: number;
  emis: string;
  emisI: number;
  wire: boolean;
  op: number;
}

/** One entry in the scene tree. Parent/child structure is `parent` + array order. */
export interface SceneNode {
  id: string;
  /** Small positive integer written into the ID buffer. Stable for the life of the node. */
  n: number;
  name: string;
  kind: NodeKind;
  /** Procedural/primitive key, or the asset id for glb/image nodes. */
  asset?: string;
  parent: string | null;
  mode: RenderMode;
  vis: boolean;
  lock: boolean;
  /** Ground catcher: receives shadows only and is excluded from the geometry buffer. */
  ground: boolean;
  label: string;
  /** Participates in the Surveillance annotation set when the effect targets the scene. */
  track: boolean;
  faceCam: boolean;
  sil: string;
  pos: Vec3;
  /** Euler XYZ in degrees. */
  rot: Vec3;
  scl: Vec3;
  mat: Material;
}

export type EffectType = 'depth' | 'silhouette' | 'ink' | 'surv' | 'grade' | 'crt';
export type TargetType = 'object' | 'group' | 'scene' | 'output';

export interface EffectTarget {
  type: TargetType;
  /** Node ids when type === 'object'. */
  ids: string[];
  /** Group node id when type === 'group'. */
  group: string;
}

export interface EffectInstance {
  id: string;
  type: EffectType;
  enabled: boolean;
  target: EffectTarget;
  opacity: number;
  blend: 'normal';
  params: Record<string, number | string>;
}

export interface SceneSettings {
  bg: string;
  amb: number;
  key: number;
  keyCol: string;
  kx: number;
  ky: number;
  kz: number;
  shadows: boolean;
  shadowOpacity: number;
  shadowSoftness: number;
  env: boolean;
  grid: boolean;
  ortho: boolean;
  /** 0 performance, 1 balanced, 2 high. */
  q: number;
}

export interface CompositionSettings {
  w: number;
  h: number;
  ar: string;
}

export interface CameraSettings {
  p: Vec3;
  t: Vec3;
  z: number;
  fov: number;
}

export interface ProjectDoc {
  v: number;
  name: string;
  nodes: SceneNode[];
  scene: SceneSettings;
  comp: CompositionSettings;
  cam: CameraSettings;
  fx: EffectInstance[];
}
