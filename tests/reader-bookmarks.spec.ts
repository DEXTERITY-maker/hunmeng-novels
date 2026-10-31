import { expect, test, type Page } from '@playwright/test';

const chapterOne = '/novel/khranitel-mayaka/glava-1/';
const chapterTwo = '/novel/khranitel-mayaka/glava-2/';
const bookmarkStorage = 'hunmeng-novels:bookmarks:v1';
const progressStorage = 'hunmeng-novels:v1';

async function chapterReady(page:Page, url=chapterOne) {
  await page.goto(url);
  await expect.poll(() => page.locator('#chapter-text p[id^="block-"]').count()).toBeGreaterThan(3);
  await expect(page.locator('#reader-paragraph-bookmark-action')).toBeAttached();
}
async function scrollToParagraph(page:Page, index = 2) {
  await page.locator('#chapter-text p').nth(index).evaluate(el =>
    window.scrollTo({top:window.scrollY + el.getBoundingClientRect().top - 165,behavior:'instant'}));
  await page.waitForTimeout(460);
}
async function openMore(page:Page) {
  if(await page.locator('#show-reader-controls').isVisible())
    await page.locator('#show-reader-controls').click();
  await page.locator('.reader-more > summary').click();
}
async function addViaMenu(page:Page) {
  await openMore(page);
  await expect(page.locator('#reader-paragraph-bookmark-action')).toHaveText('Bookmark this paragraph');
  await page.locator('#reader-paragraph-bookmark-action').click();
  await expect(page.locator('#reader-bookmark-status')).toContainText('saved');
}
async function bookmarks(page:Page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) || '{"bookmarks":{}}').bookmarks as Record<string,{
    novelSlug:string;chapterSlug:string;blockId:string;deleted:boolean;quote:string;textHash:string;createdAt:number;revision:number
  }>,bookmarkStorage);
}
async function active(page:Page) {
  const entries=await bookmarks(page);
  return Object.entries(entries).filter(([,b])=>!b.deleted);
}
async function openBookmarks(page:Page) {
  if (await page.locator('#show-reader-controls').isVisible())
    await page.locator('#show-reader-controls').click();
  await page.locator('[data-open="toc"]').first().click();
  await expect(page.getByRole('dialog',{name:'Contents'})).toBeVisible();
  await page.locator('#reader-toc-bookmarks-tab').click();
  await expect(page.locator('#reader-toc-bookmarks-panel')).toBeVisible();
}

test('menu bookmarks first visible paragraph; repeat toggles removal without duplicates', async({page})=>{
  await chapterReady(page);
  await scrollToParagraph(page);
  const firstVisible=await page.evaluate(()=>{
    const top=Math.max(88,document.querySelector('.reader-header')!.getBoundingClientRect().bottom);
    return [...document.querySelectorAll('#chapter-text p')].find(p=>{
      const r=p.getBoundingClientRect();return r.bottom>top&&r.top<innerHeight-48;
    })?.id;
  });
  await addViaMenu(page);
  const items=await active(page);
  expect(items).toHaveLength(1);
  expect(items[0][1].blockId).toBe(firstVisible);
  await expect(page.locator('#'+firstVisible+' .reader-paragraph-bookmark-marker')).toBeVisible();
  await openMore(page);
  await expect(page.locator('#reader-paragraph-bookmark-action')).toHaveText('Remove bookmark');
  await page.locator('#reader-paragraph-bookmark-action').click();
  expect(await active(page)).toHaveLength(0);
  expect((await bookmarks(page))[items[0][0]].deleted).toBe(true);
});

test('saved gutter marker is interactive; keyboard TOC Escape restores focus', async({page})=>{
  page.on('dialog',dialog=>void dialog.accept());
  await chapterReady(page);
  await scrollToParagraph(page);
  await addViaMenu(page);
  const item=(await active(page))[0];
  const marker=page.locator('#'+item[1].blockId+' .reader-paragraph-bookmark-marker');
  await expect(marker).toBeVisible();
  await expect(marker).toHaveAttribute('aria-label','Remove bookmark from this paragraph');
  await marker.click();
  await expect.poll(async()=> (await active(page)).length).toBe(0);
  if(await page.locator('#show-reader-controls').isVisible())
    await page.locator('#show-reader-controls').click();
  const opener=page.locator('[data-open=toc]').first();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#reader-toc')).not.toBeVisible();
  await expect(opener).toBeFocused();
});

test('bookmark list opens another chapter and highlights its paragraph, and survives reload',async({page})=>{
  await chapterReady(page,chapterTwo);
  await scrollToParagraph(page);
  await addViaMenu(page);
  const key=(await active(page))[0][0];
  await page.reload();
  await expect.poll(async()=> (await active(page)).length).toBe(1);
  await page.goto(chapterOne);
  await openBookmarks(page);
  await expect(page.locator('#reader-bookmark-list .reader-bookmark-item')).toHaveCount(1);
  await expect(page.locator('#reader-bookmark-list')).toContainText('Chapter 2');
  await page.locator('#reader-bookmark-list a').click();
  await expect(page).toHaveURL(/\/glava-2\/$/);
  await expect(page.locator('#reader-bookmark-status')).toContainText('Opened paragraph bookmark');
  await expect(page.locator('#chapter-text .reader-bookmark-highlight')).toHaveCount(1);
  expect((await bookmarks(page))[key].deleted).toBe(false);
});

