import { test, expect } from './fixtures';

test('demo novels without art retain a clean heading and working reader controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  const heading = page.locator('.reader-heading');
  await expect(heading).toBeVisible();
  await expect(heading).not.toHaveAttribute('data-art', /.+/);
  await expect(heading.locator('.reader-heading-art')).toHaveCount(0);
  const image = await heading.evaluate(el => getComputedStyle(el).backgroundImage);
  expect(image).toBe('none');
  await expect(page.locator('.reader-back')).toBeVisible();
  await expect(page.locator('.reader-logo-placeholder')).toBeVisible();
  await expect(page.locator('.reader-header-actions button[data-open="settings-header"]')).toBeVisible();
  await page.getByRole('button', { name: 'Reading settings' }).click();
  await expect(page.locator('#reader-settings')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.locator('#reader-settings')).toBeHidden();
  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(page.locator('#reader-toc')).toBeVisible();
  await page.getByRole('button', { name: 'Close contents' }).click();
  await expect(page.locator('#reader-toc')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});

test('reading position still restores on reload, without altering chapter text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  const article = page.locator('#chapter-text');
  const content = await article.innerText();
  await article.evaluate(el => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => scrollBy(0, 160));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(160);
  const before = await page.evaluate(() => window.scrollY);
  await page.waitForTimeout(550); // the existing 250ms debounced save has settled
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before * .6);
  await expect(article).toHaveText(content);
  await expect(page.locator('#reading-progress')).toBeVisible();
  await expect(page.locator('#progress-label')).not.toBeEmpty();
});

test('landscape phone leaves room for reading, back navigation and progress', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  const heading = (await page.locator('.reader-heading').boundingBox())!;
  // The fallback has no picture, and remains compact in landscape mode.
  expect(heading.height).toBeLessThan(250);
  await expect(page.locator('.reader-back')).toBeVisible();
  await expect(page.locator('#reading-progress')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
