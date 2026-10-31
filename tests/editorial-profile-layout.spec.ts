import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Synthetic account only. Never sign into a real reader profile for visual tests. */
async function demoReader(page: Page) {
  const user={
    id:'00000000-0000-4000-8000-000000000047',aud:'authenticated',role:'authenticated',
    email:'visual-fixture@example.test',app_metadata:{},user_metadata:{nickname:'Demo Reader',avatar_color:'sage',bio:'Demo profile for layout testing.'},
    identities:[],created_at:'2026-10-25T00:00:00Z',
  };
  const session=()=>({
    access_token:[
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
      Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),
      'visual-fixture-signature',
    ].join('.'),
    refresh_token:'visual-fixture-refresh',expires_in:3600,
    expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user,
  });
  await page.route('https://*.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    const json=(value:unknown,status=200)=>route.fulfill({
      status,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','x-supabase-api-version':'2024-01-01'},
      body:JSON.stringify(value),
    });
    if(route.request().method()==='OPTIONS')return json({});
    if(path==='/auth/v1/token')return json(session());
    if(path==='/auth/v1/user')return json(user);
    if(path==='/rest/v1/rpc/reader_my_progress')return json({
      total_xp:0,chapters:0,completedNovels:0,readingDays:0,scifiNovels:0,
      completedGenres:0,approvedReviews:0,selected_title:'novice',last_rank_notified:null,
    });
    if(path==='/rest/v1/reader_xp_events')return json([]);
    if(path==='/rest/v1/novel_reader_state')return json([]);
    if(path==='/rest/v1/reader_reviews'||path==='/rest/v1/reader_published_reviews')return json([]);
    return json({message:'Not available in demo fixture'},403);
  });
  await page.goto('/account/');
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('demo-only-password');
  await page.locator('#reader-auth-submit').click();
  await expect(page.locator('#auth-logged-in')).toBeVisible();
  await expect(page.locator('#profile-sidebar-rank')).toBeVisible();
}

test('профиль: синтетическая сессия, адаптивные карточки, прогресс и снимки светлой/тёмной тем',async({page},info)=>{
  await page.addInitScript(()=>{
    localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
      version:1,settings:{theme:'light'},
      library:{'khranitel-mayaka':'reading','sad-zimy':'later'},
      progress:{
        'khranitel-mayaka':{chapterSlug:'glava-1',chapterNumber:1,blockId:'block-0',offset:0,ratio:.42,updatedAt:Date.now()},
        'sad-zimy':{chapterSlug:'glava-2',chapterNumber:2,blockId:'block-0',offset:0,ratio:.68,updatedAt:Date.now()-1000},
      },
    }));
  });
  await demoReader(page);
  for(const width of [1440,390]){
    await page.setViewportSize({width,height:900});
    for(const theme of ['light','dark'] as const) {
      await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
      await expect(page.locator('#profile-hero-identity')).toBeVisible();
      await expect(page.locator('#profile-avatar')).toHaveText('D');
      await expect(page.locator('#reader-xp-progress')).toBeVisible();
      await expect(page.locator('.reader-mastery-section')).toBeVisible();
      await expect(page.locator('.profile-recent-cover')).toHaveCount(2);
      const bars=page.locator('.profile-recent-copy progress');
      await expect(bars).toHaveCount(2);
      for(const bar of await bars.all()){
        const rect=await bar.boundingBox();
        expect(rect).not.toBeNull();
        expect(rect!.height).toBeGreaterThanOrEqual(6);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.evaluate(()=>document.fonts.ready);
      await page.evaluate(()=>{window.scrollTo(0,0);(document.activeElement as HTMLElement|null)?.blur();});
      await page.screenshot({path:info.outputPath('hunmeng-profile-'+width+'-'+theme+'.png'),fullPage:true,animations:'disabled'});
      await page.locator('.profile-sidebar nav a[href="#profile-reading"]').click();
      await expect(page.locator('#profile-reading')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
      await expect(page.locator('#profile-account')).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      await page.locator('.profile-sidebar nav a[href="#profile-details"]').click();
      await expect(page.locator('#profile-details')).toBeVisible();
    }
  }
});
