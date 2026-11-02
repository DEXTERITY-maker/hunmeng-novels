import { test, expect } from './fixtures';

const preview = '/v2/read/khranitel-mayaka/glava-1/';
const original = '/novel/khranitel-mayaka/glava-1/';

test('V2 reader displays the same real chapter as the canonical reader', async ({ page }) => {
  await page.goto(original);
  const originalText = (await page.locator('#chapter-text').innerText()).replace(/\s+/g, ' ').trim();
  expect(originalText.length).toBeGreaterThan(500);
  await page.goto(preview);
  await expect(page.locator('body')).toHaveClass(/v2-reader/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.getByRole('navigation', { name: 'Preview navigation' })).toBeVisible();
  await expect(page.locator('#chapter-text')).toHaveText(originalText);
  await expect(page.locator('[data-reader]')).toHaveAttribute('data-chapter', 'glava-1');
  await expect(page.getByRole('link', { name: 'Original reader' })).toHaveAttribute('href', original);
  await expect(page.locator('.chapter-end-nav .chapter-next')).toHaveAttribute('href', '/v2/read/khranitel-mayaka/glava-2/');
  await expect(page.locator('#reader-reward-status')).toBeAttached();
});

test('V2 chapter navigation stays in preview while original route stays canonical', async ({ page }) => {
  await page.goto(preview);
  await page.getByRole('button', { name: 'Open contents' }).click();
  const toc = page.getByRole('dialog', { name: 'Contents' });
  await expect(toc).toBeVisible();
  await toc.getByRole('link', { name: /Chapter 2/ }).click();
  await expect(page).toHaveURL('/v2/read/khranitel-mayaka/glava-2/');
  await expect(page.locator('.chapter-end-nav .chapter-previous')).toHaveAttribute('href', preview);
  await expect(page.locator('main#main')).toHaveAttribute('data-number', '2');
  await page.getByRole('link', { name: 'Original reader' }).click();
  await expect(page).toHaveURL('/novel/khranitel-mayaka/glava-2/');
  await expect(page.locator('body')).not.toHaveClass(/v2-reader/);
});

test('V2 preferences persist in original reader with existing local keys', async ({ page }) => {
  await page.goto(preview);
  await page.locator('.reader-header [data-open="settings-header"]').click();
  const dialog = page.getByRole('dialog', { name: 'Reading settings' });
  await dialog.locator('input[name="size"]').fill('23');
  await dialog.locator('input[name="theme"][value="sepia"]').check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await dialog.getByRole('button', { name: 'Close settings' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1') ?? '{}').settings?.size)).toBe(23);
  await page.goto(original);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.locator('.reader-header [data-open="settings-header"]').click();
  await expect(page.locator('#reader-settings input[name="size"]')).toHaveValue('23');
  await expect(page.locator('body')).not.toHaveClass(/v2-reader/);
});

test('V2 reuses existing shelf state, not parallel storage', async ({ page }) => {
  await page.goto(preview);
  await page.getByRole('button', { name: 'Save novel to Read later' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1') ?? '{}').library?.['khranitel-mayaka'])).toBe('later');
  await page.goto(original);
  await expect(page.locator('#reader-save-later')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Remove from Read later' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1') ?? '{}').library?.['khranitel-mayaka'])).toBe('reading');
});

test('V2 reader has no horizontal overflow on narrow screens', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(preview);
    await expect(page.locator('#chapter-text p').first()).toBeVisible();
    await expect(page.locator('.v2-reader-preview-bar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'width ' + width).toBe(true);
    for (const selector of ['.reader-heading', '.chapter-text', '.v2-reader-preview-bar']) {
      const rect = await page.locator(selector).first().boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x, selector + ' left at ' + width).toBeGreaterThanOrEqual(-1);
      expect(rect!.x + rect!.width, selector + ' right at ' + width).toBeLessThanOrEqual(width + 1);
    }
  }
  expect(errors).toEqual([]);
});

test('V2 focus mode with reduced motion keeps text visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(preview);
  await page.locator('.reader-more > summary').click();
  await page.getByRole('button', { name: 'Focus mode' }).click();
  await expect(page.locator('body')).toHaveClass(/reader-focus-mode/);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await page.getByRole('button', { name: 'Show reading controls' }).click();
  await expect(page.locator('.reader-header')).toBeVisible();
});
