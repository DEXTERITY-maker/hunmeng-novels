import { test, expect } from './fixtures';
import { readFile } from 'node:fs/promises';

test('V2 pages integrate navigation, reader and canonical V1 routes without replacing them', async ({ page }) => {
  await page.goto('/v2/');
  await expect(page.locator('main.v2-home')).toBeVisible();
  await page.getByRole('link', { name: /Browse the library/ }).click();
  await expect(page).toHaveURL('/v2/catalog/');
  await expect(page.locator('main.v2-catalog-page')).toBeVisible();
  await expect(page.locator('#catalog-results .catalog-novel-card').first()).toBeVisible();

  await page.goto('/v2/');
  await page.getByRole('link', { name: /Try the V2 reader/ }).click();
  await expect(page).toHaveURL(/\/v2\/read\/[^/]+\/[^/]+\/$/);
  await expect(page.locator('body')).toHaveClass(/v2-reader/);
  await expect(page.locator('#chapter-text')).not.toBeEmpty();
  await page.getByRole('link', { name: 'Original reader' }).click();
  await expect(page).toHaveURL(/\/novel\/[^/]+\/[^/]+\/$/);
  await expect(page.locator('body')).not.toHaveClass(/v2-reader/);
  await page.goto('/');
  await expect(page.locator('.home-hero h1')).toContainText('Stories worth');
});

test('all four V2 pilot areas are noindexed; public sitemap does not list V2', async ({ page }) => {
  for (const url of ['/v2/', '/v2/catalog/', '/v2/admin/', '/v2/read/khranitel-mayaka/glava-1/']) {
    await page.goto(url);
    await expect(page.locator('meta[name="robots"]'), url).toHaveAttribute('content', 'noindex,follow');
    if (url.startsWith('/v2/admin/')) {
      await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
      await expect(page.locator('#admin-workspace')).toBeHidden();
    }
  }
  const sitemap = await readFile('dist/sitemap-0.xml', 'utf8');
  expect(sitemap).not.toContain('/v2/');
  expect(sitemap).toContain('/catalog/');
});

test('V2 keeps reader and staff credentials in their original independent stores', async ({ page }) => {
  await page.goto('/v2/admin/');
  const result = await page.evaluate(() => ({
    adminSession: sessionStorage.getItem('hunmeng-novels:admin-session:v1'),
    readerSession: localStorage.getItem('hunmeng-novels:session:v1'),
    visible: !document.getElementById('admin-workspace')?.hidden,
  }));
  expect(result.adminSession).toBeNull();
  expect(result.readerSession).toBeNull();
  expect(result.visible).toBe(false);
  await page.goto('/v2/read/khranitel-mayaka/glava-1/');
  await expect(page.locator('#chapter-text')).not.toBeEmpty();
  expect(await page.evaluate(() => sessionStorage.getItem('hunmeng-novels:admin-session:v1'))).toBeNull();
});
