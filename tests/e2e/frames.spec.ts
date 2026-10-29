import { test, expect, type Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { COLOUR_PATCHES } from '../../src/diagnostics/charts';
import { decode, expectNoErrors, matchGolden, openApp, regionStats, saveArtifact } from './helpers';

/*
 * Acceptance for the five reference frames.
 *
 * IMPORTANT: the reference screenshots (/reference) were not present when this suite was written.
 * Every assertion below is derived from the written description of the frames, applied to the
 * procedural diagnostic scene. Nothing here proves a visual match to the real references; it
 * proves the measurable properties the descriptions name. Goldens only catch regressions.
 */

const lum = (img: PNG, x: number, y: number) => {
  const i = (y * img.width + x) * 4;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
};
const rgb = (img: PNG, x: number, y: number) => { const i = (y * img.width + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2]]; };
const isCrimson = (r: number, g: number, b: number) => r - g > 60 && r - b > 50;

async function frame(page: Page, name: Parameters<Window['awaken']['loadFrame']>[0], w = 540, h = 675) {
  await page.evaluate((n) => window.awaken.loadFrame(n), name);
  return page.evaluate(([W, H]) => window.awaken.renderPng(W, H), [w, h]);
}

function crimsonBBox(img: PNG) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const [r, g, b] = rgb(img, x, y);
    if (isCrimson(r, g, b)) { n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  return { x0, y0, x1, y1, n };
}

test.describe('frame 1: clean studio', () => {
  test('white void, no floor, soft grey shadows, objects present', async ({ page }) => {
    const errs = await openApp(page);
    const b64 = await frame(page, 'clean');
    saveArtifact('frame1-clean.png', b64);
    const img = decode(b64);

    for (const [x, y] of [[0, 0], [img.width - 20, 0], [0, img.height - 20], [img.width - 20, img.height - 20]]) {
      expect(regionStats(img, { x0: x, y0: y, x1: x + 20, y1: y + 20 }).min, `corner ${x},${y}`).toBeGreaterThanOrEqual(253);
    }
    // No visible floor: the whole band below the shadows is pure paper white.
    const floor = regionStats(img, { x0: 0, y0: 480, x1: img.width, y1: img.height });
    expect(floor.lum.filter((l) => l < 250).length / floor.n, 'non-white fraction below the shadows').toBeLessThan(0.001);

    // Shadow of the left figure: grey, never black, with a soft (low-gradient) falloff.
    const sh = regionStats(img, { x0: 100, y0: 432, x1: 150, y1: 442 });
    expect(sh.mean).toBeGreaterThan(190); expect(sh.mean).toBeLessThan(245); expect(sh.min).toBeGreaterThan(150);
    const col: number[] = [];
    for (let y = 415; y < 465; y++) col.push(lum(img, 120, y));
    const maxStep = Math.max(...col.slice(1).map((v, i) => Math.abs(v - col[i])));
    expect(Math.max(...col) - Math.min(...col), 'shadow has real depth').toBeGreaterThan(25);
    expect(maxStep, 'adjacent-pixel step across the shadow edge').toBeLessThan(35);

    // Rust sign is red-dominant; monobloc chair is green-dominant.
    const sample = (r: { x0: number; y0: number; x1: number; y1: number }) => {
      let R = 0, G = 0, B = 0, n = 0;
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { const [a, b, c] = rgb(img, x, y); R += a; G += b; B += c; n++; }
      return [R / n, G / n, B / n];
    };
    const [sr, , sb] = sample({ x0: 152, y0: 200, x1: 170, y1: 215 });
    expect(sr - sb, 'sign reads rust (R > B)').toBeGreaterThan(40);
    const [cr, cg, cb] = sample({ x0: 445, y0: 378, x1: 505, y1: 388 });
    expect(cg, 'chair seat is green').toBeGreaterThan(cr + 30);
    expect(cg).toBeGreaterThan(cb + 30);

    expect(matchGolden('frame1-clean.png', b64).diffRatio).toBeLessThanOrEqual(0.005);
    expectNoErrors(errs);
  });

  test('is deterministic: two renders are byte-identical', async ({ page }) => {
    await openApp(page);
    const a = await frame(page, 'clean');
    const b = await page.evaluate(() => window.awaken.renderPng());
    expect(decode(a).data.equals(decode(b).data)).toBe(true);
  });

  test('charts variant renders and matches golden', async ({ page }) => {
    const errs = await openApp(page);
    const b64 = await frame(page, 'charts', 1080, 1350);
    saveArtifact('diagnostic-charts.png', b64);
    const img = decode(b64);
    // The text chart is mostly white with black type: it must contain both extremes.
    const s = regionStats(img, { x0: 0, y0: 0, x1: img.width, y1: img.height });
    expect(s.min).toBeLessThan(40);
    expect(matchGolden('diagnostic-charts.png', b64).diffRatio).toBeLessThanOrEqual(0.005);
    expectNoErrors(errs);
  });
});

