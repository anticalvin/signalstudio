import type { ParamDef } from '../effects/schema';
import { clamp, fmt, h } from './dom';

interface Binding {
  get: () => number | string;
  /** Live change (dragging). */
  set: (v: number | string) => void;
  /** End of a gesture: record history. */
  commit: () => void;
}

/** Slider row for any non-analog parameter. Double-click the label to reset. */
export function paramRow(p: ParamDef, b: Binding): HTMLElement {
  const id = 'p-' + p.id + '-' + Math.random().toString(36).slice(2, 6);
  const label = h('label', { class: 'lb', for: id, title: p.tip || p.label }, p.label);
  let input: HTMLElement;
  let out: HTMLElement | null = null;
  switch (p.kind) {
    case 'chk':
      input = h('input', { id, type: 'checkbox', checked: !!+b.get(), onchange: (e: Event) => { b.set((e.target as HTMLInputElement).checked ? 1 : 0); b.commit(); } });
      break;
    case 'col':
      input = h('input', { id, type: 'color', value: String(b.get()), oninput: (e: Event) => b.set((e.target as HTMLInputElement).value), onchange: b.commit });
      break;
    case 'sel': {
      const s = h('select', { id, onchange: (e: Event) => { b.set(+(e.target as HTMLSelectElement).value); b.commit(); } },
        ...(p.opts ?? []).map(([v, l]) => h('option', { value: String(v), selected: +b.get() === v }, l)));
      input = s;
      break;
    }
    default: {
      out = h('output', { for: id }, fmt(+b.get()));
      input = h('input', {
        id, type: 'range', min: p.min, max: p.max, step: p.step, value: +b.get(),
        oninput: (e: Event) => { const v = +(e.target as HTMLInputElement).value; b.set(v); out!.textContent = fmt(v); },
        onchange: b.commit,
      });
    }
  }
  const row = h('div', { class: 'row', title: p.tip }, label, input, out);
  label.addEventListener('dblclick', () => { b.set(p.def); b.commit(); (input as HTMLInputElement).value = String(p.def); if (out) out.textContent = fmt(+p.def); });
  return row;
}

/** Rotary control for analog instrument parameters. Drag, wheel, or arrow keys; Shift = fine; double-click resets. */
export function knob(p: ParamDef, b: Binding): HTMLElement {
  const k = h('div', { class: 'knob', tabindex: 0, role: 'slider', title: p.tip || p.label, 'aria-label': p.label,
    'aria-valuemin': p.min, 'aria-valuemax': p.max });
  k.innerHTML = '<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><circle cx="24" cy="24" r="19" class="kb"/><line class="ind" x1="24" y1="24" x2="24" y2="8"/></svg>';
  const val = h('div', { class: 'kv' });
  k.append(val, h('div', { class: 'kl' }, p.label));
  const draw = () => {
    const v = +b.get();
    k.querySelector('.ind')!.setAttribute('transform', `rotate(${-135 + (270 * (v - p.min)) / (p.max - p.min)} 24 24)`);
    val.textContent = fmt(v);
    k.setAttribute('aria-valuenow', String(v));
  };
  const put = (v: number) => { b.set(+clamp(Math.round(v / p.step) * p.step, p.min, p.max).toFixed(4)); draw(); };
  let y0 = 0, v0 = 0, active = false;
  k.addEventListener('pointerdown', (e) => { k.setPointerCapture(e.pointerId); y0 = e.clientY; v0 = +b.get(); active = true; k.focus(); });
  k.addEventListener('pointermove', (e) => { if (active) put(v0 + ((y0 - e.clientY) / (e.shiftKey ? 900 : 150)) * (p.max - p.min)); });
  const end = () => { if (active) { active = false; b.commit(); } };
  k.addEventListener('pointerup', end);
  k.addEventListener('pointercancel', end);
  k.addEventListener('dblclick', () => { put(+p.def); b.commit(); });
  k.addEventListener('keydown', (e) => {
    const step = p.step * (e.shiftKey ? 1 : Math.max(1, Math.round((p.max - p.min) / p.step / 50)));
    let v = +b.get();
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') v += step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') v -= step;
    else if (e.key === 'Home') v = p.min;
    else if (e.key === 'End') v = p.max;
    else return;
    e.preventDefault(); put(v); b.commit();
  });
  draw();
  return k;
}

export function vec3Row(label: string, arr: [number, number, number], step: number, onChange: () => void, commit: () => void): HTMLElement {
  const row = h('div', { class: 'row v' }, h('span', { class: 'lb' }, label));
  for (let i = 0; i < 3; i++) {
    row.append(h('input', {
      type: 'number', step, value: +arr[i].toFixed(3), 'aria-label': `${label} ${'XYZ'[i]}`,
      oninput: (e: Event) => { arr[i] = +(e.target as HTMLInputElement).value || 0; onChange(); },
      onchange: commit,
    }));
  }
  return row;
}
