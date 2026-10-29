import type { EffectInstance, NodeKind, ProjectDoc, RenderMode, SceneNode } from './types';
import { DOC_VERSION, RENDER_MODES } from './types';
import { defaultCam, defaultComp, defaultScene, makeNode, uid } from './defaults';
import { EFFECTS, effectDefaults } from '../effects/registry';
import { CRT_PARAMS } from '../effects/crt-params';

type Raw = Record<string, any>;

const PRIMITIVES = new Set(['cube', 'sphere', 'plane', 'cylinder', 'torus', 'cone', 'knot', 'pattern']);

export class DocumentError extends Error {}

/** Prototype (v1-v3) object -> v4 node. Group strings are resolved by the caller. */
function migrateObject(o: Raw, n: number): SceneNode {
  let kind: NodeKind;
  let asset: string | undefined = o.asset;
  if (o.type === 'lib') kind = 'procedural';
  else if (o.type === 'image') kind = 'image';
  else if (o.type === 'glb') kind = 'glb';
  else if (PRIMITIVES.has(o.type)) { kind = 'primitive'; asset = o.type; }
  else kind = 'primitive';
  const mode: RenderMode = RENDER_MODES.includes(o.mode) ? o.mode : 'pbr';
  return makeNode({
    id: String(o.id ?? uid()), n: Number.isInteger(o.n) && o.n > 0 ? o.n : n,
    name: String(o.name ?? 'Object'), kind, asset, mode,
    vis: o.vis !== false, lock: !!o.lock, ground: !!o.ground, label: String(o.label ?? ''),
    track: !!o.track, faceCam: !!o.faceCam, sil: o.sil ?? '#000000',
    pos: o.pos ?? [0, 0, 0], rot: o.rot ?? [0, 0, 0], scl: o.scl ?? [1, 1, 1],
    mat: o.mat,
  });
}

function migrateEffects(raw: Raw, idMap: Map<string, string>, groupByName: Map<string, string>): EffectInstance[] {
  let list: Raw[] = Array.isArray(raw.fx) ? raw.fx : [];
  if (!raw.fx && raw.crt?.on) list = [{ type: 'crt', params: raw.crt.p }];
  const out: EffectInstance[] = [];
  for (const f of list) {
    const def = EFFECTS[f.type as keyof typeof EFFECTS];
    if (!def) continue;
    const target = f.target ?? {};
    let type = def.targets.includes(target.type) ? target.type : (def.targets.includes('scene') ? 'scene' : def.targets[0]);
    const ids: string[] = (target.ids ?? []).map((i: string) => idMap.get(i) ?? i);
    const group = target.group ? (groupByName.get(target.group) ?? target.group) : '';
    if (type === 'group' && !group) type = 'scene';
    out.push({
      id: String(f.id ?? uid()), type: f.type, enabled: f.enabled !== false,
      opacity: typeof f.opacity === 'number' ? f.opacity : 1, blend: 'normal',
      target: { type, ids, group },
      params: { ...effectDefaults(f.type), ...(f.type === 'crt' ? Object.fromEntries(CRT_PARAMS.map((p) => [p.id, p.def])) : {}), ...f.params },
    });
  }
  return out;
}

/**
 * Upgrade any known document version to the current one.
 * Never mutates its input. Throws DocumentError for input that is not a project.
 */
export function migrate(input: unknown): ProjectDoc {
  if (!input || typeof input !== 'object') throw new DocumentError('Project file is not an object');
  const raw = structuredClone(input) as Raw;
  const version = typeof raw.v === 'number' ? raw.v : 1;
  if (version > DOC_VERSION) throw new DocumentError(`Project version ${version} is newer than this build (${DOC_VERSION})`);

  let nodes: SceneNode[];
  const idMap = new Map<string, string>();
  const groupByName = new Map<string, string>();

  if (version >= 4) {
    if (!Array.isArray(raw.nodes)) throw new DocumentError('Project has no node list');
    nodes = raw.nodes.map((o: Raw, i: number) => ({ ...migrateObject(o, i + 1), parent: o.parent ?? null, kind: o.kind ?? 'primitive' }));
  } else {
    if (!Array.isArray(raw.objs)) throw new DocumentError('Project has no object list');
    let n = 0;
    nodes = raw.objs.map((o: Raw) => { const node = migrateObject(o, ++n); idMap.set(String(o.id), node.id); return node; });
    // v3 hierarchy was a name string on each object. Promote each distinct name to a real group node.
    const maxN = nodes.reduce((m, x) => Math.max(m, x.n), 0);
    let gn = maxN;
    const groups: SceneNode[] = [];
    raw.objs.forEach((o: Raw, i: number) => {
      const name = String(o.grp ?? '').trim();
      if (!name) return;
      let gid = groupByName.get(name);
      if (!gid) {
        const g = makeNode({ n: ++gn, name, kind: 'group' });
        gid = g.id; groupByName.set(name, gid); groups.push(g);
      }
      nodes[i].parent = gid;
    });
    nodes = [...groups, ...nodes];
  }

  const ids = new Set(nodes.map((x) => x.id));
  for (const nd of nodes) if (nd.parent && (!ids.has(nd.parent) || nd.parent === nd.id)) nd.parent = null;

  return {
    v: DOC_VERSION,
    name: String(raw.name ?? 'Untitled'),
    nodes,
    scene: { ...defaultScene(), ...pickKnown(raw.scene, defaultScene()) },
    comp: { ...defaultComp(), ...(raw.comp ?? {}) },
    cam: { ...defaultCam(), ...(raw.cam ?? {}) },
    fx: migrateEffects(raw, idMap, groupByName),
  };
}

function pickKnown<T extends object>(src: Raw | undefined, shape: T): Partial<T> {
  const out: Raw = {};
  if (src) for (const k of Object.keys(shape)) if (src[k] !== undefined) out[k] = src[k];
  return out as Partial<T>;
}
