import type { EffectInstance, ProjectDoc, SceneNode } from '../doc/types';
import { migrate } from '../doc/migrate';
import { emptyDoc, makeNode, nextObjectNumber, newEffect } from '../doc/defaults';
import type { EffectType } from '../doc/types';

export type Listener = (kind: 'doc' | 'selection') => void;

const HISTORY_LIMIT = 100;

/** Single source of truth for the project document, selection and undo history. */
export class EditorStore {
  doc: ProjectDoc = emptyDoc();
  selection: string | null = null;
  selectedFx: string | null = null;
  private listeners = new Set<Listener>();
  private past: string[] = [];
  private future: string[] = [];
  private lastSnap = '';

  constructor(doc?: ProjectDoc) {
    if (doc) this.doc = doc;
    this.lastSnap = JSON.stringify(this.doc);
  }

  subscribe(fn: Listener): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit(kind: 'doc' | 'selection'): void { for (const l of this.listeners) l(kind); }

  node(id: string | null): SceneNode | undefined { return id ? this.doc.nodes.find((n) => n.id === id) : undefined; }
  get selected(): SceneNode | undefined { return this.node(this.selection); }
  get selectedEffect(): EffectInstance | undefined { return this.doc.fx.find((f) => f.id === this.selectedFx); }

  /** Replace the document wholesale (load, new project). Clears history. */
  load(doc: ProjectDoc): void {
    this.doc = doc; this.past = []; this.future = [];
    this.lastSnap = JSON.stringify(doc);
    if (!this.node(this.selection)) this.selection = null;
    this.emit('doc');
  }

  loadJson(text: string): void { this.load(migrate(JSON.parse(text))); }
  toJson(): string { return JSON.stringify(this.doc, null, 1); }

  /** Apply a mutation and record exactly one history step if anything changed. */
  edit(fn: (doc: ProjectDoc) => void): void {
    fn(this.doc);
    this.commit();
  }

  /** Notify listeners of a live change (e.g. slider drag) without adding history. */
  touch(): void { this.emit('doc'); }

  commit(): void {
    const snap = JSON.stringify(this.doc);
    if (snap !== this.lastSnap) {
      this.past.push(this.lastSnap);
      if (this.past.length > HISTORY_LIMIT) this.past.shift();
      this.future = [];
      this.lastSnap = snap;
    }
    this.emit('doc');
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }

  undo(): void {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.future.push(this.lastSnap);
    this.restore(prev);
  }

  redo(): void {
    const next = this.future.pop();
    if (next === undefined) return;
    this.past.push(this.lastSnap);
    this.restore(next);
  }

  private restore(snap: string): void {
    this.doc = JSON.parse(snap);
    this.lastSnap = snap;
    if (!this.node(this.selection)) this.selection = null;
    if (!this.selectedEffect) this.selectedFx = null;
    this.emit('doc');
  }

  select(id: string | null): void {
    if (id === this.selection && this.selectedFx === null) return;
    this.selection = id; this.selectedFx = null;
    this.emit('selection');
  }

  selectEffect(id: string | null): void { this.selectedFx = id; this.emit('selection'); }

  // ---- structural operations ----------------------------------------------------------------

  addNode(init: Omit<Parameters<typeof makeNode>[0], 'n'>): SceneNode {
    const n = makeNode({ ...init, n: nextObjectNumber(this.doc.nodes) });
    this.edit((d) => { d.nodes.push(n); });
    this.select(n.id);
    return n;
  }

  /** Remove a node and its descendants; effects that targeted them drop the reference. */
  removeNode(id: string): void {
    const gone = new Set<string>([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const n of this.doc.nodes) if (n.parent && gone.has(n.parent) && !gone.has(n.id)) { gone.add(n.id); grew = true; }
    }
    this.edit((d) => {
      d.nodes = d.nodes.filter((n) => !gone.has(n.id));
      for (const f of d.fx) {
        f.target.ids = f.target.ids.filter((i) => !gone.has(i));
        if (gone.has(f.target.group)) { f.target.group = ''; if (f.target.type === 'group') f.target.type = 'scene'; }
      }
    });
    if (this.selection && gone.has(this.selection)) this.select(null);
  }

  removeEffectById(id: string): void {
    this.edit((d) => { d.fx = d.fx.filter((f) => f.id !== id); });
    this.selectEffect(null);
  }

  addEffect(type: EffectType, target?: EffectInstance['target']): EffectInstance {
    const f = newEffect(type, target);
    this.edit((d) => { d.fx.push(f); });
    this.selectEffect(f.id);
    return f;
  }
}
