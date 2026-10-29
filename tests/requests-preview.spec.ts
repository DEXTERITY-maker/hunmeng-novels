import { test, expect } from '@playwright/test';

test('request preview is explicit and never submits a user URL', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && request.method() !== 'HEAD') outgoing.push(request.url());
  });
  await page.goto('/requests/');
  await expect(page.getByRole('heading', { name: 'Request a new novel' })).toBeVisible();
  await expect(page.getByText('submissions are not enabled')).toBeVisible();
  const url = page.getByLabel('Novel URL');
  await url.fill('http://insecure.example/book/1');
  await page.getByRole('button', { name: 'Check link format' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No request was sent' })).toBeVisible();
  await url.fill('https://novels.example/book/1');
  await page.getByRole('button', { name: 'Check link format' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'No data was sent' })).toBeVisible();
  expect(outgoing).toEqual([]);
});

test('request preview fits mobile and takes an actual screenshot', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/requests/');
  const overflowing = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflowing).toBe(false);
  await expect(page.getByRole('heading', { name: 'Supported sources' })).toBeVisible();
  await page.screenshot({ path: 'test-results/hunmeng-requests-mobile.png', fullPage: true });
});
