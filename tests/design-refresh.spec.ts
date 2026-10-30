import { test, expect } from './fixtures';

test('reading-room homepage keeps search, stories, updates and recommendations discoverable', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.home-hero h1')).toContainText('Stories worth');
  await expect(page.locator('.home-hero h1')).toContainText('coming back to.');
  await expect(page.locator('.home-hero-feature')).toHaveCount(1);
  await expect(page.locator('.home-cover-grid .home-book-card')).toHaveCount(2);
  await expect(page.locator('#latest-chapters .home-chapter-link').first()).toBeVisible();
  await expect(page.locator('#latest-news .news-card').first()).toBeVisible();
  await expect(page.locator('#recommended-novels .home-recommendation-card').first()).toBeVisible();
  await page.locator('#home-search-input').fill('lighthouse');
  await page.locator('.home-search button[type=submit]').click();
  await expect(page).toHaveURL(/\/catalog\/\?search=lighthouse/);
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await expect(page.locator('.catalog-read-action')).toBeVisible();
});

test('responsive layout keeps covers, featured shelf, footer and menus inside the viewport', async ({ page }) => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.home-hero-feature')).toBeVisible();
    const heroBounds = (await page.locator('.home-hero-content').boundingBox())!;
    for (const selector of ['.home-search button[type=submit]', '.home-discover a']) {
      const container = selector.includes('home-discover') ? (await page.locator('.home-page').boundingBox())! : heroBounds;
      for (const element of await page.locator(selector).all()) {
        const box = (await element.boundingBox())!;
        expect(box.x, selector + ' left in hero').toBeGreaterThanOrEqual(heroBounds.x - 1);
        expect(box.x + box.width, selector + ' right in hero').toBeLessThanOrEqual(heroBounds.x + heroBounds.width + 1);
      }
    }
    for (const selector of ['.home-hero-content', '.home-hero-feature', '.home-book-card', '.home-chapter-link', '.home-recommendation-card']) {
      for (const box of await page.locator(selector).all()) {
        const rect = (await box.boundingBox())!;
        expect(rect.x, selector + ' starts inside screen').toBeGreaterThanOrEqual(-1);
        expect(rect.x + rect.width, selector + ' fits screen').toBeLessThanOrEqual(width + 1);
      }
    }
    const overflow = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewport: innerWidth,
      offenders: [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(el => {
          const box = el.getBoundingClientRect();
          return box.width > 0 && box.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed';
        })
        .slice(0, 10)
        .map(el => ({ tag: el.tagName, className: el.className?.toString(), right: Math.round(el.getBoundingClientRect().right) })),
    }));
    expect(overflow.pageWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(width + 1);
    await page.goto('/catalog/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.goto('/authors/');
    await expect(page.getByRole('heading', { name: 'Our authors' })).toBeVisible();
    await expect(page.locator('.author-directory-card')).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});

test('editorial surfaces work in light, dark and sepia modes', async ({ page }) => {
  await page.goto('/');
  const backgrounds = [];
  for (const theme of ['light', 'dark', 'sepia']) {
    if (!(await page.locator('.appearance-control').evaluate(el => (el as HTMLDetailsElement).open))) {
      await page.getByRole('button', { name: 'Site appearance', exact: true }).click();
    }
    await page.getByRole('radio', { name: theme[0].toUpperCase() + theme.slice(1), exact: true }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const visual = await page.locator('.home-hero-copy').evaluate(element => {
      const css = getComputedStyle(element);
      return { background: css.backgroundImage, color: css.color, border: css.borderColor };
    });
    expect(visual.background).toContain('gradient');
    expect(visual.color).not.toBe('rgba(0, 0, 0, 0)');
    backgrounds.push(visual.background);
    await expect(page.locator('.home-feature-cover img')).toBeVisible();
  }
  expect(new Set(backgrounds).size).toBe(3);
});
