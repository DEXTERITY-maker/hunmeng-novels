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
  await expect(page.locator('.contents-section .chapter-list li')).toHaveCount(Math.min(10, publishedCount));
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

test('reader contents picks its own art for each novel and switches by theme and viewport', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const scenarios = [
    { slug: 'comprehension-against-the-heavens', chapter: 1, art: 'comprehension', light: 'comprehension-day', dark: 'comprehension-night' },
    { slug: 'the-latency-of-tomorrow', chapter: 10, art: 'latency', light: 'latency-night', dark: 'latency-night' },
  ];
  for (const scenario of scenarios) {
    await page.goto(`/novel/${scenario.slug}/chapter-${scenario.chapter}/`);
    await expect(page.getByRole('button', { name: 'Open contents' })).toBeVisible();
    await page.getByRole('button', { name: 'Open contents' }).click();
    const dialog = page.locator('#reader-toc');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('data-art', scenario.art);
    const art = dialog.locator('.reader-toc-art');
    await expect(art).toBeVisible();
    await expect(dialog.locator('.reader-toc-list a[aria-current="page"]')).toHaveCount(1);
    await expect(dialog.locator('.reader-toc-list a[aria-current="page"]')).toBeInViewport();
    const chevrons = await dialog.locator('.reader-toc-chevron').evaluateAll(els => els.map(el => Math.round(el.getBoundingClientRect().right)));
    expect(new Set(chevrons).size, 'chevrons share one column').toBe(1);
    for (const theme of ['light', 'dark', 'sepia'] as const) {
      await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
      const expected = theme === 'dark' ? scenario.dark : scenario.light;
      const background = await art.evaluate(el => getComputedStyle(el).backgroundImage);
      expect(background, `${scenario.slug} ${theme}`).toContain(`${expected}-1536.webp`);
      await page.screenshot({ path: info.outputPath(`hunmeng-toc-${scenario.art}-${theme}-desktop.png`), animations: 'disabled' });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('html').evaluate(el => { el.dataset.theme = 'dark'; });
    const mobileImage = await art.evaluate(el => getComputedStyle(el).backgroundImage);
    expect(mobileImage).toContain(`${scenario.dark}-960.webp`);
    const rect = await dialog.boundingBox();
    expect(rect).not.toBeNull();
    expect(rect!.x).toBeGreaterThanOrEqual(-1);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(391);
    expect(rect!.y).toBeGreaterThanOrEqual(-1);
    if (scenario.art === 'latency') {
      expect(await dialog.locator('.reader-toc-list').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await dialog.locator('.reader-toc-list').evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(await dialog.locator('.reader-toc-list').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    }
    await page.screenshot({ path: info.outputPath(`hunmeng-toc-${scenario.art}-mobile.png`), animations: 'disabled' });
    await dialog.getByRole('button', { name: 'Close contents' }).click();
    await expect(dialog).toBeHidden();
    await page.setViewportSize({ width: 1280, height: 800 });
  }
});

test('illustrated novel pages use correct art in light/dark themes and capture desktop/mobile previews', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One project records all eight viewport and theme combinations.');
  const novels = [
    { slug: 'comprehension-against-the-heavens', art: 'comprehension', day: 'comprehension-day', night: 'comprehension-night' },
    { slug: 'the-latency-of-tomorrow', art: 'latency', day: 'latency-night', night: 'latency-night' },
  ];
  for (const novel of novels) {
    const data = JSON.parse(readFileSync(new URL(`../src/content/novels/${novel.slug}.json`, import.meta.url), 'utf8'));
    for (const width of [1440, 390]) {
      const device = width === 390 ? 'mobile' : 'desktop';
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto(`/novel/${novel.slug}/`);
      await expect(page.locator('.novel-detail')).toBeVisible();
      await expect(page.locator('.novel-art-band')).toHaveAttribute('data-novel-art', novel.art);
      await expect(page.locator('.site-header a[href="/catalog/"]')).toHaveAttribute('aria-current', 'page');
      await expect(page.locator('.synopsis-panel .detail-description')).toHaveText(data.description);
      await expect(page.locator('.detail-description')).toHaveCount(1);
      await expect(page.locator('.personal-rating-stars button')).toHaveCount(5);
      await expect(page.locator('.novel-detail-tags a')).toHaveCount(data.tags.length);
      for (const theme of ['light', 'dark'] as const) {
        await page.locator('html').evaluate((el, selected) => { el.dataset.theme = selected; }, theme);
        const expected = theme === 'dark' ? novel.night : novel.day;
        const bg = await page.locator('.novel-art-band').evaluate(el => getComputedStyle(el).backgroundImage);
        expect(bg, `${novel.slug} ${device} ${theme}`).toContain(`${expected}-${width === 390 ? 960 : 1536}.webp`);
        expect(bg).not.toContain('hunmeng-landscape');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath(`hunmeng-novel-${novel.art}-${theme}-${device}.png`),
          fullPage: false,
          animations: 'disabled',
        });
      }
    }
  }
});

