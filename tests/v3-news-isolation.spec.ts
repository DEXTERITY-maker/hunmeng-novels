import { test, expect } from './fixtures';

test('existing V1 news feed and articles remain unchanged without public V2 flag', async ({ page }) => {
  await page.goto('/news/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-news-nav')).toHaveCount(0);
  await expect(page.locator('#news-feed [data-news-card]').first()).toBeVisible();
  const href = await page.locator('#news-feed .news-card h3 a').first().getAttribute('href');
  expect(href).toMatch(/^\/news\/[^/]+\/$/);
  await page.goto(href!);
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.news-article-body')).toBeVisible();
  await expect(page.locator('[data-news-reactions] button[data-reaction]')).toHaveCount(6);
});
