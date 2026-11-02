import { test, expect } from '../tests/fixtures';
import { readFile } from 'node:fs/promises';

test('public V2 homepage is canonical and retains the old reader library', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.v2-home')).toBeVisible();
  await expect(page.locator('main.home-page')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('.v2-preview-bar')).toHaveCount(0);
  await expect(page.locator('#continue-section')).toBeAttached();
  await expect(page.locator('form.v2-search')).toHaveAttribute('action', '/catalog/');
  await expect(page.getByRole('link', { name: /Browse the library/ })).toHaveAttribute('href', '/catalog/');
  await expect(page.getByRole('link', { name: /Try the V2 reader/ })).toHaveAttribute('href', /\/novel\/[^/]+\/[^/]+\/$/);
  await expect(page.locator('.v2-bottom-note')).not.toContainText('Preview edition');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /https:\/\/hunmeng-novel\.ru\/$/);
});

test('public V2 catalog uses canonical search, tags and external reference labels', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('main.v2-catalog-page')).toBeVisible();
  await expect(page.locator('.v2-catalog-preview')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(2);
  await expect(page.locator('.v2-catalog-picks a').first()).toHaveAttribute('href', '/catalog/?sort=added');
  await page.locator('#catalog-filters input[name="search"]').fill('lighthouse');
  await expect(page).toHaveURL(/\/catalog\/\?search=lighthouse/);
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.reload();
  await expect(page.locator('#catalog-filters input[name="search"]')).toHaveValue('lighthouse');
});

test('canonical reader uses V2 styles without changing chapter URL or progress keys', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await expect(page.locator('body')).toHaveClass(/v2-reader/);
  await expect(page.locator('main[data-reader][data-chapter="glava-1"]')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('.v2-reader-preview-bar')).toHaveCount(0);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await page.goto('/v2/read/khranitel-mayaka/glava-1/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});

test('private staff and prototype routes keep their protection and SEO boundaries', async ({ page }) => {
  for (const route of ['/v2/', '/v2/catalog/', '/v2/admin/']) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  }
  await expect(page.locator('#admin-workspace')).toBeHidden();
  const xml = await readFile('dist/sitemap-0.xml', 'utf8');
  expect(xml).toContain('/catalog/');
  expect(xml).not.toContain('/v2/');
});

test('V2 live home and catalog stay inside the narrow mobile viewport', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    for (const route of ['/', '/catalog/']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route+' @ '+width).toBe(true);
    }
  }
});

test('public V2 screenshot evidence and browser errors on all launch pages', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = [
    {url: '/', name: 'home', selector: 'main.v2-home'},
    {url: '/catalog/', name: 'catalog', selector: 'main.v2-catalog-page'},
    {url: '/novel/khranitel-mayaka/glava-1/', name: 'reader', selector: 'body.v2-reader #chapter-text'},
    {url: '/v2/admin/', name: 'admin-guest', selector: 'main.v2-admin-page'},
  ];
  for (const route of routes) {
    await page.goto(route.url);
    await expect(page.locator(route.selector)).toBeVisible();
    if (route.name === 'admin-guest') await expect(page.locator('#admin-workspace')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('hunmeng-v2-public-' + route.name + '.png'),
      fullPage: false,
      animations: 'disabled',
    });
  }
  expect(errors).toEqual([]);
});
