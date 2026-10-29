import type { EffectType } from '../doc/types';
import { EFFECTS } from '../effects/registry';
import type { ParamDef } from '../effects/schema';
import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import common from './shaders/common.glsl?raw';
import depth from './shaders/depth.glsl?raw';
import silhouette from './shaders/silhouette.glsl?raw';
import ink from './shaders/ink.glsl?raw';
import grade from './shaders/grade.glsl?raw';
import crt from './shaders/crt.glsl?raw';
import geoVert from './shaders/geo.vert.glsl?raw';
import geoFrag from './shaders/geo.frag.glsl?raw';
import overlay from './shaders/overlay.glsl?raw';
import blit from './shaders/blit.glsl?raw';

const BODIES: Partial<Record<EffectType, string>> = { depth, silhouette, ink, surv: ink, grade };

export const uniformDecl = (params: ParamDef[]): string =>
  params.map((p) => `uniform ${p.kind === 'col' ? 'vec3' : 'float'} u_${p.id};`).join('\n');

export function effectFragment(type: EffectType): string {
  const body = BODIES[type];
  if (!body) throw new Error(`Effect ${type} has no per-object pass`);
  return `${common}\n${uniformDecl(EFFECTS[type].params)}\n${body}`;
}

export const crtFragment = (): string =>
  crt.replace('varying vec2 vUv;', `${uniformDecl(EFFECTS.crt.params)}\nvarying vec2 vUv;`);

export const SHADERS = { fullscreenVert, geoVert, geoFrag, overlay, blit } as const;

/** Every program the renderer builds, by name, as plain GLSL (before three.js adds its prefix). */
export function allProgramSources(): Record<string, { vertex: string; fragment: string }> {
  const out: Record<string, { vertex: string; fragment: string }> = {};
  for (const t of Object.keys(BODIES) as EffectType[]) {
    if (t === 'surv') continue; // identical program to ink plus a different parameter set
    out[`effect-${t}`] = { vertex: fullscreenVert, fragment: effectFragment(t) };
  }
  out['effect-surv'] = { vertex: fullscreenVert, fragment: effectFragment('surv') };
  out.crt = { vertex: fullscreenVert, fragment: crtFragment() };
  out.geometry = { vertex: geoVert, fragment: geoFrag };
  out.overlay = { vertex: fullscreenVert, fragment: overlay };
  out.blit = { vertex: fullscreenVert, fragment: blit };
  return out;
}
