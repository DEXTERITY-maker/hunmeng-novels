import { test, expect } from '../tests/fixtures';
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

// Full-page captures must not freeze lazy images before they have decoded, or
// leave the off-screen skip link painted over the article after scrolling.
async function prepareNewsScreenshot(page: Page) {
  const images=page.locator('main img:visible');
  for(let i=0;i<await images.count();i++){
    const image=images.nth(i);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await image.evaluate(async el => { await (el as HTMLImageElement).decode(); });
  }
  await page.evaluate(() => {
    if(document.activeElement instanceof HTMLElement) document.activeElement.blur();
    window.scrollTo(0,0);
  });
}

test('public V2 homepage is canonical and retains the old reader library', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main.v2-home')).toBeVisible();
  await expect(page.locator('main.home-page')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator('.v2-preview-bar')).toHaveCount(0);
  await expect(page.locator('#continue-section')).toBeAttached();
  await expect(page.locator('form.v2-search')).toHaveAttribute('action', '/catalog/');
  await expect(page.getByRole('link', { name: /Browse the library/ })).toHaveAttribute('href', '/catalog/');
  const featuredReaderLink = page.locator('.v2-spotlight-link');
  await expect(featuredReaderLink).toHaveAttribute('href', /\/novel\/[^/]+\/[^/]+\/$/);
  await expect(featuredReaderLink).toHaveAttribute('aria-label', /^Read .+/);
  await expect(page.locator('.v3-category-icon svg')).toHaveCount(6);
  await expect(page.locator('.v3-category-row').filter({ hasText: 'Science Fiction' }))
    .toHaveAttribute('href', '/catalog/?genre=Science%20Fiction');
  await expect(page.locator('.v2-bottom-note')).not.toContainText('Preview edition');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /https:\/\/hunmeng-novel\.ru\/$/);
});


test('curated collection cards use their own original optimized cover art and preserve catalog links', async ({ page }) => {
  await page.goto('/');
  const cards=page.locator('#v3-collections .v3-collection-card');
  await expect(cards).toHaveCount(3);
  const expected=[
    {name:'Fantasy & Wonder',src:'/images/editorial/collection-fantasy.webp',href:'/catalog/?genre=Fantasy'},
    {name:'Mystery & Intrigue',src:'/images/editorial/collection-mystery.webp',href:'/catalog/?genre=Mystery'},
    {name:'Worlds of Tomorrow',src:'/images/editorial/collection-future.webp',href:'/catalog/?genre=Science%20Fiction'},
  ];
  for(const [index,item] of expected.entries()){
    const card=cards.nth(index);
    await expect(card.locator('strong')).toHaveText(item.name);
    await expect(card).toHaveAttribute('href',item.href);
    const image=card.locator('img');
    await expect(image).toHaveAttribute('src',item.src);
    await image.scrollIntoViewIfNeeded();
    await expect.poll(async()=>image.evaluate(node=>(node as HTMLImageElement).naturalWidth),{
      message:'Collection image must decode: '+item.src,
      timeout:10000,
    }).toBe(960);
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bounds=await page.locator('#v3-collections .v3-collection-card').evaluateAll(nodes=>
    nodes.map(node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,width:r.width};}));
  expect(bounds[1].top).toBeGreaterThan(bounds[0].bottom);
  expect(bounds[2].top).toBeGreaterThan(bounds[1].bottom);
  for(const b of bounds) expect(b.width).toBeGreaterThan(280);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
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

test('external story artwork is labeled and keeps its proportions on narrow screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/sources/highway-survival-lathe-gatling/');
  const cover = page.locator('.external-novel-cover img');
  await expect(cover).toHaveAttribute('src', '/images/editorial/highway-survival-art.webp');
  await expect(cover).toHaveAttribute('alt', /Hunmeng editorial illustration/);
  await expect(page.locator('.external-novel-cover span')).toContainText('Hunmeng illustration');
  await expect.poll(() => cover.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const bounds = await cover.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.height / bounds!.width).toBeCloseTo(1.5, 1);
  await expect(page.getByRole('link', { name: /Read on WTR-Lab/ })).toHaveAttribute('href', /^https:\/\/wtr-lab\.com\//);
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
      await prepareNewsScreenshot(page);
      await page.screenshot({path: testInfo.outputPath('hunmeng-v2-public-news-' + width + '.png'),
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
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    await expect(page.locator('.news-article-body')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'article overflow @ ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await prepareNewsScreenshot(page);
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-article-' + width + '.png'),
        fullPage: true, animations: 'disabled'});
    }
  }
});

