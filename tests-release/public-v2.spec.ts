import { test, expect } from '../tests/fixtures';
import { readFile } from 'node:fs/promises';

test('public V2 homepage is canonical and retains the old reader library', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.v2-home')).toBeVisible();
  await expect(page.locator('main.home-page')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('.v2-preview-bar')).toHaveCount(0);
  await expect(page.locator('#continue-section')).toBeAttached();
  await expect(page.locator('form.v2-search')).toHaveAttribute('action', '/catalog/');
  await expect(page.getByRole('link', { name: /Browse the library/ })).toHaveAttribute('href', '/catalog/');
  await expect(page.getByRole('link', { name: /Try the V2 reader/ })).toHaveAttribute('href', /\/novel\/[^/]+\/[^/]+\/$/);
  await expect(page.locator('.v2-bottom-note')).not.toContainText('Preview edition');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /https:\/\/hunmeng-novel\.ru\/$/);
});

test('public V2 catalog uses canonical search, tags and external reference labels', async ({ page }) => {
  await page.goto('/catalog/');
  await expect(page.locator('main.v2-catalog-page')).toBeVisible();
  await expect(page.locator('.v2-catalog-preview')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(2);
  await expect(page.locator('.v2-catalog-picks a').first()).toHaveAttribute('href', '/catalog/?sort=added');
  await page.locator('#catalog-filters input[name="search"]').fill('lighthouse');
  await expect(page).toHaveURL(/\/catalog\/\?search=lighthouse/);
  await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
  await page.reload();
  await expect(page.locator('#catalog-filters input[name="search"]')).toHaveValue('lighthouse');
});

test('canonical reader uses V2 styles without changing chapter URL or progress keys', async ({ page }) => {
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await expect(page.locator('body')).toHaveClass(/v2-reader/);
  await expect(page.locator('main[data-reader][data-chapter="glava-1"]')).toBeVisible();
  const editorialChapterHeading = await page.locator('.reader-main > .reader-heading').evaluate(
    element => getComputedStyle(element).backgroundImage);
  expect(editorialChapterHeading).toContain('linear-gradient');
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('.v2-reader-preview-bar')).toHaveCount(0);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await page.goto('/v2/read/khranitel-mayaka/glava-1/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});

test('private staff and prototype routes keep their protection and SEO boundaries', async ({ page }) => {
  for (const route of ['/v2/', '/v2/catalog/', '/v2/admin/']) {
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
  }
  await expect(page.locator('#admin-workspace')).toBeHidden();
  const xml = await readFile('dist/sitemap-0.xml', 'utf8');
  expect(xml).toContain('/catalog/');
  expect(xml).not.toContain('/v2/');
});

test('V2 live home and catalog stay inside the narrow mobile viewport', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    for (const route of ['/', '/catalog/']) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), route+' @ '+width).toBe(true);
    }
  }
});

test('public V2 screenshot evidence and browser errors on all launch pages', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = [
    {url: '/', name: 'home', selector: 'main.v2-home'},
    {url: '/catalog/', name: 'catalog', selector: 'main.v2-catalog-page'},
    {url: '/novel/khranitel-mayaka/glava-1/', name: 'reader', selector: 'body.v2-reader #chapter-text'},
    {url: '/v2/admin/', name: 'admin-guest', selector: 'main.v2-admin-page'},
  ];
  for (const route of routes) {
    await page.goto(route.url);
    await expect(page.locator(route.selector)).toBeVisible();
    if (route.name === 'admin-guest') await expect(page.locator('#admin-workspace')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('hunmeng-v2-public-' + route.name + '.png'),
      fullPage: false,
      animations: 'disabled',
    });
  }
  expect(errors).toEqual([]);
});

test('public V2 novel details keep actions and chapters with the new editorial shell', async ({ page }, testInfo) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/novel/khranitel-mayaka/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-novel-nav a')).toHaveCount(5);
    await expect(page.locator('.v3-novel-nav a[aria-current="page"]')).toHaveAttribute('href', '/catalog/');
    await expect(page.locator('.novel-detail')).toBeVisible();
    await expect(page.locator('.novel-primary-read')).toHaveAttribute('href', '/novel/khranitel-mayaka/glava-1/');
    await expect(page.locator('.personal-rating-stars button')).toHaveCount(5);
    await expect(page.locator('.chapter-list a').first()).toHaveAttribute('href', '/novel/khranitel-mayaka/glava-1/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'book overflow @ ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({ path: testInfo.outputPath('hunmeng-v2-public-book-' + width + '.png'), fullPage: true, animations: 'disabled' });
    }
  }
});

