import { test, expect } from './fixtures';

const first = '/novel/khranitel-mayaka/glava-1/';

test('book-specific reading preferences survive reload while global settings stay unchanged', async ({ page }) => {
  await page.goto(first);
  await page.locator('.reader-header [data-open="settings-header"]').click();
  const settings = page.getByRole('dialog', { name: 'Reading settings' });
  await expect(settings).toBeVisible();

  const toggle = settings.locator('#reader-novel-settings');
  await toggle.check();
  await settings.locator('input[name="font"][value="literary"]').check();
  await settings.locator('input[name="size"]').fill('24');
  await settings.locator('input[name="theme"][value="sepia"]').check();

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await expect(page.locator('html')).toHaveAttribute('data-reader-font', 'literary');
  await expect(page.locator('#chapter-text')).toHaveCSS('font-size', '24px');
  await expect(page.locator('#chapter-text')).toHaveCSS('font-family', /Lora/);
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('hunmeng-novels:v1') || '{}');
    return { global: saved.settings?.size, custom: saved.novelSettings?.['khranitel-mayaka']?.size };
  })).toEqual({ global: 20, custom: 24 });

  await page.reload();
  await page.locator('.reader-header [data-open="settings-header"]').click();
  await expect(settings).toBeVisible();
  await expect(settings.locator('#reader-novel-settings')).toBeChecked();
  await expect(settings.locator('input[name="size"]')).toHaveValue('24');
  await expect(settings.locator('input[name="font"][value="literary"]')).toBeChecked();

  await toggle.uncheck();
  await expect(settings.locator('input[name="size"]')).toHaveValue('20');
  await expect(settings.locator('input[name="font"][value="serif"]')).toBeChecked();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('hunmeng-novels:v1') || '{}');
    return Object.keys(saved.novelSettings || {}).length;
  })).toBe(0);
});
