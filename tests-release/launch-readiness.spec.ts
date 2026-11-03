import { test, expect } from '../tests/fixtures';

// This gate intentionally uses the same synthetic-content V2 release build as
// other release tests. It checks navigation across redesigned real routes,
// without signing in, reading private records or publishing content.
const publicPages = [
  {path:'/', selector:'main.v2-home'},
  {path:'/catalog/', selector:'main.v2-catalog-page'},
  {path:'/novel/khranitel-mayaka/', selector:'.novel-detail'},
  {path:'/novel/khranitel-mayaka/chapters/1/', selector:'main.v3-chapter-index'},
  {path:'/sources/highway-survival-lathe-gatling/', selector:'main.v3-source-page'},
  {path:'/news/', selector:'main.news-page'},
  {path:'/genres/', selector:'main.v3-taxonomy-page'},
  {path:'/tags/', selector:'main.v3-taxonomy-page'},
  {path:'/authors/', selector:'main.v3-authors-page'},
  {path:'/updates/', selector:'main.v3-updates-page'},
  {path:'/about/', selector:'main.v3-info-page'},
  {path:'/contacts/', selector:'main.v3-info-page'},
  {path:'/rules/', selector:'main.v3-info-page'},
  {path:'/rights/', selector:'main.v3-info-page'},
  {path:'/ranks/', selector:'main.v3-ranks-page'},
];
const privatePages = [
  {path:'/library/', selector:'main.library-page'},
  {path:'/account/', selector:'main.reader-account-page'},
  {path:'/studio/', selector:'main.v3-studio-page'},
];

test('launch-flagged V2 routes form a consistent no-overflow public/private experience', async ({page}) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({width,height:900});
    for (const route of [...publicPages,...privatePages]) {
      const response = await page.goto(route.path);
      expect(response?.status(),route.path+' @ '+width).toBe(200);
      await expect(page.locator('body'),route.path).toHaveClass(/hm-editorial-site/);
      await expect(page.locator(route.selector),route.path).toBeVisible();
      await expect(page.locator('nav.v3-primary-nav a').first(),route.path).toBeVisible();
      await expect(page.locator('footer.site-footer'),route.path).toBeVisible();
      await expect(page.locator('link[rel="canonical"]'),route.path)
        .toHaveAttribute('href',/^https:\/\/hunmeng-novel\.ru\//);
      const isPrivate = privatePages.some(p=>p.path===route.path);
      if (isPrivate) {
        await expect(page.locator('meta[name="robots"]'),route.path)
          .toHaveAttribute('content','noindex,follow');
      } else {
        await expect(page.locator('meta[name="robots"]'),route.path).toHaveCount(0);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
        route.path+' viewport overflow @ '+width).toBe(true);
    }
  }
});

test('V2 footer destinations resolve to actual routes and keep private pages protected', async ({page}) => {
  await page.goto('/');
  const urls = await page.locator('.site-footer .footer-link-group a')
    .evaluateAll(elements=>elements.map(a=>a.getAttribute('href')||''));
  expect(urls).toContain('/studio/');
  expect(urls).toContain('/rights/');
  expect(urls).toContain('/authors/');
  expect(urls).toContain('/tags/');
  expect(new Set(urls).size,'duplicate editorial footer destinations').toBe(urls.length);
  for(const href of urls){
    expect(href).toMatch(/^\/[a-z0-9\-/]*\/$/);
    // Browser navigation goes through serveStatic's context.route in
    // STATIC_TEST=1; page.request bypasses the fixture (no TCP server).
    const result=await page.goto(href);
    expect(result?.status(),'footer destination '+href).toBe(200);
  }
  // Return to the page whose footer contains the verified navigation link.
  await page.goto('/');
  await page.getByRole('link',{name:'Writing studio'}).click();
  await expect(page).toHaveURL(/\/studio\/$/);
  await expect(page.locator('meta[name="robots"]'))
    .toHaveAttribute('content','noindex,follow');
  await expect(page.locator('#studio-workspace')).toBeHidden();
});

test('unknown URLs, reader preview and private staff preview stay outside public SEO', async ({page}) => {
  const missing = await page.goto('/hunmeng-v2-no-such-public-route-404/');
  expect(missing?.status()).toBe(404);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
  await expect(page.getByRole('link',{name:'Browse catalog'})).toHaveAttribute('href','/catalog/');

  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await expect(page.locator('body')).toHaveClass(/v2-reader/);
  await expect(page.locator('body')).not.toHaveClass(/hm-editorial-site/);
  await expect(page.locator('#chapter-text p').first()).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);

  for(const route of ['/v2/','/v2/catalog/','/v2/admin/']){
    await page.goto(route);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
  }
  await expect(page.locator('#admin-workspace')).toBeHidden();
});