test('colour pipeline reproduces the 24-patch chart within ±3 per channel', async ({ page }) => {
  await openApp(page);
  // Plane fills the frame exactly: ortho, fov chosen so half-height is 0.5 at distance 10.
  const doc = await page.evaluate(() => {
    const d = JSON.parse(JSON.stringify(window.awaken.store.doc));
    d.nodes = [{ ...d.nodes.find((n: any) => n.id === 'diag-chart-colour'), vis: true, pos: [0, 0, 0], rot: [0, 0, 0], scl: [1.5, 1, 1] }];
    d.scene.bg = '#000000'; d.scene.ortho = true; d.scene.shadows = false;
    d.comp = { w: 768, h: 512, ar: 'custom' };
    d.cam = { p: [0, 0, 10], t: [0, 0, 0], z: 1, fov: 2 * Math.atan(0.05) * 180 / Math.PI };
    return d;
  });
  await page.evaluate((d) => window.awaken.loadDoc(d), doc);
  const b64 = await page.evaluate(() => window.awaken.renderPng(768, 512));
  saveArtifact('colour-chart-flat.png', b64);
  const img = decode(b64);
  let worst = 0;
  COLOUR_PATCHES.forEach((exp, i) => {
    const x = (i % 6) * 120 + 24 + 54, y = Math.floor(i / 6) * 120 + 16 + 54;
    const got = rgb(img, x, y);
    got.forEach((v, c) => { worst = Math.max(worst, Math.abs(v - exp[c])); });
  });
  expect(worst, 'worst per-channel error across 24 patches').toBeLessThanOrEqual(3);
});

test('export does not depend on what size the preview rendered at first', async ({ browser }) => {
  // Regression: the annotation overlay texture kept the size of its first allocation, so whichever of
  // preview (viewport size) and export (requested size) ran first decided whether the other was wrong.
  const exportAfter = async (previewFirst: boolean) => {
    const page = await browser.newPage();
    const errs = await openApp(page);
    await page.evaluate(() => window.awaken.loadFrame('surveillance-tight'));
    if (previewFirst) await page.evaluate(() => window.awaken.app.drawPreview({ time: 1.5, dt: 1 / 60, seed: 7 }));
    const b64 = await page.evaluate(() => window.awaken.renderPng());
    // And the other direction: a second export at a different size must not disturb the first size.
    await page.evaluate(() => window.awaken.renderPng(270, 338));
    const again = await page.evaluate(() => window.awaken.renderPng());
    expectNoErrors(errs);
    await page.close();
    return { b64, again };
  };
  const exportFirst = await exportAfter(false);
  const previewFirst = await exportAfter(true);
  expect(decode(previewFirst.b64).data.equals(decode(exportFirst.b64).data), 'export after a preview == export on a cold start').toBe(true);
  expect(decode(exportFirst.again).data.equals(decode(exportFirst.b64).data), 'export after a different-size export').toBe(true);
  expect(decode(previewFirst.again).data.equals(decode(exportFirst.b64).data), 'same, preview first').toBe(true);
});

