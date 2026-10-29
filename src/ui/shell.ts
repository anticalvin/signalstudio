import type { EffectInstance, RenderMode, SceneNode } from '../doc/types';
import { RENDER_MODES } from '../doc/types';
import { EFFECTS, EFFECT_TYPES, checkStack } from '../effects/registry';
import type { ParamDef } from '../effects/schema';
import { PROCEDURAL, PRIMITIVES } from '../assets/procedural';
import type { StudioApp } from '../app';
import { h } from './dom';
import { knob, paramRow, vec3Row } from './controls';

const ASPECTS: Record<string, [number, number]> = {
  '4:5': [1080, 1350], '1:1': [1080, 1080], '16:9': [1920, 1080], '9:16': [1080, 1920], '3:2': [1620, 1080],
};
const TARGET_LABEL = { object: 'Selected objects', group: 'Group', scene: 'Whole scene', output: 'Final output' } as const;

export function mountShell(root: HTMLElement, app: StudioApp, viewport: HTMLElement): { refresh(): void } {
  const store = app.store;
  let leftTab: 'Assets' | 'Scene' | 'Effects' = 'Scene';
  let sheet = false;
  let lastSig = '';

  const status = h('div', { id: 'status', role: 'status', 'aria-live': 'polite' });
  viewport.append(status);
  const left = h('aside', { id: 'left', 'aria-label': 'Library and scene' });
  const right = h('aside', { id: 'right', 'aria-label': 'Inspector' });
  const errors = h('div', { id: 'errors', role: 'alert', hidden: true });

  // ---- header ---------------------------------------------------------------------------------
  const undoBtn = h('button', { title: 'Undo (Ctrl+Z)', 'aria-label': 'Undo', onclick: () => { store.undo(); refresh(true); } }, '↶');
  const redoBtn = h('button', { title: 'Redo (Ctrl+Shift+Z)', 'aria-label': 'Redo', onclick: () => { store.redo(); refresh(true); } }, '↷');
  const cleanBtn = h('button', { id: 'btn-clean', title: 'Clean preview: hide gizmo and selection', 'aria-pressed': 'false',
    onclick: () => { app.clean = !app.clean; cleanBtn.setAttribute('aria-pressed', String(app.clean)); cleanBtn.classList.toggle('on', app.clean); app.requestRender(); } }, 'Clean');
  const ab = h('button', { id: 'btn-ab', title: 'Hold to compare with all effects bypassed' }, 'A/B');
  const hold = (v: boolean) => () => { app.bypass = v; app.requestRender(); };
  ab.addEventListener('pointerdown', hold(true)); ab.addEventListener('pointerup', hold(false)); ab.addEventListener('pointerleave', hold(false));
  const arSel = h('select', { id: 'sel-ar', title: 'Composition aspect ratio', 'aria-label': 'Aspect ratio',
    onchange: (e: Event) => {
      const v = (e.target as HTMLSelectElement).value;
      store.edit((d) => { d.comp = { ar: v, w: ASPECTS[v][0], h: ASPECTS[v][1] }; });
      app.resize(); refresh(true);
    } }, ...Object.keys(ASPECTS).map((k) => h('option', { value: k }, k)));
  const qSel = h('select', { id: 'sel-q', title: 'Preview quality', 'aria-label': 'Preview quality',
    onchange: (e: Event) => { store.edit((d) => { d.scene.q = +(e.target as HTMLSelectElement).value; }); app.resize(); } },
    h('option', { value: '0' }, 'Fast'), h('option', { value: '1' }, 'Balanced'), h('option', { value: '2' }, 'High'));
  const exportBtn = h('button', { id: 'btn-export', class: 'primary', title: 'Export a PNG at composition size',
    onclick: async () => {
      try {
        const { w, h: hh } = store.doc.comp;
        const blob = await app.exportPng(w, hh, { time: 0, dt: 1 / 60, seed: 7 });
        const a = h('a', { href: URL.createObjectURL(blob), download: `${store.doc.name || 'awaken'}.png` });
        a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      } catch (e) { toast((e as Error).message); }
    } }, 'Export');
  const header = h('header', {}, h('b', { class: 'brand' }, 'AWAKEN'), h('span', { class: 'sub' }, 'Signal Studio'), h('span', { class: 'sp' }),
    arSel, qSel, undoBtn, redoBtn, cleanBtn, ab, exportBtn);

  const toastEl = h('div', { id: 'toast', role: 'status', hidden: true });
  let toastT = 0;
  function toast(m: string) { toastEl.textContent = m; toastEl.hidden = false; clearTimeout(toastT); toastT = window.setTimeout(() => (toastEl.hidden = true), 4000); }

  // ---- left panel -----------------------------------------------------------------------------
  function tabs<T extends string>(names: T[], cur: T, set: (t: T) => void): HTMLElement {
    return h('nav', { class: 'tabs', role: 'tablist' }, ...names.map((t) =>
      h('button', { role: 'tab', 'aria-selected': String(t === cur), class: t === cur ? 'on' : '', onclick: () => set(t) }, t)));
  }

  function assetsView(): HTMLElement {
    const grid = h('div', { class: 'agrid' });
    for (const [key, def] of Object.entries(PROCEDURAL)) {
      grid.append(h('button', { class: 'acard', title: `Add ${def.name}`, onclick: () => {
        store.addNode({ name: def.name, kind: 'procedural', asset: key, pos: [0, 0, 0.5], mat: { color: '#d9d9d9', rough: 0.6 } });
      } }, def.name));
    }
    const prims = h('div', { class: 'agrid' });
    for (const key of Object.keys(PRIMITIVES)) {
      prims.append(h('button', { class: 'acard', onclick: () => {
        store.addNode({ name: key[0].toUpperCase() + key.slice(1), kind: 'primitive', asset: key, pos: [0, key === 'plane' ? 0 : 0.7, 0], mat: { color: '#cfcfcf' },
          ...(key === 'plane' ? { rot: [-90, 0, 0], scl: [3, 3, 1] } : {}) });
      } }, key));
    }
    const mine = h('div', { class: 'agrid' });
    for (const r of app.assets.records.values()) {
      mine.append(h('button', { class: 'acard', title: `Add ${r.name}`, onclick: () => {
        store.addNode({ name: r.name, kind: r.type, asset: r.id, mat: { color: '#ffffff' } });
      } }, r.thumb ? h('img', { src: r.thumb, alt: '', width: 72, height: 72 }) : null, r.name));
    }
    const input = h('input', { type: 'file', id: 'file-import', 'aria-label': 'Import model or image file', accept: '.glb,.gltf,image/png,image/webp,image/jpeg', hidden: true, multiple: true,
      onchange: async (e: Event) => {
        const el = e.target as HTMLInputElement;
        for (const f of Array.from(el.files ?? [])) {
          try {
            const { report } = await app.importFile(f);
            toast(report ? `Imported ${f.name}: ${report.size.map((v) => v.toFixed(2)).join(' × ')} m${report.fixes.length ? ' · ' + report.fixes.join(', ') : ''}` : `Imported ${f.name}`);
          } catch (err) { toast(`Import failed: ${(err as Error).message}`); }
        }
        el.value = ''; refresh(true);
      } });
    return h('div', { class: 'pane' },
      h('button', { class: 'primary', id: 'btn-import', onclick: () => input.click() }, 'Import model or image…'), input,
      h('p', { class: 'hint' }, 'GLB/GLTF scans stay in this browser. PNG/WebP with transparency become cut-out planes.'),
      mine.childElementCount ? h('h4', {}, 'Imported') : null, mine.childElementCount ? mine : null,
      h('h4', {}, 'Procedural'), grid, h('h4', {}, 'Primitives'), prims);
  }

  function sceneView(): HTMLElement {
    const list = h('ul', { class: 'tree', role: 'tree' });
    const walk = (parent: string | null, depth: number) => {
      for (const n of store.doc.nodes.filter((x) => x.parent === parent)) {
        const row = h('li', { role: 'treeitem', 'aria-selected': String(n.id === store.selection), class: 'layer' + (n.id === store.selection ? ' sel' : ''),
          style: `padding-left:${4 + depth * 14}px` },
          h('button', { class: 'ico', title: n.vis ? 'Hide' : 'Show', 'aria-label': `${n.vis ? 'Hide' : 'Show'} ${n.name}`, 'aria-pressed': String(n.vis),
            onclick: () => { store.edit(() => { n.vis = !n.vis; }); refresh(true); } }, n.vis ? '◉' : '○'),
          h('button', { class: 'nm', onclick: () => store.select(n.id) }, `${n.kind === 'group' ? '▸ ' : ''}${n.name}`),
          n.lock ? h('span', { class: 'tag' }, 'locked') : null);
        list.append(row);
        if (n.kind === 'group') walk(n.id, depth + 1);
      }
    };
    walk(null, 0);
    return h('div', { class: 'pane' }, list);
  }

  function effectsView(): HTMLElement {
    const sel = store.selected;
    const wrap = h('div', { class: 'pane' });
    wrap.append(h('h4', {}, sel ? `Add to ${sel.name}` : 'Add effect'));
    for (const t of EFFECT_TYPES) {
      const def = EFFECTS[t];
      const targets = h('span', { class: 'btns' });
      const add = (label: string, target: EffectInstance['target']['type']) =>
        targets.append(h('button', { title: `${def.name} → ${TARGET_LABEL[target]}`, onclick: () => {
          store.addEffect(t, { type: target, ids: target === 'object' && sel ? [sel.id] : [], group: target === 'group' && sel ? sel.id : '' }); refresh(true);
        } }, label));
      if (def.targets.includes('object') && sel && sel.kind !== 'group') add('Object', 'object');
      if (def.targets.includes('group') && sel?.kind === 'group') add('Group', 'group');
      if (def.targets.includes('scene')) add('Scene', 'scene');
      if (def.targets.includes('output')) add('Output', 'output');
      wrap.append(h('div', { class: 'card' }, h('div', { class: 't' }, h('b', {}, def.name), h('small', {}, def.desc)), targets));
    }
    return wrap;
  }

  function renderLeft() {
    const body = leftTab === 'Assets' ? assetsView() : leftTab === 'Scene' ? sceneView() : effectsView();
    left.replaceChildren(tabs(['Assets', 'Scene', 'Effects'], leftTab, (t) => { leftTab = t; renderLeft(); }), body);
  }

  // ---- inspector ------------------------------------------------------------------------------
  const binder = (obj: Record<string, any>, id: string) => ({
    get: () => obj[id], set: (v: number | string) => { obj[id] = v; store.touch(); }, commit: () => store.commit(),
  });

  function groupParams(params: ParamDef[], values: Record<string, any>, analog: boolean): HTMLElement[] {
    const groups = new Map<string, ParamDef[]>();
    for (const p of params) (groups.get(p.group) ?? groups.set(p.group, []).get(p.group)!).push(p);
    return [...groups].map(([name, ps]) => {
      const body = analog && ps.every((p) => p.kind === 'range')
        ? h('div', { class: 'kgrid' }, ...ps.map((p) => knob(p, binder(values, p.id))))
        : h('div', {}, ...ps.map((p) => analog && p.kind === 'range' ? knob(p, binder(values, p.id)) : paramRow(p, binder(values, p.id))));
      return h('details', { open: true }, h('summary', {}, name), body);
    });
  }

  function effectInspector(f: EffectInstance): HTMLElement {
    const def = EFFECTS[f.type];
    const pane = h('div', { class: 'pane' }, h('h3', {}, def.name), h('p', { class: 'hint' }, def.desc));
    for (const c of checkStack(store.doc.fx).filter((c) => c.effectId === f.id)) pane.append(h('p', { class: `constraint ${c.severity}`, role: 'note' }, c.message));
    pane.append(
      paramRow({ id: 'enabled', label: 'Enabled', group: '', min: 0, max: 1, def: 1, step: 1, tip: '', kind: 'chk' }, { get: () => (f.enabled ? 1 : 0), set: (v) => { f.enabled = !!+v; store.touch(); }, commit: () => store.commit() }),
      paramRow({ id: 'opacity', label: 'Opacity', group: '', min: 0, max: 1, def: 1, step: 0.01, tip: 'Blend of this effect over the previous stage.', kind: 'range' }, binder(f as any, 'opacity')),
      h('div', { class: 'row' }, h('label', { class: 'lb', for: 'tgt' }, 'Applies to'),
        h('select', { id: 'tgt', onchange: (e: Event) => { store.edit(() => { f.target.type = (e.target as HTMLSelectElement).value as any; }); refresh(true); } },
          ...def.targets.map((t) => h('option', { value: t, selected: f.target.type === t }, TARGET_LABEL[t])))),
    );
    if (f.target.type === 'object') {
      const sel = store.selected;
      if (sel && sel.kind !== 'group') pane.append(h('div', { class: 'row' }, h('span', { class: 'lb' }, 'Objects'),
        h('span', { class: 'hint' }, f.target.ids.map((i) => store.node(i)?.name).filter(Boolean).join(', ') || 'none'),
        h('button', { onclick: () => { store.edit(() => { const ids = f.target.ids; const i = ids.indexOf(sel.id); if (i >= 0) ids.splice(i, 1); else ids.push(sel.id); }); refresh(true); } },
          f.target.ids.includes(sel.id) ? `Remove ${sel.name}` : `Add ${sel.name}`)));
    }
    pane.append(...groupParams(def.params, f.params, f.type === 'crt'));
    pane.append(h('div', { class: 'acts' },
      h('button', { onclick: () => { store.removeEffectById(f.id); refresh(true); } }, 'Remove effect')));
    return pane;
  }

  function objectInspector(o: SceneNode): HTMLElement {
    const pane = h('div', { class: 'pane' });
    const text = (label: string, key: 'name' | 'label') => h('div', { class: 'row' }, h('label', { class: 'lb', for: 'o-' + key }, label),
      h('input', { id: 'o-' + key, type: 'text', value: o[key], onchange: (e: Event) => { store.edit(() => { o[key] = (e.target as HTMLInputElement).value; }); refresh(true); } }));
    pane.append(h('h3', {}, o.name), text('Name', 'name'), text('Annotation label', 'label'));
    pane.append(h('div', { class: 'row' }, h('label', { class: 'lb', for: 'o-mode', title: 'How this object itself is shaded, before any effect.' }, 'Render mode'),
      h('select', { id: 'o-mode', onchange: (e: Event) => { store.edit(() => { o.mode = (e.target as HTMLSelectElement).value as RenderMode; }); } },
        ...RENDER_MODES.map((m) => h('option', { value: m, selected: o.mode === m }, m)))));
    const mkChk = (label: string, get: () => boolean, set: (v: boolean) => void, tip = '') => paramRow(
      { id: label, label, group: '', min: 0, max: 1, def: 0, step: 1, tip, kind: 'chk' }, { get: () => (get() ? 1 : 0), set: (v) => set(!!+v), commit: () => { store.commit(); refresh(true); } });
    pane.append(mkChk('Visible', () => o.vis, (v) => (o.vis = v)), mkChk('Locked', () => o.lock, (v) => (o.lock = v)),
      mkChk('Track', () => o.track, (v) => (o.track = v), 'Included when Surveillance targets the whole scene.'));
    if (o.kind !== 'group') {
      pane.append(h('h4', {}, 'Transform'),
        vec3Row('Position', o.pos, 0.05, () => store.touch(), () => store.commit()),
        vec3Row('Rotation°', o.rot, 1, () => store.touch(), () => store.commit()),
        vec3Row('Scale', o.scl, 0.05, () => store.touch(), () => store.commit()),
        h('h4', {}, 'Material'),
        paramRow({ id: 'color', label: 'Colour', group: '', min: 0, max: 0, def: '#ffffff', step: 0, tip: '', kind: 'col' }, binder(o.mat, 'color')),
        paramRow({ id: 'rough', label: 'Roughness', group: '', min: 0, max: 1, def: 0.5, step: 0.01, tip: '', kind: 'range' }, binder(o.mat, 'rough')),
        paramRow({ id: 'metal', label: 'Metalness', group: '', min: 0, max: 1, def: 0, step: 0.01, tip: '', kind: 'range' }, binder(o.mat, 'metal')));
    }
    const mine = store.doc.fx.filter((f) => f.target.type === 'object' && f.target.ids.includes(o.id));
    pane.append(h('h4', {}, 'Effects on this object'),
      ...(mine.length ? mine.map((f) => h('button', { class: 'fxrow', onclick: () => store.selectEffect(f.id) }, EFFECTS[f.type].name)) : [h('p', { class: 'hint' }, 'None. Add one from the Effects tab.')]));
    pane.append(h('div', { class: 'acts' }, h('button', { disabled: o.lock, onclick: () => { store.removeNode(o.id); refresh(true); } }, 'Delete')));
    return pane;
  }

  function sceneInspector(): HTMLElement {
    const d = store.doc;
    const pane = h('div', { class: 'pane' }, h('h3', {}, 'Scene and camera'));
    const P = (id: string, label: string, min: number, max: number, step: number, obj: any, tip = ''): HTMLElement =>
      paramRow({ id, label, group: '', min, max, def: obj[id], step, tip, kind: 'range' }, binder(obj, id));
    pane.append(
      paramRow({ id: 'bg', label: 'Background', group: '', min: 0, max: 0, def: '#ffffff', step: 0, tip: '', kind: 'col' }, binder(d.scene, 'bg')),
      P('key', 'Key light', 0, 5, 0.05, d.scene), P('amb', 'Ambient', 0, 3, 0.05, d.scene),
      P('shadowOpacity', 'Shadow density', 0, 1, 0.01, d.scene, 'Opacity of the shadow-only ground.'),
      P('shadowSoftness', 'Shadow softness', 0, 25, 0.5, d.scene),
      P('fov', 'Field of view', 15, 90, 1, d.cam),
      ...['shadows', 'grid', 'ortho'].map((k) => paramRow({ id: k, label: k === 'ortho' ? 'Orthographic' : k[0].toUpperCase() + k.slice(1), group: '', min: 0, max: 1, def: 0, step: 1, tip: '', kind: 'chk' },
        { get: () => ((d.scene as any)[k] ? 1 : 0), set: (v) => { (d.scene as any)[k] = !!+v; store.touch(); }, commit: () => store.commit() })));
    const fxList = d.fx.map((f) => {
      const cs = checkStack(d.fx).filter((c) => c.effectId === f.id);
      return h('button', { class: 'fxrow' + (f.enabled ? '' : ' off'), onclick: () => store.selectEffect(f.id) },
        `${EFFECTS[f.type].name} · ${TARGET_LABEL[f.target.type]}`, cs.length ? h('span', { class: 'tag warn' }, cs[0].message) : null);
    });
    pane.append(h('h4', {}, 'Effect stack'), ...(fxList.length ? fxList : [h('p', { class: 'hint' }, 'No effects.')]));
    return pane;
  }

  function renderRight() {
    const f = store.selectedEffect, o = store.selected;
    right.replaceChildren(f ? effectInspector(f) : o ? objectInspector(o) : sceneInspector());
    if (f || o) right.prepend(h('button', { class: 'back', onclick: () => { store.selectEffect(null); store.select(null); refresh(true); } }, '← Scene'));
  }

  // ---- shell lifecycle ------------------------------------------------------------------------
  function sig(): string {
    const d = store.doc;
    return JSON.stringify([d.nodes.map((n) => [n.id, n.name, n.vis, n.lock, n.parent, n.mode]), d.fx.map((f) => [f.id, f.enabled, f.target]), store.selection, store.selectedFx, d.comp.ar]);
  }

  function refresh(force = false) {
    const s = sig();
    if (force || s !== lastSig) {
      lastSig = s;
      renderLeft(); renderRight();
      arSel.value = store.doc.comp.ar; qSel.value = String(store.doc.scene.q);
    }
    undoBtn.disabled = !store.canUndo; redoBtn.disabled = !store.canRedo;
    status.textContent = `${app.graph.width}×${app.graph.height} · ${store.doc.fx.filter((f) => f.enabled).length} effects`;
    document.body.classList.toggle('sheet-open', sheet);
  }

  store.subscribe(() => refresh());
  const sheetBtn = h('button', { id: 'btn-sheet', class: 'sheet-toggle', 'aria-label': 'Toggle panels', onclick: () => { sheet = !sheet; refresh(); } }, '☰ Panels');
  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? store.redo() : store.undo(); refresh(true); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && store.selected && !store.selected.lock) { store.removeNode(store.selected.id); refresh(true); }
    else if (e.key === 'w') app.gizmo.setMode('translate');
    else if (e.key === 'e') app.gizmo.setMode('rotate');
    else if (e.key === 'r') app.gizmo.setMode('scale');
  });

  const main = h('main', {}, left, viewport, right);
  root.append(header, errors, main, sheetBtn, toastEl);
  app.onShaderError((err) => { errors.hidden = false; errors.append(h('pre', {}, `Shader error\n${err.log}`)); });
  return { refresh: () => refresh(true) };
}
