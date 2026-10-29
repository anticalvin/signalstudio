import type { EffectInstance, EffectType } from '../doc/types';
import type { EffectDef, ParamDef } from './schema';
import { chk, col, range, sel } from './schema';
import { CRT_PARAMS } from './crt-params';

const inkParams = (d: Record<string, number | string> = {}): ParamDef[] => {
  const v = <T extends number | string>(id: string, x: T): T => (d[id] !== undefined ? (d[id] as T) : x);
  return [
    range('exposure', 'Exposure', -3, 3, v('exposure', 0), 0.05, 'Stops applied to luminance before thresholding.', 'Tone'),
    range('contrast', 'Contrast', 0.2, 4, v('contrast', 1.6), 0.05, 'Contrast around mid grey.', 'Tone'),
    range('density', 'Ink density', -0.5, 0.5, v('density', 0), 0.01, 'Shifts tones toward more or less ink.', 'Tone'),
    range('lo', 'Shadow crush', 0, 0.5, v('lo', 0), 0.01, 'Luminance below this becomes solid ink.', 'Tone'),
    range('hi', 'Highlight clip', 0.5, 1, v('hi', 1), 0.01, 'Luminance above this becomes paper.', 'Tone'),
    range('threshold', 'Threshold', 0, 1, v('threshold', 0.62), 0.01, 'Ink/paper switching point.', 'Dither'),
    sel('dither', 'Dither mode', v('dither', 1), [[0, 'Threshold'], [1, 'Bayer 8×8'], [2, 'Blue noise']],
      'Threshold: hard cut. Bayer: ordered 8×8. Blue noise: tiled noise texture.', 'Dither'),
    range('ditherScale', 'Dither scale', 1, 12, v('ditherScale', 3), 0.5, 'Cell size in composition pixels, so preview and export match.', 'Dither'),
    range('ditherAmt', 'Dither strength', 0, 1, v('ditherAmt', 0.8), 0.01, 'How far the pattern moves the threshold.', 'Dither'),
    range('edge', 'Edge intensity', 0, 2, v('edge', 0.8), 0.01, 'Ink lines from luminance, object-ID, depth and normal edges.', 'Edges and ink'),
    range('detail', 'Detail preservation', 0, 1, v('detail', 0.6), 0.01, 'Local contrast boost and weight of surface-normal edges.', 'Edges and ink'),
    range('spread', 'Ink spread', -1, 1, v('spread', 0), 0.01, 'Positive grows ink, negative erodes it.', 'Edges and ink'),
    range('grain', 'Grain amount', 0, 1, v('grain', 0.15), 0.01, 'Static, seeded grain.', 'Edges and ink'),
    range('grainScale', 'Grain scale', 1, 8, v('grainScale', 2), 0.5, 'Grain cell size in composition pixels.', 'Edges and ink'),
    range('speck', 'Speckle', 0, 0.02, v('speck', 0), 0.0005, 'Sparse random ink specks on the paper, like print dust.', 'Edges and ink'),
    col('inkC', 'Ink colour', v('inkC', '#000000'), 'Colour'),
    col('paperC', 'Paper colour', v('paperC', '#ffffff'), 'Colour'),
    chk('invert', 'Invert', 0, '', 'Colour'),
  ];
};

const annotationParams: ParamDef[] = [
  chk('boxes', 'Bounding boxes', 1, 'Frames from projected object bounds.', 'Annotations'),
  col('boxC', 'Annotation colour', '#b3202e', 'Annotations'),
  range('thick', 'Frame thickness', 1, 8, 1, 0.5, 'Composition pixels.', 'Annotations'),
  chk('labels', 'Labels', 1, 'Layer name, or its annotation label if set.', 'Annotations'),
  chk('ids', 'Object IDs', 1, 'Scene object number. This is metadata, not a detection result.', 'Annotations'),
  chk('caption', 'Caption strip', 1, '', 'Annotations'),
  range('capSize', 'Caption size', 8, 40, 14, 1, 'Composition pixels.', 'Annotations'),
  sel('capPos', 'Caption position', 0, [[0, 'Below box'], [1, 'Above box']], '', 'Annotations'),
  range('pad', 'Box padding', 0, 60, 12, 1, 'Composition pixels around the projected bounds.', 'Annotations'),
  chk('lines', 'Tracking lines', 0, 'Joins annotated objects in layer order.', 'Annotations'),
];

