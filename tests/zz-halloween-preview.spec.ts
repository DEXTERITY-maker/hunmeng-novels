import {test} from './fixtures';
const rows=[
 {place:1,display_name:'Moonlit Owl',chapters:58,team:false},
 {place:2,display_name:'Kirill Team',chapters:44,team:true},
 {place:3,display_name:'Lantern Fox',chapters:41,team:false},
 {place:4,display_name:'Тихий читатель',chapters:27,team:false},
 {place:5,display_name:'Autumn_Reader',chapters:12,team:false},
 {place:6,display_name:'Night Pages',chapters:3,team:false},
];
for(const scene of ['open','final'] as const) for(const scheme of ['light','dark'] as const) for(const width of [1366,390]){
 test(`hw ${scene} ${scheme} ${width}`,async({page},info)=>{
  await page.clock.setFixedTime(scene==='open'?'2026-11-03T12:00:00Z':'2026-11-08T09:00:00Z');
  await page.emulateMedia({colorScheme:scheme});
  await page.setViewportSize({width,height:900});
  await page.route('**/rest/v1/rpc/reader_halloween_*',async route=>{
   const fn=new URL(route.request().url()).pathname.split('/').pop();
   const body=fn==='reader_halloween_leaderboard'?rows:fn==='reader_halloween_event_finalized'?scene==='final':null;
   await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(body)});
  });
  await page.goto('/events/halloween-2026/');
  await page.waitForTimeout(1200);
  await page.screenshot({path:info.outputPath(`hunmeng-hw-event-${scene}-${scheme}-${width}.png`),fullPage:true,animations:'disabled'});
  if(scene==='open'){
   await page.goto('/');
   await page.waitForTimeout(800);
   const banner=page.locator('#halloween-home-banner');
   await banner.scrollIntoViewIfNeeded().catch(()=>{});
   await page.screenshot({path:info.outputPath(`hunmeng-hw-home-${scheme}-${width}.png`),fullPage:false,animations:'disabled'});
  }
 });
}
