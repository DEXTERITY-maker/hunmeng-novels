import { test, expect } from './fixtures';

for (const locale of ['en-US', 'ru-RU']) {
  test.describe(`English edition with ${locale} browser preferences`, () => {
    test.use({ locale });
    test('public pages, content, metadata, and search stay in English', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const route of ['/', '/catalog/', '/updates/', '/library/', '/news/', '/news/hunmeng-opens/',
        '/account/', '/admin/login/', '/about/', '/contacts/', '/rights/', '/rules/',
        '/novel/khranitel-mayaka/', '/novel/khranitel-mayaka/chapters/1/', '/novel/khranitel-mayaka/glava-1/',
        '/novel/sad-zimy/', '/novel/sad-zimy/glava-4/', '/404/']) {
        await page.goto(route);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('lang', 'en');
        await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute('content', 'en_US');
        expect(await page.locator('body').innerText()).not.toMatch(/[А-Яа-яЁё]/);
        const labels = await page.locator('[aria-label], [placeholder]').evaluateAll(nodes =>
          nodes.flatMap(node => [node.getAttribute('aria-label') ?? '', node.getAttribute('placeholder') ?? '']));
        expect(labels.join(' ')).not.toMatch(/[А-Яа-яЁё]/);
        expect(await page.title()).not.toMatch(/[А-Яа-яЁё]/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      await page.goto('/catalog/');
      await page.getByPlaceholder('English or original title').fill('lighthouse');
      await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
      await expect(page.locator('#catalog-results')).toContainText('3 chapters');
      await expect(page.locator('#catalog-results')).toContainText('In progress');
      await expect(page.locator('#catalog-results')).not.toContainText('Переводится');
      expect(errors).toEqual([]);
    });
    test('native validation is English and clears after correction', async ({ page }) => {
      await page.goto('/account/');
      const email = page.getByLabel('Email', { exact: true });
      await expect(email).toBeEnabled();
      await page.locator('#reader-auth-submit').click();
      expect(await email.evaluate((field: HTMLInputElement) => field.validationMessage)).toBe('Please fill out this field.');
      await email.fill('not-an-email');
      await page.locator('#reader-auth-submit').click();
      expect(await email.evaluate((field: HTMLInputElement) => field.validationMessage)).toBe('Enter a valid email address.');
      await email.fill('reader@example.test');
      expect(await email.evaluate((field: HTMLInputElement) => field.validationMessage)).toBe('');
      await page.getByRole('button', { name: 'Register', exact: true }).click();
      await expect(page.locator('#reader-auth-submit')).toHaveText('Create account');
      await expect(page.locator('#account-status')).toHaveText('Create an account with your email and password.');
      await expect(page.getByLabel('Confirm password', { exact: true })).toBeVisible();
    });
  });
}
