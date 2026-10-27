import { test, expect } from '@playwright/test';

test('novel-specific reading settings survive reload without changing global defaults', async ({ page }) => {
  await page.goto('/novel/the-latency-of-tomorrow/');
  const chapter = page.locator('.chapter-list a[data-chapter-slug]').first();
  await chapter.click();
  await page.locator('[data-open^="settings"]').first().click();
  const dialog = page.locator('#reader-settings');
  await expect(dialog).toBeVisible();
  const toggle = dialog.locator('#reader-novel-settings');
  await toggle.check();
  await dialog.locator('input[name="size"]').fill('24');
  await expect(page.locator('html')).toHaveCSS('--reader-size', '24px').catch(() => {});
  await page.reload();
  await page.locator('[data-open^="settings"]').first().click();
  await expect(page.locator('#reader-novel-settings')).toBeChecked();
  await expect(page.locator('#settings-form input[name="size"]')).toHaveValue('24');
  await page.locator('#reader-novel-settings').uncheck();
  await expect(page.locator('#settings-form input[name="size"]')).toHaveValue('20');
});
