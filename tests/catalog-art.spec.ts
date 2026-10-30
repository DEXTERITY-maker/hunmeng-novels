import { test, expect } from './fixtures';

test('catalog keeps usable, art-free demo cards and a first result above the fold on a 390px phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalog/');
  await expect(page.locator('.catalog-art-hero')).toBeVisible();
  await expect(page.locator('#catalog-results .catalog-novel-card').first()).toBeVisible();
  await expect(page.locator('#catalog-results .catalog-card-art')).toHaveCount(0);
  const top = (await page.locator('#catalog-results .catalog-novel-card').first().boundingBox())!;
  expect(top.y).toBeLessThan(844);
  for (const theme of ['light', 'dark', 'sepia'] as const) {
    await page.locator('html').evaluate((el, v) => { el.dataset.theme = v; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), theme).toBe(true);
    const read = page.locator('.catalog-novel-card .catalog-read-action').first();
    await expect(read).toBeVisible();
    const width = await read.evaluate(el => el.getBoundingClientRect().width);
    const parentWidth = await read.evaluate(el => el.closest('.catalog-novel-card')!.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(parentWidth - 35);
    // Buttons use an opaque emerald surface and white text, including on dark/sepia.
    const contrast = await read.evaluate(el => {
      const parse = (s: string) => s.match(/[\d.]+/g)!.slice(0, 3).map(Number);
      const linear = (v: number) => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
      const lum = (rgb: number[]) => rgb.reduce((sum, v, i) => sum + linear(v) * [.2126, .7152, .0722][i], 0);
      const style = getComputedStyle(el);
      const a = lum(parse(style.color)), b = lum(parse(style.backgroundColor));
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    expect(contrast, theme).toBeGreaterThanOrEqual(4.5);
  }
});

test('filtered demo cards use the same structure as the server-rendered fallback', async ({ page }) => {
  await page.goto('/catalog/');
  const first = page.locator('.catalog-novel-card').first();
  const before = await first.evaluate(el => ({
    children: [...el.children].map(child => child.className),
    text: [...el.querySelector('.novel-copy')!.children].map(child => child.className || child.tagName.toLowerCase()),
  }));
  const title = await first.locator('h2').innerText();
  await page.locator('#catalog-filters input[name="search"]').fill(title);
  await expect(page.locator('.catalog-novel-card')).toHaveCount(1);
  const after = await page.locator('.catalog-novel-card').evaluate(el => ({
    children: [...el.children].map(child => child.className),
    text: [...el.querySelector('.novel-copy')!.children].map(child => child.className || child.tagName.toLowerCase()),
  }));
  expect(after).toEqual(before);
  await expect(page.locator('.catalog-card-art')).toHaveCount(0);
});
