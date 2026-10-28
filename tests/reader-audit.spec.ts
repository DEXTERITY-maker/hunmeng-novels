import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';

const user={
 id:'00000000-0000-4000-8000-000000000023',aud:'authenticated',
 role:'authenticated',email:'reader@example.test',
 user_metadata:{},app_metadata:{},identities:[],created_at:'2026-10-20T00:00:00Z',
};
const session=()=>({
 access_token:[
  Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
  'fixture-signature'].join('.'),
 refresh_token:'test-reader-refresh',expires_at:Math.floor(Date.now()/1000)+3600,
 expires_in:3600,token_type:'bearer',user,
});
const key='hunmeng-novels:reader-auth:v1';
async function signedIn(page:Page){
 await page.addInitScript(({key,session})=>localStorage.setItem(key,JSON.stringify(session)),{key,session:session()});
}
async function service(page:Page){
 const calls:string[]=[];
 let awarded=false;
 await page.route('https://*.supabase.co/**',async route=>{
  const url=new URL(route.request().url());
  const path=url.pathname;calls.push(path);
  const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*',
   'access-control-expose-headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01',
   'content-type':'application/json'};
  const send=(body:unknown,status=200)=>route.fulfill({status,headers,body:JSON.stringify(body)});
  if(route.request().method()==='OPTIONS')return send({});
  if(path==='/auth/v1/user')return send(user);
  if(path==='/rest/v1/rpc/reader_begin_chapter')
   return send(awarded?null:'00000000-0000-4000-8000-000000000555');
  if(path==='/rest/v1/rpc/reader_finish_chapter') {
   const first=!awarded;awarded=true;return send(first);
  }
  if(path==='/rest/v1/rpc/reader_my_progress')
   return send({total_xp:awarded?80:0,chapters:awarded?1:0,completedNovels:0,readingDays:awarded?1:0,selected_title:'novice'});
  if(path==='/rest/v1/author_novels')return send([]);
  if(path==='/rest/v1/novel_reader_state'||path==='/rest/v1/reader_xp_events'||path==='/rest/v1/reader_reviews'||path==='/rest/v1/reader_published_reviews')return send([]);
  return send([]);
 });
 return {calls,earned:()=>awarded};
}

test('deep links #reading, #profile and #account open the correct tab with browser history',async({page})=>{
 await signedIn(page);await service(page);
 await page.goto('/account/#reading');
 await expect(page).toHaveURL(/#profile-reading$/);
 await expect(page.locator('#profile-reading')).toBeVisible();
 await expect(page.locator('#profile-details')).toBeHidden();
 await page.locator('[data-profile-section="profile-account"]').click();
 await expect(page).toHaveURL(/#profile-account$/);
 await expect(page.locator('#profile-account')).toBeVisible();
 await page.goBack();
 await expect(page.locator('#profile-reading')).toBeVisible();
 await page.goForward();
 await expect(page.locator('#profile-account')).toBeVisible();
});

test('no nickname is presented as an empty field and a deliberate prompt',async({page})=>{
 await signedIn(page);await service(page);
 await page.goto('/account/');
 await expect(page.locator('#profile-name')).toHaveText('Nickname not set');
 await expect(page.locator('input[name="nickname"]')).toHaveValue('');
 await expect(page.locator('[data-header-name]')).toHaveText('Set a nickname');
});

test('new releases opens a recently-added catalog, and mobile search placeholder fits',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const input=page.locator('#home-search-input');
 await expect(input).toHaveAttribute('placeholder','Title or author');
 const fits=await input.evaluate((input:HTMLInputElement)=>{
  const style=getComputedStyle(input);
  const canvas=document.createElement('canvas');
  const context=canvas.getContext('2d')!;
  context.font=`${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const textWidth=context.measureText(input.placeholder).width;
  const space=input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  return textWidth<=space-8;
 });
 expect(fits).toBe(true);
 await expect(page.locator('.home-discover a').last()).toHaveAttribute('href','/catalog/?sort=added');
 await page.locator('.home-discover a').last().click();
 await expect(page).toHaveURL(/\/catalog\/\?sort=added/);
 await expect(page.locator('#catalog-filters select[name="sort"]')).toHaveValue('added');
});

test('the featured cover loads real artwork and guest studio has no large empty gap',async({page})=>{
 await page.setViewportSize({width:390,height:850});
 await page.goto('/');
 const cover=page.locator('[data-feature-cover] img');
 await expect.poll(()=>cover.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 await page.goto('/studio/');
 await expect(page.locator('#studio-login')).toBeVisible();
 await expect(page.locator('#studio-workspace')).toBeHidden();
 const gap=await page.evaluate(()=>{
  const login=document.querySelector('#studio-login')!.getBoundingClientRect();
  const footer=document.querySelector('.site-footer')!.getBoundingClientRect();
  return footer.top-login.bottom;
 });
 expect(gap).toBeLessThan(180);
});

test('reading preferences remain on device and explain why library sync is different',async({page})=>{
 await signedIn(page);await service(page);
 await page.goto('/account/#reading');
 const section=page.locator('#profile-reading');
 await expect(section).toBeVisible();
 await expect(section).toContainText('saved on this device only');
 await expect(section).toContainText('Library cloud sync does not transfer');
});

test('reader XP shows session and server-verified reward, then never awards twice',async({page})=>{
 await page.clock.install();
 await signedIn(page);
 const fake=await service(page);
 await page.goto('/novel/khranitel-mayaka/glava-1/');
 const status=page.locator('#reader-reward-status');
 await expect(status).toContainText('90 seconds');
 await page.mouse.wheel(0,1200);
 await page.locator('#chapter-text').evaluate(el=>el.scrollIntoView({block:'end'}));
 await page.clock.fastForward(92000);
 await expect(status).toContainText('+80 XP awarded');
 expect(fake.earned()).toBe(true);
 await page.reload();
 await expect(status).toContainText('already rewarded');
 await page.goto('/account/');
 await expect(page.locator('#reader-stat-chapters')).toHaveText('1');
});
