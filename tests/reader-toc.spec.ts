import { test, expect } from './fixtures';

const chapter = '/novel/khranitel-mayaka/glava-1/';

test('contents without configured art keeps links, accessible names, nearby chapters and existing footer', async ({ page }) => {
  await page.goto(chapter);
  await page.getByRole('button', { name: 'Open contents' }).click();
  const dialog = page.getByRole('dialog', { name: 'Contents' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.reader-toc-art')).toHaveCount(0);
  await expect(dialog.locator('.reader-toc-list li')).toHaveCount(3);
  await expect(dialog.locator('.reader-toc-list a[aria-current="page"]')).toHaveCount(1);
  const first = dialog.locator('.reader-toc-list a').first();
  const title = await first.locator('.reader-toc-name').innerText();
  await expect(first).toHaveAttribute('aria-label', `Chapter 1. ${title}`);
  await expect(first.locator('.reader-toc-name')).not.toContainText(/^Chapter 1\./);
  await expect(first.locator('.reader-toc-number svg')).toHaveCount(1);
  await expect(first.locator('.reader-toc-reading')).toHaveText('Reading');
  await expect(dialog.locator('.reader-toc-all')).toHaveText('Full contents (3 chapters) →');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();

  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(dialog).toBeVisible();
  await first.focus();
  await page.keyboard.press('Tab');
  await expect(dialog.locator('.reader-toc-list a').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/glava-2\//);
});

test('contents closes by x and backdrop, locks background and fits 390px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(chapter);
  await page.evaluate(() => window.scrollTo(0, 300));
  const before = await page.evaluate(() => window.scrollY);
  await page.getByRole('button', { name: 'Open contents' }).click();
  const dialog = page.locator('#reader-toc');
  await expect(dialog).toBeVisible();
  const rect = await dialog.boundingBox();
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(-1);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(391);
  expect(rect!.y).toBeGreaterThanOrEqual(-1);
  await page.mouse.move(5, 5);
  await page.mouse.wheel(0, 450);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await dialog.getByRole('button', { name: 'Close contents' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeHidden();
});