export const EFFECTS: Record<EffectType, EffectDef> = {
  depth: {
    name: 'Depth Map', cat: 'Geometry',
    desc: 'Camera-space depth between near and far colours. Reads the geometry buffer.',
    targets: ['object', 'group', 'scene'],
    params: [
      chk('auto', 'Auto range', 1, 'Fit near and far to the visible objects, so the nearest object is light and the farthest dark.'),
      range('near', 'Near', 0, 60, 5, 0.1, 'Distance mapped to the near colour (used when Auto range is off).'),
      range('far', 'Far', 1, 120, 14, 0.1, 'Distance mapped to the far colour.'),
      range('contrast', 'Contrast', 0.2, 3, 1, 0.01),
      range('gamma', 'Gamma', 0.2, 3, 1, 0.01),
      chk('invert', 'Invert', 0),
      col('bg', 'Background', '#000000'),
      col('nearC', 'Near colour', '#ffffff'),
      col('farC', 'Far colour', '#000000'),
    ],
  },
  silhouette: {
    name: 'Silhouette', cat: 'Geometry',
    desc: 'Flat fill from object coverage in the ID buffer, not from shaded pixels.',
    targets: ['object', 'group', 'scene'],
    params: [
      col('fill', 'Fill colour', '#000000'),
      col('bg', 'Background colour', '#ffffff'),
      sel('bgMode', 'Background', 0, [[0, 'Keep scene'], [1, 'Solid colour']], 'Keep the scene behind the silhouettes, or replace it.'),
      chk('smooth', 'Edge smoothing', 1, 'Averages coverage over neighbouring pixels.'),
      chk('outline', 'Outline', 0),
      col('outlineC', 'Outline colour', '#ff3b1f'),
      range('outlineW', 'Outline width', 1, 8, 2, 0.5, 'Composition pixels.'),
      range('depthTint', 'Depth tint', 0, 1, 0, 0.01, 'Fades the fill toward the background colour with distance.'),
    ],
  },
  ink: {
    name: 'Signal Ink', cat: 'Graphic',
    desc: 'Threshold, ordered or blue-noise dither, edges and grain on the rendered image.',
    targets: ['object', 'group', 'scene'], params: inkParams(),
  },
  surv: {
    name: 'Surveillance', cat: 'Composition',
    desc: 'Monochrome ink treatment plus tracking frames computed from scene objects.',
    targets: ['object', 'group', 'scene'],
    params: [
      ...inkParams({ contrast: 1.6, threshold: 0.68, dither: 2, ditherScale: 1.6, ditherAmt: 0.9, edge: 0.15, detail: 0.5, grain: 0.05, grainScale: 1.5, speck: 0.003 }),
      ...annotationParams,
    ],
  },
  grade: {
    name: 'Colour Grade', cat: 'Finishing',
    desc: 'Exposure, contrast, saturation and vignette in linear light.',
    targets: ['scene', 'output'],
    params: [
      range('exposure', 'Exposure', -3, 3, 0, 0.05),
      range('contrast', 'Contrast', 0.5, 2, 1, 0.01),
      range('saturation', 'Saturation', 0, 2, 1, 0.01),
      range('vignette', 'Vignette', 0, 1, 0, 0.01),
    ],
  },
  crt: {
    name: 'Analog CRT', cat: 'Analog',
    desc: 'Display simulation: scan, beam, phosphor and sync instability. Always runs last.',
    targets: ['output'], params: CRT_PARAMS, fullFrameOnly: true,
  },
};

export const EFFECT_TYPES = Object.keys(EFFECTS) as EffectType[];

export function effectDefaults(type: EffectType): Record<string, number | string> {
  return Object.fromEntries(EFFECTS[type].params.map((p) => [p.id, p.def]));
}

export interface Constraint {
  effectId: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Explicit statement of every combination the pipeline cannot honour. */
export function checkStack(fx: EffectInstance[]): Constraint[] {
  const out: Constraint[] = [];
  const crts = fx.filter((f) => f.type === 'crt');
  crts.slice(1).forEach((f) =>
    out.push({ effectId: f.id, severity: 'error', message: 'Only one Analog CRT is supported; this one is ignored.' }));
  for (const f of fx) {
    const def = EFFECTS[f.type];
    if (!def.targets.includes(f.target.type)) {
      out.push({ effectId: f.id, severity: 'error', message: `${def.name} cannot target ${f.target.type}.` });
    }
  }
  const inkLike = fx.filter((f) => f.enabled && (f.type === 'ink' || f.type === 'surv') && f.target.type === 'scene');
  if (inkLike.length > 1) {
    inkLike.slice(1).forEach((f) =>
      out.push({ effectId: f.id, severity: 'warning', message: 'Two scene-wide ink effects stack: the second dithers an already 1-bit image.' }));
  }
  return out;
}
