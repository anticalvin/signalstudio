import { test, expect } from '@playwright/test';
import type { PNG } from 'pngjs';
import { decode, expectNoErrors, openApp, regionStats } from './helpers';

const rgb = (img: PNG, x: number, y: number) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };

test('click selects an object; selection shows in the hierarchy', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => window.awaken.loadFrame('clean'));
  await page.evaluate(() => window.awaken.app.drawPreview({ time: 0, dt: 0, seed: 7 }));
  const { client } = await page.evaluate(() => window.awaken.screenInfo('diag-fig-b'));
  await page.mouse.click(client.x, client.y);
  expect(await page.evaluate(() => window.awaken.store.selection)).toBe('diag-fig-b');
  await expect(page.locator('[role=treeitem][aria-selected=true]')).toContainText('Figure B');
  // Clicking empty paper deselects.
  await page.mouse.click(client.x, client.y + 300);
  expect(await page.evaluate(() => window.awaken.store.selection)).toBeNull();
  expectNoErrors(errs);
});

test('an object-targeted effect changes only that object', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => { window.awaken.loadFrame('clean'); window.awaken.select('diag-fig-b'); });
  const baseline = decode(await page.evaluate(() => window.awaken.renderPng()));

  await page.getByRole('tab', { name: 'Effects' }).click();
  await page.locator('.card', { hasText: 'Depth Map' }).getByRole('button', { name: 'Object' }).click();
  const fx = await page.evaluate(() => window.awaken.store.doc.fx);
  expect(fx).toHaveLength(1);
  expect(fx[0].target).toMatchObject({ type: 'object', ids: ['diag-fig-b'] });
  await expect(page.locator('#right h3')).toHaveText('Depth Map');

  const img = decode(await page.evaluate(() => window.awaken.renderPng()));
  // Figure B torso is now grey (no chroma) where it used to be skin-coloured...
  const [br, bg, bb] = rgb(baseline, 270, 305);
  const [r, g, b] = rgb(img, 270, 305);
  expect(Math.max(br, bg, bb) - Math.min(br, bg, bb), 'baseline torso has colour').toBeGreaterThan(30);
  expect(Math.max(r, g, b) - Math.min(r, g, b), 'torso is grey under Depth').toBeLessThanOrEqual(2);
  // ...while everything else is bit-identical, including the shadows and the other figure.
  let changedOutside = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    if (x >= 225 && x <= 310 && y >= 235 && y <= 440) continue; // Figure B's box
    const i = (y * img.width + x) * 4;
    if (img.data[i] !== baseline.data[i] || img.data[i + 1] !== baseline.data[i + 1] || img.data[i + 2] !== baseline.data[i + 2]) changedOutside++;
  }
  expect(changedOutside, 'pixels changed outside the targeted object').toBeLessThan(40);

  // Undo removes the effect and restores the original image exactly.
  await page.click('button[aria-label=Undo]');
  expect(await page.evaluate(() => window.awaken.store.doc.fx.length)).toBe(0);
  const after = decode(await page.evaluate(() => window.awaken.renderPng()));
  expect(after.data.equals(baseline.data)).toBe(true);
  expectNoErrors(errs);
});

test('hiding a node removes it from the render; show restores it', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.awaken.loadFrame('clean'));
  const shown = decode(await page.evaluate(() => window.awaken.renderPng()));
  await page.getByRole('button', { name: 'Hide Figure A' }).click();
  const hidden = decode(await page.evaluate(() => window.awaken.renderPng()));
  const fig = { x0: 20, y0: 235, x1: 95, y1: 435 };
  expect(regionStats(shown, fig).min).toBeLessThan(80);
  expect(regionStats(hidden, { ...fig, y1: 420 }).min, 'figure gone, shadow too').toBeGreaterThan(240);
  await page.getByRole('button', { name: 'Show Figure A' }).click();
  expect(decode(await page.evaluate(() => window.awaken.renderPng())).data.equals(shown.data)).toBe(true);
});

test('project JSON round-trips through load', async ({ page }) => {
  await openApp(page);
  const same: string[] = await page.evaluate(() => {
    window.awaken.loadFrame('surveillance');
    const before = window.awaken.store.toJson();
    window.awaken.store.loadJson(before);
    return [before, window.awaken.store.toJson()];
  });
  // Compare documents, not strings: key order is normalised by migration on the first load.
  expect(JSON.parse(same[1])).toEqual(JSON.parse(same[0]));
});

test('every control has an accessible name and a visible keyboard focus ring', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.awaken.loadFrame('surveillance'); window.awaken.select('diag-fig-a'); });
  for (const tab of ['Assets', 'Scene', 'Effects']) {
    await page.getByRole('tab', { name: tab }).click();
    const unnamed = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('button, input, select, [role=slider]').forEach((el) => {
        const e = el as HTMLInputElement;
        const name = e.getAttribute('aria-label') || e.title || (e.labels && e.labels[0]?.textContent) || e.textContent?.trim();
        if (!name) out.push(e.outerHTML.slice(0, 80));
      });
      return out;
    });
    expect(unnamed, `unnamed controls on ${tab}`).toEqual([]);
  }
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return [s.outlineStyle, s.outlineWidth]; });
  expect(outline[0]).not.toBe('none');
  expect(parseFloat(outline[1])).toBeGreaterThanOrEqual(2);
});

test('knobs are keyboard operable and expose slider semantics (CRT)', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => { window.awaken.loadFrame('clean'); window.awaken.store.addEffect('crt'); });
  const knob = page.locator('.knob[aria-label="Scanline strength"]');
  await expect(knob).toHaveAttribute('role', 'slider');
  const v0 = +(await knob.getAttribute('aria-valuenow'))!;
  await knob.focus();
  await page.keyboard.press('ArrowUp');
  const v1 = +(await knob.getAttribute('aria-valuenow'))!;
  expect(v1).toBeGreaterThan(v0);
  expect(await page.evaluate(() => window.awaken.store.doc.fx[0].params.scan)).toBeCloseTo(v1, 2);
  await knob.dblclick();
  expect(+(await knob.getAttribute('aria-valuenow'))!).toBeCloseTo(0.35, 2);
  expectNoErrors(errs);
});

test('phone-width layout has no horizontal overflow and a panel toggle', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true });
  const page = await ctx.newPage();
  const errs = await openApp(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('#btn-sheet')).toBeVisible();
  const canvas = await page.locator('#cv').boundingBox();
  expect(canvas!.width).toBeGreaterThan(250);
  await page.screenshot({ path: 'artifacts/mobile-375.png' });
  expectNoErrors(errs);
  await ctx.close();
});
