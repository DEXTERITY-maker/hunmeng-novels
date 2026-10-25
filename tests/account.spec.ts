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
    passwordCalls:0,codeCalls:0,errorCode:'',logoutOffline:false};
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
    if(address.pathname.endsWith('/user'))return json(user);
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
