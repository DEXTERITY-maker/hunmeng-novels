import { test, expect } from './fixtures';

test('alternative titles, author and active filters lead to genuine catalog results', async ({ page }) => {
  await page.goto('/catalog/');
  await page.getByPlaceholder('English or original title').fill('тихий маяк');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results')).toContainText('The Keeper of the Quiet Lighthouse');
  await expect(page.getByRole('button', { name: 'Remove Search: тихий маяк' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Search: тихий маяк' }).click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.getByPlaceholder('English or original title').fill('lesnaya');
  await expect(page.locator('#catalog-results')).toContainText('The Garden at Winter');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
});

test('genre all, any, exclusion, URL restoration and reset are usable', async ({ page }) => {
  await page.goto('/catalog/');
  const options = page.locator('#catalog-options');
  if (!(await options.evaluate(el => (el as HTMLDetailsElement).open))) await options.locator(':scope > summary').click();
  await page.locator('.genre-filters > summary').click();
  await page.getByRole('checkbox', { name: 'Include genre Adventure', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Include genre Slice of life', exact: true }).check();
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.locator('[name=genreMode]').selectOption('any');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.getByRole('checkbox', { name: 'Exclude genre Adventure', exact: true }).check();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.getByRole('button', { name: 'Remove Not genre: Adventure' })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('hunmeng-v014-catalog.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.getByRole('checkbox', { name: 'Exclude genre Adventure', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Remove Not genre: Adventure' }).click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('#active-filters')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('novel groups existing tags and links to reviews and catalog', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  await expect(page.locator('.original-title').filter({ hasText: 'Тихий маяк' })).toHaveCount(0);
  await expect(page.getByText('Also known as: Тихий маяк · Quiet Beacon')).toBeVisible();
  await expect(page.locator('.novel-tag-group')).toHaveCount(3);
  await expect(page.locator('.novel-tag-group').filter({ hasText: 'Worldbuilding' })).toContainText('Sea');
  await expect(page.getByRole('link', { name: 'Reviews', exact: true })).toHaveAttribute('href', '#reader-reviews-heading');
  await page.locator('.novel-tag-group').getByRole('link', { name: 'Sea', exact: true }).click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
});

test('library search preserves saved shelf and reading position', async ({ page }) => {
  const before = { version: 1, settings: {}, library: { 'khranitel-mayaka': 'reading', 'sad-zimy': 'reading' },
    progress: { 'khranitel-mayaka': { chapterSlug: 'glava-1', chapterNumber: 1, blockId: 'block-0', offset: 0, ratio: .3, updatedAt: 100 } } };
  await page.addInitScript(state => localStorage.setItem('hunmeng-novels:v1', JSON.stringify(state)), before);
  await page.goto('/library/');
  await expect(page.locator('.library-row')).toHaveCount(2);
  await page.getByLabel('Find in your library').fill('тихий маяк');
  await expect(page.locator('.library-row')).toHaveCount(1);
  await expect(page.locator('.library-row')).toContainText('Current chapter: 30%');
  await page.screenshot({ path: test.info().outputPath('hunmeng-v014-library.png'), fullPage: true });
  await page.getByLabel('Find in your library').fill('not a book');
  await expect(page.locator('#library-no-results')).toBeVisible();
  await expect(page.locator('#library-empty')).toBeHidden();
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!));
  expect(state.library).toEqual(before.library);
  expect(state.progress['khranitel-mayaka'].ratio).toBe(.3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test('library displays a real loading error instead of an empty shelf', async ({ page }) => {
  await page.route('**/catalog.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/library/');
  await expect(page.locator('#library-error')).toBeVisible();
  await expect(page.locator('#library-empty')).toBeHidden();
  await expect(page.locator('#library-loading')).toBeHidden();
});

test('chapter bounds filter available chapters without losing legacy genre links', async ({ page }) => {
  await page.goto('/catalog/?genre=Fantasy&maxChapters=3');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('#catalog-results')).toContainText('The Keeper of the Quiet Lighthouse');
  await expect(page.locator('select[name=genre]')).toHaveValue('Fantasy');
  await expect(page.getByRole('button', { name: 'Remove Max chapters: 3' })).toBeVisible();
  await page.getByRole('button', { name: 'Remove Max chapters: 3' }).click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
});

test('failed catalog index is explicit and its unusable controls are disabled', async ({ page }) => {
  await page.route('**/catalog-index.json', route => route.fulfill({ status: 503, body: 'unavailable' }));
  await page.goto('/catalog/');
  await expect(page.locator('#result-count')).toContainText('Advanced search is temporarily unavailable');
  await expect(page.getByPlaceholder('English or original title')).toBeDisabled();
  await expect(page.locator('#catalog-results .novel-card')).toHaveCount(2);
});
