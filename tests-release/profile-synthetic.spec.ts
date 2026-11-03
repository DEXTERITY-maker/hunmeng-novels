import { test, expect } from '../tests/fixtures';

// Only fabricated session and API responses. Never read real user information.
const fakeUser = {
  id: '00000000-0000-4000-8000-000000000023',
  email: 'reader@example.test',
  aud: 'authenticated', role: 'authenticated',
  app_metadata: {}, user_metadata: {}, identities: [],
  created_at: '2026-10-20T00:00:00Z',
};
const session = () => ({
  access_token: [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({
      sub: fakeUser.id, role: fakeUser.role,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })).toString('base64url'),
    'synthetic-signature',
  ].join('.'),
  refresh_token: 'synthetic-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: fakeUser,
});

test('V2 signed-in profile uses responsive editorial layout without real account data', async ({ page }, testInfo) => {
  await page.addInitScript(value =>
    localStorage.setItem('hunmeng-novels:reader-auth:v1', JSON.stringify(value)), session());
  await page.route('https://*.supabase.co/**', route => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('/auth/v1/user')
      ? fakeUser
      : url.pathname === '/rest/v1/rpc/reader_my_progress'
        ? { total_xp: 0, chapters: 0, completedNovels: 0, readingDays: 0, selected_title: 'novice' }
        : [];
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-expose-headers': 'x-supabase-api-version',
        'x-supabase-api-version': '2024-01-01',
      },
      body: JSON.stringify(body),
    });
  });
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/account/');
    await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
    await expect(page.locator('#auth-logged-in')).toBeVisible();
    await expect(page.locator('#auth-fields')).toBeHidden();
    await expect(page.locator('.profile-member-hero')).toBeVisible();
    await expect(page.locator('.profile-sidebar')).toBeVisible();
    await expect(page.locator('#profile-details')).toBeVisible();
    await expect(page.locator('#account-email')).toHaveText(fakeUser.email);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,follow');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      'profile overflow @ ' + width).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('hunmeng-v2-public-profile-synthetic-' + width + '.png'),
      fullPage: true,
      animations: 'disabled',
    });
  }
  // Regression: the signed-in profile retains readable ink on ivory cards even
  // when the reader preference or the operating system requests dark mode.
  await page.emulateMedia({colorScheme:'dark'});
  await page.locator('.profile-sidebar [data-profile-section="profile-account"]').click();
  await expect(page.locator('#account-email')).toBeVisible();
  for(const theme of ['light','dark','system']){
    await page.evaluate(value=>{document.documentElement.dataset.theme=value;},theme);
    const colors=await page.evaluate(()=>({
      email:getComputedStyle(document.querySelector('#account-email')!).color,
      emailPaper:getComputedStyle(document.querySelector('#profile-account')!).backgroundColor,
      quicklink:getComputedStyle(document.querySelector('.profile-quicklinks .profile-library-link')!).color,
      sidebarPaper:getComputedStyle(document.querySelector('.profile-sidebar')!).backgroundColor,
    }));
    expect(colors.email,'email ink in '+theme).toBe('rgb(36, 57, 47)');
    expect(colors.quicklink,'sidebar links in '+theme).toBe('rgb(36, 57, 47)');
    expect(colors.emailPaper,'account paper in '+theme).toBe('rgb(255, 253, 246)');
    expect(colors.sidebarPaper,'sidebar paper in '+theme).toBe('rgb(255, 253, 246)');
  }
});
