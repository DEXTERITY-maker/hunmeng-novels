import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Synthetic staff session only. No live editorial account or write is used.
const id = '00000000-0000-4000-8000-000000000130';
const sessionKey = 'hunmeng-novels:admin-session:v1';
const session = () => ({
  access_token: 'fixture-v2-editorial-token',
  refresh_token: 'fixture-v2-editorial-refresh',
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id, email: 'editor-v2@example.test' },
});
async function mockAdmin(page: Page, role: string | null) {
  const requests: Array<{path: string; method: string}> = [];
  const state = { role, requests };
  await page.route('https://*.supabase.co/**', async route => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push({ path: url.pathname, method: req.method() });
    const answer = (data: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json',
      headers: {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*'},
      body: JSON.stringify(data),
    });
    if (req.method() === 'OPTIONS') return answer({});
    if (url.pathname.endsWith('/auth/v1/user')) return answer({ id });
    if (url.pathname.endsWith('/novel_staff')) return answer(state.role ? [{role:state.role}] : []);
    if (url.pathname.endsWith('/auth/v1/logout')) return answer({});
    return answer([]);
  });
  return state;
}
async function enter(page: Page) {
  await page.addInitScript(({key, seeded}) => {
    if (location.pathname.startsWith('/v2/admin/')) sessionStorage.setItem(key, JSON.stringify(seeded));
  }, {key:sessionKey, seeded:session()});
  await page.goto('/v2/admin/');
}

test('V2 editorial page hides all work tools without a verified staff session', async ({page}) => {
  const mock = await mockAdmin(page, null);
  await page.goto('/v2/admin/?redirect=https://example.test/#access_token=fixture');
  await expect(page).toHaveURL('/v2/admin/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','noindex,follow');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content','no-referrer');
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('.v2-admin-nav')).toBeHidden();
  await expect(page.locator('.v2-admin-live')).toBeHidden();
  await expect(page.locator('#admin-login-link')).toBeVisible();
  await expect(page.getByRole('link',{name:'Editorial sign-in',exact:true})).toHaveAttribute('href','/admin/login/');
  expect(mock.requests.some(r=>/novel_(sources|terms|translation_jobs)/.test(r.path))).toBe(false);
});

