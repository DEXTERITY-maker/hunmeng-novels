import {test, expect} from '../tests/fixtures';

// Only built public pages and the guest library. Signed-in private profiles
// are covered separately by the fabricated-session regression suite.
const surfaces = [
  {path:'/', foreground:'.v2-external h2', paper:'.v2-external'},
  {path:'/', foreground:'.v2-external a', paper:'.v2-external'},
  {path:'/', foreground:'.v2-external > div > p:last-child', paper:'.v2-external'},
  {path:'/catalog/', foreground:'.catalog-novel-card .catalog-card-tags a', paper:'.catalog-novel-card .catalog-card-tags a'},
  {path:'/library/', foreground:'.shelf-tab[aria-pressed="true"] [data-shelf-count]', paper:'.shelf-tab[aria-pressed="true"] [data-shelf-count]'},
  {path:'/news/', foreground:'.news-feed .news-card .news-card-body > p', paper:'.news-feed .news-card'},
  {path:'/about/', foreground:'main.v3-info-page.prose-page > p', paper:'main.v3-info-page.prose-page'},
  {path:'/contacts/', foreground:'main.v3-info-page.prose-page > p', paper:'main.v3-info-page.prose-page'},
  {path:'/rules/', foreground:'main.v3-info-page.prose-page > p', paper:'main.v3-info-page.prose-page'},
];

test('V2 editorial text remains readable across public routes in dark and system-dark appearance',async({page})=>{
  await page.emulateMedia({colorScheme:'dark'});
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    for(const item of surfaces){
      await page.goto(item.path);
      await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
      // The home external-story panel is conditional on available references.
      // The synthetic release dataset may omit it; do not treat absent data
      // as a contrast failure. Other route targets are required.
      if(item.path==='/' && await page.locator('.v2-external').count()===0) continue;
      const foreground=page.locator(item.foreground).first();
      await expect(foreground,item.path+' @ '+width).toBeVisible();
      for(const theme of ['light','dark','system']){
        await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
        const ratio=await foreground.evaluate((element,paperSelector)=>{
          const color=(value:string)=>(value.match(/[0-9]+(?:[.][0-9]+)?/g)||[]).slice(0,3).map(Number);
          const luminance=(channels:number[])=>channels.map(channel=>{
            const x=channel/255;
            return x<=0.04045?x/12.92:Math.pow((x+0.055)/1.055,2.4);
          }).reduce((sum,x,i)=>sum+x*[0.2126,0.7152,0.0722][i],0);
          const surface=document.querySelector(paperSelector);
          if(!surface)throw new Error('Missing paint surface '+paperSelector);
          const fg=luminance(color(getComputedStyle(element).color));
          const bg=luminance(color(getComputedStyle(surface).backgroundColor));
          return (Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05);
        },item.paper);
        expect(ratio,item.path+' '+item.foreground+' '+theme+' @ '+width)
          .toBeGreaterThanOrEqual(4.5);
      }
    }
  }
});
