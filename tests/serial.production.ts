import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
const slug = 'the-latency-of-tomorrow';
const root = `/novel/${slug}/`;
// New chapter publications should not leave the production smoke test pinned to launch day.
const publishedCount = readdirSync(new URL(`../src/content/chapters/${slug}/`, import.meta.url))
  .filter(name => name.endsWith('.md')).length;
const plan = JSON.parse(readFileSync(new URL('../src/data/serials.json', import.meta.url), 'utf8'))
  .find((serial: { slug: string }) => serial.slug === slug);
const scheduledChapter = plan.initialChapters + 1;
const edition = { slug, total_chapters: plan.totalChapters, initial_chapters: plan.initialChapters, timezone: plan.timezone, launch_at: null };
test('original novel opens with its published English chapters and generated cover', async ({ page, request }) => {
  await page.route('**/rest/v1/serial_*', r => r.fulfill({ json: r.request().url().includes('serial_editions') ? [edition] : [] }));
  await page.goto(root);
  await expect(page.getByRole('heading', { name: 'The Latency of Tomorrow', exact: true })).toBeVisible();
  expect(publishedCount).toBeGreaterThan(0);
  await expect(page.locator('.contents-section .chapter-list li')).toHaveCount(Math.min(30, publishedCount));
  await expect(page.getByRole('link', { name: 'Full contents' })).toBeVisible();
  expect(await page.locator('.detail-cover').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1024 && img.naturalHeight === 1536)).toBe(true);
  await page.getByRole('link', { name: 'Start reading', exact: true }).click();
  await expect(page.locator('#chapter-text')).toContainText('The rice cooker clicked off');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('#block-0')).toBeVisible();
  expect((await request.get(root + 'chapter-1/')).status()).toBe(200);
  expect((await request.get('/novel/comprehension-against-the-heavens/')).status()).toBe(200);
  const catalog = await (await request.get('/catalog.json')).json();
  expect(catalog.some((n: { demo: boolean }) => n.demo)).toBe(false);
  expect(catalog.some((n: { slug: string }) => n.slug === 'khranitel-mayaka' || n.slug === 'sad-zimy')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('the contents distinguish published chapters from 247 planned chapters', async ({ page }) => {
  await page.route('**/rest/v1/serial_*', r => r.fulfill({ json: r.request().url().includes('serial_editions') ? [edition] : [] }));
  await page.goto(root + 'releases/');
  await expect(page.locator('[data-release-number]')).toHaveCount(plan.totalChapters);
  await expect(page.locator('[data-release-number] a:visible')).toHaveCount(publishedCount);
  await expect(page.locator('[data-release-status]')).toContainText('has not started yet');
  await expect(page.locator(`[data-release-number="${scheduledChapter}"] [data-release-date]`)).toHaveText('Daily releases have not started yet.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('a locked chapter contains no body and does not mark a future chapter as read', async ({ page, request }) => {
  await page.route('**/rest/v1/serial_*', r => r.fulfill({ json: r.request().url().includes('serial_editions') ? [{ ...edition, launch_at: '2026-10-26T10:00:00Z' }] : [] }));
  // A visitor changing their clock cannot make an empty server response disclose a body.
  await page.clock.setFixedTime(new Date('2040-01-01T00:00:00Z'));
  await page.goto(root + `chapter-${scheduledChapter}/`);
  await expect(page.locator('#serial-status')).toContainText('27 Oct 2026 · 12:00 MSK');
  await expect(page.locator('#chapter-text')).toBeEmpty();
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  expect(await page.locator('main[data-reader]').count()).toBe(0);
  const source = await (await request.get(root + `chapter-${scheduledChapter}/`)).text();
  expect(source).not.toContain('application/ld+json');
  expect(source).toContain('noindex');
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1') || '{}').progress || {});
  expect(progress[slug]).toBeUndefined();
});
test('the server release loads safe prose, then reader settings and progress work', async ({ page }) => {
  let released = false;
  const body = '<img src=x onerror="window.injected=1">\n\n' + 'An ordinary paragraph of a test manuscript. '.repeat(100);
  await page.route('**/rest/v1/serial_*', r => r.fulfill({ json: r.request().url().includes('serial_editions') ? [{ ...edition, launch_at: '2026-10-26T10:00:00Z' }]
    : released ? [{ number: scheduledChapter, title: plan.chapters[scheduledChapter - 1].title, body }] : [] }));
  await page.goto(root + `chapter-${scheduledChapter}/`);
  await expect(page.locator('#serial-status')).toContainText('locked');
  released = true;
  await page.getByRole('button', { name: 'Check availability' }).click();
  await expect(page.locator('#chapter-text')).toContainText('<img src=x');
  await expect(page.locator('#chapter-text img')).toHaveCount(0);
  await expect(page.locator('#block-0')).toBeVisible();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.locator('#reader-settings')).toBeVisible();
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('hunmeng-novels:v1') || '{}').progress?.['the-latency-of-tomorrow']?.chapterNumber)).toBe(scheduledChapter);
});
test('release service errors show retry without exposing a body', async ({ page }) => {
  await page.route('**/rest/v1/serial_*', r => r.fulfill({ status: 503, body: '{}' }));
  await page.goto(root + 'chapter-247/');
  await expect(page.locator('#serial-status')).toContainText('Unable to check');
  await expect(page.getByRole('button', { name: 'Check availability' })).toBeEnabled();
  await expect(page.locator('#chapter-text')).toBeEmpty();
});
