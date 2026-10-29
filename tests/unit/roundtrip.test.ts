import { describe, expect, it } from 'vitest';
import { migrate } from '../../src/doc/migrate';
import { frameDoc } from '../../src/diagnostics/scene';

describe('save/load round trip', () => {
  for (const name of ['clean', 'depth', 'surveillance', 'surveillance-tight'] as const) {
    it(`${name}: migrate(JSON(doc)) deep-equals doc`, () => {
      const doc = frameDoc(name);
      expect(migrate(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
    });
  }
  it('serialisation is stable once normalised (save -> load -> save is a fixed point)', () => {
    const once = JSON.stringify(migrate(JSON.parse(JSON.stringify(frameDoc('surveillance')))));
    const twice = JSON.stringify(migrate(JSON.parse(once)));
    expect(twice).toBe(once);
  });
});
