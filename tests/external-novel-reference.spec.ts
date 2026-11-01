import { test, expect } from './fixtures';

// Browser tests use an isolated demo library with two fictional on-site novels.
// External sources are deliberately excluded from its normal catalog search.
test('demo catalog remains unchanged while external source pages stay available', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(2);
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  const index = await page.request.get('/catalog-index.json');
  expect(index.ok()).toBe(true);
  const local = await index.json() as Array<{ title: string; slug: string }>;
  expect(local.some(n => n.title.includes('Gatling Gun') || n.slug === 'highway-survival-lathe-gatling')).toBe(false);
  const source = await page.request.get('/sources/highway-survival-lathe-gatling/');
  expect(source.ok()).toBe(true);
});

test('external novel reference has author and source links but no unauthorized local chapters', async ({ page }) => {
  await page.goto('/sources/highway-survival-lathe-gatling/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Highway Survival');
  await expect(page.locator('.external-novel-original')).toHaveText('公路求生车床也是车我手搓加特林');
  await expect(page.locator('.external-novel-author')).toContainText('凨羽');
  await expect(page.getByRole('link', { name: 'Read on WTR-Lab' })).toHaveAttribute('href', 'https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun');
  await expect(page.getByRole('link', { name: 'Chinese original' })).toHaveAttribute('href', 'https://fanqienovel.com/page/7673414027619339289');
  await expect(page.locator('.external-novel-copy')).toContainText('publication rights remain unverified');
  await expect(page.locator('.novel-read-label, .chapter-list, [data-continue]')).toHaveCount(0);
});

for (const width of [390, 1366]) {
  test(`external novel detail remains readable at ${width}px in all themes`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/sources/highway-survival-lathe-gatling/');
    for (const theme of ['light', 'dark', 'sepia']) {
      await page.locator('html').evaluate((el, value) => el.setAttribute('data-theme', value), theme);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: info.outputPath(`hunmeng-highway-${theme}-${width}.png`), animations: 'disabled' });
    }
  });
}