test('featured news cards keep their text and article links inside the card', async ({ page }) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    for (const filter of ['all', 'changelog']) {
      await page.goto(filter === 'all' ? '/news/' : '/news/?category=changelog');
      await expect(page.locator(`[data-news-filter="${filter}"]`)).toHaveAttribute('aria-current','page');
      const card=page.locator('#news-feed .news-card:visible').first();
      const readMore=card.locator('.news-read-more');
      await expect(readMore).toBeVisible();
      const bounds=await card.evaluate(element => {
        const cardRect=element.getBoundingClientRect();
        const paragraph=element.querySelector('.news-card-body > p')!.getBoundingClientRect();
        const link=element.querySelector('.news-read-more')!.getBoundingClientRect();
        return {bottom:cardRect.bottom, paragraphBottom:paragraph.bottom, linkBottom:link.bottom};
      });
      expect(bounds.paragraphBottom, `excerpt inside card: ${filter} @ ${width}`).toBeLessThanOrEqual(bounds.bottom+1);
      expect(bounds.linkBottom, `article link inside card: ${filter} @ ${width}`).toBeLessThanOrEqual(bounds.bottom+1);
      const target=await readMore.getAttribute('href');
      expect(target).toMatch(/^\/news\/[^/]+\/$/);
      await readMore.click();
      await expect(page).toHaveURL(new RegExp(target!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
      await expect(page.locator('.news-article h1')).toBeVisible();
    }
  }
});

test('public V2 informational pages retain their original legal content and usable mobile layout', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const routes = [
    { url: '/about/', label: 'About', name: 'about' },
    { url: '/contacts/', label: 'Contact', name: 'contact' },
    { url: '/rules/', label: 'Terms and privacy', name: 'privacy' },
    { url: '/rights/', label: 'Rights holders', name: 'rights' },
  ];
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of routes) {
      await page.goto(route.url);
      await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
      await expect(page.locator('main.v3-info-page')).toBeVisible();
      await expect(page.locator('.v3-info-nav a')).toHaveCount(6);
      await expect(page.locator('main h1')).toHaveText(route.label);
      await expect(page.locator('main .back-link')).toHaveAttribute('href', '/');
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        route.url + ' overflow @ ' + width).toBe(true);
      const headingBackground = await page.locator(route.name === 'rights' ? '.rights-hero' : 'main h1')
        .evaluate(el => getComputedStyle(el).backgroundImage);
      expect(headingBackground, route.name + ' editorial artwork @ ' + width).toContain('hero-mountains');
      if (width === 390 || width === 1280) {
        await page.screenshot({
          path: testInfo.outputPath('hunmeng-v2-public-info-' + route.name + '-' + width + '.png'),
          fullPage: true, animations: 'disabled',
        });
      }
    }
  }
  await page.goto('/about/');
  await expect(page.getByRole('link', { name: 'terms and privacy' })).toHaveAttribute('href', '/rules/');
  await page.goto('/contacts/');
  await expect(page.getByRole('link', { name: 'information for rights holders' })).toHaveAttribute('href', '/rights/');
  await page.goto('/rules/');
  await expect(page.getByRole('heading', { name: 'Library and reading data' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reader account' })).toBeVisible();
  await page.goto('/rights/');
  await expect(page.locator('.rights-steps li')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('public V2 chapter updates show real published chapters in a responsive editorial index', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/updates/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-utility-nav a')).toHaveCount(6);
    await expect(page.locator('main.v3-updates-page')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'All updates' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('.updates-page .home-chapter-grid li').first()).toBeVisible();
    await expect(page.locator('.updates-page .home-chapter-link').first())
      .toHaveAttribute('href', /^\/novel\/[^/]+\/[^/]+\/$/);
    await expect(page.locator('.updates-page .home-chapter-link img').first()).toBeVisible();
    const allDates = await page.locator('.updates-page time[datetime]').evaluateAll(
      elements => elements.map(el => el.getAttribute('datetime') || ''),
    );
    expect(allDates, 'newest-first release order @ ' + width)
      .toEqual([...allDates].sort((a, b) => b.localeCompare(a)));
    const artwork = await page.locator('.updates-page .page-heading')
      .evaluate(el => getComputedStyle(el).backgroundImage);
    expect(artwork).toContain('hero-mountains.svg');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'updates overflow @ ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({
        path: testInfo.outputPath('hunmeng-v2-public-chapter-updates-' + width + '.png'),
        fullPage: true, animations: 'disabled',
      });
    }
  }
  const first = await page.locator('.updates-page .home-chapter-link').first().getAttribute('href');
  await page.goto(first!);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('public V2 unknown URL returns the editorial 404 and keeps crawler protections', async ({ page }, testInfo) => {
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height:900});
    const response = await page.goto('/missing-page-for-hunmeng-v2-404/');
    expect(response?.status()).toBe(404);
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('main.v3-error-page')).toBeVisible();
    await expect(page.locator('meta[name="robots"]'))
      .toHaveAttribute('content', 'noindex,follow');
    await expect(page.locator('.v3-utility-nav a')).toHaveCount(6);
    await expect(page.getByRole('heading', { name: 'This page is lost' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse catalog' }))
      .toHaveAttribute('href', '/catalog/');
    const artwork = await page.locator('main.v3-error-page')
      .evaluate(el => getComputedStyle(el).backgroundImage);
    expect(artwork).toContain('hero-mountains.svg');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      '404 overflow @ ' + width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({
        path: testInfo.outputPath('hunmeng-v2-public-not-found-' + width + '.png'),
        fullPage: true, animations: 'disabled',
      });
    }
  }
  await page.getByRole('link', { name: 'Browse catalog' }).click();
  await expect(page).toHaveURL(/\/catalog\/$/);
  await expect(page.locator('main.v2-catalog-page')).toBeVisible();
});

