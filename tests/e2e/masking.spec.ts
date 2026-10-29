import { test, expect, type Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { decode, expectNoErrors, openApp, saveArtifact } from './helpers';

const px = (img: PNG, x: number, y: number) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const lum = (img: PNG, x: number, y: number) => { const [r, g, b] = px(img, x, y); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const isGreen = (img: PNG, x: number, y: number) => { const [r, g, b] = px(img, x, y); return g > r + 30 && g > b + 30; };

async function setup(page: Page, chairZ: number, fx: { type: 'silhouette' | 'ink'; target: string }) {
  await page.evaluate(([z, f]) => {
    const { store } = window.awaken;
    window.awaken.loadFrame('clean');
    const chair = store.doc.nodes.find((n) => n.id === 'diag-chair')!;
    chair.pos = [0.45, 0, z as number]; chair.scl = [1.3, 1.3, 1.3]; chair.rot = [0, -20, 0];
    const e = store.addEffect((f as any).type, { type: 'object', ids: [(f as any).target], group: '' });
    if ((f as any).type === 'silhouette') e.params.bgMode = 0;
    store.commit();
  }, [chairZ, fx] as const);
}

const render = async (page: Page, w = 540, h = 675) => decode(await page.evaluate(([a, b]) => window.awaken.renderPng(a, b), [w, h]));
const baseline = async (page: Page, chairZ: number) => {
  await setup(page, chairZ, { type: 'silhouette', target: 'diag-fig-b' });
  await page.evaluate(() => { window.awaken.store.doc.fx[0].enabled = false; window.awaken.store.touch(); });
  const img = await render(page);
  await page.evaluate(() => { window.awaken.store.doc.fx[0].enabled = true; window.awaken.store.touch(); });
  return img;
};

test('chair IN FRONT of the targeted figure stays untouched (occlusion)', async ({ page }) => {
  const errs = await openApp(page);
  const base = await baseline(page, 1.6);
  const img = await render(page);
  saveArtifact('mask-chair-in-front.png', await page.evaluate(() => window.awaken.renderPng()));
  let green = 0, kept = 0, black = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (isGreen(base, x, y)) { green++; if (Math.abs(lum(img, x, y) - lum(base, x, y)) < 6) kept++; }
    if (lum(img, x, y) < 25) black++;
  }
  expect(green, 'chair visible in baseline').toBeGreaterThan(1500);
  expect(kept / green, 'fraction of chair pixels unchanged by the figure effect').toBeGreaterThan(0.985);
  expect(black, 'figure is silhouetted').toBeGreaterThan(1500);
  expectNoErrors(errs);
});

test('chair BEHIND the targeted figure: figure covers it, chair keeps its colour', async ({ page }) => {
  const errs = await openApp(page);
  const base = await baseline(page, -1.4);
  const img = await render(page);
  let greenBase = 0, greenNow = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) { if (isGreen(base, x, y)) greenBase++; if (isGreen(img, x, y)) greenNow++; }
  expect(greenBase).toBeGreaterThan(800);
  expect(greenNow / greenBase, 'visible chair pixels survive the figure effect').toBeGreaterThan(0.97);
  expectNoErrors(errs);
});

test('thin signpost keeps a continuous silhouette (no dropouts) and has antialiased edges', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => {
    window.awaken.loadFrame('clean');
    const e = window.awaken.store.addEffect('silhouette', { type: 'object', ids: ['diag-sign'], group: '' });
    e.params.bgMode = 0;
  });
  const img = await render(page, 540, 675);
  let rows = 0, gaps = 0, soft = 0;
  for (let y = 270; y < 390; y++) {
    rows++;
    let dark = 0, mid = 0;
    for (let x = 170; x < 205; x++) { const l = lum(img, x, y); if (l < 40) dark++; else if (l < 225) mid++; }
    if (dark + mid === 0) gaps++;
    if (mid > 0) soft++;
  }
  expect(gaps, 'rows where the 3px-wide pole vanished').toBe(0);
  expect(soft / rows, 'rows with fractional (antialiased) edge pixels').toBeGreaterThan(0.9);
  expectNoErrors(errs);
});

test('Signal Ink on one figure leaves its shadow and everything else bit-identical', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => window.awaken.loadFrame('clean'));
  const base = await render(page);
  await page.evaluate(() => window.awaken.store.addEffect('ink', { type: 'object', ids: ['diag-fig-b'], group: '' }));
  const img = await render(page);
  saveArtifact('mask-ink-fig-b.png', await page.evaluate(() => window.awaken.renderPng()));
  let shadowDiff = 0, shadowN = 0, outside = 0, inside = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const same = lum(img, x, y) === lum(base, x, y);
    if (x >= 305 && x <= 370 && y >= 428 && y <= 446) { shadowN++; if (!same) shadowDiff++; }
    const inBox = x >= 218 && x <= 316 && y >= 228 && y <= 446;
    if (!inBox && !same) outside++;
    if (inBox && !same) inside++;
  }
  expect(shadowDiff / shadowN, 'shadow pixels changed').toBeLessThan(0.01);
  expect(outside, 'pixels changed outside the figure').toBeLessThan(30);
  expect(inside, 'figure was actually processed').toBeGreaterThan(2000);
  expectNoErrors(errs);
});
