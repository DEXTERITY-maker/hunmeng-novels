import { test, expect } from './fixtures';

test('original reader rank gallery and private studio stay V1 when the launch flag is off', async ({ page }) => {
  await page.goto('/ranks/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-reader-resources-nav')).toHaveCount(0);
  await expect(page.locator('.rank-world-card')).toHaveCount(9);
  await expect(page.locator('.rank-world-track li')).toHaveCount(9);
  await expect(page.locator('.rank-world-disclaimer')).toContainText('server-verified');

  await page.goto('/studio/');
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-reader-resources-nav')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.locator('#studio-workspace')).toBeHidden();
  await expect(page.getByText('Sign in to access your private writing studio.')).toBeVisible();
  await expect(page.locator('#studio-create')).toBeHidden();
});
