import { test, expect } from './fixtures';

const chapter = '/novel/khranitel-mayaka/glava-1/';
const novel = '/novel/khranitel-mayaka/';
const breakpoints = [320, 360, 390, 430, 768, 1280];

for (const width of breakpoints) {
  test('reader redesign is legible and has no overflow at '+width+'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 820 });
    await page.goto(chapter);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('.reader-heading-ornament')).toBeVisible();
    await expect(page.locator('.reader-header [data-open="settings-header"]')).toBeVisible();
    await expect(page.locator('#chapter-text p').first()).toBeVisible();
    await expect(page.locator('[data-reader-words]')).toBeVisible();
    await expect(page.locator('.chapter-end-nav .chapter-next')).toHaveAttribute(
      'href', '/novel/khranitel-mayaka/glava-2/');
    await expect(page.locator('.chapter-end-nav .chapter-back-to-novel')).toHaveAttribute('href',novel);
    const chapterText = await page.locator('#chapter-text').evaluate(el => {
      const style = getComputedStyle(el);
      return { size:parseFloat(style.fontSize),leading:parseFloat(style.lineHeight),
        paragraphs:el.querySelectorAll('p').length,
        margin:getComputedStyle(el.querySelector('p')!).marginBottom,
        width:el.getBoundingClientRect().width };
    });
    expect(chapterText.size).toBeGreaterThanOrEqual(18);
    expect(chapterText.leading).toBeGreaterThan(chapterText.size*1.5);
    expect(chapterText.paragraphs).toBeGreaterThan(8);
    expect(chapterText.width).toBeLessThanOrEqual(width-24);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:info.outputPath('hunmeng-reader-'+width+'-'+info.project.name+'.png'),fullPage:false,animations:'disabled'});
    await page.locator('.chapter-end-nav').scrollIntoViewIfNeeded();
    await page.screenshot({path:info.outputPath('hunmeng-reader-end-'+width+'-'+info.project.name+'.png'),fullPage:false,animations:'disabled'});
    for (const selector of ['.reader-back','.reader-header-actions .icon-button','.reader-toolbar button']) {
      for (const element of await page.locator(selector).all()) {
        const b=await element.boundingBox();
        if(!b)continue;
        expect(b.width,selector).toBeGreaterThanOrEqual(width<=380 ? 40 : 44);
        expect(b.height,selector).toBeGreaterThanOrEqual(44);
      }
    }
  });
}
test('reader keeps headings, paragraph structure, existing content and working chapter links', async({page})=>{
  await page.goto(chapter);
  const before=await page.locator('#chapter-text').evaluate(el=>el.textContent);
  expect(before?.length).toBeGreaterThan(500);
  await expect(page.locator('.chapter-end-nav .chapter-unavailable')).toContainText('First chapter');
  await expect(page.locator('.chapter-end-nav .chapter-next')).toHaveAttribute('href','/novel/khranitel-mayaka/glava-2/');
  await expect(page.locator('.reader-more-panel a').first()).toHaveAttribute('href',novel);
  await expect(page.locator('#chapter-text')).toHaveText((before??'').replace(/\s+/g,' ').trim(),{useInnerText:false});
  await page.getByRole('button',{name:'Open contents'}).click();
  await expect(page.getByRole('dialog',{name:'Contents'})).toBeVisible();
  await page.getByRole('dialog',{name:'Contents'}).getByRole('link',{name:/Chapter 2/}).click();
  await expect(page).toHaveURL(/glava-2/);
  await expect(page.locator('.chapter-end-nav .chapter-previous')).toHaveAttribute('href',chapter);
});
test('reader reuses library shelves for Read later instead of a fake bookmark',async({page})=>{
  await page.goto(chapter);
  const toggle=page.getByRole('button',{name:'Save novel to Read later'});
  await toggle.click();
  await expect(page.locator('#reader-save-later')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library['khranitel-mayaka'])).toBe('later');
  await page.reload();
  await expect(page.locator('#reader-save-later')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library['khranitel-mayaka'])).toBe('later');
  await page.getByRole('button',{name:'Remove from Read later'}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).library['khranitel-mayaka'])).toBe('reading');
});
test('reader settings apply immediately, persist paragraph spacing and restore position',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(chapter);
  await page.locator('.reader-header [data-open="settings-header"]').click();
  const dialog=page.getByRole('dialog',{name:'Reading settings'});
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="paragraphSpacing"]').fill('1.8');
  await dialog.locator('input[name="size"]').fill('24');
  await dialog.locator('input[name="theme"][value="sepia"]').check();
  await expect.poll(()=>page.locator('#chapter-text p').first().evaluate(el=>getComputedStyle(el).marginBottom)).toBe('43.2px');
  await expect(page.locator('html')).toHaveAttribute('data-theme','sepia');
  await dialog.screenshot({path:info.outputPath('hunmeng-reader-settings-mobile.png'),animations:'disabled'});
  await dialog.getByRole('button',{name:'Close settings'}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).settings);
  expect(saved.paragraphSpacing).toBe(1.8);
  await page.evaluate(()=>scrollTo(0,750));
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('hunmeng-novels:v1')!).progress?.['khranitel-mayaka']?.blockId)).toMatch(/^block-/);
  const previous=await page.evaluate(()=>scrollY);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','sepia');
  await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(previous-150);
  await page.locator('[data-open="settings"]').click();
  await expect(dialog.locator('input[name="paragraphSpacing"]')).toHaveValue('1.8');
});
test('reader focus mode hides chrome, can recover controls and does not fake comments',async({page})=>{
  await page.goto(chapter);
  await page.locator('.reader-more > summary').click();
  await page.locator('[data-reader-focus]').click();
  await expect(page.locator('body')).toHaveClass(/reader-focus-mode/);
  await expect(page.locator('#show-reader-controls')).toBeVisible();
  await page.getByRole('button',{name:'Show reading controls'}).click();
  await expect(page.locator('.reader-header')).toBeVisible();
  await page.locator('.reader-more > summary').click();
  await page.locator('[data-reader-focus]').click();
  await expect(page.locator('body')).not.toHaveClass(/reader-focus-mode/);
  await expect(page.locator('#show-reader-controls')).toBeHidden();
  await expect(page.locator('[data-chapter-comments]')).toHaveCount(0);
});
