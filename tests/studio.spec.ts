import { test, expect } from './fixtures';
const user = { id: '00000000-0000-4000-8000-000000000077', email: 'author@example.test' };
const session = () => ({
  access_token: 'test-access', refresh_token: 'test-refresh', user,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});

test('writing studio keeps private controls hidden from guests', async ({ page }) => {
  await page.goto('/studio/');
  await expect(page.getByText('Sign in to access your private writing studio.')).toBeVisible();
  await expect(page.locator('#studio-workspace')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
});

test('author can create a private novel, autosave its chapter and save a revision', async ({ page }) => {
  await page.addInitScript(value => localStorage.setItem('hunmeng-novels:session:v1', JSON.stringify(value)), session());
  const novels: Record<string, unknown>[] = [];
  const chapters: Record<string, unknown>[] = [];
  const revisions: Record<string, unknown>[] = [];
  let mutations = 0;
  await page.route('https://*.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    const method = request.method();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'content-type': 'application/json',
    };
    const send = (value: unknown) => route.fulfill({ status: 200, headers, body: JSON.stringify(value) });
    if (method === 'OPTIONS') return send({});
    if (url.pathname.endsWith('/auth/v1/user')) return send(user);
    const target = table === 'author_novels' ? novels : table === 'author_chapters' ? chapters : revisions;
    if (method === 'GET') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const novelId = url.searchParams.get('novel_id')?.replace('eq.', '');
      const chapterId = url.searchParams.get('chapter_id')?.replace('eq.', '');
      return send(target.filter(row => (!id || row.id === id) &&
        (!novelId || row.novel_id === novelId) && (!chapterId || row.chapter_id === chapterId)));
    }
    if (method === 'POST') {
      mutations++;
      const body = request.postDataJSON() as Record<string, unknown>;
      const row = { id: String(mutations), ...body, updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(), synopsis: '', outline: '', characters: '',
        genres: [], tags: [], ...body };
      target.push(row);
      return send([row]);
    }
    if (method === 'PATCH') {
      mutations++;
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const row = target.find(row => row.id === id);
      if (!row) return send([]);
      Object.assign(row, request.postDataJSON());
      return send([row]);
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  await page.goto('/studio/');
  await expect(page.getByText('Private workspace ready.')).toBeVisible();
  await page.getByPlaceholder('Working title').fill('My original story');
  await page.getByRole('button', { name: 'Create private novel' }).click();
  await expect(page.locator('#studio-novels')).toHaveValue('1');
  await page.getByRole('button', { name: '+ New chapter' }).click();
  await expect(page.locator('#studio-chapters')).toHaveValue('2');
  await page.locator('#studio-chapter-form [name="title"]').fill('Opening scene');
  await page.locator('#studio-chapter-form [name="body"]').fill('The first paragraph of my private manuscript.');
  await page.getByRole('button', { name: 'Save now' }).click();
  await expect(page.locator('#studio-save-state')).toContainText('Saved privately');
  expect(chapters[0].body).toBe('The first paragraph of my private manuscript.');
  await page.getByRole('button', { name: 'Save version' }).click();
  await expect(page.locator('#studio-versions option')).toHaveCount(1);
  expect(revisions[0].body).toBe(chapters[0].body);
});
