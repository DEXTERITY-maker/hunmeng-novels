import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
// Synthetic credentials only; no real accounts or roles are created.
const user = { id: '00000000-0000-4000-8000-000000000022', email: 'staff@example.test' };
const sessionKey = 'hunmeng-novels:admin-session:v1';
const fakeSession = (expired = false) => ({
  access_token: 'fixture-access', refresh_token: 'fixture-refresh', user,
  expires_at: Math.floor(Date.now()/1000) + (expired ? -10 : 3600),
});
async function mockBackend(page: Page, role: string | null = 'admin') {
  const state = { role, passwordStatus:200, refreshStatus:200, dataStatus:200, userStatus:200,
    logoutOffline:false, requests:[] as string[], passwordCalls:0, refreshCalls:0 };
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    state.requests.push(url.pathname);
    const json = (data: unknown, status = 200) => route.fulfill({ status,
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},
      contentType:'application/json', body:JSON.stringify(data) });
    if (route.request().method() === 'OPTIONS') return json({});
    if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        state.refreshCalls++;
        return json({...fakeSession(),expires_in:3600}, state.refreshStatus);
      }
      state.passwordCalls++;
      return json(state.passwordStatus === 200 ? {...fakeSession(),expires_in:3600} :
        {message:'Private upstream diagnostic must never be rendered'}, state.passwordStatus);
    }
    if (url.pathname.endsWith('/user')) return json(user, state.userStatus);
    if (url.pathname.endsWith('/logout')) {
      if (state.logoutOffline) return route.abort('failed');
      return json({});
    }
    if (url.pathname.endsWith('/novel_staff')) return json(state.role ? [{role:state.role}] : []);
    return json([], state.dataStatus);
  });
  return state;
}
async function login(page: Page) {
  await page.getByLabel('Email', {exact:true}).fill(user.email);
  await page.getByLabel('Пароль', {exact:true}).fill('fixture-password');
  await page.getByRole('button', {name:'Войти в редакцию',exact:true}).click();
}
async function seededSession(page: Page, expired = false) {
  await page.goto('/admin/login/');
  await page.evaluate(({key,session}) => sessionStorage.setItem(key, JSON.stringify(session)),
    {key:sessionKey,session:fakeSession(expired)});
  await page.goto('/admin/');
}

test('вход редакции отдельно: noindex, нет регистрации/OAuth, безопасный адрес', async ({page}) => {
  await page.goto('/admin/login/?next=https://evil.example/#access_token=fixture');
  await expect(page).toHaveURL(/\/admin\/login\/$/);
  await expect(page.getByRole('heading', {name:'Вход в редакцию'})).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex,follow');
  await expect(page.locator('meta[name=referrer]')).toHaveAttribute('content','no-referrer');
  await expect(page.locator('#google-sign-in, select[name=mode], a[href*="signup"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/admin/');
  await expect(page.locator('#admin-login-link')).toBeVisible();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await page.getByRole('link', {name:'Войти в редакцию',exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/login\/$/);
});
for (const role of ['admin', 'editor']) test(`вход ${role}: разрешённые функции без синхронизации читателей`, async ({page}) => {
  const state = await mockBackend(page, role);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/admin/login/?redirect=https://evil.example/');
  await login(page);
  await expect(page).toHaveURL(/\/admin\/$/);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#admin-status')).toContainText(role === 'admin' ? 'Администратор' : 'Редактор');
  await expect(page.locator('#source-form')).toBeVisible({visible:role === 'admin'});
  await expect(page.locator('#rights-form')).toBeVisible({visible:role === 'admin'});
  expect(state.requests.some(path=>path.includes('novel_reader_state'))).toBe(false);
  expect(state.requests.some(path=>/signup|authorize/.test(path))).toBe(false);
  expect(await page.evaluate(key=>localStorage.getItem(key),sessionKey)).toBeNull();
  expect(await page.evaluate(key=>sessionStorage.getItem(key)!==null,sessionKey)).toBe(true);
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Выйти из редакции'}).click();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toHaveText('Вы вышли из редакции.');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
  await page.reload();
  await expect(page.locator('#admin-workspace')).toBeHidden();
});
for (const role of [null,'reader','owner']) test(`роль ${String(role)} не открывает редакторские данные`, async ({page}) => {
  const state=await mockBackend(page, role);
  await page.goto('/admin/login/');
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Нет доступа к редакции');
  expect(state.requests.some(path=>/novel_(sources|terms|translation_jobs)/.test(path))).toBe(false);
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
});
test('неверный пароль и частые попытки: понятные ошибки без утечки ответа сервера', async ({page}) => {
  const state=await mockBackend(page);
  state.passwordStatus=400;
  await page.goto('/admin/login/');
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Проверьте email, пароль');
  await expect(page.getByLabel('Пароль',{exact:true})).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('Private upstream');
  state.passwordStatus=429;
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Слишком много попыток');
  expect(state.requests.some(path=>path.endsWith('novel_staff'))).toBe(false);
});
test('истёкший токен обновляется; отозванная сессия требует входа', async ({page}) => {
  const state=await mockBackend(page);
  await seededSession(page,true);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  expect(state.refreshCalls).toBe(1);
  state.refreshStatus=400;
  await page.evaluate(({key,session})=>sessionStorage.setItem(key,JSON.stringify(session)),{key:sessionKey,session:fakeSession(true)});
  await page.reload();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-login-link')).toBeVisible();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
});
test('401 и 403 API закрывают редакторские данные', async ({page}) => {
  const state=await mockBackend(page);
  await seededSession(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#admin-job-list')).toContainText('Очередь пока пуста.');
  state.dataStatus=401;
  await page.getByRole('button',{name:'Обновить очередь'}).click();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('Сессия завершена');
  state.dataStatus=403;
  await seededSession(page);
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('Нет прав');
});
test('выход без соединения очищает сессию и предупреждает', async ({page}) => {
  const state=await mockBackend(page);
  await seededSession(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  state.logoutOffline=true;
  await page.getByRole('button',{name:'Выйти из редакции'}).click();
  await expect(page.locator('#admin-status')).toContainText('Сервер не подтвердил');
  await expect(page.locator('#admin-workspace')).toBeHidden();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
});
test('запрещённое хранилище не отправляет пароль и не создаёт сессию', async ({page}) => {
  const state=await mockBackend(page);
  await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked');}}));
  await page.goto('/admin/login/');
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Разрешите сохранение');
  expect(state.passwordCalls).toBe(0);
});
test('отозванная роль скрывает редакцию при возвращении во вкладку', async ({page}) => {
  const state=await mockBackend(page);
  await seededSession(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  state.role=null;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-login-link')).toBeVisible();
});
