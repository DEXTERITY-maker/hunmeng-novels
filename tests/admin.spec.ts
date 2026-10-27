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


test('saving a partial editorial draft does not mark it ready for review', async ({ page }) => {
  await mockBackend(page);
  const source = { id: '00000000-0000-4000-8000-000000000055', slug: 'draft-source',
    original_title: 'Draft source', rights_status: 'pending', permission_publish: false,
    permission_translate: false };
  const submitted: Record<string, unknown>[] = [];
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**', route =>
    route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json',
      body: JSON.stringify([source]) }));
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs**', async route => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({
      status: 204, headers: { 'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    if (route.request().method() === 'POST') {
      submitted.push(route.request().postDataJSON());
      return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' },
        contentType: 'application/json', body: JSON.stringify([{ id: 'created-job', ...submitted.at(-1) }]) });
    }
    return route.fulfill({ headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json', body: '[]' });
  });
  await seededSession(page);
  const form = page.locator('#job-form');
  await form.locator('[name=chapter_number]').fill('1');
  await form.locator('[name=chapter_slug]').fill('chapter-1');
  await form.locator('[name=chapter_title]').fill('Unfinished chapter');
  await form.getByRole('button', { name: 'Save draft' }).click();
  await expect.poll(() => submitted.length).toBe(1);
  expect(submitted[0].status).toBe('draft');
  expect(submitted[0].translated_text).toBe('');
  await form.locator('[name=chapter_number]').fill('2');
  await form.locator('[name=chapter_slug]').fill('chapter-2');
  await form.locator('[name=chapter_title]').fill('Reviewed chapter');
  await form.locator('[name=chapter_description]').fill('A complete chapter description.');
  await form.locator('[name=original_text]').fill('A'.repeat(100));
  await form.locator('[name=translated_text]').fill('B'.repeat(100));
  await form.getByRole('button', { name: 'Send for review' }).click();
  await expect.poll(() => submitted.length).toBe(2);
  expect(submitted[1].status).toBe('review');
});


test('existing draft keeps its status and uses conditional updates', async ({ page }) => {
  await mockBackend(page);
  const source = { id: '00000000-0000-4000-8000-000000000055', slug: 'draft-source',
    original_title: 'Draft source', rights_status: 'pending', permission_publish: false,
    permission_translate: false };
  const version = '2026-10-27T11:00:00.123456+00:00';
  const job = { id: '00000000-0000-4000-8000-000000000056', source_id: source.id,
    chapter_number: 1, chapter_slug: 'chapter-1', chapter_title: 'Draft chapter',
    chapter_description: '', original_text: 'Partial source', translated_text: 'Partial translation',
    qa_notes: '', status: 'draft', updated_at: version };
  const patches: { query: string; body: Record<string, unknown> }[] = [];
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**', route =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify([source]) }));
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push({query: new URL(route.request().url()).search, body: route.request().postDataJSON()});
      Object.assign(job, route.request().postDataJSON(), {updated_at: '2026-10-27T11:00:02.123456+00:00'});
    }
    return route.fulfill({contentType:'application/json',body:JSON.stringify([job])});
  });
  await seededSession(page);
  await page.getByRole('button', {name:'Open in editor'}).click();
  const form = page.locator('#job-form');
  await form.locator('[name=translated_text]').fill('Improved but unfinished translation');
  await form.getByRole('button',{name:'Save draft'}).click();
  await expect.poll(()=>patches.length).toBe(1);
  expect(patches[0].body.status).toBe('draft');
  expect(new URLSearchParams(patches[0].query).get('updated_at')).toBe('eq.'+version);
  await expect(page.locator('#admin-status')).toHaveText('Draft saved privately.');
});

test('saving a review cannot silently downgrade it to draft', async ({ page }) => {
  await mockBackend(page);
  const source = { id:'00000000-0000-4000-8000-000000000055',slug:'draft-source',
    original_title:'Source',rights_status:'pending',permission_publish:false,permission_translate:false };
  const job = { id:'00000000-0000-4000-8000-000000000056',source_id:source.id,
    chapter_number:1,chapter_slug:'chapter-1',chapter_title:'Reviewed chapter',
    chapter_description:'A complete chapter description.',original_text:'A'.repeat(100),
    translated_text:'B'.repeat(100),qa_notes:'',status:'review',
    updated_at:'2026-10-27T11:00:00.123456+00:00' };
  const patches: Record<string, unknown>[] = [];
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**', route =>
    route.fulfill({ contentType:'application/json',body:JSON.stringify([source]) }));
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs**', route => {
    if(route.request().method()==='PATCH') patches.push(route.request().postDataJSON());
    return route.fulfill({contentType:'application/json',body:JSON.stringify([job])});
  });
  await seededSession(page);
  await page.getByRole('button',{name:'Open in editor'}).click();
  await expect(page.getByRole('button',{name:'Save draft'})).toBeDisabled();
  await page.getByRole('button',{name:'Send for review'}).click();
  await expect.poll(()=>patches.length).toBe(1);
  expect(patches[0].status).toBe('review');
});

test('empty PATCH result detects a competing editor and never confirms success', async ({ page }) => {
  await mockBackend(page);
  const source = {id:'00000000-0000-4000-8000-000000000055',slug:'draft-source',
    original_title:'Source',rights_status:'pending',permission_publish:false,permission_translate:false};
  const job = {id:'00000000-0000-4000-8000-000000000056',source_id:source.id,
    chapter_number:1,chapter_slug:'chapter-1',chapter_title:'Concurrent draft',
    chapter_description:'',original_text:'',translated_text:'',qa_notes:'',
    status:'draft',updated_at:'2026-10-27T11:00:00.123456+00:00'};
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**', route =>
    route.fulfill({contentType:'application/json',body:JSON.stringify([source])}));
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs**', route =>
    route.fulfill({contentType:'application/json',body:route.request().method()==='PATCH' ? '[]' : JSON.stringify([job])}));
  await seededSession(page);
  await page.getByRole('button',{name:'Open in editor'}).click();
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.locator('#admin-status')).toContainText('changed in another session');
  await expect(page.locator('#admin-status')).not.toContainText('Draft saved');
  await expect(page.locator('#job-form')).toHaveAttribute('data-edit-id',job.id);
});

test('empty POST result never shows a false draft-save confirmation', async ({ page }) => {
  await mockBackend(page);
  const source={id:'00000000-0000-4000-8000-000000000055',slug:'draft-source',
    original_title:'Source',rights_status:'pending',permission_publish:false,permission_translate:false};
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**',route=>
    route.fulfill({contentType:'application/json',body:JSON.stringify([source])}));
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs**',route=>
    route.fulfill({contentType:'application/json',body:'[]'}));
  await seededSession(page);
  const form=page.locator('#job-form');
  await form.locator('[name=chapter_number]').fill('1');
  await form.locator('[name=chapter_slug]').fill('chapter-1');
  await form.locator('[name=chapter_title]').fill('Incomplete but valid draft title');
  await form.getByRole('button',{name:'Save draft'}).click();
  await expect(page.locator('#admin-status')).toContainText('Server did not confirm creation');
  await expect(page.locator('#admin-status')).not.toContainText('Draft saved');
});
