import { test, expect } from './fixtures';

test('external reading reference appears in catalog without being published as a local novel', async ({ page }) => {
  await page.goto('/catalog/');
  const reference = page.locator('[data-external-source="wtr-lab:109475"]');
  await expect(reference).toBeVisible();
  await expect(reference).toContainText('Highway Survival: Lathe Is Also a Car');
  await expect(reference).toContainText('External source');
  const url = await reference.getByRole('link', { name: 'Read on WTR-Lab' }).getAttribute('href');
  expect(url).toBe('https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun');
  const index = await page.request.get('/catalog-index.json');
  expect(index.ok()).toBe(true);
  const local = await index.json() as Array<{ title: string; slug: string }>;
  expect(local.some(n => n.title.includes('Gatling Gun') || n.slug === 'highway-survival-lathe-gatling')).toBe(false);
});

test('novel reference has correct author, original source and no on-site reading controls', async ({ page }) => {
  await page.goto('/sources/highway-survival-lathe-gatling/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Highway Survival');
  await expect(page.locator('.external-novel-original')).toHaveText('公路求生车床也是车我手搓加特林');
  await expect(page.locator('.external-novel-author')).toContainText('凨羽');
  await expect(page.getByRole('link', { name: 'Chinese original' })).toHaveAttribute('href', 'https://fanqienovel.com/page/7673414027619339289');
  await expect(page.locator('.external-novel-copy')).toContainText('Publication rights have not been verified');
  await expect(page.locator('.novel-read-label, .chapter-list, [data-continue]')).toHaveCount(0);
});

for (const width of [390, 1366]) {
  test(`external reference remains readable at ${width}px in all themes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/catalog/');
    for (const theme of ['light', 'dark', 'sepia']) {
      await page.locator('html').evaluate((element, value) => element.setAttribute('data-theme', value), theme);
      await expect(page.locator('[data-external-source="wtr-lab:109475"]')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`hunmeng-highway-${theme}-${width}.png`), animations: 'disabled' });
    }
  });
}
