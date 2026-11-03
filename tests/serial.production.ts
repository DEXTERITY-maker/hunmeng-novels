import { test, expect } from '@playwright/test';

const withdrawn = ['comprehension-against-the-heavens', 'the-latency-of-tomorrow'];

test('Chinese web novel references are searchable and clearly link to their sources', async ({ page, request }) => {
  const stories = [
    { slug: 'lord-of-mysteries', title: 'Lord of Mysteries', originalTitle: '诡秘之主', author: '爱潜水的乌贼' },
    { slug: 'cultivation-chat-group', title: 'Cultivation Chat Group', originalTitle: '修真聊天群', author: '圣骑士的传说' },
    { slug: 'release-that-witch', title: 'Release That Witch', originalTitle: '放开那个女巫', author: '二目' },
    { slug: 'library-of-heavens-path', title: "Library of Heaven's Path", originalTitle: '天道图书馆', author: '横扫天涯' },
    { slug: 'the-kings-avatar', title: "The King's Avatar", originalTitle: '全职高手', author: '蝴蝶蓝' },
    { slug: 'guardians-of-the-dafeng', title: 'Guardians of the Dafeng', originalTitle: '大奉打更人', author: '卖报小郎君' },
  ];
  const index = await (await request.get('/catalog-index.json')).json() as Array<{
    slug: string; title: string; originalTitle: string; author: string;
    external?: boolean; chapterCount: number; sourceUrl?: string; addedAt?: string;
  }>;
  const published = await (await request.get('/catalog.json')).json() as Array<{slug:string}>;
  for (const story of stories) {
    const matches = index.filter(item => item.slug === story.slug);
    expect(matches, story.slug).toHaveLength(1);
    expect(matches[0]).toEqual(expect.objectContaining(story));
    if (!published.some(item => item.slug === story.slug)) {
      expect(matches[0]).toEqual(expect.objectContaining({
        external: true, chapterCount: 0, addedAt: '2026-11-03',
        sourceUrl: expect.stringMatching(/^https:\/\/www\.webnovel\.com\/book\//),
      }));
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('/catalog/');
  await page.locator('#catalog-filters input[name="search"]').fill('诡秘之主');
  const card = page.locator('#catalog-results [data-novel="lord-of-mysteries"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText('External novel');
  await expect(card).toContainText('Added');
  await expect(card.getByRole('link', {name:'Read on Webnovel'}))
    .toHaveAttribute('href','https://www.webnovel.com/book/11022733006234505');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await card.getByRole('link', {name:'View novel'}).click();
  await expect(page.getByRole('heading', {level:1})).toHaveText('Lord of Mysteries');
  await expect(page.locator('.external-novel-copy')).toContainText('chapters hosted elsewhere');
});

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

test('third-party reference becomes one canonical on-site book after licensed publication', async ({ page, request }) => {
  const slug = 'highway-survival-lathe-gatling';
  const catalog = await (await request.get('/catalog.json')).json() as Array<{
    slug: string; chapters: Array<{url:string}>;
  }>;
  const published = catalog.find(n => n.slug === slug);
  const index = await (await request.get('/catalog-index.json')).json() as Array<{
    slug: string; external?: boolean; chapterCount: number; sourceUrl?: string;
  }>;
  const matches = index.filter(n => n.slug === slug);
  expect(matches).toHaveLength(1);
  await page.goto('/catalog/');
  await expect(page.locator('#catalog-results [data-novel="' + slug + '"]')).toBeVisible();
  await page.locator('#catalog-filters input[name="search"]').fill('凨羽');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results [data-novel="' + slug + '"]')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalog/');
  await page.locator('#catalog-filters input[name="search"]').fill('Highway Survival');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results [data-novel="' + slug + '"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.goto('/');
  if (published) {
    expect(matches[0].external).not.toBe(true);
    expect(matches[0].chapterCount).toBeGreaterThan(0);
    await expect(page.locator('.home-external-card[data-external-source="wtr-lab:109475"]')).toHaveCount(0);
    expect((await request.get('/novel/' + slug + '/')).status()).toBe(200);
    expect(published.chapters.length).toBeGreaterThan(0);
    expect((await request.get(published.chapters[0].url)).status()).toBe(200);
    await page.goto('/sources/' + slug + '/');
    await expect(page.getByRole('link', { name: 'Read on Hunmeng' })).toBeVisible();
  } else {
    expect(matches[0]).toEqual(expect.objectContaining({
      slug, external: true, chapterCount: 0,
      sourceUrl: 'https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun',
    }));
    await expect(page.locator('.home-external-card[data-external-source="wtr-lab:109475"]')).toBeVisible();
    expect((await request.get('/novel/' + slug + '/chapter-1/')).status()).toBe(404);
    await page.goto('/sources/' + slug + '/');
    await expect(page.getByRole('link', { name: 'Read on WTR-Lab' })).toBeVisible();
  }
});
