import { test, expect } from '../tests/fixtures';
import type { Page } from '@playwright/test';

// Only synthetic staff sessions and intercepted, empty editorial collections.
const key='hunmeng-novels:admin-session:v1';
const user={id:'00000000-0000-4000-8000-000000000130',email:'fixture-editor@example.test'};
const session=()=>({
  access_token:'synthetic-editorial-token',
  refresh_token:'synthetic-refresh-token',
  expires_at:Math.floor(Date.now()/1000)+3600,
  user,
});
async function mockStaff(page:Page,role:'admin'|'editor'|null){
  const requests:{path:string;method:string}[]=[];
  await page.route('https://*.supabase.co/**', route=>{
    const req=route.request(),url=new URL(req.url());
    requests.push({path:url.pathname,method:req.method()});
    const data=url.pathname.endsWith('/auth/v1/user')?user:
      url.pathname.endsWith('/novel_staff')?(role?[{role}]:[]):[];
    return route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},
      body:JSON.stringify(data)});
  });
  if(role){
    await page.addInitScript(({key,value})=>{
      if(location.pathname==='/admin/'){
        sessionStorage.setItem(key,JSON.stringify(value));
      }
    },{key,value:session()});
  }
  return requests;
}

test('public V2 staff login and dashboard keep guest sections hidden and noindexed',async({page},testInfo)=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  const calls=await mockStaff(page,null);
  for(const width of [320,390,768,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/admin/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-admin-nav a')).toHaveCount(6);
    await expect(page.locator('#admin-workspace')).toBeHidden();
    await expect(page.locator('.v3-admin-jumps')).toBeHidden();
    await expect(page.locator('#admin-login-link')).toHaveAttribute('href','/admin/login/');
    await expect(page.locator('meta[name="robots"]'))
      .toHaveAttribute('content','noindex,follow');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'staff dashboard guest overflow @ '+width).toBe(true);

    await page.goto('/admin/login/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('.v3-admin-nav a')).toHaveCount(6);
    await expect(page.locator('#admin-login-form')).toBeVisible();
    await expect(page.locator('meta[name="robots"]'))
      .toHaveAttribute('content','noindex,follow');
    await expect(page.locator('meta[name="referrer"]'))
      .toHaveAttribute('content','no-referrer');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'editorial login overflow @ '+width).toBe(true);
    if(width===390||width===1280){
      await page.screenshot({path:testInfo.outputPath('hunmeng-v2-public-admin-login-'+width+'.png'),
        fullPage:true,animations:'disabled'});
    }
  }
  expect(calls.some(x=>/novel_(sources|terms|translation_jobs)/.test(x.path))).toBe(false);
  expect(calls.some(x=>['POST','PATCH','DELETE'].includes(x.method))).toBe(false);
  expect(errors).toEqual([]);
});

test('public V2 administrator keeps original protected tools with responsive editorial quicklinks',async({page},testInfo)=>{
  const calls=await mockStaff(page,'admin');
  for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    await page.goto('/admin/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('#admin-workspace')).toBeVisible();
    await expect(page.locator('#admin-status')).toContainText('Administrator');
    await expect(page.locator('.v3-admin-jumps a')).toHaveCount(5);
    await expect(page.locator('.v3-admin-jumps a[href="#admin-sources-section"]')).toBeVisible();
    await expect(page.locator('.v3-admin-jumps a[href="#chapter-batch-form"]')).toBeVisible();
    await expect(page.locator('#source-form')).toBeVisible();
    await expect(page.locator('#rights-form')).toBeVisible();
    await expect(page.locator('#term-form')).toBeVisible();
    await expect(page.locator('#job-form')).toBeVisible();
    await expect(page.locator('#chapter-batch-form')).toBeVisible();
    await expect(page.locator('meta[name="robots"]'))
      .toHaveAttribute('content','noindex,follow');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'staff dashboard overflow @ '+width).toBe(true);
    await page.screenshot({
      path:testInfo.outputPath('hunmeng-v2-public-admin-synthetic-'+width+'.png'),
      fullPage:false,animations:'disabled'});
  }
  await page.locator('.v3-admin-jumps a[href="#job-form"]').click();
  await expect(page).toHaveURL(/#job-form$/);
  expect(calls.some(x=>['POST','PATCH','DELETE'].includes(x.method))).toBe(false);
});

test('V2 editor never gains administrator-only controls via the visual refresh',async({page})=>{
  const calls=await mockStaff(page,'editor');
  await page.goto('/admin/');
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#admin-status')).toContainText('Editor');
  await expect(page.locator('#source-form')).toBeHidden();
  await expect(page.locator('#rights-form')).toBeHidden();
  await expect(page.locator('#job-form')).toBeVisible();
  await expect(page.locator('#chapter-batch-form')).toBeVisible();
  await expect(page.locator('#admin-reader-reviews')).toBeHidden();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
  expect(calls.some(x=>['POST','PATCH','DELETE'].includes(x.method))).toBe(false);
});

test('source and glossary lists stay readable on ivory cards in dark/system themes',async({page})=>{
  const calls=await mockStaff(page,'admin');
  await page.emulateMedia({colorScheme:'dark'});
  await page.goto('/admin/');
  await expect(page.locator('#admin-workspace')).toBeVisible();

  // Synthetic list entries exercise the same selectors as admin.ts without
  // requesting or inserting any real source-rights or glossary records.
  for(const selector of ['#admin-source-list','#admin-term-list']){
    await page.locator(selector).evaluate(container=>{
      const list=document.createElement('ul');
      list.dataset.contrastFixture='true';
      const item=document.createElement('li');
      item.textContent='Synthetic permission or glossary entry';
      list.append(item);
      container.append(list);
    });
  }

  for(const theme of ['dark','system','light']){
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    for(const selector of ['#admin-source-list ul','#admin-term-list ul']){
      const colors=await page.locator(selector).evaluate(list=>{
        const card=list.closest('.admin-card');
        return {
          text:getComputedStyle(list).color,
          paper:getComputedStyle(card!).backgroundColor,
        };
      });
      expect(colors.text,selector+' ink in '+theme+' theme').toBe('rgb(49, 84, 65)');
      expect(colors.paper,selector+' paper in '+theme+' theme').toBe('rgb(255, 253, 246)');
    }
  }
  expect(calls.some(x=>['POST','PATCH','DELETE'].includes(x.method))).toBe(false);
});
