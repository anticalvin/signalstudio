import { expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export const ARTIFACTS = join(process.cwd(), 'artifacts');
export const GOLDENS = join(process.cwd(), 'tests', 'goldens');
mkdirSync(ARTIFACTS, { recursive: true });
mkdirSync(GOLDENS, { recursive: true });

export interface PageErrors { console: string[]; page: string[] }

/** Open the app and fail loudly on any page error or console error (shader errors included). */
export async function openApp(page: Page): Promise<PageErrors> {
  const errs: PageErrors = { console: [], page: [] };
  page.on('console', (m) => { if (m.type() === 'error') errs.console.push(m.text()); });
  page.on('pageerror', (e) => errs.page.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as any).awaken?.ready === true, undefined, { timeout: 60_000 });
  return errs;
}

export function expectNoErrors(errs: PageErrors): void {
  expect(errs.page, 'uncaught page errors').toEqual([]);
  expect(errs.console, 'console errors').toEqual([]);
}

export const decode = (b64: string): PNG => PNG.sync.read(Buffer.from(b64, 'base64'));

export function saveArtifact(name: string, b64: string): string {
  const p = join(ARTIFACTS, name);
  writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}

export interface Tolerance {
  /** pixelmatch per-pixel colour distance threshold, 0..1. */
  threshold: number;
  /** Maximum fraction of pixels allowed to differ. */
  maxDiffRatio: number;
}

/** Documented default: tolerates driver-level rasterisation noise, rejects visible change. */
export const DEFAULT_TOLERANCE: Tolerance = { threshold: 0.1, maxDiffRatio: 0.005 };

/**
 * Compare against a stored golden. With UPDATE_GOLDENS=1 (or no golden yet and CI unset) the golden is written.
 * On mismatch a diff image is written to /artifacts.
 */
export function matchGolden(name: string, b64: string, tol: Tolerance = DEFAULT_TOLERANCE): { diffRatio: number; wrote: boolean } {
  const path = join(GOLDENS, name);
  if (process.env.UPDATE_GOLDENS === '1' || !existsSync(path)) {
    if (process.env.CI && !process.env.UPDATE_GOLDENS) throw new Error(`Missing golden ${name}`);
    writeFileSync(path, Buffer.from(b64, 'base64'));
    return { diffRatio: 0, wrote: true };
  }
  const a = decode(b64), g = PNG.sync.read(readFileSync(path));
  expect([a.width, a.height], `${name} size`).toEqual([g.width, g.height]);
  const diff = new PNG({ width: a.width, height: a.height });
  const n = pixelmatch(a.data, g.data, diff.data, a.width, a.height, { threshold: tol.threshold });
  const ratio = n / (a.width * a.height);
  if (ratio > tol.maxDiffRatio) writeFileSync(join(ARTIFACTS, name.replace('.png', '.diff.png')), PNG.sync.write(diff));
  return { diffRatio: ratio, wrote: false };
}

export interface Region { x0: number; y0: number; x1: number; y1: number }

export function regionStats(img: PNG, r: Region) {
  let sum = 0, n = 0, min = 255, max = 0;
  const lum: number[] = [];
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    const i = (y * img.width + x) * 4;
    const l = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    sum += l; n++; min = Math.min(min, l); max = Math.max(max, l); lum.push(l);
  }
  return { mean: sum / n, min, max, n, lum };
}
