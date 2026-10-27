import { test, expect } from './fixtures';

async function openTags(page: import('@playwright/test').Page) {
  const options = page.locator('#catalog-options');
  if (!(await options.evaluate(el => (el as HTMLDetailsElement).open))) await options.locator(':scope > summary').click();
  const tags = page.locator('.tag-filters');
  if (!(await tags.evaluate(el => (el as HTMLDetailsElement).open))) await tags.locator(':scope > summary').click();
}

test('genre and tag directories expose the vocabulary with local counts and working links', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/genres/');
  await expect(page.getByRole('heading', { name: 'Genres', exact: true })).toBeVisible();
  await page.locator('[data-term-search]').fill('fantasy');
  await expect(page.locator('[data-term]:visible')).toHaveCount(1);
  await expect(page.locator('[data-term]:visible')).toContainText('2 novels');
  await page.locator('[data-term]:visible a').click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.goto('/novel/sad-zimy/');
  await page.locator('.genre-links').getByRole('link', { name: 'Slice of life' }).click();
  await expect(page.locator('select[name=genre]')).toHaveValue('Slice of life');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.goto('/tags/');
  expect(await page.locator('[data-term]').count()).toBeGreaterThan(880);
  await page.locator('[data-term-availability]').selectOption('available');
  await expect(page.locator('[data-term]:visible')).toHaveCount(6);
  await page.locator('[data-term-search]').fill('sea');
  await expect(page.locator('[data-term]:visible')).toHaveCount(1);
  await page.locator('[data-term]:visible a').click();
  await expect(page.locator('input[name=include][value="Sea"]')).toBeChecked();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.goto('/tags/');
  await page.locator('[data-term-group]').selectOption('Power Systems');
  await page.locator('[data-term-search]').fill('magic');
  await expect(page.locator('[data-term]:visible')).not.toHaveCount(0);
  await page.locator('[data-term-search]').fill('no-such-tag-98765');
  await expect(page.locator('[data-term-empty]')).toBeVisible();
  await page.locator('[data-term-reset]').click();
  await expect(page.locator('[data-term-empty]')).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('tag matching supports all, any, exclusion, URLs, reset and legacy links', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await openTags(page);
  await page.locator('#catalog-tag-search').fill('sea');
  await page.locator('input[name=include][value="Sea"]').check();
  await page.locator('#catalog-tag-search').fill('magic');
  await expect(page.locator('input[name=include][value="Sea"]')).toBeVisible();
  await page.locator('input[name=include][value="Magic"]').check();
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await page.locator('[name=tagMode]').selectOption('any');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await page.locator('input[name=exclude][value="Sea"]').check();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.reload();
  await expect(page.locator('[name=tagMode]')).toHaveValue('any');
  await expect(page.locator('input[name=exclude][value="Sea"]')).toBeChecked();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  await expect(page.locator('#catalog-tag-search')).toHaveValue('');
  await expect(page.locator('[name=tagMode]')).toHaveValue('all');
  await page.goto('/catalog/?include=%D0%9C%D0%BE%D1%80%D0%B5');
  await expect(page.locator('input[name=include][value="Sea"]')).toBeChecked();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
});

test('unused taxonomy choices give a truthful empty result', async ({ page }) => {
  await page.goto('/catalog/?include=System');
  await expect(page.locator('input[name=include][value="System"]')).toBeChecked();
  await expect(page.locator('#catalog-empty')).toBeVisible();
  await expect(page.locator('#result-count')).toHaveText('Novels found: 0');
});
