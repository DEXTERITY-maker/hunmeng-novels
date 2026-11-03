import { test, expect } from './fixtures';

test('V1 genre, tag and author pages retain original shell and real directory links', async ({ page }) => {
  for (const url of ['/genres/', '/tags/', '/authors/']) {
    await page.goto(url);
    await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-discovery-nav')).toHaveCount(0);
    await expect(page.locator('main h1')).toBeVisible();
  }
  await page.goto('/genres/');
  await expect(page.locator('[data-term-search]')).toBeVisible();
  await expect(page.locator('[data-term-availability]')).toHaveValue('available');
  await expect(page.locator('.taxonomy-nav a[aria-current="page"]'))
    .toHaveAttribute('href', '/genres/');
  await page.goto('/tags/');
  await expect(page.locator('[data-term-group]')).toBeVisible();
  await expect(page.locator('.taxonomy-nav a[aria-current="page"]'))
    .toHaveAttribute('href', '/tags/');
  await page.goto('/authors/');
  await expect(page.locator('.authors-directory .author-directory-card').first())
    .toBeVisible();
  await expect(page.locator('.author-directory-card h2 a').first())
    .toHaveAttribute('href', /^\/catalog\/\?search=/);
});
