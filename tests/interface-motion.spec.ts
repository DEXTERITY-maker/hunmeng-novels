import { test, expect } from './fixtures';

test('catalog retains server-rendered cards while a slow search index loads', async ({ page }) => {
  let unblock!: () => void;
  const hold = new Promise<void>(resolve => { unblock = resolve; });
  await page.route('**/catalog-index.json', async route => {
    await hold;
    await route.continue();
  });
  await page.goto('/catalog/', { waitUntil: 'domcontentloaded' });
  const cards = page.locator('#catalog-results .catalog-novel-card');
  const status = page.locator('#catalog-load-status');
  await expect(cards.first()).toBeVisible();
  await expect(status).toBeVisible();
  await expect(page.locator('#catalog-results')).toHaveAttribute('aria-busy', 'true');
  unblock();
  await expect(status).toBeHidden();
  await expect(page.locator('#catalog-results')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#result-count')).toContainText('Novels found:');
});

test('catalog filtering animates once but honours reduced-motion settings', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.id === 'catalog-results') {
        const win = window as typeof window & { catalogMotionCount?: number };
        win.catalogMotionCount = (win.catalogMotionCount ?? 0) + 1;
      }
      return original.apply(this, args);
    };
  });
  await page.goto('/catalog/');
  await expect(page.locator('#catalog-results')).not.toHaveAttribute('aria-busy', 'true');

  await page.locator('#catalog-filters input[name=search]').fill('no matching novel, please');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 0');
  const animated = await page.evaluate(() =>
    (window as typeof window & { catalogMotionCount?: number }).catalogMotionCount ?? 0);
  expect(animated).toBeGreaterThan(0);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('#catalog-filters input[name=search]').fill('lighthouse');
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  const reduced = await page.evaluate(() =>
    (window as typeof window & { catalogMotionCount?: number }).catalogMotionCount ?? 0);
  expect(reduced).toBe(animated);
  const spinner = await page.locator('#catalog-load-status').evaluate(el =>
    getComputedStyle(el, '::before').animationName);
  expect(spinner).toBe('none');
});