test('public V2 library keeps real shelves and local reading progress inside responsive editorial layout', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('hunmeng-novels:v1', JSON.stringify({
      version: 1,
      library: { 'khranitel-mayaka': 'reading' },
      progress: {},
    }));
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/library/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-library-nav a')).toHaveCount(6);
    await expect(page.locator('.v3-library-nav a[aria-current="page"]')).toHaveAttribute('href', '/library/');
    await expect(page.locator('.shelf-tab')).toHaveCount(4);
    await expect(page.locator('[data-shelf-tab="reading"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.library-novel-row')).toHaveCount(1);
    await expect(page.locator('.library-chapter-progress')).toBeVisible();
    const visual = await page.locator('.library-hero').evaluate(el => ({
      background: getComputedStyle(el).backgroundImage,
      title: getComputedStyle(el.querySelector('h1')!).color,
    }));
    expect(visual.background, 'original artwork is actually visible @ ' + width).toContain('hero-mountains.svg');
    expect(visual.title, 'hero title remains legible @ ' + width).toMatch(/^rgb\(255,/);
    const descriptionColor = await page.locator('.library-hero-copy > p:last-child').evaluate(
      el => getComputedStyle(el).color);
    expect(descriptionColor, 'hero supporting text contrast @ ' + width).toBe('rgb(234, 240, 229)');
    const readActionColor = await page.locator('.library-row-action').first().evaluate(el => getComputedStyle(el).color);
    expect(readActionColor, 'read action text contrast @ ' + width).toMatch(/^rgb\(255,/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'library overflow @ ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({path: testInfo.outputPath('hunmeng-v2-public-library-' + width + '.png'),
        fullPage: true, animations: 'disabled'});
    }
  }
  await page.locator('.library-novel-row select').selectOption('later');
  await expect(page.locator('.library-novel-row')).toHaveCount(0);
  await page.locator('[data-shelf-tab="later"]').click();
  await expect(page.locator('.library-novel-row')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('public V2 account keeps guest sign-in protected with responsive editorial framing', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height:900});
    await page.goto('/account/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-profile-nav a')).toHaveCount(6);
    await expect(page.locator('.v3-profile-nav a[aria-current="page"]')).toHaveAttribute('href','/account/');
    await expect(page.locator('#auth-fields')).toBeVisible();
    await expect(page.locator('#auth-logged-in')).toBeHidden();
    await expect(page.locator('#auth-form input[name="email"]')).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'account viewport ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-profile-guest-' + width + '.png'),
        fullPage:true, animations:'disabled'});
    }
  }
  expect(errors).toEqual([]);
});

test('public V2 news uses editorial layout with working category filters and responsive cards', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/news/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-news-nav a')).toHaveCount(6);
    await expect(page.locator('.v3-news-nav a[aria-current="page"]')).toHaveAttribute('href', '/news/');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('#news-feed [data-news-card]').first()).toBeVisible();
    const heroImage = await page.locator('.news-heading.news-hero').evaluate(el => getComputedStyle(el).backgroundImage);
    expect(heroImage, 'editorial hero background @ ' + width).toContain('hero-mountains');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'news overflow @ ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({path: testInfo.outputPath('hunmeng-v2-news-' + width + '.png'),
        fullPage: true, animations: 'disabled'});
    }
  }
  await page.locator('[data-news-filter="changelog"]').click();
  await expect(page).toHaveURL(/\/news\/\?category=changelog/);
  await expect(page.locator('[data-news-filter="changelog"]')).toHaveAttribute('aria-current', 'page');
  await page.locator('[data-news-filter="all"]').click();
  await expect(page).toHaveURL(/\/news\/$/);
  expect(errors).toEqual([]);
});

test('public V2 article keeps real content, reactions, metadata and SEO', async ({ page }, testInfo) => {
  await page.goto('/news/');
  const link = page.locator('#news-feed .news-card h3 a').first();
  const target = await link.getAttribute('href');
  expect(target).toMatch(/^\/news\/[^/]+\/$/);
  await page.goto(target!);
  await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
  await expect(page.locator('.v3-news-nav a[aria-current="page"]')).toHaveAttribute('href', '/news/');
  await expect(page.locator('main.news-article-shell')).toBeVisible();
  await expect(page.locator('.news-article h1')).not.toBeEmpty();
  await expect(page.locator('.news-article-body')).not.toBeEmpty();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('.news-reaction-options button')).toHaveCount(6);
  await page.locator('.news-reaction-options button').first().click();
  await expect(page.locator('#news-reaction-status')).toContainText('You selected');
  await page.reload();
  await expect(page.locator('.news-reaction-options button').first()).toHaveAttribute('aria-pressed', 'true');
  for (const width of [390, 1280]) {
    await page.setViewportSize({width,height:900});
    await expect(page.locator('.news-article-body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'article overflow @ ' + width).toBe(true);
    await page.screenshot({path:testInfo.outputPath('hunmeng-v2-article-' + width + '.png'),
      fullPage: true, animations: 'disabled'});
  }
});
