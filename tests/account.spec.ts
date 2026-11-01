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

test('видимая регистрация: подтверждение пароля, письмо, PKCE и отсутствие редакторских запросов',async({page})=>{
 const state=await mockAuth(page);await open(page,true);await fill(page,true);
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.locator('#account-status')).toContainText('Check your inbox');
 expect(state.signupCalls).toBe(1);
 expect(state.signupBody.email).toBe(user.email);
 expect(typeof state.signupBody.code_challenge).toBe('string');
 expect(state.signupBody.code_challenge_method).toBe('s256');
 expect(state.signupRedirect).toBe('http://127.0.0.1:4321/account/');
 await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
 expect(readerSafeRequests(state.requests)).toBe(true);
 await expect(page.locator('#auth-fields')).toBeVisible();
});
test('несовпадающие пароли не отправляются в Auth',async({page})=>{
 const state=await mockAuth(page);await open(page,true);await fill(page,true);
 await page.getByLabel('Confirm password',{exact:true}).fill('different-fixture');
 await page.getByRole('button',{name:'Create account',exact:true}).click();
 await expect(page.locator('#account-status')).toHaveText('Passwords do not match.');
 expect(state.signupCalls).toBe(0);
});
test('вход, сохранение сессии и выход сохраняют локальную библиотеку',async({page})=>{
 const state=await mockAuth(page);await open(page);await fill(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,library:{'sad-zimy':'later'},progress:{}})));
 await page.locator('#reader-auth-submit').click();
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page.locator('#account-email')).toHaveText(user.email);
 await page.reload();await expect(page.locator('#auth-logged-in')).toBeVisible();
 await page.goto('/admin/');
 await expect(page.locator('#admin-workspace')).toBeHidden();
 await expect(page.locator('#admin-login-link')).toBeVisible();
 await page.goto('/account/');await expect(page.locator('#auth-logged-in')).toBeVisible();
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.locator('#auth-fields')).toBeVisible();
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library['sad-zimy'])).toBe('later');
 expect(await page.evaluate(()=>sessionStorage.getItem('hunmeng-novels:admin-session:v1'))).toBeNull();
 expect(readerSafeRequests(state.requests)).toBe(true);
});
for(const [code,message] of [['invalid_credentials','Check your email and password'],['email_not_confirmed','Confirm your email'],['signup_disabled','registrations are temporarily disabled']])
test(`ошибка ${code} is shown in English without private diagnostics`,async({page})=>{
 const state=await mockAuth(page);state.errorCode=code;await open(page,code==='signup_disabled');await fill(page,code==='signup_disabled');
 await page.locator('#reader-auth-submit').click();
 await expect(page.locator('#account-status')).toContainText(message);
 await expect(page.locator('body')).not.toContainText('Private upstream');
});
test('подтверждение почты обменивает код и удаляет параметры, открытых редиректов нет',async({page})=>{
 const state=await mockAuth(page);await open(page);
 await page.evaluate(k=>localStorage.setItem(k+'-code-verifier',JSON.stringify('fixture-code-verifier')),key);
 await page.goto('/account/?code=fixture-confirmation&next=https://evil.example/');
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page).toHaveURL(/\/account\/$/);
 expect(state.codeCalls).toBe(1);
});
test('callback на главной доходит до аккаунта, токены из hash не принимаются',async({page})=>{
 const state=await mockAuth(page);await open(page);
 await page.evaluate(k=>localStorage.setItem(k+'-code-verifier',JSON.stringify('fixture-code-verifier')),key);
 await page.goto('/?code=fixture-confirmation');
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page).toHaveURL(/\/account\/$/);
 expect(state.codeCalls).toBe(1);
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await page.goto('/account/#access_token=fixture&refresh_token=fixture');
 await expect(page).toHaveURL(/\/account\/$/);
 await expect(page.locator('#auth-logged-in')).toBeHidden();
});
test('выход при сетевой ошибке очищает читательскую сессию',async({page})=>{
 const state=await mockAuth(page);await open(page);await fill(page);
 await page.locator('#reader-auth-submit').click();await expect(page.locator('#auth-logged-in')).toBeVisible();
 state.logoutOffline=true;
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.getByRole('button',{name:'Sign out',exact:true}).click();
 await expect(page.locator('#account-status')).toContainText('The server could not confirm');
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
});
test('запрещённое хранилище не отправляет данные регистрации',async({page})=>{
 const state=await mockAuth(page);
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));
 await page.goto('/account/');
 await expect(page.locator('#account-status')).toContainText('Allow browser storage');
 await expect(page.getByLabel('Email',{exact:true})).toBeDisabled();
 expect(state.requests).toEqual([]);
});

