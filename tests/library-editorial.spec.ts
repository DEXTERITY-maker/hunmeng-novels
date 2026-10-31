import { test, expect } from './fixtures';

test('artless demo novel remains a readable library row with a genuine shelf control', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hunmeng-novels:v1', JSON.stringify({
      version: 1,
      library: { 'khranitel-mayaka': 'reading' },
      progress: {},
    }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/library/');
  const row = page.locator('.library-novel-row');
  await expect(row).toHaveCount(1);
  await expect(row).not.toHaveAttribute('data-art', /.+/);
  await expect(row.locator('.library-row-art')).toHaveCount(0);
  await expect(row.locator('.library-chapter-progress')).toBeVisible();
  await expect(row.locator('.library-row-copy')).toContainText('The Keeper of the Quiet Lighthouse');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await row.getByRole('combobox', { name: /Shelf:/ }).selectOption('later');
  await expect(page.locator('#library-empty')).toBeVisible();
  await page.locator('[data-shelf-tab="later"]').click();
  await expect(page.locator('.library-novel-row')).toHaveCount(1);
  await page.locator('.library-novel-row select').selectOption('remove');
  await expect(page.locator('#library-empty')).toBeVisible();
});

test('all four shelves have accessible counts and 390px controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/library/');
  const tabs = page.locator('.shelf-tab');
  await expect(tabs).toHaveCount(4);
  for (const tab of await tabs.all()) {
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-pressed', 'true');
  }
});
