import { test, expect } from './fixtures';

test('unflagged canonical editorial pages retain V1 design and permission boundaries', async ({page}) => {
  await page.goto('/admin/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-admin-nav,.v3-admin-jumps')).toHaveCount(0);
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-login-link')).toHaveAttribute('href','/admin/login/');
  await expect(page.locator('meta[name="robots"]'))
    .toHaveAttribute('content','noindex,follow');
  await page.goto('/admin/login/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-admin-nav')).toHaveCount(0);
  await expect(page.locator('#admin-login-form')).toBeVisible();
  await expect(page.locator('meta[name="robots"]'))
    .toHaveAttribute('content','noindex,follow');
  await expect(page.locator('meta[name="referrer"]'))
    .toHaveAttribute('content','no-referrer');
});
