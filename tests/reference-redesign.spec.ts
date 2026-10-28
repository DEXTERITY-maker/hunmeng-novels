import { test, expect } from './fixtures';

/** Real Astro HTML/CSS, fixture-only Auth for account screenshots. No production data or credentials. */
const publicScreens: [string, string, string][] = [
  ['home','/','.home-hero'],
  ['catalog','/catalog/','.catalog-heading'],
  ['library','/library/','.shelf-tabs'],
  ['news','/news/','.news-feed'],
  ['ranks','/ranks/','.rank-world-cards'],
  ['rights','/rights/','.rights-steps'],
  ['writing-studio','/studio/','.studio-hero'],
];
for(const [name,url,selector] of publicScreens) {
  test('reference design screenshot: '+name,async({page},info)=>{
    await page.goto(url);
    await expect(page.locator(selector)).toBeVisible();
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:info.outputPath('hunmeng-'+name+'-'+info.project.name+'.png'),
      fullPage:true,animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  });
}
test('profile and reading settings are navigable and captured with synthetic Auth',async({page},info)=>{
  const user={id:'00000000-0000-4000-8000-000000000023',aud:'authenticated',role:'authenticated',
    email:'preview@example.test',app_metadata:{},user_metadata:{nickname:'Hunmeng Preview',bio:'A quiet reader of stories.',avatar_color:'sage'},
    identities:[],created_at:'2026-10-25T00:00:00Z'};
  const session=()=>({access_token:[
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),
    'fixture-signature'].join('.'),refresh_token:'fixture-reader-refresh',
    expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const json=(body:unknown)=>route.fulfill({status:200,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*',
        'Access-Control-Expose-Headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01'},
      body:JSON.stringify(body)});
    if(route.request().method()==='OPTIONS')return json({});
    if(path.endsWith('/token'))return json(session());
    if(path.endsWith('/user'))return json(user);
    if(path.endsWith('/logout'))return json({});
    return route.fulfill({status:403,body:'{}',headers:{'Access-Control-Allow-Origin':'*'}});
  });
  await page.goto('/account/');
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('synthetic-fixture');
  await page.getByRole('button',{name:'Sign in',exact:true}).last().click();
  await expect(page.locator('#auth-logged-in')).toBeVisible();
  await expect(page.locator('#profile-details')).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(() => { window.scrollTo(0,0); (document.activeElement as HTMLElement | null)?.blur(); });
  await page.screenshot({path:info.outputPath('hunmeng-profile-'+info.project.name+'.png'),fullPage:true,animations:'disabled'});
  await page.locator('.profile-sidebar nav a[href="#profile-reading"]').click();
  await expect(page.locator('#profile-reading')).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0,0); (document.activeElement as HTMLElement | null)?.blur(); });
  await page.screenshot({path:info.outputPath('hunmeng-reading-'+info.project.name+'.png'),fullPage:true,animations:'disabled'});
  await page.evaluate(() => window.scrollTo(0,0));
  await page.getByRole('button',{name:'Reader account',exact:true}).click();
  await expect(page.locator('.header-account .account-panel')).toBeVisible();
  await page.screenshot({path:info.outputPath('hunmeng-account-menu-'+info.project.name+'.png'),fullPage:false,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('fantasy rank gallery preserves all nine emblems and fits phone and desktop widths',async({page})=>{
 for(const width of [320,390,768,1280,1536]){
  await page.setViewportSize({width,height:900});
  await page.goto('/ranks/');
  await expect(page.locator('.rank-world-card')).toHaveCount(9);
  await expect(page.locator('.rank-world-card[data-rank-style="dark-gold"] h3')).toHaveText('Тёмно-золотой');
  await expect(page.locator('.rank-world-card[data-rank-style="mythical"] .rank-world-levels')).toHaveText('Уровни 420–500');
  for(const emblem of await page.locator('.rank-world-emblem img').all()){
    await emblem.scrollIntoViewIfNeeded();
    await expect.poll(()=>emblem.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 }
 await expect(page.locator('a[href="/account/"].rank-world-primary')).toBeVisible();
});
