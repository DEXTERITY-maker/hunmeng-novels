import { test, expect } from './fixtures';

test('V1 chapter contents and external references preserve original shell and rights boundaries', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/chapters/1/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-book-extra-nav')).toHaveCount(0);
  await expect(page.locator('main.chapter-pages .page-heading')).toBeVisible();
  await expect(page.locator('.chapter-list a').first())
    .toHaveAttribute('href', /^\/novel\/[^/]+\/[^/]+\/$/);
  await expect(page.locator('nav.chapter-pagination').first()).toBeVisible();

  await page.goto('/sources/highway-survival-lathe-gatling/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-book-extra-nav')).toHaveCount(0);
  await expect(page.locator('.external-novel-copy')).toContainText('publication rights remain unverified');
  await expect(page.locator('.external-novel-actions a[target="_blank"]')).toHaveCount(2);
  await expect(page.locator('.chapter-list, [data-continue]')).toHaveCount(0);
});
