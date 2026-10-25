import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
// Synthetic accounts, credentials and responses. No real emails are sent.
const key = 'hunmeng-novels:reader-auth:v1';
const user={id:'00000000-0000-4000-8000-000000000023',aud:'authenticated',role:'authenticated',
  email:'reader@example.test',app_metadata:{},user_metadata:{},identities:[],created_at:'2026-10-25T00:00:00Z'};
const session=()=>({access_token:[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
  Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'fixture-signature'].join('.'),
  refresh_token:'fixture-reader-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user});
async function mockAuth(page: Page) {
  const state={requests:[] as string[],signupBody:{} as Record<string,unknown>,signupRedirect:'',signupCalls:0,
    passwordCalls:0,codeCalls:0,errorCode:'',logoutOffline:false,profileUser:structuredClone(user),profileCalls:0,profileBody:{} as Record<string,unknown>,profileError:0,verifyError:0,sessionExpired:false};
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
    return json({message:'No editorial access'},403);
  });
  return state;
}
async function open(page:Page,signup=false){
  await page.goto('/account/');
  await expect(page.getByLabel('Email',{exact:true})).toBeEnabled();
  if(signup)await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
}
async function fill(page:Page,signup=false){
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Пароль',{exact:true}).fill('fixture-password');
  if(signup)await page.getByLabel('Повторите пароль',{exact:true}).fill('fixture-password');
}

test('видимая регистрация: подтверждение пароля, письмо, PKCE и отсутствие редакторских запросов',async({page})=>{
 const state=await mockAuth(page);await open(page,true);await fill(page,true);
 await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();
 await expect(page.locator('#account-status')).toContainText('Проверьте почту');
 expect(state.signupCalls).toBe(1);
 expect(state.signupBody.email).toBe(user.email);
 expect(typeof state.signupBody.code_challenge).toBe('string');
 expect(state.signupBody.code_challenge_method).toBe('s256');
 expect(state.signupRedirect).toBe('http://127.0.0.1:4321/account/');
 await expect(page.getByLabel('Пароль',{exact:true})).toHaveValue('');
 expect(state.requests.every(p=>p.startsWith('/auth/v1/'))).toBe(true);
 await expect(page.locator('#auth-fields')).toBeVisible();
});
test('несовпадающие пароли не отправляются в Auth',async({page})=>{
 const state=await mockAuth(page);await open(page,true);await fill(page,true);
 await page.getByLabel('Повторите пароль',{exact:true}).fill('different-fixture');
 await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();
 await expect(page.locator('#account-status')).toHaveText('Пароли не совпадают.');
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
 await page.getByRole('button',{name:'Выйти из аккаунта',exact:true}).click();
 await expect(page.locator('#auth-fields')).toBeVisible();
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library['sad-zimy'])).toBe('later');
 expect(await page.evaluate(()=>sessionStorage.getItem('hunmeng-novels:admin-session:v1'))).toBeNull();
 expect(state.requests.every(p=>p.startsWith('/auth/v1/'))).toBe(true);
});
for(const [code,message] of [['invalid_credentials','Проверьте email и пароль'],['email_not_confirmed','Сначала подтвердите email'],['signup_disabled','не принимает новые регистрации']])
test(`ошибка ${code} показана по-русски без диагностики`,async({page})=>{
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
 await page.getByRole('button',{name:'Выйти из аккаунта',exact:true}).click();
 await page.goto('/account/#access_token=fixture&refresh_token=fixture');
 await expect(page).toHaveURL(/\/account\/$/);
 await expect(page.locator('#auth-logged-in')).toBeHidden();
});
test('выход при сетевой ошибке очищает читательскую сессию',async({page})=>{
 const state=await mockAuth(page);await open(page);await fill(page);
 await page.locator('#reader-auth-submit').click();await expect(page.locator('#auth-logged-in')).toBeVisible();
 state.logoutOffline=true;
 await page.getByRole('button',{name:'Выйти из аккаунта',exact:true}).click();
 await expect(page.locator('#account-status')).toContainText('Сервер не подтвердил');
 expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
});
test('запрещённое хранилище не отправляет данные регистрации',async({page})=>{
 const state=await mockAuth(page);
 await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}}));
 await page.goto('/account/');
 await expect(page.locator('#account-status')).toContainText('разрешите сохранение данных');
 await expect(page.getByLabel('Email',{exact:true})).toBeDisabled();
 expect(state.requests).toEqual([]);
});

