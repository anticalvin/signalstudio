import { describe, expect, it } from 'vitest';
import { EditorStore } from '../../src/editor/store';
import { diagnosticDoc } from '../../src/diagnostics/scene';

describe('EditorStore history', () => {
  it('records one step per committed edit and undoes/redoes exactly', () => {
    const s = new EditorStore(diagnosticDoc());
    const x0 = s.doc.nodes[1].pos[0];
    s.edit((d) => { d.nodes[1].pos[0] = 5; });
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.doc.nodes[1].pos[0]).toBe(x0);
    s.redo();
    expect(s.doc.nodes[1].pos[0]).toBe(5);
  });

  it('does not add history for no-op commits or live touches', () => {
    const s = new EditorStore(diagnosticDoc());
    s.commit(); s.touch();
    expect(s.canUndo).toBe(false);
    s.doc.scene.key = 2; s.touch();
    expect(s.canUndo, 'live change alone is not a step').toBe(false);
    s.commit();
    expect(s.canUndo).toBe(true);
  });

  it('clears the redo stack after a new edit', () => {
    const s = new EditorStore(diagnosticDoc());
    s.edit((d) => { d.scene.key = 2; }); s.undo();
    expect(s.canRedo).toBe(true);
    s.edit((d) => { d.scene.key = 3; });
    expect(s.canRedo).toBe(false);
  });

  it('removing a node drops its descendants and effect references', () => {
    const s = new EditorStore(diagnosticDoc());
    const fig = s.doc.nodes.find((n) => n.name === 'Figure A')!;
    s.addEffect('depth', { type: 'object', ids: [fig.id], group: '' });
    s.select(fig.id);
    s.removeNode(fig.id);
    expect(s.doc.nodes.find((n) => n.id === fig.id)).toBeUndefined();
    expect(s.doc.fx[0].target.ids).toEqual([]);
    expect(s.selection).toBeNull();
    s.undo();
    expect(s.doc.nodes.find((n) => n.id === fig.id)).toBeDefined();
  });

  it('caps history length', () => {
    const s = new EditorStore(diagnosticDoc());
    for (let i = 0; i < 150; i++) s.edit((d) => { d.scene.key = i + 10; });
    let steps = 0;
    while (s.canUndo) { s.undo(); steps++; }
    expect(steps).toBe(100);
  });
});
