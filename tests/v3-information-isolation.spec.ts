import { test, expect } from './fixtures';

test('V1 informational routes retain original layout, destinations and privacy copy', async ({ page }) => {
  for (const url of ['/about/', '/contacts/', '/rules/', '/rights/']) {
    await page.goto(url);
    await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-info-nav')).toHaveCount(0);
    await expect(page.locator('main#main h1')).toBeVisible();
    await expect(page.locator('main#main .back-link')).toHaveAttribute('href', '/');
  }
  await page.goto('/rules/');
  await expect(page.getByRole('heading', { name: 'Terms and privacy' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Contact page' })).toHaveAttribute('href', '/contacts/');
  await expect(page.getByRole('link', { name: 'information for rights holders' })).toHaveAttribute('href', '/rights/');
  await page.goto('/rights/');
  await expect(page.getByRole('heading', { name: 'Rights requests' })).toBeVisible();
  await expect(page.locator('.rights-steps li')).toHaveCount(4);
});