async function loginFixture(page:Page) { await open(page);await fill(page);await page.locator('#reader-auth-submit').click();await expect(page.locator('#auth-logged-in')).toBeVisible(); }
for (const width of [320, 390, 1440]) {
 test(`профиль показывает одну вкладку, а ссылки меню открывают нужную при ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:850});
  const state=await mockAuth(page);
  await loginFixture(page);
  const panels=['profile-details','profile-reading','profile-account'] as const;
  const assertView=async(id:(typeof panels)[number])=>{
    await expect(page.locator('#account-title')).toHaveText(
      id==='profile-details'?'My profile':id==='profile-reading'?'Reading settings':'My account');
    for(const panel of panels){
      if(panel===id)await expect(page.locator('#'+panel)).toBeVisible();
      else await expect(page.locator('#'+panel)).toBeHidden();
    }
    await expect(page.locator('.profile-sidebar nav a[href="#'+id+'"]')).toHaveAttribute('aria-current','location');
    await expect(page.locator('.profile-sidebar nav a[aria-current="location"]')).toHaveCount(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  };
  await assertView('profile-details');
  await expect(page.locator('#profile-metrics-slot')).toBeVisible();
  await expect(page.locator('#profile-details .profile-local-note')).toBeHidden();
  await page.evaluate(() => { window.scrollTo(0,0); (document.activeElement as HTMLElement | null)?.blur(); });
  await page.screenshot({path:testInfo.outputPath(`hunmeng-account-tabs-profile-${width}.png`),fullPage:true,animations:'disabled'});
  await page.locator('.profile-sidebar nav a[href="#profile-reading"]').click();
  await expect(page).toHaveURL(/#profile-reading$/);
  await assertView('profile-reading');
  await expect(page.getByLabel('Reading font',{exact:true})).toBeVisible();
  await page.evaluate(() => { window.scrollTo(0,0); (document.activeElement as HTMLElement | null)?.blur(); });
  await page.screenshot({path:testInfo.outputPath(`hunmeng-account-tabs-reading-${width}.png`),fullPage:true,animations:'disabled'});
  await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
  await assertView('profile-account');
  await expect(page.locator('#account-signout')).toBeVisible();
  await page.goBack();
  await assertView('profile-reading');
  await page.goBack();
  await assertView('profile-details');
  await page.goto('/');
  await page.getByRole('button',{name:'Reader account',exact:true}).click();
  await page.locator('.account-panel').getByRole('link',{name:'Reading settings',exact:true}).click();
  await expect(page).toHaveURL(/\/account\/#profile-reading$/);
  await assertView('profile-reading');
  await page.goto('/');
  await page.getByRole('button',{name:'Reader account',exact:true}).click();
  await page.locator('.account-panel').getByRole('link',{name:'My profile',exact:true}).click();
  await expect(page).toHaveURL(/\/account\/$/);
  await assertView('profile-details');
  expect(readerSafeRequests(state.requests)).toBe(true);
 });
}
test('меню шапки показывает аватар и настройки, а выход сохраняет библиотеку',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await page.locator('#profile-edit-open').click();
 await page.getByLabel('Nickname',{exact:true}).fill('Моряк');
 await page.getByRole('radio',{name:'Blue',exact:true}).check();
 await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#profile-status')).toHaveText('Profile saved.');
 await expect(page.locator('[data-header-avatar]')).toHaveAttribute('data-avatar','navy');
 await expect(page.locator('[data-avatar-initial]')).toHaveText('М');
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,settings:{theme:'sepia'},library:{'sad-zimy':'later'},progress:{'sad-zimy':{ratio:.25}}})));
 await page.goto('/');
 await page.getByRole('button',{name:'Reader account',exact:true}).click();
 await expect(page.locator('[data-header-name]')).toHaveText('Моряк');
 await page.locator('.account-panel').getByRole('link',{name:'Reading settings',exact:true}).click();
 await expect(page).toHaveURL(/\/account\/#profile-reading$/);
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect.poll(()=>page.locator('#profile-reading').evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0);
 await expect.poll(()=>page.locator('#profile-reading').evaluate(el=>el.getBoundingClientRect().top)).toBeLessThan(200);
 await page.goto('/');
 await page.getByRole('button',{name:'Reader account',exact:true}).click();
 await page.locator('[data-header-signout]').click();
 await expect(page).toHaveURL(/\/account\/$/);
 await expect(page.locator('#auth-fields')).toBeVisible();
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!));
 expect(saved.library['sad-zimy']).toBe('later');expect(saved.progress['sad-zimy'].ratio).toBe(.25);expect(saved.settings.theme).toBe('sepia');
 expect(readerSafeRequests(state.requests)).toBe(true);
});
test('выход из меню при недоступном сервере удаляет сессию только в этом браузере',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);state.logoutOffline=true;
 await page.goto('/');await page.getByRole('button',{name:'Reader account',exact:true}).click();
 await page.locator('[data-header-signout]').click();
 await expect(page).toHaveURL(/\/account\/$/);await expect(page.locator('#auth-fields')).toBeVisible();
 await expect(page.locator('#account-status')).toContainText('server could not confirm');
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
});
test('профиль: никнейм, описание и аватар сохраняются между посещениями только в Auth metadata',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await expect(page.locator('#profile-name')).toBeVisible();
 await page.locator('#profile-edit-open').click();
 await page.getByLabel('Nickname',{exact:true}).fill('Тихий_читатель');
 await page.getByLabel('Bio',{exact:true}).fill('Люблю истории о море.');
 await page.getByRole('radio',{name:'Blue',exact:true}).check();
 await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#profile-status')).toHaveText('Profile saved.');
 expect(state.profileBody).toEqual({data:{nickname:'Тихий_читатель',bio:'Люблю истории о море.',avatar_color:'navy'},code_challenge:null,code_challenge_method:null});
 await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar','navy');
 await page.goto('/');await expect(page.locator('[data-account-link]')).toHaveText('Profile');
 await page.goto('/account/');await expect(page.getByLabel('Nickname',{exact:true})).toHaveValue('Тихий_читатель');
 await expect(page.getByLabel('Bio',{exact:true})).toHaveValue('Люблю истории о море.');
 expect(state.profileCalls).toBe(1);expect(readerSafeRequests(state.requests)).toBe(true);
});
test('некорректный никнейм и ошибки сети не дают ложного сохранения',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await page.locator('#profile-edit-open').click();
 await page.getByLabel('Nickname',{exact:true}).fill('<script>');await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#profile-status')).toContainText('Check your nickname');expect(state.profileCalls).toBe(0);
 await page.getByLabel('Nickname',{exact:true}).fill('Моряк');state.profileError=500;
 await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#profile-status')).not.toHaveText('Saving your profile…');
 await expect(page.locator('#profile-status')).not.toHaveText('Profile saved.');
 await expect(page.locator('body')).not.toContainText('Private upstream');
 await expect(page.getByRole('button',{name:'Save profile',exact:true})).toBeEnabled();
 state.profileError=0;await page.getByRole('button',{name:'Save profile',exact:true}).click();await expect(page.locator('#profile-status')).toHaveText('Profile saved.');
});
test('истёкшая сессия закрывает профиль и не отправляет изменения',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);state.sessionExpired=true;
 await page.locator('#profile-edit-open').click();
 await page.getByLabel('Nickname',{exact:true}).fill('Моряк');await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#auth-logged-in')).toBeHidden();await expect(page.locator('#account-status')).toContainText('Your session has ended');expect(state.profileCalls).toBe(0);
});
test('настройки чтения: сохранение, обновление страницы и сброс без отправки на сервер',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await page.locator('.profile-sidebar nav a[href="#profile-reading"]').click();
 await page.getByLabel('Appearance',{exact:true}).selectOption('sepia');
 await page.getByLabel('Reading font',{exact:true}).selectOption('sans');
 await page.locator('#preferences-form [name=size]').fill('24');
 await page.locator('#preferences-form [name=lineHeight]').fill('2');
 await page.locator('#preferences-form [name=width]').fill('800');
 await page.getByRole('button',{name:'Save settings',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','sepia');
 await page.reload();await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page.locator('#profile-reading')).toBeVisible();
 await expect(page.locator('#preferences-form [name=size]')).toHaveValue('24');
 await page.goto('/novel/sad-zimy/glava-1/');
 await expect(page.locator('#chapter-text')).toHaveCSS('font-size','24px');await expect(page.locator('html')).toHaveAttribute('data-reader-font','sans');
 await page.goto('/account/');await expect(page.locator('#auth-logged-in')).toBeVisible();
 await page.locator('.profile-sidebar nav a[href="#profile-reading"]').click();
 await page.getByRole('button',{name:'Reset to default',exact:true}).click();
 await expect(page.locator('#preferences-form [name=size]')).toHaveValue('20');
 await expect(page.locator('#preferences-form [name=theme]')).toHaveValue('system');
 expect(state.profileCalls).toBe(0);expect(readerSafeRequests(state.requests)).toBe(true);
});

test('недоступный сервер проверки сессии не выдаётся за выход из аккаунта',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);state.verifyError=503;
 await page.locator('#profile-edit-open').click();
 await page.getByLabel('Nickname',{exact:true}).fill('Моряк');await page.getByRole('button',{name:'Save profile',exact:true}).click();
 await expect(page.locator('#profile-status')).toContainText('Unable to verify your session');
 await expect(page.locator('#auth-logged-in')).toBeVisible();expect(state.profileCalls).toBe(0);
 state.verifyError=0;await page.getByRole('button',{name:'Save profile',exact:true}).click();await expect(page.locator('#profile-status')).toHaveText('Profile saved.');
});


test('authenticated reader sees nine accurate ranks and independent novice title', async ({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
 await expect(page.locator('#reader-level')).toHaveText('Level 1');
 await expect(page.locator('#reader-rank')).toHaveText('Iron');
 await expect(page.locator('#reader-equipped-title')).toHaveText('Novice Reader');
 await expect(page.locator('#reader-xp-numbers')).toHaveText('0 / 500 XP');
 await expect(page.locator('[data-rank-id]')).toHaveCount(9);
 await expect(page.locator('[data-rank-id]').evaluateAll(els=>els.map(el=>el.getAttribute('data-rank-id'))))
  .resolves.toEqual(['iron','bronze','silver','gold','dark-gold','platinum','diamond','legendary','mythical']);
 await expect(page.locator('[data-rank-id=dark-gold] .rank-tile-levels')).toHaveText('Levels 140–174');
 await expect(page.locator('[data-title-id=novice] .award-select')).toHaveText('Equipped');
 await expect(page.locator('[data-title-id=reviewer] .award-select')).toBeDisabled();
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('verified title can be equipped, display survives reload, and cards fit mobile',async({page})=>{
 const state=await mockAuth(page);
 state.rankStats.readingDays=30;
 state.rankStats.chapters=30;
 state.rankStats.total_xp=30*80;
 await page.setViewportSize({width:320,height:800});
 await loginFixture(page);
 await page.getByRole('tab',{name:'Titles & achievements'}).click();
 await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
 await page.locator('[data-equip-title=regular]').click();
 await expect(page.locator('#reader-equipped-title')).toHaveText('Regular Reader');
 await page.reload();
 await expect(page.locator('#reader-equipped-title')).toHaveText('Regular Reader');
 const scroll=await page.evaluate(()=>document.documentElement.scrollWidth);
 expect(scroll).toBeLessThanOrEqual(321);
 await page.screenshot({path:'test-results/hunmeng-rank-profile-mobile.png',fullPage:true});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'test-results/hunmeng-rank-profile-desktop.png',fullPage:true});
});

test('Dark Gold promotion at level 140 is announced once and survives refresh', async ({page})=>{
 const state=await mockAuth(page);
 state.rankStats.total_xp=Array.from({length:139},(_,i)=>500+4*i+Math.floor(26*Math.sqrt(i))).reduce((a,b)=>a+b,0);
 state.rankStats.last_rank_notified='gold';
 await loginFixture(page);
 await expect(page.locator('#reader-level')).toHaveText('Level 140');
 await expect(page.locator('#reader-rank')).toHaveText('Dark Gold');
 const modal=page.locator('#reader-rank-unlocked');
 await expect(modal).toBeVisible();
 await expect(modal).toContainText('Dark Gold');
 await page.screenshot({path:'test-results/hunmeng-dark-gold-upgrade.png',fullPage:false});
 await modal.getByRole('button',{name:'Continue reading'}).click();
 await expect.poll(()=>state.requests.filter(p=>p.includes('reader_mark_rank_seen')).length).toBeGreaterThan(0);
 await expect.poll(()=>state.rankStats.last_rank_notified, {message: JSON.stringify(state.requests)}).toBe('dark-gold');
 await page.reload();
 await expect(page.locator('#reader-level')).toHaveText('Level 140');
 await expect(modal).toBeHidden();
});


test('verified XP ledger shows real server awards, not local reading estimates',async({page})=>{
 const state=await mockAuth(page);
 state.rankStats.total_xp=480;
 state.rankStats.chapters=1;
 state.xpAwards=[
  {event_kind:'novel_finished',novel_slug:'sad-zimy',chapter_slug:'',xp:400,awarded_at:'2026-10-27T13:00:00Z'},
  {event_kind:'chapter_finished',novel_slug:'sad-zimy',chapter_slug:'glava-1',xp:80,awarded_at:'2026-10-27T12:00:00Z'},
 ];
 await loginFixture(page);
 await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
 await page.getByRole('tab',{name:'XP history'}).click();
 await expect(page.locator('#reader-xp-history-list li')).toHaveCount(2);
 await expect(page.locator('#reader-xp-history-list li').first()).toContainText('Novel completed');
 await expect(page.locator('#reader-xp-history-list li').first()).toContainText('The Garden');
 await expect(page.locator('#reader-xp-history-list li').first()).toContainText('+400 XP');
 await expect(page.locator('#reader-xp-history-list li').last()).toContainText('Chapter 1');
 await expect(page.locator('#reader-xp-history-list li').last()).toContainText('+80 XP');
 expect(state.xpHistoryRequests).toBeGreaterThan(0);
 expect(readerSafeRequests(state.requests)).toBe(true);
});
test('XP history shows empty and unavailable states without inventing rewards',async({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await expect(page.locator('#reader-xp-history-list li')).toHaveCount(0);
 await expect(page.locator('#reader-xp-history-status')).toContainText('No verified XP awards yet');
 state.xpHistoryError=true;
 await page.reload();
 await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
 await expect(page.locator('#reader-xp-history-status')).toHaveText('Reward history is temporarily unavailable.');
 await expect(page.locator('#reader-xp-history-list li')).toHaveCount(0);
});


test('opt-in cloud sync backs up local library and keeps guests local', async ({page}) => {
 const state=await mockAuth(page);
 await loginFixture(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
  version:1,settings:{font:'serif',size:20,lineHeight:1.85,paragraphSpacing:1.35,width:720,theme:'system'},
  library:{'sad-zimy':'reading'},progress:{'sad-zimy':{
    chapterSlug:'glava-1',chapterNumber:1,blockId:'block-2',offset:10,ratio:.35,updatedAt:12345
  }}
 })));
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.locator('#reader-sync-enable').click();
 await expect(page.locator('#reader-sync-now')).toBeVisible();
 expect(state.cloudRow?.state.library).toEqual({'sad-zimy':'reading'});
 expect(state.cloudWrites).toBe(1);
 expect(readerSafeRequests(state.requests)).toBe(true);
 await page.locator('#reader-sync-pause').click();
 await expect(page.locator('#reader-sync-enable')).toBeVisible();
});
test('different chapter positions require an explicit decision before cloud upload', async ({page}) => {
 const state=await mockAuth(page);
 state.cloudRow={state:{
   version:1,library:{'sad-zimy':'reading'},progress:{'sad-zimy':{
     chapterSlug:'glava-2',chapterNumber:2,blockId:'block-4',offset:0,ratio:.44,updatedAt:100
   }}
 },updated_at:'2026-10-28T00:00:00Z'};
 await loginFixture(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
   version:1,library:{'sad-zimy':'reading'},progress:{'sad-zimy':{
     chapterSlug:'glava-1',chapterNumber:1,blockId:'block-2',offset:0,ratio:.8,updatedAt:200
   }}
 })));
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.locator('#reader-sync-enable').click();
 await expect(page.locator('#reader-sync-conflict')).toBeVisible();
 expect(state.cloudWrites).toBe(0);
 await page.locator('[data-sync-choice="device"]').click();
 await expect(page.locator('#reader-sync-conflict')).toBeHidden();
 expect((state.cloudRow?.state.progress as Record<string,{chapterSlug:string}>)['sad-zimy'].chapterSlug).toBe('glava-1');
 expect(state.cloudWrites).toBe(1);
});
test('offline or failed cloud storage never erases local progress', async ({page}) => {
 const state=await mockAuth(page);
 state.cloudError=true;
 await loginFixture(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
  version:1,library:{'sad-zimy':'later'},progress:{'sad-zimy':{
    chapterSlug:'glava-1',chapterNumber:1,blockId:'block-1',offset:0,ratio:.56,updatedAt:100
  }}
 })));
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.locator('#reader-sync-enable').click();
 await expect(page.locator('#reader-cloud-sync-status')).toContainText('cloud library');
 await expect(page.locator('#reader-sync-enable')).toBeVisible();
 const preserved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!));
 expect(preserved.progress['sad-zimy'].ratio).toBe(.56);
 expect(state.cloudWrites).toBe(0);
});


test('routine reading changes upload automatically without a false chapter conflict',async({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
  version:1,library:{'sad-zimy':'reading'},progress:{'sad-zimy':{
   chapterSlug:'glava-1',chapterNumber:1,blockId:'block-2',offset:0,ratio:.2,updatedAt:100
  }}
 })));
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.locator('#reader-sync-enable').click();
 await expect(page.locator('#reader-sync-now')).toBeVisible();
 await page.evaluate(()=>{
  const state=JSON.parse(localStorage.getItem('hunmeng-novels:v1')!);
  state.progress['sad-zimy']={chapterSlug:'glava-2',chapterNumber:2,blockId:'block-4',offset:0,ratio:.6,updatedAt:200};
  localStorage.setItem('hunmeng-novels:v1',JSON.stringify(state));
 });
 await page.locator('#reader-sync-now').click();
 await expect(page.locator('#reader-cloud-sync-status')).toContainText('backed up');
 await expect(page.locator('#reader-sync-conflict')).toBeHidden();
 expect((state.cloudRow?.state.progress as Record<string,{chapterSlug:string}>)['sad-zimy'].chapterSlug).toBe('glava-2');
 expect(state.cloudWrites).toBe(2);
});
test('cloud updates download when this device has not changed since last sync',async({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
  version:1,library:{'sad-zimy':'reading'},progress:{'sad-zimy':{
   chapterSlug:'glava-1',chapterNumber:1,blockId:'block-2',offset:0,ratio:.2,updatedAt:100
  }}
 })));
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await page.locator('#reader-sync-enable').click();
 await expect(page.locator('#reader-sync-now')).toBeVisible();
 state.cloudRow!.updated_at='2026-10-28T01:00:00Z';
 (state.cloudRow!.state.progress as Record<string,unknown>)['sad-zimy']={
  chapterSlug:'glava-2',chapterNumber:2,blockId:'block-4',offset:0,ratio:.7,updatedAt:400
 };
 await page.locator('#reader-sync-now').click();
 await expect(page.locator('#reader-cloud-sync-status')).toContainText('matches');
 const local=await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!));
 expect(local.progress['sad-zimy'].chapterSlug).toBe('glava-2');
 expect(state.cloudWrites).toBe(1);
});


test('a second account never silently imports the previous account library',async({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await page.evaluate(()=>{
  localStorage.setItem('hunmeng-novels:cloud-sync-last-owner:v1','11111111-1111-4111-8111-111111111111');
  localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,library:{'sad-zimy':'later'},progress:{}}));
 });
 await page.reload();
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await page.locator('.profile-sidebar nav a[href="#profile-account"]').click();
 await expect(page.locator('#reader-sync-enable')).toBeHidden();
 await expect(page.locator('#reader-cloud-sync-status')).toContainText('another synced account');
 expect(state.cloudWrites).toBe(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library['sad-zimy'])).toBe('later');
});


test('signed-in reader submits one substantive review; pending content is not published',async({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await page.goto('/novel/sad-zimy/');
 await expect(page.locator('[data-review-form]')).toBeVisible();
 const review='I enjoyed the careful pacing and the changing relationship between the characters. The setting feels immersive, while the story builds tension naturally through meaningful choices and increasingly difficult consequences.';
 await page.locator('[data-review-form] textarea').fill(review);
 await page.locator('[data-review-form] button[type=submit]').click();
 await expect(page.locator('[data-review-feedback]')).toContainText('submitted for moderation');
 await expect(page.locator('[data-published-reviews] li')).toHaveCount(0);
 expect(state.reviewSubmissions).toBe(1);
 await page.reload();
 await expect(page.locator('[data-review-form]')).toBeHidden();
 await expect(page.locator('[data-review-feedback]')).toContainText('awaiting moderation');
 expect(state.reviewSubmissions).toBe(1);
 expect(readerSafeRequests(state.requests)).toBe(true);
});
test('approved reviews are displayed safely, including untrusted markup as text',async({page})=>{
 const state=await mockAuth(page);
 state.reviews=[{id:'00000000-0000-4000-8000-000000000099',novel_slug:'sad-zimy',
  body:'A thoughtful review with <script>alert(1)</script> shown as plain text, never interpreted by the browser.',
  status:'approved',created_at:'2026-10-28T00:00:00Z'}];
 await page.goto('/novel/sad-zimy/');
 await expect(page.locator('[data-published-reviews] li')).toHaveCount(0);
 await page.locator('[data-load-reviews]').click();
 await expect(page.locator('[data-published-reviews] li')).toHaveCount(1);
 await expect(page.locator('[data-published-reviews] li')).toContainText('<script>alert(1)</script>');
 await expect(page.locator('[data-published-reviews] script')).toHaveCount(0);
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('Reviewer title requires 20 approved reviews, stays separate from rank and locks after revocation',async({page})=>{
 const state=await mockAuth(page);
 state.rankStats.approvedReviews=19;
 await loginFixture(page);
 await page.getByRole('tab',{name:'Titles & achievements'}).click();
 await expect(page.locator('[data-title-id=reviewer] [data-award-progress]')).toHaveText('19 / 20');
 await expect(page.locator('#reader-stat-reviews')).toHaveText('19');
 await expect(page.locator('[data-equip-title=reviewer]')).toBeDisabled();
 state.rankStats.approvedReviews=20;
 await page.reload();
 await expect(page.locator('[data-equip-title=reviewer]')).toBeEnabled();
 await page.locator('[data-equip-title=reviewer]').click();
 await expect(page.locator('#reader-equipped-title')).toHaveText('Reviewer');
 await expect(page.locator('#reader-rank')).toHaveText('Iron');
 await page.reload();
 await expect(page.locator('#reader-equipped-title')).toHaveText('Reviewer');
 state.rankStats.approvedReviews=19;
 await page.reload();
 await expect(page.locator('[data-equip-title=reviewer]')).toBeDisabled();
 await expect(page.locator('#reader-equipped-title')).toHaveText('Novice Reader');
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('profile Continue Reading shows saved chapter position without fabricated progress',async({page})=>{
 await mockAuth(page);
 await open(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
  version:1,library:{'sad-zimy':'reading'},progress:{
   'sad-zimy':{chapterSlug:'glava-1',chapterNumber:1,blockId:'block-4',offset:0,ratio:.62,updatedAt:Date.now()}
  }
 })));
 await fill(page);
 await page.locator('#reader-auth-submit').click();
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page.locator('#profile-recent-list li')).toHaveCount(1);
 await expect(page.locator('#profile-recent-list li').first()).toContainText('62%');
 await expect(page.locator('#profile-recent-list li a').first()).toHaveAttribute('href',/sad-zimy/);
 await expect(page.locator('#profile-recent-list progress').first()).toHaveJSProperty('value',62);
 await page.reload();
 await expect(page.locator('#profile-recent-list li')).toHaveCount(1);
});
test('profile recent-reading empty state never invents activity',async({page})=>{
 await mockAuth(page);
 await open(page);await fill(page);
 await page.locator('#reader-auth-submit').click();
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page.locator('#profile-recent-list li')).toHaveCount(0);
 await expect(page.locator('#profile-recent-status')).toContainText('No reading activity saved');
});


test('profile distinguishes completed device shelf from verified novel rewards',async({page})=>{
 const state=await mockAuth(page);
 await open(page);
 await page.evaluate(()=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({
  version:1,library:{'sad-zimy':'completed','khranitel-mayaka':'reading'},progress:{}
 })));
 await fill(page);
 await page.locator('#reader-auth-submit').click();
 await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page.locator('#reader-stat-shelf-completed')).toHaveText('1');
 await expect(page.locator('#reader-stat-shelf-completed')).toBeHidden();
 await expect(page.locator('#profile-metrics-slot .advancement-stats > div')).toHaveCount(4);
 await expect(page.locator('#reader-stat-novels')).toHaveText('0');
 expect(state.rankStats.completedNovels).toBe(0);
 await page.evaluate(()=>{
  const value=JSON.parse(localStorage.getItem('hunmeng-novels:v1')!);
  value.library['khranitel-mayaka']='completed';
  localStorage.setItem('hunmeng-novels:v1',JSON.stringify(value));
  window.dispatchEvent(new CustomEvent('reader:state-change'));
 });
 await expect(page.locator('#reader-stat-shelf-completed')).toHaveText('2');
 await expect(page.locator('#reader-stat-novels')).toHaveText('0');
});

test('achievement milestones and filters use verified statistics without awarding XP',async({page})=>{
 const state=await mockAuth(page);
 state.rankStats.chapters=51;
 state.rankStats.completedNovels=1;
 state.rankStats.readingDays=8;
 await loginFixture(page);
 await page.getByRole('tab',{name:'Titles & achievements'}).click();
 await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
 await expect(page.locator('[data-achievement-id]')).toHaveCount(13);
 await expect(page.locator('#reader-stat-achievements')).toHaveText('6 / 13');
 await expect(page.locator('#reader-achievements-summary')).toContainText('6 of 13');
 await expect(page.locator('[data-achievement-id="first-world"]')).toHaveAttribute('data-unlocked','true');
 await expect(page.locator('[data-achievement-id="one-hundred-days"]')).toHaveAttribute('data-unlocked','false');
 await page.locator('[data-achievement-filter="unlocked"]').click();
 await expect(page.locator('[data-achievement-id]:visible')).toHaveCount(6);
 await expect(page.locator('[data-achievement-filter="unlocked"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#reader-achievements-empty')).toBeHidden();
 await page.locator('[data-achievement-filter="locked"]').click();
 await expect(page.locator('[data-achievement-id]:visible')).toHaveCount(7);
 await page.locator('[data-achievement-filter="all"]').click();
 await expect(page.locator('[data-achievement-id]:visible')).toHaveCount(13);
 await expect(page.locator('#reader-level')).toHaveText('Level 1');
 expect(state.rankStats.total_xp).toBe(0);
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('unlocked achievement filter explains an empty verified history',async({page})=>{
 await mockAuth(page);
 await loginFixture(page);
 await page.getByRole('tab',{name:'Titles & achievements'}).click();
 await expect(page.locator('#reader-stat-achievements')).toHaveText('0 / 13');
 await page.locator('[data-achievement-filter="unlocked"]').click();
 await expect(page.locator('[data-achievement-id]:visible')).toHaveCount(0);
 await expect(page.locator('#reader-achievements-empty')).toBeVisible();
 await expect(page.locator('#reader-achievements-empty')).toContainText('No achievements match');
});


test('next rank preview uses verified XP and advances at the exact rank boundary',async({page})=>{
 const state=await mockAuth(page);
 const toLevel=(target:number)=>{
   let total=0;
   for(let level=1;level<target;level++){
     const n=level-1;total+=500+4*n+Math.floor(26*Math.sqrt(n));
   }
   return total;
 };
 state.rankStats.total_xp=toLevel(25)-1;
 state.rankStats.last_rank_notified='iron';
 await loginFixture(page);
 await page.getByRole('tab',{name:'Progress',exact:true}).click();
 await expect(page.locator('#reader-next-rank')).toBeVisible();
 await expect(page.locator('#reader-next-rank-name')).toHaveText('Bronze · Level 25');
 await expect(page.locator('#reader-next-rank-remaining')).toHaveText('1 verified XP remaining');
 await expect(page.locator('#reader-next-rank-image')).toHaveAttribute('src','/images/ranks/bronze.svg');
 const amount=await page.locator('#reader-next-rank-progress').evaluate(
  (bar:HTMLProgressElement)=>({value:bar.value,max:bar.max}));
 expect(amount.max-amount.value).toBe(1);
 state.rankStats.total_xp=toLevel(25);
 state.rankStats.last_rank_notified='bronze';
 await page.reload();
 await expect(page.locator('#reader-rank')).toHaveText('Bronze');
 await expect(page.locator('#reader-next-rank-name')).toHaveText('Silver · Level 60');
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('Dark Gold appears directly after Gold; Mythical has no next rank',async({page})=>{
 const state=await mockAuth(page);
 const toLevel=(target:number)=>{
   let total=0;
   for(let level=1;level<target;level++){
     const n=level-1;total+=500+4*n+Math.floor(26*Math.sqrt(n));
   }
   return total;
 };
 state.rankStats.total_xp=toLevel(110);
 state.rankStats.last_rank_notified='gold';
 await loginFixture(page);
 await page.getByRole('tab',{name:'Progress',exact:true}).click();
 await expect(page.locator('#reader-rank')).toHaveText('Gold');
 await expect(page.locator('#reader-next-rank-name')).toHaveText('Dark Gold · Level 140');
 await expect(page.locator('#reader-next-rank-image')).toHaveAttribute('src','/images/ranks/dark-gold.svg');
 state.rankStats.total_xp=toLevel(420);
 state.rankStats.last_rank_notified='mythical';
 await page.reload();
 await expect(page.locator('#reader-rank')).toHaveText('Mythical');
 await expect(page.locator('#reader-next-rank')).toBeHidden();
 await expect(page.locator('#reader-highest-rank')).toBeVisible();
 await expect(page.locator('#reader-highest-rank')).toContainText('Keep reading toward level 500');
});


test('closest verified achievement updates from server progress without granting XP',async({page})=>{
 const state=await mockAuth(page);
 state.rankStats.chapters=51;
 state.rankStats.completedNovels=1;
 state.rankStats.readingDays=8;
 await loginFixture(page);
 await expect(page.locator('#reader-next-achievement')).toBeVisible();
 await expect(page.locator('#reader-next-achievement-name')).toHaveText('Page Voyager');
 await expect(page.locator('#reader-next-achievement-remaining')).toHaveText('49 chapters to unlock');
 await expect(page.locator('#reader-next-achievement-progress')).toHaveJSProperty('value',51);
 await expect(page.locator('#reader-next-achievement-progress')).toHaveJSProperty('max',100);
 expect(state.rankStats.total_xp).toBe(0);
 await expect(page.locator('#reader-level')).toHaveText('Level 1');
 await expect(page.locator('#reader-all-achievements')).toBeHidden();
 await page.getByRole('tab',{name:'Titles & achievements'}).click();
 await page.locator('[data-achievement-filter="unlocked"]').click();
 await page.getByRole('tab',{name:'Overview'}).click();
 await expect(page.locator('#reader-next-achievement')).toBeVisible();
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('new readers see a first goal and fully completed readers see a completion state',async({page})=>{
 const state=await mockAuth(page);
 await loginFixture(page);
 await expect(page.locator('#reader-next-achievement-name')).toHaveText('First Chapter');
 await expect(page.locator('#reader-next-achievement-remaining')).toHaveText('1 chapter to unlock');
 state.rankStats.chapters=500;
 state.rankStats.completedNovels=25;
 state.rankStats.readingDays=100;
 await page.reload();
 await expect(page.locator('#reader-next-achievement')).toBeHidden();
 await expect(page.locator('#reader-all-achievements')).toBeVisible();
 await expect(page.locator('#reader-achievements-summary')).toContainText('13 of 13');
});

test('reader mastery is a six-step level ladder distinct from the nine rank emblems',async({page})=>{
 const state=await mockAuth(page);
 const toLevel=(target:number)=>{
   let xp=0;
   for(let level=1;level<target;level++){
     const n=level-1;xp+=500+4*n+Math.floor(26*Math.sqrt(n));
   }
   return xp;
 };
 state.rankStats.total_xp=toLevel(12);
 state.rankStats.last_rank_notified='iron';
 await loginFixture(page);
 await page.getByRole('tab',{name:'Progress',exact:true}).click();
 await expect(page.locator('.reader-mastery-tile')).toHaveCount(6);
 await expect(page.locator('#reader-mastery-name')).toHaveText('Experienced Reader');
 await expect(page.locator('[data-mastery-id="experienced"]')).toHaveAttribute('data-mastery-status','current');
 await expect(page.locator('[data-mastery-id="reader"]')).toHaveAttribute('data-mastery-status','earned');
 await expect(page.locator('[data-mastery-id="connoisseur"]')).toHaveAttribute('data-mastery-status','locked');
 await expect(page.locator('#reader-rank')).toHaveText('Iron');
 await expect(page.locator('.advancement-all-ranks')).toHaveAttribute('href','/ranks/');
 state.rankStats.total_xp=toLevel(50);
 state.rankStats.last_rank_notified='bronze';
 await page.reload();
 await expect(page.locator('#reader-mastery-name')).toHaveText('Hunmeng Legend');
 await expect(page.locator('#reader-rank')).toHaveText('Bronze');
 await expect(page.locator('[data-mastery-id="legend"]')).toHaveAttribute('data-mastery-status','current');
 expect(readerSafeRequests(state.requests)).toBe(true);
});


test('six unique SVG reader-mastery badges are readable and responsive on desktop and mobile',async({page},info)=>{
 const state=await mockAuth(page);
 const xpTo=(target:number)=>{
  let total=0;
  for(let level=1;level<target;level++){
   const n=level-1;total+=500+4*n+Math.floor(26*Math.sqrt(n));
  }
  return total;
 };
 state.rankStats.total_xp=xpTo(12);
 state.rankStats.last_rank_notified='iron';
 await loginFixture(page);
 await expect(page.locator('.reader-mastery-tile')).toHaveCount(6);
 await expect(page.locator('#reader-mastery-name')).toHaveText('Experienced Reader');
 await expect(page.locator('[data-mastery-id="experienced"]')).toHaveAttribute('data-mastery-status','current');
 await expect(page.locator('[data-mastery-id="experienced"] [data-mastery-state]')).toHaveText('Current step');
 await expect(page.locator('[data-mastery-id="reader"] [data-mastery-state]')).toHaveText('Unlocked');
 await expect(page.locator('[data-mastery-id="master"] [data-mastery-state]')).toHaveText('Locked');
 // Reader's Path now lives in the Progress tab of the compact profile.
 await page.getByRole('tab',{name:'Progress',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Progress',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#progress')).toBeVisible();
 await expect(page.locator('.reader-mastery-section')).toBeVisible();
 const paths=['novice','reader','experienced','connoisseur','master','legend'];
 for(const id of paths){
  const img=page.locator(`[data-mastery-id="${id}"] img.reader-mastery-emblem`);
  await expect(img).toHaveAttribute('src',`/images/mastery/${id}.webp`);
  // Loading each in-view-on-demand image via eager mode avoids a brittle
  // scroll-into-view on the horizontally compact six-step grid.
  await img.evaluate((image:HTMLImageElement)=>{ image.loading='eager'; });
  await expect.poll(()=>img.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 }
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},width===390?'dark':'light');
  await expect(page.locator('.reader-mastery-section')).toBeVisible();
  await page.evaluate(()=>document.fonts.ready);
  await page.locator('.reader-mastery-section').screenshot({
   path:info.outputPath(`hunmeng-reader-mastery-${width}.png`),animations:'disabled',
  });
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 }
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('mastery celebration appears once for an authenticated promotion, never on initial login or refresh',async({page},info)=>{
 const state=await mockAuth(page);
 const xpTo=(target:number)=>{
  let total=0;
  for(let level=1;level<target;level++){
   const n=level-1;total+=500+4*n+Math.floor(26*Math.sqrt(n));
  }
  return total;
 };
 state.rankStats.total_xp=xpTo(4);
 state.rankStats.last_rank_notified='iron';
 await loginFixture(page);
 await expect(page.locator('#reader-mastery-unlocked')).toBeHidden();
 state.rankStats.total_xp=xpTo(5);
 await page.reload();
 await expect(page.locator('#reader-mastery-unlocked')).toBeVisible();
 await expect(page.locator('#reader-mastery-unlocked-image')).toHaveAttribute('src','/images/mastery/reader.webp');
 await expect(page.locator('#reader-mastery-unlocked-detail')).toContainText('Reader');
 await page.setViewportSize({width:390,height:850});
 await page.locator('#reader-mastery-unlocked').screenshot({
  path:info.outputPath('hunmeng-mastery-unlock-390.png'),animations:'disabled',
 });
 await page.locator('#reader-mastery-acknowledge').click();
 await expect(page.locator('#reader-mastery-unlocked')).toBeHidden();
 await page.reload();
 await expect(page.locator('#reader-mastery-unlocked')).toBeHidden();
 await expect(page.locator('[data-mastery-id="reader"]')).toHaveAttribute('data-mastery-status','current');
 expect(state.rankStats.total_xp).toBe(xpTo(5));
 expect(readerSafeRequests(state.requests)).toBe(true);
});

test('rank celebration completes first when a level unlocks both a rank and mastery tier',async({page})=>{
 const state=await mockAuth(page);
 const xpTo=(target:number)=>{
  let total=0;
  for(let level=1;level<target;level++){
   const n=level-1;total+=500+4*n+Math.floor(26*Math.sqrt(n));
  }
  return total;
 };
 state.rankStats.total_xp=xpTo(19);
 state.rankStats.last_rank_notified='iron';
 await loginFixture(page);
 await expect(page.locator('#reader-mastery-unlocked')).toBeHidden();
 state.rankStats.total_xp=xpTo(25);
 await page.reload();
 await expect(page.locator('#reader-rank-unlocked')).toBeVisible();
 await expect(page.locator('#reader-mastery-unlocked')).toBeHidden();
 await page.locator('#reader-rank-acknowledge').click();
 await expect(page.locator('#reader-mastery-unlocked')).toBeVisible();
 await expect(page.locator('#reader-mastery-unlocked-image')).toHaveAttribute('src','/images/mastery/connoisseur.webp');
 await page.locator('#reader-mastery-acknowledge').click();
 await page.reload();
 await expect(page.locator('#reader-mastery-unlocked')).toBeHidden();
 await expect(page.locator('#reader-rank-unlocked')).toBeHidden();
 expect(state.rankStats.last_rank_notified).toBe('bronze');
 expect(readerSafeRequests(state.requests)).toBe(true);
});


test('editorial signed-in profile: accessible cards, demo recent covers and responsive screenshots', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'The test captures both viewport sizes from the desktop browser only.');
  // Uses the existing mocked reader account / responses; no real account is accessed.
  const state = await mockAuth(page);
  // Representative signed-in reader for visual screenshots (synthetic data only).
  state.profileUser.user_metadata = { nickname: 'Hunmeng', avatar_color: 'navy',
    bio: 'Reading cultivation and near-future sci-fi every evening.' };
  const xpAtLevel=(target:number)=>{
    let total=0;
    for(let level=1;level<target;level++) {
      const n=level-1;total+=500+4*n+Math.floor(26*Math.sqrt(n));
    }
    return total;
  };
  state.rankStats.total_xp = xpAtLevel(25)+135;
  state.rankStats.last_rank_notified = 'bronze';
  state.rankStats.selected_title = 'regular';
  state.rankStats.chapters = 180;
  state.rankStats.completedNovels = 2;
  state.rankStats.readingDays = 34;
  state.xpAwards = [
    {event_kind:'chapter_finished',novel_slug:'sad-zimy',chapter_slug:'glava-2',xp:80,awarded_at:'2026-10-31T12:00:00Z'},
    {event_kind:'chapter_finished',novel_slug:'sad-zimy',chapter_slug:'glava-1',xp:80,awarded_at:'2026-10-31T11:00:00Z'},
    {event_kind:'novel_finished',novel_slug:'khranitel-mayaka',chapter_slug:'glava-3',xp:400,awarded_at:'2026-10-30T12:00:00Z'},
  ];
  await open(page);
  await page.evaluate(() => localStorage.setItem('hunmeng-novels:v1', JSON.stringify({
    version: 1,
    library: { 'sad-zimy': 'reading', 'khranitel-mayaka': 'later' },
    progress: {
      'sad-zimy': { chapterSlug:'glava-1', chapterNumber:1, blockId:'block-4',
        offset: 0, ratio: .62, updatedAt: Date.parse('2026-10-30T10:00:00Z') },
    },
  })));
  await fill(page);
  await page.locator('#reader-auth-submit').click();
  await expect(page.locator('#auth-logged-in')).toBeVisible();
  await expect(page.locator('.profile-member-identity')).toBeVisible();
  await expect(page.locator('#profile-avatar')).toBeVisible();
  await expect(page.locator('#reader-current-emblem')).toBeVisible();
  await expect(page.locator('#profile-recent-list .profile-recent-card')).toHaveCount(1);
  await expect(page.locator('#profile-recent-list .profile-recent-cover')).toHaveAttribute('src', /sad-zimy|garden/i);
  await expect(page.locator('#profile-recent-list progress')).toHaveJSProperty('value', 62);
  await expect(page.locator('#reader-rank')).not.toBeEmpty();
  await expect(page.locator('#reader-mastery-heading')).toHaveText("Reader's Path");

  for (const width of [1440, 390]) {
    const device = width === 390 ? 'mobile' : 'desktop';
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const theme of ['light', 'dark', 'sepia'] as const) {
      await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
      await expect(page.locator('#profile-details')).toBeVisible();
      const hero = await page.locator('.profile-member-hero').boundingBox();
      const identity = await page.locator('.profile-member-identity').boundingBox();
      const panel = await page.locator('#profile-details').boundingBox();
      const recent = await page.locator('.profile-recent-card').first().boundingBox();
      expect(hero).toBeTruthy();
      expect(identity).toBeTruthy();
      expect(panel).toBeTruthy();
      expect(recent).toBeTruthy();
      // The presentational redesign should preserve the older verified tests
      // while removing the hero card frame and floating rank background.
      const presentation = await page.locator('.profile-member-hero').evaluate(el => {
        const style=getComputedStyle(el);
        return {radius:style.borderTopLeftRadius,border:style.borderTopWidth,image:style.backgroundImage};
      });
      expect(presentation.radius).toBe('0px');
      expect(presentation.border).toBe('0px');
      // Phones load the 960 px copy of the same header art.
      expect(presentation.image).toMatch(theme === 'dark' ? /header-night(-960)?\.webp/ : /header-day(-960)?\.webp/);
      expect(presentation.image).toContain('hunmeng-landscape-');
      const rankPlate=await page.locator('.profile-rank-slot .advancement-hero').evaluate(el => ({
        background:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopWidth,
      }));
      expect(rankPlate.background).toBe('rgba(0, 0, 0, 0)');
      expect(rankPlate.border).toBe('0px');
      if(width===1440) expect(hero!.height).toBeGreaterThanOrEqual(330);
      if(width===390) {
        const count=await page.locator('#profile-metrics-slot .advancement-stats').evaluate(el =>
          getComputedStyle(el).gridTemplateColumns.split(' ').length);
        expect(count).toBe(2);
      }
      expect(identity!.x).toBeGreaterThanOrEqual(hero!.x - 1);
      expect(identity!.x + identity!.width).toBeLessThanOrEqual(hero!.x + hero!.width + 1);
      expect(recent!.x).toBeGreaterThanOrEqual(panel!.x - 1);
      expect(recent!.x + recent!.width).toBeLessThanOrEqual(panel!.x + panel!.width + 1);
      if (width === 1440 && theme === 'light') {
        // Overview is no longer a seven-thousand-pixel stream of all progression cards.
        expect(panel!.height).toBeLessThanOrEqual(1800);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), theme + ' at ' + width).toBe(true);
      await expect(page.locator('.profile-sidebar nav [aria-current="location"]')).toHaveCount(1);
      if (theme !== 'sepia') {
        await page.evaluate(() => document.fonts.ready);
        // Capture the visible screen rather than stitching a very long page:
        // fullPage screenshots displace the sticky site header mid-image.
        await page.evaluate(() => window.scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await page.screenshot({
          path: info.outputPath('hunmeng-profile-' + device + '-' + theme + '.png'),
          fullPage: false, animations: 'disabled',
        });
        if (width === 390) {
          // Capture the entire Overview dashboard below the fold as well as its first screen.
          await page.locator('#auth-logged-in').screenshot({
            path: info.outputPath('hunmeng-profile-mobile-' + theme + '-overview.png'),
            animations: 'disabled',
          });
        }
      }
    }
  }
  // Profile tabs and separated progression systems remain functional.
  await page.locator('.profile-sidebar [data-profile-section="profile-reading"]').click();
  await expect(page.locator('#profile-reading')).toBeVisible();
  await page.locator('.profile-sidebar [data-profile-section="profile-details"]').click();
  await page.getByRole('tab',{name:'Progress',exact:true}).click();
  await expect(page.locator('#reader-mastery-heading')).toBeVisible();
  await expect(page.locator('#reader-rank')).not.toBeEmpty();
  expect(readerSafeRequests(state.requests)).toBe(true);
});

test('profile dashboard: keyboard tabs and URL state, edit dialog focus and live XP preview', async ({page}) => {
  const state=await mockAuth(page);
  state.profileUser.user_metadata={nickname:'Hunmeng',bio:'Reading cultivation and near-future sci-fi every evening.',avatar_color:'navy'};
  state.rankStats.chapters=180;
  state.rankStats.completedNovels=2;
  state.rankStats.readingDays=34;
  state.rankStats.total_xp=15200;
  state.xpAwards=[
    {event_kind:'chapter_finished',novel_slug:'sad-zimy',chapter_slug:'glava-1',xp:80,awarded_at:'2026-10-31T12:00:00Z'},
    {event_kind:'novel_finished',novel_slug:'khranitel-mayaka',chapter_slug:'glava-1',xp:400,awarded_at:'2026-10-30T12:00:00Z'},
  ];
  await page.setViewportSize({width:390,height:844});
  await loginFixture(page);
  await expect(page.locator('#profile-name')).toHaveText('Hunmeng');
  await expect(page.locator('#profile-bio')).toContainText('near-future sci-fi');
  await expect(page.locator('#reader-stat-chapters')).toHaveText('180');
  await expect(page.locator('#profile-metrics-slot .advancement-stats>div')).toHaveCount(4);
  await expect(page.locator('#profile-recent-xp-list li')).toHaveCount(2);
  await expect(page.locator('#profile-recent-xp-list')).toContainText('The Garden');
  await expect(page.locator('#profile-recent-xp-list')).not.toContainText('sad-zimy');
  await expect(page.locator('#profile-recent-xp-list')).toContainText('31 Oct');
  const tab=page.getByRole('tab',{name:'Overview',exact:true});
  await tab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab',{name:'Progress'})).toHaveAttribute('aria-selected','true');
  await expect(page).toHaveURL(/#progress$/);
  await page.reload();
  await expect(page.getByRole('tab',{name:'Progress'})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Overview'}).click();
  await page.locator('#profile-edit-open').click();
  await expect(page.locator('#profile-edit-dialog')).toBeVisible();
  await expect(page.getByLabel('Nickname',{exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#profile-edit-dialog')).toBeHidden();
  await expect(page.locator('#profile-edit-open')).toBeFocused();
  await page.locator('#profile-edit-open').click();
  await page.getByLabel('Bio',{exact:true}).fill('Updated on mobile.');
  await page.getByRole('button',{name:'Save profile'}).click();
  await expect(page.locator('#profile-status')).toHaveText('Profile saved.');
  await expect(page.locator('#profile-edit-dialog')).toBeHidden();
  await expect(page.locator('#profile-bio')).toHaveText('Updated on mobile.');
  await expect(page.locator('#profile-edit-open')).toBeFocused();
  await page.locator('[data-open-xp-history]').click();
  await expect(page.getByRole('tab',{name:'XP history'})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#reader-xp-history-list')).toContainText('The Garden');
  await expect(page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1)).resolves.toBe(true);
  expect(readerSafeRequests(state.requests)).toBe(true);
});

test('founder account sees the unique emblem card, avatar badge and title ribbon',async({page})=>{
 const state=await mockAuth(page);
 state.rankStats.selected_title='founder';
 await page.route('**/rest/v1/rpc/reader_is_founder',route=>route.fulfill({status:200,contentType:'application/json',
  headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},body:'true'}));
 await loginFixture(page);
 await expect(page.locator('#profile-founder-card')).toBeVisible();
 await expect(page.locator('#profile-founder-badge')).toBeVisible();
 await expect(page.locator('#reader-equipped-title')).toHaveText('Founder of Hunmeng');
 await expect(page.locator('#profile-founder-equip')).toHaveText('Equipped');
 expect(readerSafeRequests(state.requests)).toBe(true);
});
test('regular readers never see the founder emblem',async({page})=>{
 await mockAuth(page);
 await loginFixture(page);
 await expect(page.locator('#reader-advancement')).toHaveAttribute('data-status','ready');
 await expect(page.locator('#profile-founder-card')).toBeHidden();
 await expect(page.locator('#profile-founder-badge')).toBeHidden();
});
