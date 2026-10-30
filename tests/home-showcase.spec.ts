import { test, expect } from './fixtures';

test('featured carousel uses only published catalog novels and changes by arrows, dots and keyboard', async ({ page, request }) => {
  const available = await (await request.get('/catalog.json')).json() as Array<{ url: string; title: string; chapterCount: number }>;
  await page.goto('/');
  const carousel = page.locator('[data-feature-carousel]');
  await expect(carousel).toBeVisible();
  const slides = carousel.locator('[data-feature-slide]');
  const total = await slides.count();
  expect(total).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(4);
  const links = await slides.locator('.home-feature-read').evaluateAll(elements => elements.map(e => e.getAttribute('href')));
  for (const url of links) expect(available.some(n => n.url === url)).toBe(true);
  const titles = await slides.locator('h2').allTextContents();
  for (const title of titles) expect(available.some(n => n.title === title)).toBe(true);
  await expect(slides.first()).toBeVisible();
  if (total < 2) return;
  await expect(carousel.locator('[data-feature-dot]')).toHaveCount(total);
  await expect(carousel.locator('[data-feature-controls]')).toBeVisible();
  await carousel.getByRole('button', { name: 'Next featured novel' }).click();
  await expect(slides.nth(1)).toBeVisible();
  await expect(slides.first()).toBeHidden();
  await expect(carousel.locator('[data-feature-dot="1"]')).toHaveAttribute('aria-pressed', 'true');
  await carousel.locator('[data-feature-dot="0"]').click();
  await expect(slides.first()).toBeVisible();
  await carousel.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slides.nth(1)).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(slides.first()).toBeVisible();
  await carousel.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 310, clientY: 220 });
  await carousel.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 205, clientY: 224 });
  await expect(slides.nth(1)).toBeVisible();
  await carousel.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: 205, clientY: 220 });
  await carousel.dispatchEvent('pointerup', { pointerType: 'touch', clientX: 310, clientY: 224 });
  await expect(slides.first()).toBeVisible();
});

test('a single featured story hides carousel controls and has a readable link', async ({ page }) => {
  await page.goto('/');
  const carousel = page.locator('[data-feature-carousel]');
  const slides = carousel.locator('[data-feature-slide]');
  await expect(slides.first()).toBeVisible();
  await slides.evaluateAll(elements => elements.slice(1).forEach(el => el.remove()));
  await expect(slides).toHaveCount(1);
  await expect(carousel.locator('[data-feature-controls]')).toBeHidden();
  await expect(slides.first().locator('.home-feature-read')).toHaveAttribute('href', /^\/novel\//);
});

test('three quick cards keep separate illustrations away from their copy and use small phone artwork', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const quick = page.locator('.home-discover a');
  await expect(quick).toHaveCount(3);
  const families = ['quick-genres', 'quick-latest', 'quick-new'];
  for (let i = 0; i < families.length; i++) {
    const card = quick.nth(i);
    await expect(card).toHaveAttribute('data-quick-art', families[i]);
    const art = card.locator('.home-quick-art');
    const css = await art.evaluate(el => ({ background: getComputedStyle(el).backgroundImage, mask: getComputedStyle(el).maskImage }));
    expect(css.background).toContain(families[i] + '-720.svg');
    expect(css.mask).toContain('gradient');
    const image = await art.boundingBox();
    const copy = await card.locator(':scope > span:not(.home-quick-art):not(.home-quick-arrow)').first().boundingBox();
    expect(image).not.toBeNull();
    expect(copy).not.toBeNull();
    expect(copy!.x + copy!.width).toBeLessThanOrEqual(image!.x + image!.width * .25);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (let i = 0; i < families.length; i++) {
    const art = page.locator('.home-discover a').nth(i).locator('.home-quick-art');
    const css = await art.evaluate(el => ({ background: getComputedStyle(el).backgroundImage, opacity: parseFloat(getComputedStyle(el).opacity) }));
    expect(css.background).toContain(families[i] + '-360.svg');
    expect(css.opacity).toBeLessThanOrEqual(.35);
  }
  const heroHeight = (await page.locator('.home-hero-copy').boundingBox())!.height;
  expect(heroHeight).toBeLessThan(515);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const firstRelease = await page.locator('#new-novels .home-book-card').first().boundingBox();
  expect(firstRelease!.y).toBeLessThan(1080);
});

test('homepage retains search, progress, news and real release details in three themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('#home-search-input')).toBeEnabled();
  await expect(page.locator('#continue-section')).toBeAttached();
  await expect(page.locator('#latest-chapters .home-chapter-link').first()).toBeVisible();
  await expect(page.locator('#latest-news')).toBeVisible();
  await expect(page.locator('#recommended-novels')).toBeVisible();
  await expect(page.getByRole('heading', { name: /New releases/ })).toBeVisible();
  const cards = page.locator('#new-novels .home-book-card');
  await expect(cards).toHaveCount(2);
  for (const theme of ['light', 'dark', 'sepia']) {
    await page.locator('html').evaluate((el, value) => { el.dataset.theme = value; }, theme);
    const bg = await page.locator('.home-hero-copy').evaluate(el => getComputedStyle(el).backgroundImage);
    expect(bg).toContain('hunmeng-landscape-' + (theme === 'dark' ? 'night' : 'day') + '-960.webp');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), theme).toBe(true);
    await expect(page.locator('.home-feature-read:visible')).toHaveCount(1);
  }
});
