import { test, expect } from '@playwright/test';
import { openApp, expectNoErrors, saveArtifact, decode } from './helpers';

test('app boots, compiles every shader program, renders without errors', async ({ page }) => {
  const errs = await openApp(page);
  const res = await page.evaluate(() => window.awaken.compileAll());
  expect(res.errors, 'shader compile errors').toEqual([]);
  expect(res.programs.length).toBeGreaterThanOrEqual(8);
  const b64 = await page.evaluate(() => window.awaken.renderPng());
  const img = decode(b64);
  saveArtifact('smoke-clean.png', b64);
  expect([img.width, img.height]).toEqual([540, 675]);
  await page.screenshot({ path: 'artifacts/smoke-ui.png' });
  expectNoErrors(errs);
});
