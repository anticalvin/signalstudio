import { test, expect, type Page } from '@playwright/test';
import { decode, expectNoErrors, openApp, saveArtifact } from './helpers';

const buildGlb = (page: Page) => page.evaluate(() => window.awaken.makeMessyGlb());

test('GLB import: metres, grounded, centred, repaired, one object, thumbnail, persists', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => window.awaken.loadFrame('clean'));
  const bytes = await buildGlb(page);
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.locator('#file-import').setInputFiles({ name: 'scan.glb', mimeType: 'model/gltf-binary', buffer: Buffer.from(bytes) });
  await expect(page.locator('#toast')).toContainText('Imported scan.glb');

  const info = await page.evaluate(() => {
    const { store, app } = window.awaken;
    const n = store.selected!;
    const no = app.world.objects.get(n.id)!;
    const box = app.world.bounds(n.id);
    const mats = no.meshes.map((m) => (m.material as any));
    return { kind: n.kind, min: box.min, max: box.max, meshes: no.meshes.length,
      sides: mats.map((m) => m.side), transparent: mats.map((m) => m.transparent), normals: no.meshes.every((m) => !!m.geometry.attributes.normal),
      nodes: store.doc.nodes.filter((x) => x.kind === 'glb').length, thumb: [...app.assets.records.values()][0]?.thumb?.length ?? 0 };
  });
  expect(info.kind).toBe('glb');
  expect(info.nodes, 'whole file is one logical object').toBe(1);
  expect(info.max.y - info.min.y, 'height in metres (170 cm -> 1.7 m)').toBeCloseTo(1.7, 1);
  expect(info.min.y, 'grounded').toBeCloseTo(0, 2);
  expect((info.max.x + info.min.x) / 2, 'centred x').toBeCloseTo(0, 2);
  expect((info.max.z + info.min.z) / 2, 'centred z').toBeCloseTo(0, 2);
  expect(info.sides.every((s: number) => s === 2), 'double-sided').toBe(true);
  expect(info.transparent.every((t: boolean) => !t), 'opaque material not left transparent').toBe(true);
  expect(info.normals).toBe(true);
  expect(info.thumb, 'thumbnail generated').toBeGreaterThan(500);

  // Renders in the scene with a shadow, and works with an object-targeted effect.
  const b64 = await page.evaluate(() => window.awaken.renderPng());
  saveArtifact('m2-imported.png', b64);
  expect(decode(b64).data.some((v, i) => i % 4 === 0 && v < 200 && v > 100), 'object pixels visible').toBe(true);
  await page.evaluate(() => { window.awaken.store.addEffect('depth', { type: 'object', ids: [window.awaken.store.selection!], group: '' }); });
  expect(await page.evaluate(() => window.awaken.shaderErrors())).toEqual([]);

  // Survives reload: the asset comes back from IndexedDB for a saved project.
  const json = await page.evaluate(() => window.awaken.store.toJson());
  await page.reload();
  await page.waitForFunction(() => (window as any).awaken?.ready === true);
  await page.evaluate((j) => window.awaken.store.loadJson(j), json);
  await expect.poll(() => page.evaluate(() => {
    const { store, app } = window.awaken;
    const n = store.doc.nodes.find((x) => x.kind === 'glb')!;
    return app.world.objects.get(n.id)?.meshes.length ?? 0;
  }), { timeout: 10000 }).toBeGreaterThan(0);
  expectNoErrors(errs);
});

test('transparent PNG becomes an alpha-tested cut-out in beauty and ID passes', async ({ page }) => {
  const errs = await openApp(page);
  await page.evaluate(() => window.awaken.loadFrame('clean'));
  // 64x64 PNG: opaque red disc on a fully transparent background.
  const png = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!; g.fillStyle = '#d02020'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill();
    return Array.from(new Uint8Array(await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!)))).arrayBuffer()));
  });
  await page.getByRole('tab', { name: 'Assets' }).click();
  await page.locator('#file-import').setInputFiles({ name: 'disc.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#toast')).toContainText('Imported disc.png');
  await page.evaluate(() => window.awaken.store.addEffect('silhouette'));
  const img = decode(await page.evaluate(() => window.awaken.renderPng()));
  saveArtifact('m2-cutout-silhouette.png', await page.evaluate(() => window.awaken.renderPng()));
  // Silhouette is built from the ID buffer: black where the disc is, white in its transparent corners.
  const sc = await page.evaluate(() => { const i = window.awaken.screenInfo(window.awaken.store.selection!); return i; });
  const at = (x: number, y: number) => img.data[(Math.round(y) * img.width + Math.round(x)) * 4];
  const cx = sc.center.x * (img.width / 596), cy = sc.center.y * (img.height / 745);
  expect(at(cx, cy), 'disc centre filled').toBeLessThan(40);
  const half = Math.abs(sc.corners[1].x - sc.corners[0].x) * (img.width / 596) / 2;
  expect(at(cx - half * 0.95, cy - half * 0.95 * 1.0), 'transparent corner is background').toBeGreaterThan(215);
  expectNoErrors(errs);
});
