import {test,expect} from './fixtures';

const user={id:'00000000-0000-4000-8000-000000000023',email:'reader@example.test',
  aud:'authenticated',role:'authenticated',user_metadata:{},app_metadata:{},
  identities:[],created_at:'2026-10-20T00:00:00Z'};
const session=()=>({
 access_token:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
   Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
   'fixture-signature'].join('.'),
 refresh_token:'test-reader-refresh',expires_at:Math.floor(Date.now()/1000)+3600,
 expires_in:3600,token_type:'bearer',user,
});
async function mockAuth(page:import('@playwright/test').Page) {
 await page.addInitScript(value=>localStorage.setItem('hunmeng-novels:reader-auth:v1',JSON.stringify(value)),session());
 await page.route('https://*.supabase.co/**',route=>{
  const url=new URL(route.request().url());
  const body=url.pathname.endsWith('/auth/v1/user')?user:
    url.pathname==='/rest/v1/rpc/reader_my_progress'?{total_xp:0,chapters:0,completedNovels:0,readingDays:0,selected_title:'novice'}:[];
  return route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*',
    'access-control-expose-headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01'},
   body:JSON.stringify(body)});
 });
}
const save=async(page:import('@playwright/test').Page, info:import('@playwright/test').TestInfo,name:string)=>
  page.screenshot({path:info.outputPath(name+'.png'),fullPage:true,animations:'disabled'});

test('reader audit — featured cover and mobile search field',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.locator('.home-hero')).toBeVisible();
 await page.waitForTimeout(1200);
 await save(page,info,'02-hero-cover-mobile');
 await page.locator('.home-search').screenshot({path:info.outputPath('07-search-field-mobile.png'),animations:'disabled'});
 await page.locator('.home-discover a').last().click();
 await page.waitForTimeout(650);
 await save(page,info,'03-new-releases-after-click');
});

test('reader audit — signed-in studio uses the account session',async({page},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await mockAuth(page);
 await page.goto('/studio/');
 await expect(page.locator('#studio-status')).not.toContainText('Checking your account', {timeout:12000});
 await save(page,info,'01-signed-in-studio-desktop');
});

test('reader audit — deep link into reading settings',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await mockAuth(page);
 await page.goto('/account/#reading');
 await expect(page.locator('#account-status')).not.toContainText('Checking your session',{timeout:12000});
 await save(page,info,'05-reading-settings-deeplink-mobile');
});

test('reader audit — guest studio whitespace',async({page},info)=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/studio/');
 await expect(page.locator('#studio-status')).not.toContainText('Checking your account',{timeout:12000});
 await save(page,info,'08-studio-guest-mobile');
});
