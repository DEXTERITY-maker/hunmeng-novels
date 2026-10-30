import { test, expect } from './fixtures';

const demoNovel = '/novel/khranitel-mayaka/';

test('novel detail has a graceful no-art fallback, a single synopsis, and active Catalog', async ({ page }) => {
  await page.goto(demoNovel);
  await expect(page.locator('.novel-art-band')).toHaveCount(0);
  await expect(page.locator('.novel-detail')).toBeVisible();
  await expect(page.locator('.synopsis-panel .detail-description')).toHaveCount(1);
  await expect(page.locator('.detail-copy .detail-description')).toHaveCount(0);
  await expect(page.locator('.synopsis-panel .detail-description')).not.toBeEmpty();
  await expect(page.locator('.site-header a[href="/catalog/"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.personal-rating-stars button')).toHaveCount(5);
  await expect(page.locator('.serial-publication-stats')).toContainText('3 published chapters');
  await expect(page.locator('.serial-publication-stats')).not.toContainText('planned in total');
  await expect(page.locator('.serial-publication-stats a')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start reading', exact: true })).toHaveAttribute('href', '/novel/khranitel-mayaka/glava-1/');
  await expect(page.locator('.novel-read-label')).toHaveText('Start reading');
  await expect(page.locator('.novel-primary-read svg')).toHaveCount(1);
});

test('novel actions preserve library shelf, five-star rating and mobile layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demoNovel);
  await expect(page.locator('.novel-detail')).toBeVisible();
  await expect(page.locator('.novel-book-shell .detail-cover')).toBeVisible();
  await expect(page.locator('.novel-primary-read')).toBeVisible();
  await expect(page.locator('.site-header a[href="/catalog/"]')).toHaveAttribute('aria-current', 'page');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const controls = await page.locator('.novel-primary-read, .detail-actions [data-add-library]').evaluateAll(elements =>
    elements.filter(el => getComputedStyle(el).display !== 'none').map(el => el.getBoundingClientRect().height));
  for (const height of controls) expect(height).toBeGreaterThanOrEqual(44);

  const add = page.locator('.detail-actions [data-add-library]');
  await add.click();
  await expect(page.locator('.detail-actions [data-shelf]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1') || '{}').library?.['khranitel-mayaka'])).toBe('later');

  await page.locator('.personal-rating-stars [data-star="4"]').click();
  await expect(page.locator('.personal-rating-stars button.selected')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.personal-rating-stars button.selected')).toHaveCount(4);
  await expect(page.locator('.personal-rating-stars button')).toHaveCount(5);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('without art, the novel page remains within 390px in all three themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(demoNovel);
  for (const theme of ['light', 'dark', 'sepia']) {
    await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), theme).toBe(true);
  }
});

test('novel page shows each tag or category pill once and keeps release arrow inside its pill', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  const pills = await page.locator('.novel-detail-tags a, .work-categories a').allInnerTexts();
  expect(new Set(pills).size).toBe(pills.length);
  const nested = await page.locator('.serial-publication-stats a span, .serial-publication-stats span span').evaluateAll(
    (els) => els.filter((el) => getComputedStyle(el).borderTopWidth !== '0px').length);
  expect(nested).toBe(0);
});
