import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
// Synthetic accounts, credentials and responses. No real emails are sent.
const key = 'hunmeng-novels:reader-auth:v1';
const user={id:'00000000-0000-4000-8000-000000000023',aud:'authenticated',role:'authenticated',
  email:'reader@example.test',app_metadata:{},user_metadata:{},identities:[],created_at:'2026-10-25T00:00:00Z'};
const session=()=>({access_token:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'fixture-signature'].join('.'),
  refresh_token:'fixture-reader-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
const readerSafeRequests = (requests: string[]) => requests.every(p =>
  p.startsWith('/auth/v1/') || p.startsWith('/rest/v1/rpc/reader_') || p === '/rest/v1/reader_xp_events' || p === '/rest/v1/novel_reader_state' || p === '/rest/v1/reader_reviews' || p === '/rest/v1/reader_published_reviews');
async function mockAuth(page: Page) {
  const state={requests:[] as string[],signupBody:{} as Record<string,unknown>,signupRedirect:'',signupCalls:0,
    passwordCalls:0,codeCalls:0,errorCode:'',logoutOffline:false,profileUser:structuredClone(user),profileCalls:0,profileBody:{} as Record<string,unknown>,profileError:0,verifyError:0,sessionExpired:false,
    rankStats:{total_xp:0,chapters:0,completedNovels:0,readingDays:0,scifiNovels:0,completedGenres:0,approvedReviews:0,selected_title:'novice',last_rank_notified:null as string|null},
    xpAwards:[] as Array<{event_kind:string,novel_slug:string,chapter_slug:string,xp:number,awarded_at:string}>,xpHistoryRequests:0,xpHistoryError:false,
    cloudRow:null as null|{state:Record<string,unknown>;updated_at:string},cloudWrites:0,cloudError:false,
    reviews:[] as Array<{id:string,novel_slug:string,body:string,status:string,created_at:string}>,reviewSubmissions:0};
  await page.route('https://*.supabase.co/**',async route=>{
    const address=new URL(route.request().url());state.requests.push(address.pathname);
    const json=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Expose-Headers':'x-supabase-api-version','x-supabase-api-version':'2024-01-01'},body:JSON.stringify(body)});
    if(route.request().method()==='OPTIONS')return json({});
    if(address.pathname.endsWith('/signup')) {
      state.signupCalls++;state.signupBody=route.request().postDataJSON();
      state.signupRedirect=address.searchParams.get('redirect_to')||'';
      if(state.errorCode)return json({code:state.errorCode,msg:'Private upstream diagnostic'},400);
      return json(user);
    }
    if(address.pathname.endsWith('/token')) {
      if(address.searchParams.get('grant_type')==='pkce')state.codeCalls++;else state.passwordCalls++;
      if(state.errorCode)return json({code:state.errorCode,msg:'Private upstream diagnostic'},400);
      return json(session());
    }
    if(address.pathname.endsWith('/user')) {
      if(state.verifyError && route.request().method()==='GET')return json({code:'unexpected_failure',msg:'Private upstream diagnostic'},state.verifyError);
      if(state.sessionExpired)return json({code:'session_not_found',msg:'Private upstream diagnostic'},401);
      if(route.request().method()==='PUT') {
        state.profileCalls++;state.profileBody=route.request().postDataJSON();
        if(state.profileError)return json({code:'unexpected_failure',msg:'Private upstream diagnostic'},state.profileError);
        state.profileUser.user_metadata=state.profileBody.data as typeof user.user_metadata;
      }
      return json(state.profileUser);
    }
    if(address.pathname.endsWith('/logout'))return state.logoutOffline?route.abort('failed'):json({});
    if(address.pathname==='/rest/v1/reader_published_reviews') {
      return json(state.reviews.filter(review=>review.status==='approved').map(({id,novel_slug,body,created_at})=>({id,novel_slug,body,created_at})));
    }
    if(address.pathname==='/rest/v1/reader_reviews') {
      const filter=address.searchParams.get('novel_slug');
      const wanted=filter?.startsWith('eq.') ? filter.slice(3) : filter;
      return json(state.reviews.filter(review=>!filter||review.novel_slug===wanted));
    }
        if(address.pathname==='/rest/v1/rpc/reader_my_review_status') {
      const body=route.request().postDataJSON();
      const own=state.reviews.find(review=>review.novel_slug===body.p_novel);
      return json(own?.status ?? null);
    }
    if(address.pathname==='/rest/v1/rpc/reader_submit_review') {
      const body=route.request().postDataJSON();
      if(state.reviews.some(review=>review.novel_slug===body.p_novel))return json(null);
      if(typeof body.p_body!=='string'||body.p_body.trim().length<120)return json({message:'Invalid review'},400);
      state.reviewSubmissions++;
      const id='00000000-0000-4000-8000-000000000099';
      state.reviews.push({id,novel_slug:body.p_novel,body:body.p_body,status:'pending',created_at:'2026-10-28T00:00:00Z'});
      return json(id);
    }
    if(address.pathname==='/rest/v1/novel_reader_state') {
      const method=route.request().method();
      if(state.cloudError)return json({message:'Storage unavailable'},503);
      if(method==='GET')return json(state.cloudRow?[state.cloudRow]:[]);
      if(method==='POST'){
        if(state.cloudRow)return json({code:'23505',message:'Duplicate'},409);
        const payload=route.request().postDataJSON();
        state.cloudRow={state:payload.state,updated_at:'2026-10-28T00:00:00Z'};
        state.cloudWrites++;
        return json([state.cloudRow]);
      }
      if(method==='PATCH'){
        if(!state.cloudRow)return json([]);
        const payload=route.request().postDataJSON();
        state.cloudRow={state:payload.state,updated_at:payload.updated_at};
        state.cloudWrites++;
        return json([state.cloudRow]);
      }
      return json({message:'Unsupported'},405);
    }
    if(address.pathname==='/rest/v1/reader_xp_events') {
      state.xpHistoryRequests++;
      // Only a read-only projection is permitted: any attempted client write is rejected.
      if(route.request().method()!=='GET')return json({message:'XP events are read only'},403);
      if(state.xpHistoryError)return json({message:'History unavailable'},503);
      return json(state.xpAwards);
    }
    if(address.pathname==='/rest/v1/rpc/reader_my_progress')return json(state.rankStats);
    if(address.pathname==='/rest/v1/rpc/reader_mark_rank_seen'){
      state.rankStats.last_rank_notified=route.request().postDataJSON().p_rank;
      return json(true);
    }
    if(address.pathname==='/rest/v1/rpc/reader_select_title'){
      const title=route.request().postDataJSON().p_title;
      if(title!=='novice'&&!(title==='regular'&&state.rankStats.readingDays>=30)&&!(title==='reviewer'&&state.rankStats.approvedReviews>=20))return json({message:'Title locked'},403);
      state.rankStats.selected_title=title;
      return json(true);
    }
    return json({message:'No editorial access'},403);
  });
  return state;
}
async function open(page:Page,signup=false){
  await page.goto('/account/');
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  if(signup)await page.getByRole('button',{name:'Register',exact:true}).click();
}
async function fill(page:Page,signup=false){
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Password',{exact:true}).fill('fixture-password');
  if(signup)await page.getByLabel('Confirm password',{exact:true}).fill('fixture-password');
}
async function loginFixture(page:Page) { await open(page);await fill(page);await page.locator('#reader-auth-submit').click();await expect(page.locator('#auth-logged-in')).toBeVisible(); }
// Preview only: realistic signed-in profile, every tab, light and dark, desktop and phone.
for (const scheme of ['light','dark'] as const) for (const width of [1440, 390]) {
 test(`profile preview ${scheme} ${width}`,async({page},testInfo)=>{
  await page.emulateMedia({colorScheme:scheme});
  await page.setViewportSize({width,height:width>800?900:844});
  await page.clock.setFixedTime('2026-11-03T12:00:00Z');
  await page.addInitScript(()=>{try{if(!localStorage.getItem('hunmeng-novels:v1'))localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,library:{'sad-zimy':'reading'},progress:{'sad-zimy':{chapterSlug:'glava-2',chapterNumber:2,blockId:'block-3',offset:0,ratio:.4,updatedAt:Date.parse('2026-11-03T11:00:00Z')}}}));}catch{}});
  const state=await mockAuth(page);
  await page.route('**/rest/v1/rpc/reader_halloween_my_awards',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(scheme==='light'?[{event_id:'halloween-2026',place:1,title_id:'halloween-2026-gold',title:'Lantern of the Long Night',badge:'gold',awarded_at:'2026-11-08T00:10:00Z'}]:[])}));
  state.profileUser.user_metadata={nickname:'Hunmeng',bio:'Creator of Hunmeng.',avatar_color:'plum'} as any;
  state.rankStats.chapters=180;state.rankStats.completedNovels=2;state.rankStats.readingDays=34;
  state.rankStats.total_xp=939183;state.rankStats.selected_title='founder';state.rankStats.last_rank_notified='mythical';
  await page.route('**/rest/v1/rpc/reader_is_founder',route=>route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:'true'}));
  state.xpAwards=[
   {event_kind:'chapter_finished',novel_slug:'the-latency-of-tomorrow',chapter_slug:'chapter-84',xp:80,awarded_at:'2026-10-31T12:00:00Z'},
   {event_kind:'chapter_finished',novel_slug:'the-latency-of-tomorrow',chapter_slug:'chapter-83',xp:80,awarded_at:'2026-10-31T11:40:00Z'},
   {event_kind:'novel_finished',novel_slug:'comprehension-against-the-heavens',chapter_slug:'',xp:400,awarded_at:'2026-10-30T19:00:00Z'},
   {event_kind:'chapter_finished',novel_slug:'comprehension-against-the-heavens',chapter_slug:'chapter-6',xp:80,awarded_at:'2026-10-30T18:50:00Z'},
  ];
  await loginFixture(page);
  await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
  const shot=async(name:string,full=true)=>{
   await page.evaluate(()=>{document.querySelectorAll('img').forEach(i=>{(i as HTMLImageElement).loading='eager';});window.scrollTo(0,0);(document.activeElement as HTMLElement|null)?.blur();});
   await page.waitForTimeout(700);
   await page.screenshot({path:testInfo.outputPath(`hunmeng-profile-${name}-${scheme}-${width}.png`),fullPage:full,animations:'disabled'});
  };
  await shot('1-overview');
  for(const [tab,n] of [['Progress','2-progress'],['Titles & achievements','3-titles'],['XP history','4-history']] as const){
   await page.getByRole('tab',{name:tab,exact:true}).click();
   await shot(n);
  }
  await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await page.locator('#profile-edit-open').click();
  await page.waitForTimeout(400);
  await page.screenshot({path:testInfo.outputPath(`hunmeng-profile-5-edit-${scheme}-${width}.png`),fullPage:false,animations:'disabled'});
 });
}
