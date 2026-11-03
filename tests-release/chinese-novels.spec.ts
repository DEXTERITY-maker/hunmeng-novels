import { test, expect } from '../tests/fixtures';

test('Chinese novel references remain readable and illustrated on public V2 pages', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const slugs = [
    'lord-of-mysteries',
    'cultivation-chat-group',
    'release-that-witch',
    'library-of-heavens-path',
    'the-kings-avatar',
    'guardians-of-the-dafeng',
  ];
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({width,height:900});
    for (const slug of slugs) {
      await page.goto('/sources/' + slug + '/');
      await expect(page.locator('body')).toHaveClass(/hm-editorial-site/);
      await expect(page.getByRole('heading', {level:1})).toBeVisible();
      const cover = page.locator('.external-novel-cover img');
      await expect(cover).toHaveAttribute('alt', /Hunmeng illustration/);
      await expect.poll(() => cover.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      await expect(page.locator('.external-novel-cover span')).toContainText('Hunmeng illustration');
      await expect(page.getByRole('link', {name:'Read on Webnovel'})).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        slug + ' @ ' + width).toBe(true);
      if ((width === 390 || width === 1280) && ['lord-of-mysteries','guardians-of-the-dafeng'].includes(slug)) {
        await page.screenshot({
          path: testInfo.outputPath('hunmeng-v2-public-chinese-' + slug + '-' + width + '.png'),
          fullPage: true, animations: 'disabled',
        });
      }
    }
  }
});