test.describe('frame 2: selected object', () => {
  test('3D box with corner dots and a transform gizmo appear only when selected', async ({ page }) => {
    const errs = await openApp(page);
    await page.evaluate(() => window.awaken.loadFrame('clean'));
    const before = await page.evaluate(() => window.awaken.renderOverlayPng());
    const info = await page.evaluate(() => window.awaken.screenInfo('diag-fig-b'));
    await page.evaluate(() => window.awaken.select('diag-fig-b'));
    const after = await page.evaluate(() => window.awaken.renderOverlayPng());
    saveArtifact('frame2-selected.png', after);
    const a = decode(before), b = decode(after);

    const dark = (img: PNG, p: { x: number; y: number }) => {
      let m = 255;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
        if (x >= 0 && y >= 0 && x < img.width && y < img.height) m = Math.min(m, lum(img, x, y));
      }
      return m < 60;
    };
    const withBox = info.corners.filter((c) => dark(b, c)).length;
    const withoutBox = info.corners.filter((c) => dark(a, c)).length;
    expect(withBox, 'corner dots drawn at all 8 box corners').toBeGreaterThanOrEqual(7);
    expect(withoutBox, 'nothing there before selection').toBeLessThanOrEqual(2);

    // Gizmo: saturated axis colours appear that were not there before.
    const saturated = (img: PNG) => { let n = 0; for (let i = 0; i < img.data.length; i += 4) { const mx = Math.max(img.data[i], img.data[i + 1], img.data[i + 2]), mn = Math.min(img.data[i], img.data[i + 1], img.data[i + 2]); if (mx - mn > 120) n++; } return n; };
    expect(saturated(b) - saturated(a), 'gizmo axis pixels').toBeGreaterThan(80);
    expectNoErrors(errs);
  });

  test('clean preview hides the overlay', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => { window.awaken.loadFrame('clean'); window.awaken.select('diag-fig-b'); });
    await page.click('#btn-clean');
    const info = await page.evaluate(() => window.awaken.screenInfo('diag-fig-b'));
    await page.evaluate(() => window.awaken.app.drawPreview({ time: 0, dt: 0, seed: 7 }));
    const b64 = await page.evaluate(() => window.awaken.app.canvas.toDataURL('image/png').split(',')[1]);
    const img = decode(b64);
    const darkAtCorner = info.corners.filter((c) => lum(img, Math.round(c.x), Math.round(c.y)) < 60).length;
    expect(darkAtCorner).toBeLessThanOrEqual(2);
  });
});

test.describe('frame 3: depth map', () => {
  test('black void, grey by distance (near light), no floor, no shadows', async ({ page }) => {
    const errs = await openApp(page);
    const b64 = await frame(page, 'depth');
    saveArtifact('frame3-depth.png', b64);
    const img = decode(b64);

    for (const [x, y] of [[0, 0], [img.width - 20, 0], [0, img.height - 20], [img.width - 20, img.height - 20]]) {
      expect(regionStats(img, { x0: x, y0: y, x1: x + 20, y1: y + 20 }).max, 'corner is black').toBeLessThan(4);
    }
    expect(regionStats(img, { x0: 0, y0: 480, x1: img.width, y1: img.height }).max, 'no floor').toBeLessThan(4);
    expect(regionStats(img, { x0: 100, y0: 434, x1: 150, y1: 442 }).max, 'no shadow').toBeLessThan(4);

    // Pure greys.
    let maxChroma = 0;
    for (let i = 0; i < img.data.length; i += 4) maxChroma = Math.max(maxChroma, Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) - Math.min(img.data[i], img.data[i + 1], img.data[i + 2]));
    expect(maxChroma, 'depth map is grey').toBeLessThanOrEqual(2);

    // Chair is the nearest object (z=0.4), the sign the farthest (z=-0.9): near is light, far is dark.
    const chair = regionStats(img, { x0: 440, y0: 372, x1: 520, y1: 445 });
    const sign = regionStats(img, { x0: 150, y0: 180, x1: 222, y1: 252 });
    const nz = (s: ReturnType<typeof regionStats>) => { const v = s.lum.filter((l) => l > 4); return v.reduce((a, b) => a + b, 0) / Math.max(v.length, 1); };
    expect(nz(chair) - nz(sign), 'nearest object is lighter than the farthest').toBeGreaterThan(30);
    expect(matchGolden('frame3-depth.png', b64).diffRatio).toBeLessThanOrEqual(0.005);
    expectNoErrors(errs);
  });
});

