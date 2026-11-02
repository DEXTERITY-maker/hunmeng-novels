import { test, expect } from './fixtures';

test('design mockup is noindexed and uses real library content', async ({ page }) => {
  await page.goto('/design-preview/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
  await expect(page.getByRole('heading',{name:/A Thousand Worlds/})).toBeVisible();
  await expect(page.locator('.em-header')).toBeVisible();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('.em-feature-cover')).toHaveAttribute('href', /^\/novel\//);
  await expect(page.locator('.em-category')).toHaveCount(6);
  await expect(page.locator('.em-collection')).toHaveCount(3);
  await expect(page.locator('.em-editor-row')).toHaveCount(1);
  await expect(page.locator('.em-article-row').first()).toHaveAttribute('href', /^\/news\//);
  await expect(page.locator('a.em-newsletter-button')).toHaveAttribute('href','/account/');
});

test('design mockup search and navigation remain functional', async ({ page }) => {
  await page.goto('/design-preview/');
  const menu=page.locator('.em-menu');
  await menu.locator('summary').click();
  await expect(menu).toHaveAttribute('open','');
  await expect(menu.getByRole('link',{name:'Account'})).toHaveAttribute('href','/account/');
  await menu.locator('summary').click();
  await page.getByRole('searchbox',{name:'Search books and authors'}).fill('lighthouse');
  await page.getByRole('button',{name:'Search',exact:true}).click();
  await expect(page).toHaveURL(/\/catalog\/\?search=lighthouse/);
});

test('design mockup matches accessible, overflow-free mobile layout and saves screenshots', async ({ page }, testInfo) => {
  for (const width of [320,375,390,768,1280]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/design-preview/');
    await expect(page.locator('.em-feature')).toBeVisible();
    const size=await page.evaluate(() => ({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    expect(size.scroll, 'horizontal overflow at '+width).toBeLessThanOrEqual(size.width+1);
    for(const selector of ['.em-header','.em-hero','.em-feature','.em-category','.em-collection','.em-newsletter']) {
      for(const e of await page.locator(selector).all()) {
        const box=await e.boundingBox(); if(!box) continue;
        expect(box.x,selector+' left at '+width).toBeGreaterThanOrEqual(-1);
        expect(box.x+box.width,selector+' right at '+width).toBeLessThanOrEqual(width+1);
      }
    }
    if(width===390 || width===1280) {
      await page.screenshot({path:testInfo.outputPath('hunmeng-editorial-mockup-'+width+'.png'),fullPage:true,animations:'disabled'});
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/design-preview/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveCount(1);
});