test('V2 genre and tag directories preserve real taxonomy filters in responsive editorial cards', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const directories = [
    { url: '/genres/', label: 'Genres', slug: 'genres' },
    { url: '/tags/', label: 'Tags', slug: 'tags' },
  ];
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    for (const directory of directories) {
      await page.goto(directory.url);
      await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
      await expect(page.locator('main.v3-taxonomy-page')).toBeVisible();
      await expect(page.locator('.v3-discovery-nav a')).toHaveCount(6);
      await expect(page.getByRole('heading', {name:directory.label,exact:true})).toBeVisible();
      await expect(page.locator('.taxonomy-nav [aria-current="page"]'))
        .toHaveAttribute('href',directory.url);
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('[data-term-search]')).toBeVisible();
      await expect(page.locator('[data-term-count]')).toContainText('Showing ');
      await expect(page.locator('[data-term]:visible').first()).toBeVisible();
      const hero = await page.locator('main.v3-taxonomy-page > .page-heading')
        .evaluate(el=>getComputedStyle(el).backgroundImage);
      expect(hero).toContain('hero-mountains.svg');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1),
        directory.url+' overflow @ '+width).toBe(true);
      if(width===390||width===1280){
        await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-taxonomy-'+directory.slug+'-'+width+'.png'),
          fullPage:true,animations:'disabled'});
      }
    }
  }
  await page.goto('/genres/');
  await page.locator('[data-term-search]').fill('fantasy');
  await expect(page.locator('[data-term]:visible')).not.toHaveCount(0);
  await page.locator('[data-term]:visible a').first().click();
  await expect(page.locator('#catalog-results')).toBeVisible();
  await page.goto('/tags/');
  await page.locator('[data-term-availability]').selectOption('all');
  const total = await page.locator('[data-term]:visible').count();
  expect(total).toBeGreaterThan(800);
  await page.locator('[data-term-search]').fill('no-such-tag-hunmeng-2-test');
  await expect(page.locator('[data-term-empty]')).toBeVisible();
  await page.locator('[data-term-reset]').click();
  await expect(page.locator('[data-term-empty]')).toBeHidden();
  await expect(page.locator('[data-term-availability]')).toHaveValue('available');
  expect(errors).toEqual([]);
});

