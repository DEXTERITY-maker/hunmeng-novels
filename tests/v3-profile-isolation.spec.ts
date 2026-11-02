import { test, expect } from './fixtures';

test('V1 account keeps its original appearance and auth form before the V2 release', async ({ page }) => {
  await page.goto('/account/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-profile-nav')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('#auth-fields')).toBeVisible();
  await expect(page.locator('#auth-form input[name="email"]')).toBeAttached();
  await expect(page.locator('#auth-form input[name="password"]')).toBeAttached();
  await expect(page.locator('#auth-logged-in')).toBeHidden();
});
