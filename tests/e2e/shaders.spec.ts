import { test, expect } from '@playwright/test';
import { openApp, expectNoErrors } from './helpers';

const EFFECTS = ['depth', 'silhouette', 'ink', 'surv', 'grade', 'crt'] as const;

test.describe('shader programs', () => {
  for (const type of EFFECTS) {
    test(`${type}: compiles and renders without shader errors`, async ({ page }) => {
      const errs = await openApp(page);
      await page.evaluate((t) => {
        window.awaken.loadFrame('clean');
        window.awaken.store.addEffect(t as any);
      }, type);
      await page.evaluate(() => window.awaken.compileAll());
      await page.evaluate(() => window.awaken.renderPng());
      expect(await page.evaluate(() => window.awaken.shaderErrors())).toEqual([]);
      expectNoErrors(errs);
    });
  }

  test('a broken program is reported to the user, not swallowed', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.awaken.injectBrokenShader());
    await expect.poll(() => page.evaluate(() => window.awaken.shaderErrors().length)).toBeGreaterThan(0);
    const banner = page.locator('#errors');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Shader error');
  });
});