test('V2 authors directory shows real authors and links into the existing catalog', async ({page},testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/authors/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('main.v3-authors-page')).toBeVisible();
    await expect(page.locator('.v3-discovery-nav a')).toHaveCount(6);
    await expect(page.locator('main h1')).toHaveText('Our authors');
    await expect(page.locator('.author-directory-card').first()).toBeVisible();
    await expect(page.locator('.author-directory-card h2 a').first()).toHaveAttribute('href',/^\/catalog\/\?search=/);
    await expect(page.locator('.author-directory-card li a').first()).toHaveAttribute('href',/^\/novel\/[^/]+\/$/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'authors overflow @ '+width).toBe(true);
    if(width===390||width===1280){
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-authors-'+width+'.png'),
        fullPage:true,animations:'disabled'});
    }
  }
  await page.locator('.author-directory-card h2 a').first().click();
  await expect(page.locator('main.v2-catalog-page')).toBeVisible();
  expect(errors).toEqual([]);
});

test('V2 paginated book contents links to actual chapters and does not change pagination', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 900});
    await page.goto('/novel/khranitel-mayaka/chapters/1/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('main.v3-chapter-index')).toBeVisible();
    await expect(page.locator('.v3-book-extra-nav a')).toHaveCount(6);
    await expect(page.locator('.v3-book-extra-nav [aria-current="page"]')).toHaveAttribute('href','/catalog/');
    await expect(page.locator('main .back-link')).toHaveAttribute('href','/novel/khranitel-mayaka/');
    await expect(page.locator('.chapter-list a').first()).toHaveAttribute('href',
      /^\/novel\/khranitel-mayaka\/[^/]+\/$/);
    await expect(page.locator('nav.chapter-pagination')).toHaveCount(2);
    const hero = await page.locator('.v3-chapter-index .page-heading')
      .evaluate(el => getComputedStyle(el).backgroundImage);
    expect(hero).toContain('hero-mountains.svg');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'chapter index overflow @ '+width).toBe(true);
    if (width === 390 || width === 1280) {
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-chapter-index-'+width+'.png'),
        fullPage:true,animations:'disabled'});
    }
  }
  const chapterUrl = await page.locator('.chapter-list a').first().getAttribute('href');
  await page.goto(chapterUrl!);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('V2 external reference remains attributed and cannot be mistaken for a licensed chapter', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', err => errors.push(err.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/sources/highway-survival-lathe-gatling/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('main.v3-source-page')).toBeVisible();
    await expect(page.locator('.v3-book-extra-nav a')).toHaveCount(6);
    await expect(page.locator('main .novel-detail-breadcrumb a')).toHaveAttribute('href','/catalog/');
    await expect(page.locator('main h1')).toContainText('Highway Survival');
    await expect(page.locator('.external-novel-copy')).toContainText('publication rights remain unverified');
    await expect(page.locator('.external-novel-actions a[target="_blank"]')).toHaveCount(2);
    await expect(page.locator('.external-novel-actions a[rel="noopener noreferrer"]')).toHaveCount(2);
    await expect(page.locator('.chapter-list, [data-continue], .novel-primary-read')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'external book ref overflow @ '+width).toBe(true);
    if(width===390 || width===1280){
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-book-source-'+width+'.png'),
        fullPage:true,animations:'disabled'});
    }
  }
  expect(errors).toEqual([]);
});