test.describe('frames 4 and 5: surveillance', () => {
  test('frame 4: 1-bit ink, crimson boxes around the people only, caption strips', async ({ page }) => {
    const errs = await openApp(page);
    const b64 = await frame(page, 'surveillance');
    saveArtifact('frame4-surveillance.png', b64);
    const img = decode(b64);

    // 1-bit: apart from the annotation colour, almost every pixel is black or white.
    let mid = 0, total = 0;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
      const [r, g, b] = rgb(img, x, y);
      if (isCrimson(r, g, b)) continue;
      total++;
      const l = lum(img, x, y);
      if (l > 30 && l < 225) mid++;
    }
    expect(mid / total, 'fraction of non-annotation pixels that are not black or white').toBeLessThan(0.03);

    // Crimson frames around the two tracked figures, none around the chair or sign.
    const bb = crimsonBBox(img);
    expect(bb.n, 'crimson pixels').toBeGreaterThan(400);
    expect(bb.x1, 'no box beyond the figures (chair is at x>420)').toBeLessThan(330);

    // Caption strips: crimson fill with white type. Rows crossing a strip have many crimson pixels
    // (a 1px box edge is a single row, so requiring 8+ consecutive rows isolates the strips).
    const stripRows: number[] = [];
    for (let y = 0; y < img.height; y++) {
      let c = 0;
      for (let x = 0; x < img.width; x++) { const [r, g, b] = rgb(img, x, y); if (isCrimson(r, g, b)) c++; }
      if (c >= 30) stripRows.push(y);
    }
    const groups = stripRows.reduce<number[][]>((g, y) => { const last = g[g.length - 1]; if (last && y - last[last.length - 1] <= 1) last.push(y); else g.push([y]); return g; }, []);
    expect(groups.filter((g) => g.length >= 8).length, 'caption strips (8+ rows tall)').toBeGreaterThanOrEqual(1);
    // White type inside the strip: white pixels directly surrounded by crimson.
    let whiteInStrip = 0;
    for (const g of groups.filter((gr) => gr.length >= 8)) for (const y of g) for (let x = 1; x < img.width - 1; x++) {
      const [r, gg, b] = rgb(img, x, y);
      const [lr, lg, lb] = rgb(img, x - 1, y);
      if (r > 200 && gg > 200 && b > 200 && isCrimson(lr, lg, lb)) whiteInStrip++;
    }
    expect(whiteInStrip, 'caption lettering').toBeGreaterThan(10);

    // Sparse specks on the white (sky region, no objects).
    const sky = regionStats(img, { x0: 330, y0: 20, x1: 530, y1: 150 });
    const speck = sky.lum.filter((l) => l < 60).length / sky.n;
    expect(speck, 'speck density on paper').toBeGreaterThan(0.0005);
    expect(speck).toBeLessThan(0.02);

    expect(matchGolden('frame4-surveillance.png', b64).diffRatio).toBeLessThanOrEqual(0.005);
    expectNoErrors(errs);
  });

  // The reference shows shadows as solid black with dissolving stippled edges. The ink pass currently
  // thresholds shadow luminance like any other surface, which stipples the whole shadow. Needs the
  // shadow mask planned for M3/M4.
  test.fixme('frame 4: shadows solid black with dissolving stippled edges', async ({ page }) => {
    await openApp(page);
    const img = decode(await frame(page, 'surveillance'));
    const core = regionStats(img, { x0: 100, y0: 434, x1: 140, y1: 440 });
    expect(core.lum.filter((l) => l < 30).length / core.n).toBeGreaterThan(0.95);
  });

  test('frame 5: tighter framing moves and grows the boxes', async ({ page }) => {
    const errs = await openApp(page);
    const four = decode(await frame(page, 'surveillance'));
    const b64 = await frame(page, 'surveillance-tight');
    saveArtifact('frame5-surveillance-tight.png', b64);
    const five = decode(b64);
    const a = crimsonBBox(four), b = crimsonBBox(five);
    expect(b.n).toBeGreaterThan(400);
    expect(b.y1 - b.y0, 'boxes taller under the tighter camera').toBeGreaterThan((a.y1 - a.y0) * 1.3);
    expect(b.x0 >= 0 && b.x1 < five.width && b.y0 >= 0 && b.y1 < five.height).toBe(true);
    expect(matchGolden('frame5-surveillance-tight.png', b64).diffRatio).toBeLessThanOrEqual(0.005);
    expectNoErrors(errs);
  });
});
