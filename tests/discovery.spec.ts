import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('appearance follows the reader settings without losing library or progress', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('hunmeng-novels:v1', JSON.stringify({
    version: 1,
    settings: { font: 'sans', size: 24, lineHeight: 1.9, width: 800, theme: 'light' },
    library: { 'khranitel-mayaka': 'reading' },
    progress: { 'khranitel-mayaka': { chapterSlug: 'glava-1', chapterNumber: 1, blockId: 'block-0', offset: 0, ratio: .25, updatedAt: 100 } },
  })));
  await page.reload();
  await page.getByRole('button', { name: 'Site appearance', exact: true }).click();
  for (const theme of ['dark', 'sepia', 'light']) {
    await page.locator(`input[name="site-theme"][value="${theme}"]`).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  }
  await page.getByRole('radio', { name: 'Dark', exact: true }).check();
  await page.goto('/catalog/');
  await page.getByRole('button', { name: 'Site appearance', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!));
  expect(state.settings).toEqual({ font: 'sans', size: 24, lineHeight: 1.9, width: 800, theme: 'dark', paragraphSpacing: 1.35 });
  expect(state.library).toEqual({ 'khranitel-mayaka': 'reading' });
  expect(state.progress['khranitel-mayaka'].ratio).toBe(.25);
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-reader-font', 'sans');
});

test('reading actions are visible before the description and contents are one click away', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/');
  const start = page.locator('.detail-actions [data-continue]');
  await expect(start).toBeVisible();
  const button = (await start.boundingBox())!;
  const description = (await page.locator('.detail-description').boundingBox())!;
  expect(button.y + button.height).toBeLessThan(description.y);
  expect(button.y + button.height).toBeLessThan(620);
  await page.locator('.detail-actions').getByRole('link', { name: 'Contents', exact: true }).click();
  await expect(page).toHaveURL(/#contents-title$/);
  expect(await page.locator('#contents-title').evaluate(el => el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('directories start with readable books, preserve all terms, and restore shared searches', async ({ page }) => {
  await page.goto('/tags/');
  await expect(page.locator('[data-term-availability]')).toHaveValue('available');
  await expect(page.locator('[data-term]:visible')).toHaveCount(6);
  await page.locator('[data-term-availability]').selectOption('all');
  expect(await page.locator('[data-term]:visible').count()).toBeGreaterThan(880);
  await page.locator('[data-term-group]').selectOption('Power Systems');
  await page.locator('[data-term-search]').fill('magic');
  const count = await page.locator('[data-term]:visible').count();
  expect(count).toBeGreaterThan(0);
  await expect(page).toHaveURL(/q=magic/);
  await page.reload();
  await expect(page.locator('[data-term-search]')).toHaveValue('magic');
  await expect(page.locator('[data-term-group]')).toHaveValue('Power Systems');
  await expect(page.locator('[data-term-availability]')).toHaveValue('all');
  await expect(page.locator('[data-term]:visible')).toHaveCount(count);
  await page.locator('[data-term-reset]').click();
  await expect(page.locator('[data-term-availability]')).toHaveValue('available');
  await expect(page.locator('[data-term]:visible')).toHaveCount(6);
});

test('search works while release requests are pending and refreshed counts keep the active query', async ({ page }) => {
  const novels = JSON.parse(await readFile('dist/catalog-index.json', 'utf8'));
  novels.find((n: { slug: string }) => n.slug === 'khranitel-mayaka').serial = true;
  await page.route('**/catalog-index.json', route => route.fulfill({ json: novels }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested = false;
  await page.route('**/rest/v1/serial_chapters?**', async route => {
    requested = true;
    await gate;
    await route.fulfill({ json: Array.from({ length: 55 }, (_, i) => ({ number: i + 1, title: 'Published chapter' })) });
  });
  try {
    await page.goto('/catalog/');
    await expect.poll(() => requested).toBe(true);
    await page.getByPlaceholder('English or original title').fill('lighthouse');
    await expect(page.locator('#result-count')).toHaveText('Novels found: 1', { timeout: 3000 });
    const options = page.locator('#catalog-options');
    if (!(await options.evaluate(el => (el as HTMLDetailsElement).open))) await options.locator(':scope > summary').click();
    await page.locator('[name=minChapters]').fill('55');
    await expect(page.locator('#catalog-empty')).toBeVisible();
    release();
    await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
    await expect(page.locator('#catalog-results')).toContainText('55 chapters');
    await expect(page.getByPlaceholder('English or original title')).toHaveValue('lighthouse');
    await expect(page).toHaveURL(/minChapters=55/);
  } finally { release(); }
});

for (const surface of ['novel', 'library']) {
  test(`${surface} controls respond before serial chapters finish loading`, async ({ page }) => {
    const novels = JSON.parse(await readFile('dist/catalog.json', 'utf8'));
    novels.find((n: { slug: string }) => n.slug === 'khranitel-mayaka').serial = true;
    await page.route('**/catalog.json', route => route.fulfill({ json: novels }));
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/rest/v1/serial_chapters?**', async route => {
      await gate;
      await route.fulfill({ json: [] }).catch(() => {});
    });
    if (surface === 'library') await page.addInitScript(() => localStorage.setItem('hunmeng-novels:v1', JSON.stringify({
      version: 1, settings: {}, library: { 'khranitel-mayaka': 'reading' }, progress: {},
    })));
    try {
      await page.goto(surface === 'novel' ? '/novel/khranitel-mayaka/' : '/library/');
      if (surface === 'novel') {
        await page.getByRole('button', { name: 'Add to library', exact: true }).click();
        await expect(page.getByLabel('Library shelf', { exact: true })).toBeVisible({ timeout: 3000 });
      } else {
        await expect(page.locator('.library-row')).toHaveCount(1, { timeout: 3000 });
        await page.locator('[data-shelf-tab=later]').click();
        await expect(page.locator('#library-empty')).toBeVisible();
      }
    } finally { release(); }
  });
}

test('covers and text do not overlap and the header stays compact', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  for (const card of await page.locator('.catalog-novel-card').all()) {
    const cover = (await card.locator('.cover-link').boundingBox())!;
    const copy = (await card.locator('.novel-copy').boundingBox())!;
    expect(cover.x + cover.width + 12).toBeLessThanOrEqual(copy.x);
  }
  const header = (await page.locator('.site-header').boundingBox())!;
  expect(header.height).toBeLessThan(page.viewportSize()!.width > 760 ? 101 : 131);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
