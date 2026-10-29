import { describe, expect, it } from 'vitest';
import { BLUE_NOISE_SIZE, blueNoiseBytes } from '../../src/render/noise';

const N = BLUE_NOISE_SIZE;

/** Mean power in an annulus of the 2D spectrum (naive separable DFT; N is small). */
function bandPower(img: Float64Array, lo: number, hi: number): number {
  const mean = img.reduce((a, b) => a + b, 0) / img.length;
  const cos = new Float64Array(N * N), sin = new Float64Array(N * N);
  for (let k = 0; k < N; k++) for (let x = 0; x < N; x++) { const a = (2 * Math.PI * k * x) / N; cos[k * N + x] = Math.cos(a); sin[k * N + x] = Math.sin(a); }
  // rows
  const re = new Float64Array(N * N), im = new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let kx = 0; kx < N; kx++) {
    let r = 0, i = 0;
    for (let x = 0; x < N; x++) { const v = img[y * N + x] - mean; r += v * cos[kx * N + x]; i -= v * sin[kx * N + x]; }
    re[y * N + kx] = r; im[y * N + kx] = i;
  }
  let sum = 0, count = 0;
  for (let ky = 0; ky < N; ky++) for (let kx = 0; kx < N; kx++) {
    const fx = kx > N / 2 ? kx - N : kx, fy = ky > N / 2 ? ky - N : ky;
    const rad = Math.hypot(fx, fy);
    if (rad < lo || rad >= hi) continue;
    let r = 0, i = 0;
    for (let y = 0; y < N; y++) {
      const c = cos[ky * N + y], s = -sin[ky * N + y];
      r += re[y * N + kx] * c - im[y * N + kx] * s; i += re[y * N + kx] * s + im[y * N + kx] * c;
    }
    sum += r * r + i * i; count++;
  }
  return sum / count;
}

function whiteNoise(): Float64Array {
  let s = 99; const out = new Float64Array(N * N);
  for (let i = 0; i < out.length; i++) out[i] = ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 255;
  return out;
}

describe('shipped blue noise (void-and-cluster)', () => {
  const blue = Float64Array.from(blueNoiseBytes());
  const white = whiteNoise();

  it('is the advertised size and uses the full tonal range evenly', () => {
    expect(blue.length).toBe(N * N);
    const hist = new Array(8).fill(0);
    for (const v of blue) hist[Math.min(7, v >> 5)]++;
    for (const h of hist) expect(h / blue.length).toBeGreaterThan(0.11), expect(h / blue.length).toBeLessThan(0.14);
  });

  it('has strongly suppressed low-frequency energy compared with white noise', () => {
    const lowBlue = bandPower(blue, 1, 8), lowWhite = bandPower(white, 1, 8);
    expect(lowBlue / lowWhite, 'low-frequency power ratio (blue / white)').toBeLessThan(0.1);
  });

  it('keeps high-frequency energy (it is blue, not just smooth)', () => {
    const hiBlue = bandPower(blue, 40, 64), hiWhite = bandPower(white, 40, 64);
    expect(hiBlue / hiWhite).toBeGreaterThan(0.8);
  });

  it('tiles: wrap-around neighbours are as decorrelated as interior ones', () => {
    const diff = (a: number, b: number) => Math.abs(blue[a] - blue[b]);
    let edge = 0, inner = 0;
    for (let y = 0; y < N; y++) { edge += diff(y * N, y * N + N - 1); inner += diff(y * N + 10, y * N + 11); }
    expect(edge / inner).toBeGreaterThan(0.5);
    expect(edge / inner).toBeLessThan(2);
  });
});
