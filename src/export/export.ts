import * as THREE from 'three';

/** Largest side we attempt before M6's tiled renderer exists. */
export function maxSingleShot(renderer: THREE.WebGLRenderer): number {
  const gl = renderer.getContext();
  return Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE));
}

/** Read an 8-bit RGBA render target into a top-down canvas. */
export function targetToCanvas(renderer: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget): HTMLCanvasElement {
  const { width: w, height: h } = rt;
  const px = new Uint8Array(w * h * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, w, h, px);
  const flipped = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) flipped.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(flipped, w, h), 0, 0);
  return c;
}

export const canvasToBlob = (c: HTMLCanvasElement): Promise<Blob> =>
  new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
