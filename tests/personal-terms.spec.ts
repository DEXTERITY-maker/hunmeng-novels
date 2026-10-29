import { test, expect } from './fixtures';

test('personal terms affect only this novel and can be removed without changing original chapter', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  const article = page.locator('#chapter-text');
  await expect(article).toContainText('Ilya');
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  const dialog = page.locator('#reader-settings');
  await dialog.getByText('Personal word replacements', { exact: true }).click();
  await dialog.getByLabel('Find', { exact: true }).fill('Ilya');
  await dialog.getByLabel('Replace with', { exact: true }).fill('Mira');
  await dialog.getByRole('button', { name: 'Save replacement', exact: true }).click();
  await expect(dialog.locator('#personal-terms-status')).toHaveText('Replacement saved on this device.');
  await expect(article).toContainText('Mira');
  await expect(article).not.toContainText('Ilya');
  await page.screenshot({ path: test.info().outputPath('hunmeng-v014-reader-terms.png') });
  await dialog.getByRole('button', { name: 'Close settings', exact: true }).click();
  await page.goto('/novel/khranitel-mayaka/glava-2/');
  await expect(article).toContainText('Mira');
  await page.goto('/novel/sad-zimy/glava-1/');
  await expect(article).toContainText('Nika');
  await expect(page.locator('#personal-terms-list li')).toHaveCount(0);
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await expect(article).toContainText('Mira');
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  await dialog.getByText('Personal word replacements', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Remove replacement for Ilya', exact: true }).click();
  await expect(article).toContainText('Ilya');
  await expect(article).not.toContainText('Mira');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).progress['khranitel-mayaka']?.chapterSlug)).toBe('glava-1');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!));
  expect(state.library['khranitel-mayaka']).toBe('reading');
  expect(state.progress['khranitel-mayaka'].chapterSlug).toBe('glava-1');
});

test('replacement text is rendered as text, never HTML', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await page.getByRole('button', { name: 'Reading settings', exact: true }).click();
  const dialog = page.locator('#reader-settings');
  await dialog.getByText('Personal word replacements', { exact: true }).click();
  await dialog.getByLabel('Find', { exact: true }).fill('Ilya');
  await dialog.getByLabel('Replace with', { exact: true }).fill('<img src=x>');
  await dialog.getByRole('button', { name: 'Save replacement', exact: true }).click();
  await expect(page.locator('#chapter-text')).toContainText('<img src=x>');
  await expect(page.locator('#chapter-text img')).toHaveCount(0);
});
