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


test('catalog has per-novel theme art, a mobile-first layout, and four screenshot previews', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'One browser captures both responsive sizes and themes.');
  const novels = [
    { slug: 'comprehension-against-the-heavens', art: 'comprehension', day: 'comprehension-day', dark: 'comprehension-night' },
    { slug: 'the-latency-of-tomorrow', art: 'latency', day: 'latency-night', dark: 'latency-night' },
  ];
  for (const width of [1440, 390]) {
    const layout = width === 390 ? 'mobile' : 'desktop';
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/catalog/');
    const cards = page.locator('#catalog-results .catalog-novel-card');
    await expect(cards).toHaveCount(2);
    for (const theme of ['light', 'dark'] as const) {
      await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
      const hero = page.locator('[data-catalog-hero]');
      await expect(hero).toBeVisible();
      const heroBg = await hero.evaluate(el => getComputedStyle(el).backgroundImage);
      expect(heroBg).toContain('hunmeng-landscape-' + (theme === 'dark' ? 'night' : 'day') + '-' + (width === 390 ? '960' : '1536') + '.webp');
      for (const novel of novels) {
        const row = page.locator('#catalog-results .catalog-novel-card[data-novel="' + novel.slug + '"]');
        await expect(row).toHaveAttribute('data-art', novel.art);
        await expect(row.locator('.catalog-card-art')).toHaveCount(1);
        const bg = await row.locator('.catalog-card-art').evaluate(el => getComputedStyle(el).backgroundImage);
        expect(bg).toContain((theme === 'dark' ? novel.dark : novel.day) + '-1536.webp');
        const display = await row.locator('.catalog-card-art').evaluate(el => getComputedStyle(el).display);
        expect(display).toBe(width === 390 ? 'none' : 'block');
        await expect(row.locator('.catalog-card-meta > span')).toHaveCount(3);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      if (width === 390) expect((await cards.first().boundingBox())!.y).toBeLessThan(700);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: info.outputPath('hunmeng-catalog-' + layout + '-' + theme + '.png'),
        animations: 'disabled', fullPage: false,
      });
    }
  }
  await page.goto('/novel/the-latency-of-tomorrow/');
  await expect(page.locator('.detail-copy .work-categories a').filter({ hasText: 'Science fiction' })).toHaveCount(0);
  await expect(page.locator('.genre-links a').filter({ hasText: 'Science fiction' })).toHaveCount(1);
});

test('catalog server HTML and filtered results are the same illustrated card', async ({ page, request }) => {
  const html = await (await request.get('/catalog/')).text();
  const serverHtml = await page.evaluate(source => {
    const documentFromServer = new DOMParser().parseFromString(source, 'text/html');
    return documentFromServer.querySelector('.catalog-novel-card[data-novel="the-latency-of-tomorrow"]')?.outerHTML;
  }, html);
  expect(serverHtml).toBeTruthy();
  await page.goto('/catalog/');
  await page.locator('#catalog-filters input[name="search"]').fill('The Latency of Tomorrow');
  const rows = page.locator('#catalog-results .catalog-novel-card');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute('data-novel', 'the-latency-of-tomorrow');
  const clientHtml = await rows.first().evaluate(element => element.outerHTML);
  expect(clientHtml).toBe(serverHtml);
});

test('catalog card text stays clear of the visible artwork on desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/catalog/');
  const cards = await page.locator('.catalog-novel-card[data-art]').all();
  expect(cards.length).toBe(2);
  for (const card of cards) {
    const art = (await card.locator('.catalog-card-art').boundingBox())!;
    // Visible art starts where the mask reaches 45 % opacity.
    const visibleFrom = art.x + art.width * 0.45;
    for (const box of await card.locator('.card-description, .catalog-card-tags, h2').all()) {
      const b = (await box.boundingBox())!;
      expect(b.x + b.width).toBeLessThanOrEqual(visibleFrom);
    }
  }
});


test('homepage recommendation carousel supports arrows, dots, keyboard and genuine novel links', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('[data-feature-carousel]');
  await expect(root).toBeVisible();
  const slides = root.locator('[data-feature-slide]');
  const count = await slides.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const link = await slides.nth(i).locator('.home-feature-details h2 a').getAttribute('href');
    expect(link).toMatch(/^\/novel\/[a-z0-9-]+\/$/);
    const response = await page.request.get(link!);
    expect(response.ok()).toBe(true);
  }
  if (count > 1) {
    await expect(slides.nth(0)).toBeVisible();
    await root.locator('[data-feature-next]').click();
    await expect(slides.nth(1)).toBeVisible();
    await expect(slides.nth(0)).toBeHidden();
    await root.locator('[data-feature-dot="0"]').click();
    await expect(slides.nth(0)).toBeVisible();
    await root.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(slides.nth(count - 1)).toBeVisible();
    await expect(root.locator('[data-feature-dot][aria-current="true"]')).toHaveCount(1);
  } else {
    await expect(root.locator('[data-feature-prev], [data-feature-next], [data-feature-dot]')).toHaveCount(0);
  }
});

