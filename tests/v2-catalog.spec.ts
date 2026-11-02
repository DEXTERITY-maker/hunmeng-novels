import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('V2 discovery renders real catalog content and stays out of search indexing', async ({ page }) => {
  const original = JSON.parse(await readFile('dist/catalog-index.json', 'utf8'));
  await page.goto('/v2/catalog/');
  await expect(page.locator('main#main.v2-catalog-page')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('#result-count')).toHaveText('Novels found: ' + original.length);
  await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(original.length);
  await expect(page.locator('.v2-catalog-hero h1')).toContainText('Find a story worth');
  await expect(page.getByRole('link', { name: /Reading room/ })).toHaveAttribute('href', '/v2/');
  await expect(page.getByRole('search', { name: 'Quick search' })).toHaveCount(0);
});

test('V2 searches novel descriptions without changing the original catalog search behavior', async ({ page }) => {
  const index = JSON.parse(await readFile('dist/catalog-index.json', 'utf8'));
  index[0].description += ' Rare labyrinthine candlebridge expedition.';
  await page.route('**/catalog-index.json', route => route.fulfill({ json: index }));
  await page.goto('/v2/catalog/');
  const search = page.locator('#catalog-filters input[name="search"]');
  await search.fill('labyrinthine candlebridge');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(1);
  await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveAttribute('data-novel', index[0].slug);
  await expect(page).toHaveURL(/\/v2\/catalog\/\?search=labyrinthine\+candlebridge/);
  await page.reload();
  await expect(search).toHaveValue('labyrinthine candlebridge');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.goto('/catalog/?search=labyrinthine%20candlebridge');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 0');
});

test('V2 keeps legacy genre, tag, sort and reset query contracts', async ({ page }) => {
  await page.goto('/v2/catalog/?genre=Fantasy');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await expect(page.locator('select[name="genre"]')).toHaveValue('Fantasy');
  await page.goto('/v2/catalog/?include=Sea');
  await expect(page.locator('input[name="include"][value="Sea"]')).toBeChecked();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await expect(page).not.toHaveURL(/include=/);
});

test('V2 discovery and book cards remain inside narrow viewports without new page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/v2/catalog/');
    await expect(page.locator('.v2-catalog-hero')).toBeVisible();
    await expect(page.locator('#catalog-results .catalog-novel-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'viewport ' + width).toBe(true);
    for (const selector of ['.v2-catalog-hero','.catalog-filter-panel','.catalog-novel-card','.catalog-main']) {
      const element = page.locator(selector).first();
      const bounds = await element.boundingBox();
      if (!bounds) continue;
      expect(bounds.x, selector + ' left @' + width).toBeGreaterThanOrEqual(-1);
      expect(bounds.x + bounds.width, selector + ' right @' + width).toBeLessThanOrEqual(width + 1);
    }
  }
  expect(errors).toEqual([]);
});

test('editorial discovery shares the homepage shell without changing the legacy catalog', async ({ page }, testInfo) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/v2/catalog/?genre=Fantasy');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.site-footer .footer-link-group')).toHaveCount(3);
    await expect(page.getByRole('navigation', { name: 'Official Hunmeng contact channels' })).toBeVisible();
    await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
    await expect(page.locator('select[name="genre"]')).toHaveValue('Fantasy');
    const art = await page.locator('.v2-catalog-hero').evaluate(el => getComputedStyle(el).backgroundImage);
    expect(art, 'editorial landscape @ ' + width).toContain('hero-mountains');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      'no horizontal overflow @ ' + width).toBe(true);

    if (width === 390) {
      const menu = page.locator('.v3-mobile-menu');
      await expect(menu).toBeVisible();
      await menu.getByRole('button', { name: 'Open site menu' }).click();
      await expect(menu).toHaveAttribute('open', '');
      await page.keyboard.press('Escape');
      await expect(menu).not.toHaveAttribute('open', '');
      await page.screenshot({ path: testInfo.outputPath('hunmeng-editorial-catalog-390.png'), fullPage: true, animations: 'disabled' });
    }
    if (width === 1280) {
      await expect(page.locator('.v3-mobile-menu')).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('hunmeng-editorial-catalog-1280.png'), fullPage: true, animations: 'disabled' });
    }
  }
  await page.goto('/catalog/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-mobile-menu')).toHaveCount(0);
  await expect(page.locator('.catalog-page')).toBeVisible();
});
