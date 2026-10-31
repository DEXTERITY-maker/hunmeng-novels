import {test,expect} from './fixtures';

const eventUrl='/events/halloween-2026/';
for(const width of [1366,390]){
  for(const theme of ['light','dark'] as const){
    test(`Halloween event page at ${width}px in ${theme}: safe before migration, readable and no overflow`,async({page})=>{
      await page.setViewportSize({width,height:850});
      await page.route('**/rest/v1/rpc/reader_halloween_*',async route=>{
        await route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202',message:'Function not found'})});
      });
      await page.goto(eventUrl);
      await page.locator('html').evaluate((el,t)=>{el.dataset.theme=t;},theme);
      await expect(page.getByRole('heading',{name:/Halloween Reading Week/i})).toBeVisible();
      await expect(page.getByRole('heading',{name:'Awards for the top three'})).toBeVisible();
      await expect(page.getByText('Leaderboard opens soon.')).toBeVisible();
      await expect(page.getByRole('link',{name:'Sign in to join'})).toHaveAttribute('href','/account/');
      await expect(page.locator('.halloween-prize')).toHaveCount(3);
      await expect(page.locator('.halloween-prize-place')).toHaveText(['Place 1','Place 2','Place 3']);
      await expect(page.locator('.halloween-prize')).toContainText(['3,000 XP','2,000 XP','1,000 XP']);
      const hasOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      expect(hasOverflow).toBe(false);
      for(const image of await page.locator('[data-halloween-badge]').all()){
        const size=await image.getAttribute('src');
        expect(size).toMatch(/^\/images\/events\/halloween-2026\/(gold|silver|bronze)\.webp$/);
      }
      await page.screenshot({path:test.info().outputPath(`hunmeng-halloween-${width}-${theme}.png`),fullPage:true});
    });
  }
}
test('Halloween event page preserves guest privacy and explicit nick visibility warning',async({page})=>{
  await page.goto(eventUrl);
  await expect(page.getByText('Your chosen name is visible to everyone on the leaderboard.')).toHaveCount(1);
  await expect(page.locator('body')).not.toContainText('reader_xp_events');
  await expect(page.locator('body')).not.toContainText('user_id');
});
