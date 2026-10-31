import {test, expect} from './fixtures';

const channel = 'https://t.me/hunmengnovels';
const novel = '/novel/khranitel-mayaka/';
const chapter = '/novel/khranitel-mayaka/glava-1/';

test('Telegram chapter notices link is visible on novel and chapter, on 390px in every theme', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  for (const theme of ['light','dark','sepia']) {
    for (const path of [novel,chapter]) {
      await page.goto(path);
      await page.locator('html').evaluate((el,value)=>{el.dataset.theme=value;},theme);
      const link=page.getByRole('link',{name:'Get new chapters in Telegram'});
      await expect(link).toBeVisible();
      await expect(link).toHaveAttribute('href',channel);
      await expect(link).toHaveAttribute('target','_blank');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),theme+': '+path).toBe(true);
      const colors=await link.evaluate(el=>({font:getComputedStyle(el).color,background:getComputedStyle(el).backgroundColor}));
      expect(colors.font).not.toEqual(colors.background);
      await expect(link).toHaveCSS('overflow-wrap',/anywhere|break-word/);
    }
  }
});
