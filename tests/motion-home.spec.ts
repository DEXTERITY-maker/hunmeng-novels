import { test, expect } from './fixtures';

test('Motion book grid preserves real SSR links, searchable Astro Hero and responsive layout',async({page})=>{
 const errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:860});
  await page.goto('/');
  await expect(page.locator('.home-hero #home-title')).toBeVisible();
  await expect(page.locator('.home-hero .home-search input[name=search]')).toBeEnabled();
  await expect(page.locator('.home-cover-grid .home-book-card')).toHaveCount(2);
  await expect(page.locator('.home-book-card .home-book-title').first()).not.toBeEmpty();
  const firstLink=page.locator('.home-cover-grid .home-book-link').first();
  await expect(firstLink).toHaveAttribute('href',/^\/novel\//);
  await expect(page.locator('.home-book-cover img').first()).toHaveAttribute('loading','lazy');
  await page.locator('.home-cover-grid').scrollIntoViewIfNeeded();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 expect(errors,errors.join(' | ')).toEqual([]);
 await page.locator('#home-search-input').fill('lighthouse');
 await page.locator('.home-search button[type=submit]').click();
 await expect(page).toHaveURL(/\/catalog\/\?search=lighthouse/);
});

test('reduced-motion keeps hero and cards accessible and native reading behaviour intact',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await expect(page.locator('#home-title')).toBeVisible();
 await expect(page.locator('.home-cover-grid .home-book-card')).toHaveCount(2);
 await expect(page.locator('.home-discover a')).toHaveCount(3);
 const hero=page.locator('#home-title');
 await expect.poll(()=>hero.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
 await page.locator('.home-book-card').first().scrollIntoViewIfNeeded();
 const computed=await page.locator('.hm-motion-book-card').first().evaluate(el=>{
  const style=getComputedStyle(el);return {transition:style.transitionDuration,animation:style.animationDuration};
 });
 expect(computed.transition).toMatch(/(^|,\s*)0s/);
});

test('editorial scroll is never started on the account screen',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/account/');
 await expect(page.locator('#reader-auth-submit')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.classList.contains('lenis'))).toBe(false);
});
