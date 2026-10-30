import { test, expect } from './fixtures';

const chapter = '/novel/khranitel-mayaka/glava-2/';
const cases = [
  { device: 'desktop', width: 1280, height: 900 },
  { device: 'mobile', width: 390, height: 844 },
] as const;

for (const { device, width, height } of cases) {
  for (const theme of ['light', 'dark', 'sepia'] as const) {
    test(`contents redesign renders at ${device} ${width}px in ${theme} theme`, async ({ page }, info) => {
      test.skip(info.project.name !== device, 'Capture each device with its matching browser context');
      await page.setViewportSize({ width, height });
      await page.goto(chapter);

      // Use the existing reader settings, not a test-only theme override.
      await page.locator('.reader-header [data-open="settings-header"]').click();
      await page.locator('#reader-settings input[name="theme"][value="' + theme + '"]').check();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.getByRole('button', { name: 'Close settings' }).click();

      await page.getByRole('button', { name: 'Open contents' }).click();
      const dialog = page.getByRole('dialog', { name: 'Contents' });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('.reader-toc-eyebrow')).toHaveText('✦ CONTENTS');
      await expect(dialog.getByRole('heading', { name: 'Contents', exact: true })).toBeVisible();
      await expect(dialog.locator('.reader-toc-novel')).toHaveText('The Keeper of the Quiet Lighthouse');

      const links = dialog.locator('.reader-toc-chapters a');
      await expect(links).toHaveCount(3);
      const active = dialog.locator('.reader-toc-chapters a[aria-current="page"]');
      await expect(active).toHaveCount(1);
      await expect(active).toHaveAttribute('href', chapter);
      await expect(active.locator('.reader-toc-marker svg')).toHaveCount(1);
      await expect(active.locator('.reader-toc-marker')).toHaveText('');
      await expect(active.locator('.reader-toc-chapter-label')).toHaveText('Chapter 2.');
      await expect(dialog.locator('.reader-toc-chapters a:not([aria-current]) .reader-toc-marker').first()).toHaveText('1');
      await expect(dialog.locator('.reader-toc-all')).toHaveText('Full contents (3 chapters) →');
      await expect(dialog.locator('.reader-toc-ornament')).toContainText('✦');

      const measurements = await dialog.evaluate((el) => {
        const box = el.getBoundingClientRect();
        const active = el.querySelector('a[aria-current="page"]') as HTMLElement;
        const activeStyle = getComputedStyle(active);
        return {
          dialogLeft: box.left, dialogRight: box.right,
          dialogTop: box.top, dialogBottom: box.bottom,
          viewportWidth: innerWidth, viewportHeight: innerHeight,
          dialogScrollWidth: el.scrollWidth, dialogClientWidth: el.clientWidth,
          currentBackground: activeStyle.backgroundColor,
          defaultBackground: getComputedStyle(el.querySelector('.reader-toc-chapters a:not([aria-current])')!).backgroundColor,
          borderWidth: parseFloat(activeStyle.borderTopWidth),
          listOverflow: getComputedStyle(el.querySelector('.reader-toc-chapters')!).overflowY,
        };
      });
      expect(measurements.dialogLeft).toBeGreaterThanOrEqual(-1);
      expect(measurements.dialogRight).toBeLessThanOrEqual(width + 1);
      expect(measurements.dialogTop).toBeGreaterThanOrEqual(-1);
      expect(measurements.dialogBottom).toBeLessThanOrEqual(height + 1);
      expect(measurements.dialogScrollWidth).toBeLessThanOrEqual(measurements.dialogClientWidth + 2);
      expect(measurements.listOverflow).toBe('auto');
      expect(measurements.currentBackground).not.toBe(measurements.defaultBackground);
      expect(measurements.borderWidth).toBeGreaterThan(0);
      // All six theme/device screenshots are real browser renders, not mockups.
      await dialog.screenshot({
        path: info.outputPath(`hunmeng-toc-${device}-${theme}.png`),
        animations: 'disabled',
      });
    });
  }
}

test('contents dialog preserves Escape, outside click, Tab and Enter navigation', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile', 'One real mobile interaction regression is sufficient');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(chapter);
  const dialog = page.getByRole('dialog', { name: 'Contents' });
  await page.locator('.reader-toolbar [data-open="toc"]').click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();

  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(dialog).not.toBeVisible();

  await page.getByRole('button', { name: 'Open contents' }).click();
  await expect(dialog.getByRole('button', { name: 'Close contents' })).toBeFocused();
  await page.keyboard.press('Tab');
  const firstChapter = dialog.locator('.reader-toc-chapters a').first();
  await expect(firstChapter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/novel\/khranitel-mayaka\/glava-1\/$/);

  await page.getByRole('button', { name: 'Open contents' }).click();
  await dialog.getByRole('button', { name: 'Close contents' }).click();
  await expect(dialog).not.toBeVisible();
});

test('mobile contents list scrolls inside dialog and long chapter titles wrap', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(chapter);
  await page.getByRole('button', { name: 'Open contents' }).click();
  const dialog = page.getByRole('dialog', { name: 'Contents' });
  // The fixture novel has three chapters. Duplicate DOM rows only inside this
  // browser test to stress scrolling, without inventing production chapter data.
  await dialog.locator('.reader-toc-chapters').evaluate((list) => {
    const original = [...list.children];
    for (let i = 0; i < 7; i++) {
      for (const item of original) {
        const copy = item.cloneNode(true) as HTMLElement;
        copy.querySelector('a')?.removeAttribute('aria-current');
        list.appendChild(copy);
      }
    }
    const longName = list.querySelector('.reader-toc-chapter-title')!;
    longName.textContent = 'AnExtremelyLongWordWithoutSpacesRepeatedAgainAndAgainAndAgainAndAgainUntilItWouldOverflow';
  });
  const sizes = await dialog.evaluate((el) => {
    const list = el.querySelector('.reader-toc-chapters') as HTMLElement;
    const box = el.getBoundingClientRect();
    return {
      dialogLeft: box.left, dialogRight: box.right,
      dialogBottom: box.bottom,
      listScrollHeight: list.scrollHeight,
      listClientHeight: list.clientHeight,
      listScrollWidth: list.scrollWidth,
      listClientWidth: list.clientWidth,
      footerInside: el.querySelector('.reader-toc-footer')!.getBoundingClientRect().bottom <= box.bottom + 1,
    };
  });
  expect(sizes.dialogLeft).toBeGreaterThanOrEqual(-1);
  expect(sizes.dialogRight).toBeLessThanOrEqual(391);
  expect(sizes.dialogBottom).toBeLessThanOrEqual(845);
  expect(sizes.listScrollHeight).toBeGreaterThan(sizes.listClientHeight);
  expect(sizes.listScrollWidth).toBeLessThanOrEqual(sizes.listClientWidth + 2);
  expect(sizes.footerInside).toBe(true);
  await dialog.locator('.reader-toc-chapters').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(dialog.locator('.reader-toc-all')).toBeVisible();
  await dialog.screenshot({path: info.outputPath('hunmeng-toc-mobile-scroll-stress.png'),animations:'disabled'});
});