test('V2 external source attribution stays readable in light, dark and system-dark themes', async ({page}) => {
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/sources/highway-survival-lathe-gatling/');
  await expect(page.locator('.external-novel-author strong')).toBeVisible();
  await expect(page.locator('.external-novel-status strong')).toBeVisible();

  // Check the actual theme cascade instead of relying on light-mode screenshots.
  for (const theme of ['light','dark','system']) {
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    for(const selector of [
      '.external-novel-author','.external-novel-author strong',
      '.external-novel-status','.external-novel-status strong',
    ]) {
      const ratio=await page.locator(selector).evaluate(element=>{
        const rgb=(color:string)=>(color.match(/[0-9]+(?:[.][0-9]+)?/g)||[]).slice(0,3).map(Number);
        const luminance=(channels:number[])=>channels.map(channel=>{
          const x=channel/255;
          return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);
        }).reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
        const fg=luminance(rgb(getComputedStyle(element).color));
        const paper=element.closest('.external-novel-detail')!;
        const bg=luminance(rgb(getComputedStyle(paper).backgroundColor));
        return (Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
      });
      expect(ratio,selector+' contrast in '+theme).toBeGreaterThanOrEqual(4.5);
    }
  }
});

test('V2 rank gallery retains all nine server-verified ranks and responsive editorial framing', async ({ page }, testInfo) => {
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/ranks/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('main.v3-ranks-page')).toBeVisible();
    await expect(page.locator('.v3-reader-resources-nav a')).toHaveCount(6);
    await expect(page.locator('.rank-world-card')).toHaveCount(9);
    await expect(page.locator('.rank-world-track li')).toHaveCount(9);
    await expect(page.locator('.rank-world-disclaimer')).toContainText('server-verified');
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('.rank-world-actions a[href="/account/"]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'ranks overflow @ '+width).toBe(true);
    if(width===390||width===1280){
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-ranks-'+width+'.png'),
        fullPage:true,animations:'disabled'});
    }
  }
});

test('V2 private writing studio keeps guest workspace hidden and protected from indexing', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', err=>errors.push(err.message));
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/studio/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('main.v3-studio-page')).toBeVisible();
    await expect(page.locator('.v3-reader-resources-nav a')).toHaveCount(6);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
    await expect(page.locator('#studio-workspace')).toBeHidden();
    await expect(page.locator('#studio-create')).toBeHidden();
    await expect(page.locator('#studio-login')).toBeVisible();
    await expect(page.getByRole('link',{name:'Sign in',exact:true}))
      .toHaveAttribute('href','/account/');
    const artwork=await page.locator('.studio-hero')
      .evaluate(el=>getComputedStyle(el).backgroundImage);
    expect(artwork).toContain('hero-mountains.svg');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'studio guest overflow @ '+width).toBe(true);
    if(width===390||width===1280){
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-studio-guest-'+width+'.png'),
        fullPage:true,animations:'disabled'});
    }
  }
  expect(errors).toEqual([]);
});

test('V2 studio opens existing private controls with fabricated account and no actual draft data', async ({ page }, testInfo) => {
  const user = {
    id:'00000000-0000-4000-8000-000000000077',
    email:'author@example.test',
    aud:'authenticated',role:'authenticated',
  };
  const session={
    access_token:[
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',
        exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
      'fixture-only-signature',
    ].join('.'),
    refresh_token:'test-only-refresh-token',token_type:'bearer',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,user,
  };
  await page.addInitScript(value=>{
    localStorage.setItem('hunmeng-novels:reader-auth:v1',JSON.stringify(value));
  },session);
  const headers={
    'access-control-allow-origin':'*','access-control-allow-headers':'*',
    'access-control-expose-headers':'x-supabase-api-version',
    'x-supabase-api-version':'2024-01-01','content-type':'application/json',
  };
  await page.route('https://*.supabase.co/**',route=>{
    const url=new URL(route.request().url());
    const data=url.pathname.endsWith('/auth/v1/user')?user:[];
    return route.fulfill({status:200,headers,body:JSON.stringify(data)});
  });
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/studio/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
    await expect(page.locator('#studio-workspace')).toBeVisible();
    await expect(page.locator('#studio-login')).toBeHidden();
    await expect(page.locator('#studio-create')).toBeVisible();
    await expect(page.locator('#studio-new-title')).toBeVisible();
    await expect(page.locator('#studio-chapter-panel')).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'studio synthetic account overflow @ '+width).toBe(true);
    await page.screenshot({
      path:testInfo.outputPath('hunmeng-v2-public-studio-synthetic-'+width+'.png'),
      fullPage:true,animations:'disabled',
    });
  }
});
