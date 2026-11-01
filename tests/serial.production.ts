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

test('homepage and news remain available after original works are withdrawn', async ({ page, request }, info) => {
  await page.goto('/');
  await expect(page.locator('#home-title')).toBeVisible();
  await expect(page.locator('#latest-news')).toBeVisible();
  const news = await request.get('/news/original-novels-withdrawn-2026-11-01/');
  expect(news.status()).toBe(200);
  await expect(page.locator('#new-novels')).toBeVisible();
  await page.screenshot({ path: info.outputPath('hunmeng-home-withdrawn-originals.png'), animations: 'disabled', fullPage: false });
});

test('third-party novel is discoverable as a normal card while local chapters stay gated', async ({ page, request }) => {
  await page.goto('/catalog/');
  const card = page.locator('#catalog-results [data-external-source="wtr-lab:109475"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('Highway Survival: Lathe Is Also a Car');
  await expect(card).toContainText('External novel');
  await expect(card.getByRole('link', { name: 'Read on WTR-Lab' })).toHaveAttribute(
    'href', 'https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun',
  );
  await page.locator('#catalog-filters input[name="search"]').fill('凨羽');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results [data-external-source="wtr-lab:109475"]')).toBeVisible();
  await page.locator('#catalog-filters input[name="search"]').fill('Gatling');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');

  const catalog = await (await request.get('/catalog.json')).json() as Array<{ slug: string }>;
  const index = await (await request.get('/catalog-index.json')).json() as Array<{slug:string;external?:boolean;chapterCount:number;sourceUrl?:string}>;
  expect(catalog.some(n => n.slug === 'highway-survival-lathe-gatling')).toBe(false);
  expect(index.filter(n => n.slug === 'highway-survival-lathe-gatling')).toEqual([
    expect.objectContaining({
      slug:'highway-survival-lathe-gatling', external: true, chapterCount: 0,
      sourceUrl: 'https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun',
    }),
  ]);
  expect((await request.get('/novel/highway-survival-lathe-gatling/chapter-1/')).status()).toBe(404);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalog/');
  const top = (await page.locator('#catalog-results [data-external-source="wtr-lab:109475"]').boundingBox())!.y;
  expect(top).toBeLessThan(700);
  await page.goto('/');
  await expect(page.locator('.home-external-card[data-external-source="wtr-lab:109475"]')).toBeVisible();
});