test('catalog artwork, live filtered cards and theme previews match the source on desktop and phone', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One project captures both desktop and phone layouts.');
  const novels = [
    { slug: 'comprehension-against-the-heavens', art: 'comprehension', day: 'comprehension-day', night: 'comprehension-night' },
    { slug: 'the-latency-of-tomorrow', art: 'latency', day: 'latency-night', night: 'latency-night' },
  ];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/catalog/');
    await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(2);
    await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
    for (const novel of novels) {
      const card = page.locator(`#catalog-results .catalog-novel-card[data-novel="${novel.slug}"]`);
      await expect(card).toHaveAttribute('data-art', novel.art);
      await expect(card.locator('.catalog-card-art')).toHaveCount(1);
      await expect(card.locator('.catalog-card-tags a')).toHaveCount(3);
      await expect(card.locator('.catalog-card-meta > span')).toHaveCount(3);
    }
    for (const theme of ['light', 'dark'] as const) {
      await page.locator('html').evaluate((el, current) => { el.dataset.theme = current; }, theme);
      const size = width === 390 ? '960' : '1536';
      const banner = await page.locator('.catalog-art-hero').evaluate(el => getComputedStyle(el).backgroundImage);
      expect(banner).toContain(`hunmeng-landscape-${theme === 'dark' ? 'night' : 'day'}-${size}.webp`);
      for (const novel of novels) {
        const card = page.locator(`#catalog-results .catalog-novel-card[data-novel="${novel.slug}"]`);
        const art = card.locator('.catalog-card-art');
        const expected = theme === 'dark' ? novel.night : novel.day;
        expect(await art.evaluate(el => getComputedStyle(el).backgroundImage)).toContain(`${expected}-1536.webp`);
        await expect(art).toBeVisible({ visible: width > 760 });
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: info.outputPath(`hunmeng-catalog-${theme}-${width === 390 ? 'mobile' : 'desktop'}.png`),
        animations: 'disabled', fullPage: false,
      });
    }
    // Filtering replaces server-rendered cards; compare their structure and art for the same novel.
    const latency = page.locator('#catalog-results .catalog-novel-card[data-novel="the-latency-of-tomorrow"]');
    const snapshot = async () => latency.evaluate(card => ({
      cls: card.className,
      art: card.getAttribute('data-art'),
      children: [...card.children].map(el => el.className),
      copy: [...card.querySelector('.novel-copy')!.children].map(el => el.className || el.tagName.toLowerCase()),
      tags: card.querySelectorAll('.catalog-card-tags a').length,
      icons: card.querySelectorAll('.catalog-card-meta svg').length,
    }));
    const before = await snapshot();
    await page.locator('#catalog-filters input[name="search"]').fill('Latency');
    await expect(page.locator('#catalog-results .catalog-novel-card')).toHaveCount(1);
    await expect(page.locator('#result-count')).toHaveText('Novels found: 1');
    expect(await snapshot()).toEqual(before);
    await expect(latency.locator('.catalog-read-action')).toHaveAttribute('href', '/novel/the-latency-of-tomorrow/');
    await page.locator('#catalog-filters button[type="reset"]').click();
    await expect(page.locator('#result-count')).toHaveText('Novels found: 2');
  }
  await page.goto('/novel/the-latency-of-tomorrow/');
  await expect(page.locator('.novel-detail .genre-links')).toContainText('Science fiction');
  await expect(page.locator('.novel-detail .work-categories')).toHaveCount(0);
});
