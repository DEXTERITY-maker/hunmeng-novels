import { test, expect } from './fixtures';

test('editorial redesign keeps the home page usable on narrow and wide screens', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 860});
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator('#home-title')).toBeVisible();
    await expect(page.locator('#home-search-input')).toBeEnabled();
    await expect(page.locator('.home-hero-feature')).toBeVisible();
    const details = await page.evaluate(() => {
      const hero = document.querySelector('.home-hero-copy') as HTMLElement;
      const h1 = document.querySelector('#home-title') as HTMLElement;
      const header = document.querySelector('.header-inner > nav a[aria-current="page"]') as HTMLElement;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        radius: parseFloat(getComputedStyle(hero).borderTopLeftRadius),
        visible: getComputedStyle(h1).visibility,
        opacity: Number(getComputedStyle(h1).opacity),
        navBg: getComputedStyle(header).backgroundColor,
      };
    });
    expect(details.overflow, 'horizontal overflow at '+width+'px').toBe(false);
    expect(details.radius).toBeGreaterThanOrEqual(12);
    expect(details.visible).toBe('visible');
    expect(details.opacity).toBe(1);
    expect(details.navBg).not.toBe('rgba(0, 0, 0, 0)');
  }
  expect(errors).toEqual([]);
});

test('editorial redesign preserves light/dark/sepia theme controls', async ({page}) => {
  await page.goto('/catalog/');
  for (const theme of ['light','dark','sepia']) {
    await page.evaluate(value => document.documentElement.dataset.theme = value, theme);
    await expect(page.locator('.catalog-search-row input[name="search"]')).toBeVisible();
    const detail = await page.locator('.catalog-filter-panel').evaluate(el => {
      const css = getComputedStyle(el);
      return { radius: parseFloat(css.borderTopLeftRadius), opacity: css.opacity };
    });
    expect(detail.radius).toBeGreaterThanOrEqual(12);
    expect(detail.opacity).toBe('1');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    expect(overflow).toBe(false);
  }
});

test('editorial catalog keeps the first card within the tested mobile fold', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/catalog/');
  await expect(page.locator('.catalog-quick-sort select[name="sort"]')).toBeVisible();
  await expect(page.locator('#catalog-options')).not.toHaveAttribute('open','');
  const y = (await page.locator('#catalog-results .novel-card').first().boundingBox())!.y;
  expect(y).toBeLessThan(700);
  await page.locator('#catalog-options > summary').click();
  await expect(page.locator('#catalog-options')).toHaveAttribute('open','');
});

test('editorial styling does not hide reading controls', async ({page}) => {
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await expect(page.locator('.chapter-text')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
});