async function loginFixture(page:Page) { await open(page);await fill(page);await page.locator('#reader-auth-submit').click();await expect(page.locator('#auth-logged-in')).toBeVisible(); }
test('профиль: никнейм, описание и аватар сохраняются между посещениями только в Auth metadata',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await expect(page.getByRole('heading',{name:'Мой профиль',exact:true})).toBeVisible();
 await page.getByLabel('Никнейм',{exact:true}).fill('Тихий_читатель');
 await page.getByLabel('О себе',{exact:true}).fill('Люблю истории о море.');
 await page.getByRole('radio',{name:'Синий',exact:true}).check();
 await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.locator('#profile-status')).toHaveText('Профиль сохранён.');
 expect(state.profileBody).toEqual({data:{nickname:'Тихий_читатель',bio:'Люблю истории о море.',avatar_color:'navy'},code_challenge:null,code_challenge_method:null});
 await expect(page.locator('#profile-avatar')).toHaveAttribute('data-avatar','navy');
 await page.goto('/');await expect(page.locator('[data-account-link]')).toHaveText('Профиль');
 await page.goto('/account/');await expect(page.getByLabel('Никнейм',{exact:true})).toHaveValue('Тихий_читатель');
 await expect(page.getByLabel('О себе',{exact:true})).toHaveValue('Люблю истории о море.');
 expect(state.profileCalls).toBe(1);expect(state.requests.every(p=>p.startsWith('/auth/v1/'))).toBe(true);
});
test('некорректный никнейм и ошибки сети не дают ложного сохранения',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await page.getByLabel('Никнейм',{exact:true}).fill('<script>');await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.locator('#profile-status')).toContainText('Проверьте никнейм');expect(state.profileCalls).toBe(0);
 await page.getByLabel('Никнейм',{exact:true}).fill('Моряк');state.profileError=500;
 await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.locator('#profile-status')).not.toHaveText('Сохраняем профиль…');
 await expect(page.locator('#profile-status')).not.toHaveText('Профиль сохранён.');
 await expect(page.locator('body')).not.toContainText('Private upstream');
 await expect(page.getByRole('button',{name:'Сохранить профиль',exact:true})).toBeEnabled();
 state.profileError=0;await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();await expect(page.locator('#profile-status')).toHaveText('Профиль сохранён.');
});
test('истёкшая сессия закрывает профиль и не отправляет изменения',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);state.sessionExpired=true;
 await page.getByLabel('Никнейм',{exact:true}).fill('Моряк');await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.locator('#auth-logged-in')).toBeHidden();await expect(page.locator('#account-status')).toContainText('Сессия завершена');expect(state.profileCalls).toBe(0);
});
test('настройки чтения: сохранение, обновление страницы и сброс без отправки на сервер',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);
 await page.getByLabel('Тема оформления',{exact:true}).selectOption('sepia');
 await page.getByLabel('Шрифт читалки',{exact:true}).selectOption('sans');
 await page.locator('#preferences-form [name=size]').fill('24');
 await page.locator('#preferences-form [name=lineHeight]').fill('2');
 await page.locator('#preferences-form [name=width]').fill('800');
 await page.getByRole('button',{name:'Сохранить настройки',exact:true}).click();
 await expect(page.locator('html')).toHaveAttribute('data-theme','sepia');
 await page.reload();await expect(page.locator('#auth-logged-in')).toBeVisible();
 await expect(page.locator('#preferences-form [name=size]')).toHaveValue('24');
 await page.goto('/novel/sad-zimy/glava-1/');
 await expect(page.locator('#chapter-text')).toHaveCSS('font-size','24px');await expect(page.locator('html')).toHaveAttribute('data-reader-font','sans');
 await page.goto('/account/');await expect(page.locator('#auth-logged-in')).toBeVisible();
 await page.getByRole('button',{name:'По умолчанию',exact:true}).click();
 await expect(page.locator('#preferences-form [name=size]')).toHaveValue('20');
 await expect(page.locator('#preferences-form [name=theme]')).toHaveValue('system');
 expect(state.profileCalls).toBe(0);expect(state.requests.every(p=>p.startsWith('/auth/v1/'))).toBe(true);
});

test('недоступный сервер проверки сессии не выдаётся за выход из аккаунта',async({page})=>{
 const state=await mockAuth(page);await loginFixture(page);state.verifyError=503;
 await page.getByLabel('Никнейм',{exact:true}).fill('Моряк');await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();
 await expect(page.locator('#profile-status')).toContainText('Не удалось проверить сессию');
 await expect(page.locator('#auth-logged-in')).toBeVisible();expect(state.profileCalls).toBe(0);
 state.verifyError=0;await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();await expect(page.locator('#profile-status')).toHaveText('Профиль сохранён.');
});
