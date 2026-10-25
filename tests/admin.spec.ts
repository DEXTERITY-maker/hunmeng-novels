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
  await page.getByLabel('Password', {exact:true}).fill('fixture-password');
  await page.getByRole('button', {name:'Editorial sign-in',exact:true}).click();
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
  await expect(page.getByRole('heading', {name:'Editorial sign-in'})).toBeVisible();
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content','noindex,follow');
  await expect(page.locator('meta[name=referrer]')).toHaveAttribute('content','no-referrer');
  await expect(page.locator('#google-sign-in, select[name=mode], a[href*="signup"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/admin/');
  await expect(page.locator('#admin-login-link')).toBeVisible();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await page.getByRole('link', {name:'Editorial sign-in',exact:true}).click();
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
  await expect(page.locator('#admin-status')).toContainText(role === 'admin' ? 'Administrator' : 'Editor');
  await expect(page.locator('#source-form')).toBeVisible({visible:role === 'admin'});
  await expect(page.locator('#rights-form')).toBeVisible({visible:role === 'admin'});
  expect(state.requests.some(path=>path.includes('novel_reader_state'))).toBe(false);
  expect(state.requests.some(path=>/signup|authorize/.test(path))).toBe(false);
  expect(await page.evaluate(key=>localStorage.getItem(key),sessionKey)).toBeNull();
  expect(await page.evaluate(key=>sessionStorage.getItem(key)!==null,sessionKey)).toBe(true);
  expect(errors).toEqual([]);
  await page.getByRole('button',{name:'Sign out of editorial tools'}).click();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toHaveText('You are signed out of editorial tools.');
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
  await page.reload();
  await expect(page.locator('#admin-workspace')).toBeHidden();
});
for (const role of [null,'reader','owner']) test(`роль ${String(role)} не открывает редакторские данные`, async ({page}) => {
  const state=await mockBackend(page, role);
  await page.goto('/admin/login/');
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('No editorial access');
  expect(state.requests.some(path=>/novel_(sources|terms|translation_jobs)/.test(path))).toBe(false);
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
});
test('неверный пароль и частые попытки: понятные ошибки без утечки ответа сервера', async ({page}) => {
  const state=await mockBackend(page);
  state.passwordStatus=400;
  await page.goto('/admin/login/');
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Check your email, password');
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
  await expect(page.locator('body')).not.toContainText('Private upstream');
  state.passwordStatus=429;
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Too many attempts');
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
  await expect(page.locator('#admin-job-list')).toContainText('The queue is empty.');
  state.dataStatus=401;
  await page.getByRole('button',{name:'Refresh queue'}).click();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('Your session has ended');
  state.dataStatus=403;
  await seededSession(page);
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('You do not have permission');
});
test('выход без соединения очищает сессию и предупреждает', async ({page}) => {
  const state=await mockBackend(page);
  await seededSession(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  state.logoutOffline=true;
  await page.getByRole('button',{name:'Sign out of editorial tools'}).click();
  await expect(page.locator('#admin-status')).toContainText('The server could not confirm');
  await expect(page.locator('#admin-workspace')).toBeHidden();
  expect(await page.evaluate(key=>sessionStorage.getItem(key),sessionKey)).toBeNull();
});
test('запрещённое хранилище не отправляет пароль и не создаёт сессию', async ({page}) => {
  const state=await mockBackend(page);
  await page.addInitScript(()=>Object.defineProperty(window,'sessionStorage',{get(){throw new Error('blocked');}}));
  await page.goto('/admin/login/');
  await login(page);
  await expect(page.locator('#admin-login-status')).toContainText('Allow site storage');
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

test('English editorial labels preserve existing database enum values', async ({ page }) => {
  await mockBackend(page);
  const source = { id: '00000000-0000-4000-8000-000000000040', slug: 'english-demo',
    original_title: 'English Demo', rights_status: 'verified', permission_publish: true, permission_translate: true };
  let submitted: Record<string, unknown> | undefined;
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**', async route => {
    if (route.request().method() === 'POST') submitted = route.request().postDataJSON();
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: JSON.stringify([source]) });
  });
  // Source creation has no query string.
  await page.route('https://*.supabase.co/rest/v1/novel_sources', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }, status: 204 });
    submitted = route.request().postDataJSON();
    await route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: JSON.stringify([source]) });
  });
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs?**', route => route.fulfill({
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, contentType: 'application/json', body: JSON.stringify([{ id: 'job', source_id: source.id,
      chapter_number: 1, chapter_title: 'First Light', status: 'review', qa_notes: '' }]),
  }));
  await seededSession(page);
  await expect(page.locator('#admin-source-list')).toHaveText('english-demo · Verified');
  await expect(page.locator('#admin-job-list')).toContainText('In review');
  const form = page.locator('#source-form');
  await form.locator('[name=slug]').fill('english-demo');
  await form.getByLabel('Original title', { exact: true }).fill('English Demo');
  await form.getByLabel('English title', { exact: true }).fill('English Demo');
  await form.getByLabel('English description (at least 20 characters)', { exact: true }).fill('An English description of the demo novel.');
  await form.locator('select[name=original_status]').selectOption({ label: 'Completed' });
  await form.locator('select[name=translation_status]').selectOption({ label: 'In progress' });
  await form.getByLabel('Source URL (HTTPS)', { exact: true }).fill('https://example.test/original');
  await form.getByRole('button', { name: 'Create source' }).click();
  await expect.poll(() => submitted?.original_status).toBe('Завершён');
  expect(submitted?.translation_status).toBe('Переводится');
  expect(submitted?.title_ru).toBe('English Demo');
  expect(submitted?.genres).toEqual(['Fantasy']);
});