test('homepage quick cards have separate art, safe text zones and mobile layout', async ({ page }, info) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/');
    const cards = page.locator('.home-quick-card');
    await expect(cards).toHaveCount(3);
    for (const [index, art] of ['quick-genres', 'quick-latest', 'quick-new'].entries()) {
      const card = cards.nth(index);
      await expect(card).toHaveAttribute('data-quick-art', art);
      const image = await card.locator('.home-quick-image').evaluate(el => getComputedStyle(el).backgroundImage);
      expect(image).toContain(art + '-' + (width === 390 ? '360' : '720') + '.webp');
      const text = await card.locator('.home-quick-text').boundingBox();
      const artBox = await card.locator('.home-quick-image').boundingBox();
      expect(text!.x + text!.width).toBeLessThanOrEqual(artBox!.x + 8);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const theme of ['light', 'dark'] as const) {
      await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
      const bg = await page.locator('.home-hero-copy').evaluate(el => getComputedStyle(el).backgroundImage);
      expect(bg).toContain('hunmeng-landscape-' + (theme === 'light' ? 'day' : 'night') + '-' + (width === 390 ? '960' : '1536') + '.webp');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: info.outputPath('hunmeng-home-' + (width === 390 ? 'mobile' : 'desktop') + '-' + theme + '.png'), animations: 'disabled', fullPage: false });
    }
  }
});

test('featured carousel lays out cover beside details and keeps keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const slide = page.locator('.home-feature-slide:not([hidden])');
  const cover = (await slide.locator('.home-feature-cover').boundingBox())!;
  const title = slide.locator('h2');
  const t = (await title.boundingBox())!;
  // Details sit to the right of the cover, and the title is not broken letter by letter.
  expect(t.x).toBeGreaterThan(cover.x + cover.width - 1);
  expect(t.width).toBeGreaterThan(120);
  const kicker = (await page.locator('.home-feature-kicker').boundingBox())!;
  expect(kicker.y).toBeLessThan(cover.y);
  await expect(page.locator('.home-feature-controls')).toBeVisible();
  await slide.locator('.home-feature-read').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.home-feature-slide:not([hidden]) .home-feature-read')).toBeFocused();
  await expect(page.locator('[data-feature-cover] .home-feature-cover-fallback')).toHaveCount(await page.locator('.home-feature-slide').count());
});


test('reader headings render correct art and retain real chapter layout on both screen sizes', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'Capture both mobile and desktop in one deterministic production run.');
  const novels = [
    { slug: 'comprehension-against-the-heavens', chapter: 'chapter-1', art: 'comprehension', light: 'comprehension-day', dark: 'comprehension-night' },
    { slug: 'the-latency-of-tomorrow', chapter: 'chapter-10', art: 'latency', light: 'latency-night', dark: 'latency-night' },
  ];
  for (const width of [1440, 390]) {
    const device = width === 390 ? 'mobile' : 'desktop';
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const novel of novels) {
      await page.goto('/novel/' + novel.slug + '/' + novel.chapter + '/');
      const heading = page.locator('.reader-heading');
      await expect(heading).toHaveAttribute('data-art', novel.art);
      await expect(page.locator('.reader-heading-art')).toHaveCount(1);
      await expect(page.locator('#chapter-text')).toBeVisible();
      await expect(page.locator('.reader-heading-copy h1')).not.toBeEmpty();
      await expect(page.locator('.reader-toolbar')).toBeVisible();
      const image = page.locator('.reader-heading-art');
      const copy = page.locator('.reader-heading-copy');
      const textColumn = page.locator('#chapter-text');
      const headerBox = (await heading.boundingBox())!;
      const pictureBox = (await image.boundingBox())!;
      const copyBox = (await copy.boundingBox())!;
      if (width === 1440) {
        const paragraphBox = (await textColumn.boundingBox())!;
        expect(headerBox.width).toBeGreaterThan(paragraphBox.width * 1.5);
        // The art is masked at its left edge. Text ends before visible image.
        expect(copyBox.x + copyBox.width).toBeLessThan(pictureBox.x + pictureBox.width * .55);
      } else {
        expect(headerBox.height, novel.slug + ' heading must stay below one third of screen').toBeLessThan(844 / 3);
        expect(pictureBox.y + pictureBox.height).toBeLessThanOrEqual(copyBox.y + 4);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const back = (await page.locator('.reader-back').boundingBox())!;
        const mark = (await page.locator('.reader-logo-placeholder').boundingBox())!;
        const actions = await page.locator('.reader-header-actions :is(button, summary)').all();
        expect(actions.length).toBe(4);
        expect(Math.abs(back.y - mark.y)).toBeLessThan(14);
        for (const action of actions) {
          const rect = (await action.boundingBox())!;
          expect(Math.abs(rect.y - back.y)).toBeLessThan(12);
        }
      }
      for (const theme of ['light', 'dark'] as const) {
        await page.locator('html').evaluate((node, value) => { node.dataset.theme = value; }, theme);
        const img = await image.evaluate((node) => getComputedStyle(node).backgroundImage);
        const expected = novel[theme] + (width === 390 ? '-960.webp' : '-1536.webp');
        expect(img, novel.art + ' ' + theme + ' ' + device).toContain(expected);
        const render = await copy.evaluate(el => {
          const box = el.getBoundingClientRect();
          const first = el.querySelector('h1')!.getBoundingClientRect();
          return { boxRight: box.right, titleRight: first.right };
        });
        expect(render.titleRight).toBeLessThanOrEqual(render.boxRight + 1);
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: info.outputPath('hunmeng-reader-' + novel.art + '-' + device + '-' + theme + '.png'),
          animations: 'disabled', fullPage: false,
        });
      }
    }
  }
});


test('novel panoramas collapse to short readable headings on a landscape phone', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  for (const slug of ['comprehension-against-the-heavens/chapter-1', 'the-latency-of-tomorrow/chapter-10']) {
    await page.goto('/novel/' + slug + '/');
    const heading = (await page.locator('.reader-heading').boundingBox())!;
    expect(heading.height, slug).toBeLessThan(390 / 3);
    await expect(page.locator('.reader-heading-copy h1')).toBeVisible();
    await expect(page.locator('.reader-back')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
