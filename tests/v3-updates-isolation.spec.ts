import { test, expect } from './fixtures';

test('V1 chapter updates and 404 retain their original styling and routes', async ({ page }) => {
  await page.goto('/updates/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-utility-nav')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'All updates' })).toBeVisible();
  await expect(page.locator('main .back-link')).toHaveAttribute('href', '/');
  const links = page.locator('.updates-page .home-chapter-link');
  const count = await links.count();
  if (count > 0) {
    await expect(links.first()).toHaveAttribute('href', /^\/novel\/[^/]+\/[^/]+\/$/);
  } else {
    await expect(page.locator('.updates-page .home-section-empty')).toBeVisible();
  }

  const response = await page.goto('/nothing-hunmeng-2-here-404/');
  expect(response?.status()).toBe(404);
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-utility-nav')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.getByRole('heading', { name: 'This page is lost' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Browse catalog' })).toHaveAttribute('href', '/catalog/');
});
