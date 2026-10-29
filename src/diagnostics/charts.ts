import * as THREE from 'three';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Type at falling sizes, for judging blur, dither and CRT bandwidth. */
export function textChart(): THREE.CanvasTexture {
  const [c, g] = canvas(768, 1024);
  g.fillStyle = '#fff'; g.fillRect(0, 0, 768, 1024);
  g.fillStyle = '#000';
  g.font = '700 54px "Courier New", monospace'; g.fillText('AWAKEN', 40, 90);
  g.font = '700 28px "Courier New", monospace'; g.fillText('SIGNAL STUDIO 0123456789', 40, 140);
  const sizes = [40, 32, 24, 18, 14, 11, 9, 7];
  let y = 200;
  for (const s of sizes) {
    g.font = `${s}px "Courier New", monospace`;
    g.fillText(`${s}px  the quick brown fox jumps over the lazy dog`, 40, y);
    y += s + 18;
  }
  g.fillStyle = '#000'; g.fillRect(40, y + 10, 688, 60);
  g.fillStyle = '#fff'; g.font = '700 28px "Courier New", monospace'; g.fillText('REVERSED TEXT 0123456789', 56, y + 50);
  g.fillStyle = '#000';
  for (let i = 0; i < 8; i++) g.fillRect(40 + i * 86, y + 100, 1 + i, 160);
  g.strokeStyle = '#000'; g.lineWidth = 1;
  g.strokeRect(40.5, 40.5, 687, 943);
  return texture(c);
}

/**
 * Six by four patch chart using the published sRGB approximations of the 24-patch
 * reference colour target, in the standard row order.
 */
export const COLOUR_PATCHES: [number, number, number][] = [
  [115, 82, 68], [194, 150, 130], [98, 122, 157], [87, 108, 67], [133, 128, 177], [103, 189, 170],
  [214, 126, 44], [80, 91, 166], [193, 90, 99], [94, 60, 108], [157, 188, 64], [224, 163, 46],
  [56, 61, 150], [70, 148, 73], [175, 54, 60], [231, 199, 31], [187, 86, 149], [8, 133, 161],
  [243, 243, 242], [200, 200, 200], [160, 160, 160], [122, 122, 121], [85, 85, 85], [52, 52, 52],
];

export function colourChart(): THREE.CanvasTexture {
  const [c, g] = canvas(768, 512);
  g.fillStyle = '#222'; g.fillRect(0, 0, 768, 512);
  COLOUR_PATCHES.forEach(([r, gr, b], i) => {
    const x = (i % 6) * 120 + 24, y = Math.floor(i / 6) * 120 + 16;
    g.fillStyle = `rgb(${r},${gr},${b})`;
    g.fillRect(x, y, 108, 108);
  });
  return texture(c);
}

/** Single-pixel lines, checkers and a zone plate for aliasing and moire. */
export function gridChart(): THREE.CanvasTexture {
  const [c, g] = canvas(1024, 768);
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 768);
  g.strokeStyle = '#fff'; g.lineWidth = 1;
  for (let x = 0; x <= 1024; x += 64) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, 768); g.stroke(); }
  for (let y = 0; y <= 768; y += 64) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(1024, y + 0.5); g.stroke(); }
  g.fillStyle = '#fff';
  for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) g.fillRect(i * 8, 640 + j * 8, 8, 8);
  for (let i = 1; i <= 24; i++) { g.beginPath(); g.arc(512, 384, i * i * 0.4 + 2, 0, Math.PI * 2); g.stroke(); }
  return texture(c);
}

export const CHARTS = { 'chart-text': textChart, 'chart-colour': colourChart, 'chart-grid': gridChart } as const;
export type ChartKey = keyof typeof CHARTS;
