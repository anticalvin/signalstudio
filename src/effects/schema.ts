import type { TargetType } from '../doc/types';

export type ParamKind = 'range' | 'chk' | 'sel' | 'col';

export interface ParamDef {
  id: string;
  label: string;
  group: string;
  min: number;
  max: number;
  def: number | string;
  step: number;
  tip: string;
  kind: ParamKind;
  opts?: [number, string][];
}

export interface EffectDef {
  name: string;
  cat: 'Geometry' | 'Graphic' | 'Composition' | 'Finishing' | 'Analog';
  desc: string;
  targets: TargetType[];
  params: ParamDef[];
  /** Pixel-based effects whose output is only defined for the whole frame. */
  fullFrameOnly?: boolean;
}

const base = { group: 'Parameters', tip: '' };

export const range = (
  id: string, label: string, min: number, max: number, def: number, step: number,
  tip = '', group = 'Parameters',
): ParamDef => ({ ...base, id, label, min, max, def, step, tip, group, kind: 'range' });

export const chk = (id: string, label: string, def: 0 | 1, tip = '', group = 'Parameters'): ParamDef =>
  ({ ...base, id, label, min: 0, max: 1, def, step: 1, tip, group, kind: 'chk' });

export const sel = (
  id: string, label: string, def: number, opts: [number, string][], tip = '', group = 'Parameters',
): ParamDef => ({ ...base, id, label, min: 0, max: opts.length - 1, def, step: 1, tip, group, kind: 'sel', opts });

export const col = (id: string, label: string, def: string, group = 'Parameters'): ParamDef =>
  ({ ...base, id, label, min: 0, max: 0, def, step: 0, tip: '', group, kind: 'col' });
