import { test, expect } from './fixtures';

test('quick search opens, receives focus and finds a real novel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/news/');
  await expect(page).toHaveTitle(/News/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Search novels', exact: true }).click();
  const search = page.getByRole('search', { name: 'Quick search' });
  await expect(search.getByRole('searchbox')).toBeFocused();
  await search.getByRole('searchbox').fill('lighthouse');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/\?search=lighthouse/);
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results')).toContainText('The Keeper of the Quiet Lighthouse');
  expect(errors).toEqual([]);
});

test('panels are exclusive, close outside and restore keyboard focus with Escape', async ({ page }) => {
  await page.goto('/');
  const appearance = page.getByRole('button', { name: 'Site appearance', exact: true });
  await appearance.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('radio', { name: 'System', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.keyboard.press('Escape');
  await expect(appearance).toBeFocused();
  await expect(page.locator('.appearance-control')).not.toHaveAttribute('open');
  await appearance.click();
  await page.getByRole('button', { name: 'Search novels', exact: true }).click();
  await expect(page.locator('.appearance-control')).not.toHaveAttribute('open');
  await expect(page.locator('.header-search')).toHaveAttribute('open', '');
  await page.locator('.site-header').click({ position: { x: 2, y: 2 } });
  await expect(page.locator('.header-popover[open]')).toHaveCount(0);
});

test('guest menu provides sign in and registration without account requests', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', request => { if (request.url().includes('.supabase.co')) outgoing.push(request.url()); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Reader account', exact: true }).click();
  await expect(page.locator('.account-panel').getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('[data-account-member]')).toBeHidden();
  expect(outgoing).toEqual([]);
  await page.locator('.account-panel').getByRole('link', { name: 'Create account', exact: true }).click();
  await expect(page.locator('#confirm-password-label')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
});

test('all header controls fit at 320 px and open panels stay inside the viewport', async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Main navigation', exact: true });
    await expect(nav.getByRole('link')).toHaveCount(4);
    const brand = (await page.locator('.site-header .brand').boundingBox())!;
    const actions = (await page.locator('.header-actions').boundingBox())!;
    expect(brand.x + brand.width).toBeLessThanOrEqual(actions.x);
    const header = (await page.locator('.site-header').boundingBox())!;
    expect(header.height).toBeLessThan(width <= 760 ? 110 : 90);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const name of ['Search novels', 'Site appearance', 'Reader account']) {
      const trigger = page.getByRole('button', { name, exact: true });
      await trigger.click();
      const panel = (await page.locator('.header-popover[open] .header-panel').boundingBox())!;
      expect(panel.x).toBeGreaterThanOrEqual(8);
      expect(panel.x + panel.width).toBeLessThanOrEqual(width - 8);
      await page.keyboard.press('Escape');
    }
  }
});

test('search also exposes genres and tags, and nested news keeps its active section', async ({ page }) => {
  await page.goto('/news/hunmeng-opens/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'News', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('button', { name: 'Search novels', exact: true }).click();
  await page.locator('.header-discover').getByRole('link', { name: 'Tags', exact: true }).click();
  await expect(page).toHaveURL(/\/tags\/$/);
  await expect(page.getByRole('heading', { name: 'Tags', exact: true })).toBeVisible();
});
