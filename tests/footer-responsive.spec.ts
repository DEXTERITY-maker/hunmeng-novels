import { test, expect } from './fixtures';

const widths = [320, 360, 375, 390, 430, 768, 1024, 1440];
const discover = [
  ['Catalog', '/catalog/'],
  ['Genres', '/genres/'],
  ['Tags', '/tags/'],
  ['Authors', '/authors/'],
  ['Latest chapters', '/updates/'],
  ['News', '/news/'],
] as const;
const infoLinks = [
  ['My library', '/library/'],
  ['Account', '/account/'],
  ['About', '/about/'],
  ['Terms and privacy', '/rules/'],
  ['Contact', '/contacts/'],
  ['Rights holders', '/rights/'],
] as const;

for (const width of widths) {
  test(`footer keeps readable, compact columns at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 820 });
    await page.goto('/');
    const footer = page.locator('.site-footer');
    await expect(footer).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await footer.evaluate(el => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const inner = el.querySelector<HTMLElement>('.site-footer-inner')!;
      const bottom = el.querySelector<HTMLElement>('.site-footer-bottom')!;
      const identity = el.querySelector<HTMLElement>('.site-footer-identity')!;
      const groups = [...el.querySelectorAll<HTMLElement>('.footer-link-group')];
      const boxes = [inner, bottom, identity, ...groups,
        ...el.querySelectorAll<HTMLElement>('.footer-link-group a')];
      const outside = boxes.filter(item => {
        const r = item.getBoundingClientRect();
        return r.left < box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft) - 1 ||
          r.right > box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) + 1;
      }).map(item => item.textContent?.trim());
      const a = groups[0].getBoundingClientRect();
      const b = groups[1].getBoundingClientRect();
      const links = groups.flatMap(group => [...group.querySelectorAll<HTMLAnchorElement>('a')]);
      const linkHeights = links.map(a => Number(a.getBoundingClientRect().height.toFixed(1)));
      return {
        footerLeft: box.left, footerRight: box.right,
        footerHeight: box.height,
        paddingLeft: parseFloat(style.paddingLeft),
        paddingRight: parseFloat(style.paddingRight),
        innerColumns: getComputedStyle(inner).gridTemplateColumns,
        groupsSideBySide: b.left >= a.right - 1,
        groupGap: b.left - a.right,
        outside,
        minLinkHeight: Math.min(...linkHeights),
        maxLinkHeight: Math.max(...linkHeights),
        bottomRow: bottom.getBoundingClientRect().height,
      };
    });
    expect(Math.abs(geometry.paddingLeft - geometry.paddingRight), JSON.stringify(geometry)).toBeLessThan(1);
    expect(geometry.footerLeft).toBeGreaterThanOrEqual(8);
    expect(geometry.footerRight).toBeLessThanOrEqual(width - 8);
    expect(geometry.outside, JSON.stringify(geometry)).toEqual([]);
    expect(geometry.groupsSideBySide, JSON.stringify(geometry)).toBe(true);
    expect(geometry.minLinkHeight, JSON.stringify(geometry)).toBeGreaterThanOrEqual(44);
    expect(geometry.maxLinkHeight, JSON.stringify(geometry)).toBeLessThan(60);
    expect(geometry.footerHeight, JSON.stringify(geometry)).toBeLessThan(width <= 760 ? 620 : 420);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(footer.locator('.site-footer-identity .brand')).toBeVisible();
    await expect(footer.locator('.site-footer-identity > p')).toContainText('A calmer corner of the internet');
    await expect(footer.locator('.footer-link-group').nth(0).locator('h2')).toHaveText('Discover');
    await expect(footer.locator('.footer-link-group').nth(1).locator('h2')).toHaveText('Hunmeng');
    for (const [index, list] of [discover, infoLinks].entries()) {
      const links = footer.locator('.footer-link-group').nth(index).locator('nav a');
      await expect(links).toHaveCount(list.length);
      for (const [i, [label, href]] of list.entries()) {
        await expect(links.nth(i)).toHaveText(label);
        await expect(links.nth(i)).toHaveAttribute('href', href);
      }
    }
    await expect(footer.locator('.site-footer-bottom')).toContainText('© 2026 Hunmeng.');
    await expect(footer.locator('.site-footer-bottom')).toContainText('Read at your own pace.');
    await footer.screenshot({
      path: info.outputPath(`hunmeng-footer-${width}-${info.project.name}.png`),
      animations: 'disabled',
    });
  });
}

test('footer is keyboard-accessible and theme-aware', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('/news/');
  const footer = page.locator('.site-footer');
  const link = footer.getByRole('link', { name: 'Genres', exact: true });
  await link.focus();
  await expect(link).toBeFocused();
  expect(await link.evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await footer.screenshot({
    path: info.outputPath('hunmeng-footer-dark-mobile.png'),
    animations: 'disabled',
  });
  await page.evaluate(() => document.documentElement.dataset.theme = 'light');
  await footer.getByRole('link', { name: 'Catalog', exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/$/);
});
