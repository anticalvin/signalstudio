import { describe, expect, it } from 'vitest';
import { EFFECTS, EFFECT_TYPES, checkStack, effectDefaults } from '../../src/effects/registry';
import { newEffect } from '../../src/doc/defaults';
import { allProgramSources, uniformDecl } from '../../src/render/programs';

describe('effect registry', () => {
  it('has unique parameter ids per effect, defaults inside their ranges', () => {
    for (const t of EFFECT_TYPES) {
      const ids = EFFECTS[t].params.map((p) => p.id);
      expect(new Set(ids).size, `${t} ids unique`).toBe(ids.length);
      for (const p of EFFECTS[t].params) {
        if (p.kind === 'col') { expect(String(p.def)).toMatch(/^#[0-9a-f]{6}$/i); continue; }
        expect(+p.def, `${t}.${p.id}`).toBeGreaterThanOrEqual(p.min);
        expect(+p.def, `${t}.${p.id}`).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('every parameter is declared as a uniform in its shader and nothing undeclared is used', () => {
    const src = allProgramSources();
    const frag = (name: string) => src[name].fragment;
    for (const t of ['depth', 'silhouette', 'ink', 'surv', 'grade'] as const) {
      const f = frag(`effect-${t}`);
      for (const p of EFFECTS[t].params) expect(f, `${t}.${p.id} declared`).toContain(`u_${p.id};`);
      const used = new Set([...f.matchAll(/\bu_(\w+)/g)].map((m) => m[1]));
      const declared = new Set(EFFECTS[t].params.map((p) => p.id));
      for (const u of used) expect(declared.has(u), `${t} uses undeclared u_${u}`).toBe(true);
    }
    const crt = frag('crt');
    expect(uniformDecl(EFFECTS.crt.params).split('\n').every((l) => crt.includes(l))).toBe(true);
  });

  it('newEffect picks a legal default target', () => {
    for (const t of EFFECT_TYPES) expect(EFFECTS[t].targets).toContain(newEffect(t).target.type);
    expect(newEffect('crt').target.type).toBe('output');
    expect(newEffect('depth').target.type).toBe('scene');
  });

  it('effectDefaults matches schema', () => {
    expect(effectDefaults('depth').auto).toBe(1);
    expect(effectDefaults('surv').boxC).toBe('#b3202e');
  });

  describe('checkStack constraints', () => {
    it('flags a second Analog CRT', () => {
      const c = checkStack([newEffect('crt'), newEffect('crt')]);
      expect(c).toHaveLength(1);
      expect(c[0].severity).toBe('error');
    });
    it('flags an effect targeting something it cannot', () => {
      const f = newEffect('crt'); f.target.type = 'object';
      expect(checkStack([f])[0].message).toMatch(/cannot target object/);
    });
    it('warns about stacked scene-wide ink', () => {
      const c = checkStack([newEffect('ink'), newEffect('surv')]);
      expect(c.map((x) => x.severity)).toEqual(['warning']);
    });
    it('accepts a normal stack', () => {
      expect(checkStack([newEffect('depth'), newEffect('grade'), newEffect('crt')])).toEqual([]);
    });
  });
});
