import { test, expect } from './fixtures';

test('Hunmeng 2.0 preview is index-safe and powered by the published library', async ({ page }) => {
  await page.goto('/v2/');
  await expect(page.locator('main#main.v2-home')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  await expect(page.getByRole('heading', { name: /A thousand worlds/ })).toBeVisible();
  await expect(page.locator('.v2-spotlight-cover')).toHaveAttribute('href', /^\/novel\//);
  await expect(page.getByRole('link', { name: /Try the V2 reader/ })).toHaveAttribute('href', /^\/v2\/read\/[^/]+\/[^/]+\/$/);
  await expect(page.locator('.v2-book')).toHaveCount(2);
  await expect(page.locator('.v2-book-cover').first()).toHaveAttribute('href', /^\/novel\//);
  await expect(page.locator('.v2-chapter-row').first()).toHaveAttribute('href', /^\/novel\//);
  await expect(page.locator('.v2-news-item').first()).toBeVisible();
  await expect(page.locator('.v2-discover a')).toHaveCount(3);
});

test('Hunmeng 2.0 search uses the existing catalog and filters, not mock data', async ({ page }) => {
  await page.goto('/v2/');
  await page.getByRole('searchbox', { name: 'Search by title or author' }).fill('lighthouse');
  await page.getByRole('button', { name: /Find a story/ }).click();
  await expect(page).toHaveURL(/\/v2\/catalog\/\?search=lighthouse/);
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
});

test('Hunmeng 2.0 remains within mobile viewports and preserves keyboard navigation', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/v2/');
    await expect(page.locator('.v2-hero h1')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'viewport ' + width).toBe(true);
    for (const selector of ['.v2-hero', '.v2-search', '.v2-spotlight', '.v2-book', '.v2-chapter-row', '.v2-reading-cta']) {
      for (const element of await page.locator(selector).all()) {
        const box = await element.boundingBox();
        if (!box) continue;
        expect(box.x, selector + ' left @' + width).toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, selector + ' right @' + width).toBeLessThanOrEqual(width + 1);
      }
    }
  }
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveCount(1);
});

test('Hunmeng 2.0 supports reduced motion and preserves the original homepage', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/v2/');
  await expect(page.locator('.v2-book')).toHaveCount(2);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const transition = await page.locator('.v2-discover a').first().evaluate(el => getComputedStyle(el).transitionDuration);
  expect(transition).toBe('0s');
  await page.getByRole('link', { name: /Return to the current website/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.home-hero h1')).toContainText('Stories worth');
});


test('editorial-inspired homepage uses real genres, working collections and no dummy inventory', async ({ page }) => {
  await page.goto('/v2/');
  await expect(page.locator('.v3-primary-nav a')).toHaveCount(5);
  await expect(page.locator('.v3-welcome')).toBeVisible();
  await expect(page.locator('.v3-category-row')).toHaveCount(6);
  await expect(page.locator('.v3-collection-card')).toHaveCount(3);
  await expect(page.locator('.v3-collection-card').first()).toHaveAttribute('href', '/v2/catalog/?genre=Fantasy');
  await expect(page.locator('.v2-search')).toHaveAttribute('action', '/v2/catalog/');
  await expect(page.locator('.v2-spotlight h2 a')).toHaveAttribute('href', /^\/novel\//);
  await expect(page.locator('.v3-article-image').first()).toHaveAttribute('href', /^\/news\//);
  await expect(page.locator('.v2-reading-actions a').first()).toHaveAttribute('href', /^https:\/\/t\.me\//);
  await expect(page.locator('body')).not.toContainText('1,280+ books');
  await expect(page.locator('body')).not.toContainText('The Endurance of Change');
});

test('editorial art direction keeps all major sections inside mobile and desktop viewports', async ({ page }, testInfo) => {
  for (const width of [320, 375, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/v2/');
    await expect(page.locator('.v2-hero h1')).toBeVisible();
    for (const selector of ['.v3-primary-nav', '.v2-hero', '.v2-search', '.v2-spotlight', '.v3-welcome', '.v3-categories', '.v3-collections', '.v3-depth', '.v2-reading-cta']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, selector + ' @ ' + width).not.toBeNull();
      expect(box!.x, selector + ' left @ ' + width).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width, selector + ' right @ ' + width).toBeLessThanOrEqual(width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow @ ' + width).toBe(true);
    if (width === 390) {
      const heroArt = await page.locator('.v2-hero').evaluate(el => getComputedStyle(el).backgroundImage);
      expect(heroArt).toContain('hero-mountains-mobile.svg');
    }
    if (width === 390 || width === 1280) {
      await page.screenshot({path:testInfo.outputPath('hunmeng-editorial-home-' + width + '.png'), fullPage:true, animations:'disabled'});
    }
  }
});
