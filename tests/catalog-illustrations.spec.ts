import { test, expect } from './fixtures';

test('catalog cards retain their markup and data after filtering, sorting and reset', async ({ page }) => {
  await page.goto('/catalog/');
  const cards = page.locator('#catalog-results .catalog-novel-card');
  await expect(cards).toHaveCount(2);
  const first = cards.first();
  const slug = await first.getAttribute('data-novel');
  const title = await first.locator('h2').innerText();
  const original = await first.evaluate(element => element.outerHTML);
  await expect(first.locator('.catalog-card-meta span')).toHaveCount(3);
  await page.locator('#catalog-filters input[name="search"]').fill(title);
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute('data-novel', slug!);
  const filtered = await cards.first().evaluate(element => element.outerHTML);
  expect(filtered, 'SSR and client-filtered cards must be the same HTML').toBe(original);
  await page.locator('#catalog-filters button[type="reset"]').click();
  await expect(cards).toHaveCount(2);
  await page.locator('#catalog-filters select[name="sort"]').selectOption('title');
  await expect(cards).toHaveCount(2);
  await expect(page.locator('#result-count')).toContainText('Novels found: 2');
});

test('novels without art keep a usable card, and 390px catalogue keeps the first result in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalog/');
  await expect(page.locator('.catalog-card-art')).toHaveCount(0);
  const cards = page.locator('#catalog-results .catalog-novel-card');
  await expect(cards).toHaveCount(2);
  const firstY = (await cards.first().boundingBox())!.y;
  expect(firstY).toBeLessThan(700);
  const action = cards.first().locator('.catalog-read-action');
  const card = await cards.first().boundingBox();
  const button = await action.boundingBox();
  expect(card).not.toBeNull();
  expect(button).not.toBeNull();
  expect(button!.width).toBeGreaterThanOrEqual(card!.width - 30);
  expect(button!.height).toBeGreaterThanOrEqual(44);
  for (const theme of ['light', 'dark', 'sepia']) {
    await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), theme).toBe(true);
    await expect(page.locator('[data-catalog-hero]')).toBeVisible();
  }
});

test('catalog links and controls stay available in all themes', async ({ page }) => {
  await page.goto('/catalog/');
  for (const theme of ['light', 'dark', 'sepia']) {
    await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
    await expect(page.getByRole('link', { name: /Browse genres/ })).toHaveAttribute('href', '/genres/');
    await expect(page.getByRole('link', { name: /Browse tags/ })).toHaveAttribute('href', '/tags/');
    await expect(page.getByLabel('Title or author')).toBeVisible();
    await expect(page.locator('#catalog-filters select[name="sort"]')).toBeEnabled();
    const colors = await page.locator('.catalog-read-action').first().evaluate((el) => {
      const css = getComputedStyle(el);
      const rgb = (color: string) => Array.from(color.matchAll(/[\d.]+/g), match => Number(match[0])).slice(0, 3);
      const luminosity = (color: string) => rgb(color).reduce((acc, v, i) => {
        const c = v / 255;
        const linear = c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
        return acc + linear * [0.2126, 0.7152, 0.0722][i];
      }, 0);
      const l1 = luminosity(css.color), l2 = luminosity(css.backgroundColor);
      return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05);
    });
    expect(colors, 'Read novel must meet WCAG AA in '+theme).toBeGreaterThanOrEqual(4.5);
  }
});
