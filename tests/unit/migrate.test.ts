import { describe, expect, it } from 'vitest';
import { migrate, DocumentError } from '../../src/doc/migrate';
import { DOC_VERSION } from '../../src/doc/types';

/** Shape of a document saved by the single-file prototype (v3). */
const protoV3 = () => ({
  v: 3, name: 'Studio',
  objs: [
    { id: 'g0', n: 1, name: 'Ground', type: 'plane', mode: 'pbr', grp: '', ground: true, lock: true, vis: true, pos: [0, 0, 0], rot: [-90, 0, 0], scl: [60, 60, 1], mat: { color: '#101010', rough: 1, op: 0.7 }, anim: { t: 'none' } },
    { id: 'a1', n: 2, name: 'Character A', type: 'lib', asset: 'figA', mode: 'toon', grp: 'Cast', track: true, label: 'Subject A', vis: true, pos: [-1.6, 0, 0.3], rot: [0, 22, 0], scl: [1, 1, 1], mat: { color: '#7b7e82' } },
    { id: 'b1', n: 3, name: 'Character B', type: 'lib', asset: 'figB', grp: 'Cast', vis: true, pos: [0.5, 0, 0.1], rot: [0, -12, 0], scl: [1, 1, 1], mat: {} },
    { id: 'c1', n: 4, name: 'Cube', type: 'cube', grp: '', vis: true, pos: [0, 0.7, 0], rot: [0, 0, 0], scl: [1, 1, 1], mat: {} },
  ],
  scene: { bg: '#ffffff', amb: 0.2, key: 1.05, shadows: true, q: 1, sres: 2048, pt: 0.6 },
  comp: { w: 1080, h: 1350, ar: '4:5' },
  cam: { p: [1.2, 2.6, 9.2], t: [0.5, 0.9, 0], z: 1, fov: 40 },
  fx: [
    { id: 'f1', type: 'surv', enabled: true, opacity: 1, target: { type: 'group', ids: [], group: 'Cast' }, params: { threshold: 0.7 } },
    { id: 'f2', type: 'depth', enabled: true, target: { type: 'object', ids: ['a1'], group: '' }, params: {} },
    { id: 'f3', type: 'unknownEffect', target: {}, params: {} },
    { id: 'f4', type: 'crt', enabled: true, target: { type: 'scene' }, params: { scan: 0.5 } },
  ],
});

describe('migrate', () => {
  it('upgrades a v3 prototype document to the current version', () => {
    const d = migrate(protoV3());
    expect(d.v).toBe(DOC_VERSION);
    expect(d.nodes.map((n) => n.name)).toContain('Character A');
  });

  it('promotes group-name strings to real parent/child groups', () => {
    const d = migrate(protoV3());
    const groups = d.nodes.filter((n) => n.kind === 'group');
    expect(groups.map((g) => g.name)).toEqual(['Cast']);
    const cast = groups[0];
    expect(d.nodes.find((n) => n.name === 'Character A')!.parent).toBe(cast.id);
    expect(d.nodes.find((n) => n.name === 'Character B')!.parent).toBe(cast.id);
    expect(d.nodes.find((n) => n.name === 'Cube')!.parent).toBeNull();
    expect(new Set(d.nodes.map((n) => n.n)).size, 'object numbers stay unique').toBe(d.nodes.length);
  });

  it('maps prototype object types onto node kinds', () => {
    const d = migrate(protoV3());
    const by = (name: string) => d.nodes.find((n) => n.name === name)!;
    expect(by('Character A')).toMatchObject({ kind: 'procedural', asset: 'figA', mode: 'toon', track: true, label: 'Subject A' });
    expect(by('Cube')).toMatchObject({ kind: 'primitive', asset: 'cube' });
    expect(by('Ground')).toMatchObject({ ground: true, lock: true });
  });

  it('rewrites group effect targets to group node ids and drops unknown effects', () => {
    const d = migrate(protoV3());
    const cast = d.nodes.find((n) => n.kind === 'group')!;
    expect(d.fx.find((f) => f.type === 'surv')!.target).toMatchObject({ type: 'group', group: cast.id });
    expect(d.fx.map((f) => f.type)).toEqual(['surv', 'depth', 'crt']);
    expect(d.fx.find((f) => f.type === 'depth')!.target.ids).toEqual(['a1']);
  });

  it('fills missing effect parameters from the schema and keeps saved ones', () => {
    const d = migrate(protoV3());
    const surv = d.fx.find((f) => f.type === 'surv')!;
    expect(surv.params.threshold).toBe(0.7);
    expect(surv.params.contrast).toBe(1.6);
    expect(d.fx.find((f) => f.type === 'crt')!.params.scan).toBe(0.5);
  });

  it('does not mutate its input', () => {
    const src = protoV3();
    const copy = JSON.stringify(src);
    migrate(src);
    expect(JSON.stringify(src)).toBe(copy);
  });

  it('is idempotent on current-version documents', () => {
    const once = migrate(protoV3());
    const twice = migrate(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });

  it('migrates the pre-effects prototype shape (crt block, no fx list)', () => {
    const old: any = protoV3(); delete old.fx; old.v = 2; old.crt = { on: true, p: { curv: 0.2 } };
    const d = migrate(old);
    expect(d.fx).toHaveLength(1);
    expect(d.fx[0]).toMatchObject({ type: 'crt', target: { type: 'output' } });
    expect(d.fx[0].params.curv).toBe(0.2);
  });

  it('repairs dangling or self-referential parents', () => {
    const d: any = migrate(protoV3());
    d.nodes[1].parent = 'does-not-exist'; d.nodes[2].parent = d.nodes[2].id;
    const r = migrate(d);
    expect(r.nodes[1].parent).toBeNull();
    expect(r.nodes[2].parent).toBeNull();
  });

  it('rejects documents that are not projects, or from the future', () => {
    expect(() => migrate(null)).toThrow(DocumentError);
    expect(() => migrate({ v: 3 })).toThrow(DocumentError);
    expect(() => migrate({ v: DOC_VERSION + 1, nodes: [] })).toThrow(/newer/);
  });
});