test('V2 administrator sees the same authorized forms and navigates without writes', async ({page}) => {
  const mock = await mockAdmin(page, 'admin');
  await enter(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#admin-status')).toContainText('Administrator');
  expect(await page.evaluate(key => sessionStorage.getItem(key) !== null, sessionKey)).toBe(true);
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  await expect(page.locator('[data-v2-admin-stat="sources"]')).toHaveText('0');
  await expect(page.locator('[data-v2-admin-stat="draft"]')).toHaveText('0');
  await expect(page.locator('[data-v2-admin-stat="review"]')).toHaveText('0');
  await expect(page.locator('#source-form')).toBeVisible();
  await expect(page.locator('#rights-form')).toBeVisible();
  await expect(page.locator('#job-form')).toBeVisible();
  await expect(page.locator('#chapter-batch-form')).toBeVisible();
  await expect(page.locator('#admin-reader-reviews')).toBeVisible();
  await expect(page.locator('.v2-admin-nav a[href^="#"]')).toHaveCount(5);
  await page.locator('.v2-admin-nav a[href="#v2-admin-queue"]').click();
  await expect(page).toHaveURL(/#v2-admin-queue$/);
  await expect(page.locator('#admin-refresh')).toBeVisible();
  expect(mock.requests.some(r=>['POST','PATCH','DELETE'].includes(r.method))).toBe(false);
  await page.getByRole('button',{name:'Sign out of editorial tools'}).click();
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('.v2-admin-nav')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('signed out');
});

test('V2 queue metrics show only fetched staff records and refresh without writes', async ({page}) => {
  const mock = await mockAdmin(page, 'admin');
  let sourceCount = 2;
  await page.route('https://*.supabase.co/rest/v1/novel_sources?**', async route => {
    const sources = [
      {id:'src-1',slug:'licensed-novel',original_title:'Licensed novel',rights_status:'verified',
        permission_translate:true,permission_publish:true,verified_at:'2026-11-01',
        rights_evidence:'Rights holder has expressly authorized translation and publication.',rights_valid_until:null},
      {id:'src-2',slug:'pending-novel',original_title:'Pending novel',rights_status:'pending',
        permission_translate:false,permission_publish:false,verified_at:null,rights_evidence:null},
    ];
    await route.fulfill({json:sources.slice(0,sourceCount)});
  });
  await page.route('https://*.supabase.co/rest/v1/novel_terms?**', route => route.fulfill({json:[]}));
  await page.route('https://*.supabase.co/rest/v1/novel_translation_jobs?**', route => route.fulfill({json:[
    {id:'draft-1',source_id:'src-1',chapter_number:1,chapter_title:'First',chapter_slug:'chapter-1',status:'draft',updated_at:'2026-11-01',qa_notes:'',original_text:'',translated_text:'',chapter_description:''},
    {id:'review-1',source_id:'src-1',chapter_number:2,chapter_title:'Second',chapter_slug:'chapter-2',status:'review',updated_at:'2026-11-01',qa_notes:'',original_text:'',translated_text:'',chapter_description:''},
    {id:'approved-1',source_id:'src-1',chapter_number:3,chapter_title:'Third',chapter_slug:'chapter-3',status:'approved',updated_at:'2026-11-01',qa_notes:'',original_text:'',translated_text:'',chapter_description:''},
  ]}));
  await enter(page);
  await expect(page.locator('[data-v2-admin-stat="sources"]')).toHaveText('2');
  await expect(page.locator('[data-v2-admin-stat="verified"]')).toHaveText('1');
  await expect(page.locator('[data-v2-admin-stat="draft"]')).toHaveText('1');
  await expect(page.locator('[data-v2-admin-stat="review"]')).toHaveText('1');
  await expect(page.locator('[data-v2-admin-stat="approved"]')).toHaveText('1');
  await expect(page.locator('#v2-admin-queue-visible')).toHaveText('3 of 3 recent jobs shown.');
  await page.locator('#v2-admin-queue-filter').selectOption('review');
  await expect(page.locator('#v2-admin-queue-visible')).toHaveText('1 of 3 recent jobs shown.');
  await expect(page.locator('.admin-job-row:visible')).toHaveCount(1);
  await page.locator('#v2-admin-queue-filter').selectOption('');
  await expect(page.locator('.admin-job-row:visible')).toHaveCount(3);
  sourceCount = 1;
  await page.getByRole('button', {name:'Refresh queue'}).click();
  await expect(page.locator('[data-v2-admin-stat="sources"]')).toHaveText('1');
  expect(mock.requests.some(r => ['POST','PATCH','DELETE'].includes(r.method))).toBe(false);
});

test('V2 editor retains draft tools without gaining administrative permissions', async ({page}) => {
  await mockAdmin(page, 'editor');
  await enter(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  await expect(page.locator('#admin-status')).toContainText('Editor');
  await expect(page.locator('#source-form')).toBeHidden();
  await expect(page.locator('#rights-form')).toBeHidden();
  await expect(page.locator('#job-form')).toBeVisible();
  await expect(page.locator('#chapter-batch-form')).toBeVisible();
  await expect(page.locator('#admin-reader-reviews')).toBeHidden();
  await expect(page.locator('a[href="/studio/"]')).toBeVisible();
});

test('V2 workspace closes immediately when the staff role is revoked', async ({page}) => {
  const state = await mockAdmin(page, 'admin');
  await enter(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  state.role = null;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#admin-workspace')).toBeHidden();
  await expect(page.locator('#admin-status')).toContainText('changed');
  await expect(page.locator('#admin-source-list')).toBeEmpty();
  await expect(page.locator('[data-v2-admin-stat="sources"]')).toHaveText('—');
});

test('V2 editorial page has no horizontal overflow on mobile and desktop', async ({page}) => {
  await mockAdmin(page, 'admin');
  await enter(page);
  await expect(page.locator('#admin-workspace')).toBeVisible();
  for (const width of [320,390,768,1280]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'width='+width).toBe(true);
    for (const selector of ['.v2-admin-hero','.v2-admin-nav','.v2-admin-layout','.admin-card']) {
      const rect = await page.locator(selector).first().boundingBox();
      expect(rect).not.toBeNull();
      expect(rect!.x, selector+' left width='+width).toBeGreaterThanOrEqual(-1);
      expect(rect!.x+rect!.width,selector+' right width='+width).toBeLessThanOrEqual(width+1);
    }
  }
});