test('missing anchor opens chapter at top and reports uncertainty instead of jumping',async({page})=>{
  await chapterReady(page);
  await scrollToParagraph(page);
  await addViaMenu(page);
  await page.evaluate((key)=>{
    const v=JSON.parse(localStorage.getItem(key)!);
    const b=Object.values(v.bookmarks)[0] as {textHash:string;quote:string};
    b.textHash='f'.repeat(64);
    b.quote='This quotation does not exist in any paragraph of this chapter.';
    localStorage.setItem(key,JSON.stringify(v));
  },bookmarkStorage);
  await page.reload();
  await openBookmarks(page);
  await page.locator('#reader-bookmark-list a').click();
  await expect(page.locator('#reader-bookmark-status')).toContainText('could not be found');
  await expect(page.locator('#chapter-text .reader-bookmark-highlight')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBeLessThan(25);
});

test('chapter limit gives actionable error, keeps existing entries and progress',async({page})=>{
  await chapterReady(page);
  await scrollToParagraph(page);
  await page.evaluate(key=>{
    const saved:Record<string,unknown>={};
    for(let i=20;i<30;i++){
      const blockId='block-'+i;
      saved['khranitel-mayaka/glava-1/'+blockId]={
        novelSlug:'khranitel-mayaka',chapterSlug:'glava-1',blockId,
        quote:'Existing bookmark',textHash:'b'.repeat(64),
        createdAt:100,updatedAt:100,revision:1,deleted:false,
      };
    }
    localStorage.setItem(key,JSON.stringify({version:1,bookmarks:saved}));
    window.dispatchEvent(new Event('reader:bookmarks-change'));
  },bookmarkStorage);
  await expect.poll(async()=>(await active(page)).length).toBe(10);
  await page.waitForTimeout(550);
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key) || '{}').progress?.['khranitel-mayaka'],progressStorage);
  await openMore(page);
  await page.locator('#reader-paragraph-bookmark-action').click();
  await expect(page.locator('#reader-bookmark-status')).toContainText('up to 100 per reader and 10 per chapter');
  expect((await active(page))).toHaveLength(10);
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key) || '{}').progress?.['khranitel-mayaka'],progressStorage);
  expect(after).toEqual(before);
});

test('guest stores bookmarks locally without Supabase or changing the Read later shelf',async({page})=>{
  const requests:string[]=[];
  page.on('request',r=>{if(r.url().includes('.supabase.co'))requests.push(r.url());});
  await chapterReady(page);
  await scrollToParagraph(page);
  await page.waitForTimeout(500);
  const before=await page.evaluate(key=>JSON.parse(localStorage.getItem(key) || '{}').progress?.['khranitel-mayaka'],progressStorage);
  await addViaMenu(page);
  await page.waitForTimeout(200);
  const after=await page.evaluate(key=>JSON.parse(localStorage.getItem(key) || '{}').progress?.['khranitel-mayaka'],progressStorage);
  expect(after).toEqual(before);
  expect(requests).toEqual([]);
  await expect(page.locator('#reader-save-later')).toHaveAttribute('aria-label', /Read later/);
  expect((await active(page))).toHaveLength(1);
});

test('mobile 390px and sepia have accessible bookmark controls without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await chapterReady(page);
  await scrollToParagraph(page);
  await addViaMenu(page);
  await openBookmarks(page);
  await expect(page.locator('#reader-bookmark-list a')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  await page.locator('#reader-toc').getByRole('button',{name:'Close contents'}).click();
  await page.evaluate(()=>{
    const key='hunmeng-novels:v1';
    const state=JSON.parse(localStorage.getItem(key)!);
    state.settings.theme='sepia';
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','sepia');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
});

test('responsive light and dark previews: bookmark marker and Bookmarks tab',async({page},info)=>{
  test.skip(info.project.name!=='desktop','Explicit desktop/mobile viewport captures only once.');
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:900});
    await chapterReady(page);
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>{
        const key='hunmeng-novels:v1';
        const state=JSON.parse(localStorage.getItem(key)!);
        state.settings.theme=theme;
        localStorage.setItem(key,JSON.stringify(state));
      },theme);
      await page.reload();
      await scrollToParagraph(page);
      if((await active(page)).length===0) await addViaMenu(page);
      else if(await page.locator('#show-reader-controls').isVisible())
        await page.locator('#show-reader-controls').click();
      const item=(await active(page))[0];
      await page.locator('#'+item[1].blockId).scrollIntoViewIfNeeded();
      await expect(page.locator('#'+item[1].blockId+' .reader-paragraph-bookmark-marker')).toBeVisible();
      await page.screenshot({path:info.outputPath('hunmeng-bookmark-reader-'+width+'-'+theme+'.png'),animations:'disabled'});
      await openBookmarks(page);
      await expect(page.locator('#reader-bookmark-list li')).toHaveCount(1);
      await page.screenshot({path:info.outputPath('hunmeng-bookmark-toc-'+width+'-'+theme+'.png'),animations:'disabled'});
      await page.locator('#reader-toc').getByRole('button',{name:'Close contents'}).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
    }
  }
});
