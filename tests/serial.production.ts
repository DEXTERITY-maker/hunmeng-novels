import { test, expect } from '@playwright/test';

const withdrawn = ['comprehension-against-the-heavens', 'the-latency-of-tomorrow'];

test('withdrawn originals are absent from the production catalog and search index', async ({ page, request }) => {
  await page.goto('/catalog/');
  const catalogResponse = await request.get('/catalog.json');
  const indexResponse = await request.get('/catalog-index.json');
  expect(catalogResponse.status()).toBe(200);
  expect(indexResponse.status()).toBe(200);
  const catalog = await catalogResponse.json() as Array<{slug: string}>;
  const index = await indexResponse.json() as Array<{slug: string}>;
  for (const slug of withdrawn) {
    expect(catalog.some(n => n.slug === slug)).toBe(false);
    expect(index.some(n => n.slug === slug)).toBe(false);
  }
  await expect(page.locator('#result-count')).toHaveText(`Novels found: ${index.length}`);
  if (index.length === 0) {
    await expect(page.locator('#catalog-empty')).toBeVisible();
    await expect(page.locator('#catalog-empty')).toContainText('No novels are published yet');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('withdrawn novel, chapter and schedule routes return 404', async ({ request }) => {
  for (const slug of withdrawn) {
    for (const suffix of ['', 'chapter-1/', 'releases/', 'chapters/1/']) {
      const response = await request.get(`/novel/${slug}/${suffix}`);
      expect(response.status(), `${slug}/${suffix}`).toBe(404);
    }
  }
});

test('homepage and news remain available after original works are withdrawn', async ({ page, request }) => {
  await page.goto('/');
  await expect(page.locator('#home-title')).toBeVisible();
  await expect(page.locator('#latest-news')).toBeVisible();
  const news = await request.get('/news/original-novels-withdrawn-2026-11-01/');
  expect(news.status()).toBe(200);
  await expect(page.locator('#new-novels')).toBeVisible();
});
