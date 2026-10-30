import { test, expect } from './fixtures';

/** Regression checks for the targeted 29 Oct mobile release. */
test('home hero is readable immediately and leaves room for the catalog', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('#home-title')).toBeVisible();
  for (const selector of ['#home-title','.home-hero-kicker','.home-hero-description','.home-search','.home-hero-feature']) {
    await expect.poll(() => page.locator(selector).evaluate(el => Number.parseFloat(getComputedStyle(el).opacity))).toBe(1);
  }
  const hero = await page.locator('.home-hero-copy').boundingBox();
  expect(hero).toBeTruthy();
  // The new hero contains a full featured-story carousel; 515px was the
  // compact static-card threshold. Keep its height bounded, and directly
  // verify the first release needs only a short scroll on a 390px phone.
  expect(hero!.height).toBeLessThan(570);
  await expect(page.locator('#new-title')).toBeAttached();
  const firstRelease = await page.locator('.home-cover-grid .home-book-card').first().boundingBox();
  expect(firstRelease).toBeTruthy();
  expect(firstRelease!.y).toBeLessThan(1100);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({path:info.outputPath('hunmeng-mobile-hero-after.png'),animations:'disabled',fullPage:false});
});

test('catalog sort is always visible on mobile and filtering count updates', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/catalog/');
  const select = page.locator('#catalog-filters select[name=sort]');
  await expect(select).toBeVisible();
  await expect(select).toHaveCount(1);
  await expect(page.locator('#result-count')).toContainText(/Novels found:/);
  await select.selectOption('title');
  await expect(page).toHaveURL(/sort=title/);
  await page.locator('#catalog-filters input[name=search]').fill('not-a-real-novel-xyz');
  await expect(page.locator('#result-count')).toContainText(/Novels found: 0/);
  await expect(page.locator('#catalog-empty')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.locator('#catalog-filters input[name=search]').fill('');
  await page.screenshot({path:info.outputPath('hunmeng-mobile-catalog-after.png'),animations:'disabled',fullPage:false});
});

test('reading controls remain reachable and hide on downward scrolling', async ({page}, info) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  const toolbar = page.locator('.reader-toolbar');
  await expect(toolbar).toBeVisible();
  await page.evaluate(() => window.scrollTo({top:900,behavior:'instant'}));
  await expect.poll(() => page.locator('body').evaluate(el => el.classList.contains('controls-hidden'))).toBe(true);
  await expect(page.getByRole('button',{name:'Show reading controls'})).toBeVisible();
  await page.getByRole('button',{name:'Show reading controls'}).click();
  await expect(toolbar).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/controls-hidden/);
  await page.screenshot({path:info.outputPath('hunmeng-mobile-reader-after.png'),animations:'disabled',fullPage:false});
});

test('mobile novelty publication stats have separate published and planned counts in source', async () => {
  // The demo build used for browser tests has its own novel metadata. Verify
  // the production serial component contract rather than guessing demo data.
  const source = await import('node:fs/promises').then(fs => fs.readFile('src/pages/novel/[slug]/index.astro','utf8'));
  expect(source).toContain('published chapters');
  expect(source).toContain('planned in total');
  expect(source).toContain('serial-publication-stats');
});
