import { test, expect } from './fixtures';

/** Synthetic reader session is a UI display hint only; these tests never use real accounts. */
const widths = [320, 360, 390, 430, 768, 1440];
const session = {
  expires_at: 4102444800,
  user: {
    id: '00000000-0000-4000-8000-000000000012',
    email: 'reader@example.test',
    user_metadata: { nickname: 'Hunmeng Reader', avatar_color: 'sage' },
  },
};
async function showMemberMenu(page: import('@playwright/test').Page) {
  await page.addInitScript((value: typeof session) => {
    localStorage.setItem('hunmeng-novels:reader-auth:v1', JSON.stringify(value));
  }, session);
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Reader account', exact: true });
  await button.click();
  const panel = page.locator('.header-account .account-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-account-member]')).toBeVisible();
  await expect(panel.locator('[data-account-guest]')).toBeHidden();
  await expect(panel.locator('[data-header-name]')).toHaveText('Hunmeng Reader');
  return panel;
}
for (const width of widths) {
  test(`compact account menu fits ${width}px and preserves navigation`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 750 });
    const panel = await showMemberMenu(page);
    const expected = ['My profile', 'Reading settings', 'My library', 'Writing studio', 'Sign out'];
    const links = panel.locator('[data-account-member] > a, [data-account-member] > button');
    await expect(links).toHaveCount(expected.length);
    for (const [i, name] of expected.entries()) {
      await expect(links.nth(i)).toContainText(name);
      const rect = await links.nth(i).boundingBox();
      expect(rect?.height).toBeGreaterThanOrEqual(44);
    }
    const rect = await panel.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(8);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width - 8);
    expect(rect!.height).toBeLessThan(470);
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(750 - 8);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => document.fonts.ready);
    await panel.screenshot({
      path: info.outputPath(`hunmeng-account-compact-${width}-${info.project.name}.png`),
      animations: 'disabled',
    });
    await page.keyboard.press('Escape');
    await expect(page.locator('.header-account')).not.toHaveAttribute('open');
    await expect(page.getByRole('button', { name: 'Reader account', exact: true })).toBeFocused();
  });
}
test('quick Light and Dark buttons use the existing reader theme and persist', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 750 });
  const panel = await showMemberMenu(page);
  const dark = panel.getByRole('radio', { name: 'Dark', exact: true });
  const light = panel.getByRole('radio', { name: 'Light', exact: true });
  await dark.check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(dark).toBeChecked();
  const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).settings.theme);
  expect(mode).toBe('dark');
  await panel.screenshot({ path: info.outputPath('hunmeng-account-compact-dark.png'), animations: 'disabled' });
  await light.check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(light).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Reader account', exact: true }).click();
  await expect(page.locator('.account-panel').getByRole('radio', { name: 'Light', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Site appearance', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Light', exact: true }).first()).toBeChecked();
  await page.getByRole('radio', { name: 'Sepia', exact: true }).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sepia');
  await page.getByRole('button', { name: 'Reader account', exact: true }).click();
  await expect(page.locator('.account-menu-preferences-title')).toHaveText('Appearance · Sepia');
  await expect(page.locator('.account-panel .account-menu-theme input:checked')).toHaveCount(0);
  await page.locator('.site-header').click({ position: { x: 3, y: 3 } });
  await expect(page.locator('.header-account')).not.toHaveAttribute('open');
});
test('guest account menu remains accessible and shows sign-in destinations', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Reader account', exact: true }).click();
  const panel = page.locator('.account-panel');
  await expect(panel.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Create account', exact: true })).toBeVisible();
  await expect(panel.locator('[data-account-member]')).toBeHidden();
  await expect(panel.getByRole('radio', { name: 'Dark', exact: true })).toBeVisible();
  const rect = await panel.boundingBox();
  expect(rect!.x).toBeGreaterThanOrEqual(8);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(312);
});
