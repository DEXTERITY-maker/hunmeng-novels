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

for (const width of [390, 1366]) {
  test(`motion polish keeps catalog readable at ${width}px in every theme`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/catalog/');
    await expect(page.locator('#catalog-results')).not.toHaveAttribute('aria-busy', 'true');
    for (const theme of ['light', 'dark', 'sepia']) {
      await page.locator('html').evaluate((el, value) => {
        el.setAttribute('data-theme', value);
      }, theme);
      await expect(page.locator('#catalog-results .catalog-novel-card').first()).toBeVisible();
      await expect(page.locator('#catalog-load-status')).toBeHidden();
      const contrast = await page.locator('#catalog-results .catalog-novel-card').first().evaluate(el => {
        const style = getComputedStyle(el);
        return { border: style.borderColor, background: style.backgroundColor };
      });
      expect(contrast.border).not.toBe('rgba(0, 0, 0, 0)');
      expect(contrast.background).not.toBe('rgba(0, 0, 0, 0)');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({
        path: info.outputPath(`hunmeng-motion-${theme}-${width}.png`),
        animations: 'disabled',
        fullPage: false,
      });
    }
  });
}
