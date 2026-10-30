import { test, expect } from './fixtures';

/** Catalog filter header stacks without squeezing; reader controls respect keyboard focus. */
for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
  test(`catalog filter header stacks title, note and reset at ${viewport.width}px`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto('/catalog/');
    const header = page.locator('.catalog-filter-header');
    const title = header.locator('h2');
    const note = header.locator(':scope > p');
    const reset = header.getByRole('button', { name: 'Reset filters' });
    await expect(title).toBeVisible();
    const [t, n, r] = await Promise.all([title.boundingBox(), note.boundingBox(), reset.boundingBox()]);
    expect(t && n && r).toBeTruthy();
    expect(n!.y).toBeGreaterThanOrEqual(t!.y + t!.height - 1);
    expect(r!.y).toBeGreaterThanOrEqual(n!.y + n!.height - 1);
    // The title keeps a single line instead of one word per line.
    const lineHeight = await title.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize) * 1.6);
    expect(t!.height).toBeLessThan(lineHeight);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (viewport.width > 760) {
      const sort = await page.locator('.catalog-quick-sort select').evaluate((el) => (el as HTMLSelectElement).getBoundingClientRect().width);
      const search = await page.locator('#catalog-filters input[name=search]').evaluate((el) => el.getBoundingClientRect().width);
      expect(sort).toBeGreaterThanOrEqual(search - 2);
    }
    await page.screenshot({ path: info.outputPath(`hunmeng-catalog-filters-${viewport.width}.png`), animations: 'disabled', fullPage: false });
  });
}

test('reader controls stay visible while keyboard focus is inside them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/novel/khranitel-mayaka/glava-1/');
  const toolbar = page.locator('.reader-toolbar');
  await expect(toolbar).toBeVisible();
  const focusInToolbar = () => page.evaluate(() => !!document.activeElement?.closest('.reader-toolbar'));
  for (let i = 0; i < 6 && !(await focusInToolbar()); i++) await page.keyboard.press('Shift+Tab');
  expect(await focusInToolbar()).toBe(true);
  await page.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
  await page.waitForTimeout(300);
  await expect(page.locator('body')).not.toHaveClass(/controls-hidden/);
  await expect(toolbar).toBeVisible();
  // Once focus leaves the controls, downward scrolling hides them again.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
  await expect.poll(() => page.locator('body').evaluate((el) => el.classList.contains('controls-hidden'))).toBe(true);
  await expect(page.getByRole('button', { name: 'Show reading controls' })).toBeVisible();
});
