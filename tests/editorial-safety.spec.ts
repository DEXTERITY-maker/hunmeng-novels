import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// Browser tests exercise the real editor JS with synthetic network responses.
const uid = '00000000-0000-4000-8000-000000000077';
const sourceId = '00000000-0000-4000-8000-000000000078';
const source = { id: sourceId, slug: 'sample-source', original_title: 'Sample',
  rights_status: 'verified', permission_translate: true, permission_publish: true };
const time = '2026-10-27T10:00:00.000Z';
const complete = { source_id: sourceId, chapter_number: 1, chapter_slug: 'chapter-one',
  chapter_title: 'First chapter', chapter_description: 'A complete description',
  original_text: 'A'.repeat(120), translated_text: 'B'.repeat(120) };
type Job = typeof complete & { id: string; status: string; updated_at: string; qa_notes: string };
function seeded(status: string): Job {
  return { ...complete, id: '00000000-0000-4000-8000-000000000079',
    status, updated_at: time, qa_notes: 'Reviewed by a human reader.' };
}
async function setup(page: Page, initial: Job[] = []) {
  const data = { jobs: initial, submissions: [] as Array<{method:string;body:any;url:string}>,
    status: 200, emptyResponse: false };
  await page.addInitScript(({uid}) => {
    if (location.pathname.startsWith('/admin/')) sessionStorage.setItem('hunmeng-novels:admin-session:v1',
      JSON.stringify({ user: { id:uid }, access_token:'fixture-access',
        refresh_token:'fixture-refresh', expires_at:Math.floor(Date.now()/1000)+3600 }));
  }, {uid});
  await page.route('https://*.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const json = (value:unknown, status=200) => route.fulfill({status,
      headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*',
        'Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS'},
      contentType:'application/json',body:JSON.stringify(value)});
    if(req.method()==='OPTIONS') return json({});
    if(url.pathname.endsWith('/auth/v1/user')) return json({id:uid});
    if(url.pathname.endsWith('/novel_staff')) return json([{role:'admin'}]);
    if(url.pathname.endsWith('/novel_sources')) return json([source]);
    if(url.pathname.endsWith('/novel_terms')) return json([]);
    if(url.pathname.endsWith('/novel_translation_jobs')){
      if(req.method()==='GET') return json(data.jobs);
      data.submissions.push({method:req.method(), body:req.postDataJSON(), url:url.href});
      if(data.status!==200) return json({message:'do not show private upstream'},data.status);
      if(data.emptyResponse) return json([]);
      if(req.method()==='POST'){
        const row={...req.postDataJSON(),id:'00000000-0000-4000-8000-000000000080',
          qa_notes:'',updated_at:time};
        data.jobs.unshift(row);
        return json([row]);
      }
      const id=url.searchParams.get('id')?.replace(/^eq\./,'');
      const version=url.searchParams.get('updated_at')?.replace(/^eq\./,'');
      const job=data.jobs.find(j=>j.id===id && j.updated_at===version);
      if(!job) return json([]);
      Object.assign(job,req.postDataJSON(),{updated_at:'2026-10-27T10:00:01.000Z'});
      return json([job]);
    }
    return json([]);
  });
  await page.goto('/admin/');
  await expect(page.locator('#admin-workspace')).toBeVisible();
  return data;
}
async function fillChapter(page:Page, partial=false) {
  const form=page.locator('#job-form');
  await form.locator('[name=chapter_number]').fill('1');
  await form.locator('[name=chapter_slug]').fill('chapter-one');
  await form.locator('[name=chapter_title]').fill('First chapter');
  if (!partial) {
    await form.locator('[name=chapter_description]').fill(complete.chapter_description);
    await form.locator('[name=original_text]').fill(complete.original_text);
    await form.locator('[name=translated_text]').fill(complete.translated_text);
  }
}
test('partial draft stays private; complete chapter is sent to review explicitly',async({page})=>{
  const data=await setup(page);
  await fillChapter(page,true);
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect.poll(()=>data.submissions.length).toBe(1);
  expect(data.submissions[0].body.status).toBe('draft');
  expect(data.submissions[0].body.translated_text).toBe('');
  await expect(page.locator('#admin-status')).toContainText('Draft saved privately.');
  await fillChapter(page);
  await page.getByRole('button',{name:'Send for review'}).click();
  await expect.poll(()=>data.submissions.length).toBe(2);
  expect(data.submissions[1].body.status).toBe('review');
});
test('review edits preserve review; returning to draft is explicit',async({page})=>{
  const data=await setup(page,[seeded('review')]);
  await page.getByRole('button',{name:'Open in editor'}).click();
  await expect(page.getByRole('button',{name:'Save changes (keep in review)'})).toBeVisible();
  await page.locator('#job-form [name=chapter_title]').fill('Updated chapter');
  await page.getByRole('button',{name:'Save changes (keep in review)'}).click();
  await expect.poll(()=>data.submissions.length).toBe(1);
  expect(data.submissions[0].body.status).toBe('review');
  await page.getByRole('button',{name:'Open in editor'}).click();
  await page.getByRole('button',{name:'Return to draft'}).click();
  await expect.poll(()=>data.submissions.length).toBe(2);
  expect(data.submissions[1].body.status).toBe('draft');
});
test('approved chapters require explicit admin reopening; published chapters cannot be opened',async({page})=>{
  const data=await setup(page,[seeded('approved'),{...seeded('published'), id:'00000000-0000-4000-8000-000000000081',chapter_number:2}]);
  const rows=page.locator('.admin-job-row');
  await expect(rows.nth(0).getByRole('button',{name:'Open in editor'})).toBeDisabled();
  await expect(rows.nth(1).getByRole('button',{name:'Open in editor'})).toBeDisabled();
  page.once('dialog',dialog=>dialog.accept());
  await rows.nth(0).getByRole('button',{name:'Return to review'}).click();
  await expect.poll(()=>data.submissions.length).toBe(1);
  expect(data.submissions[0].body).toEqual({status:'review'});
});
test('stale concurrent write and empty API results never show a saved confirmation',async({page})=>{
  const data=await setup(page,[seeded('draft')]);
  await page.getByRole('button',{name:'Open in editor'}).click();
  await page.locator('#job-form [name=chapter_title]').fill('My unsaved edits');
  data.jobs[0].updated_at='2026-10-27T11:00:00.000Z';
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.locator('#admin-status')).toContainText('Conflict: another session changed');
  await expect(page.locator('#job-form [name=chapter_title]')).toHaveValue('My unsaved edits');
  await expect(page.locator('#admin-status')).not.toHaveText('Saved.');
});
test('empty POST and HTTP error preserve draft rather than claiming success',async({page})=>{
  const data=await setup(page);
  await fillChapter(page,true);
  data.emptyResponse=true;
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.locator('#admin-status')).toContainText('did not confirm the saved chapter');
  await expect(page.locator('#job-form [name=chapter_title]')).toHaveValue('First chapter');
  data.emptyResponse=false;
  data.status=500;
  await page.getByRole('button',{name:'Save draft'}).click();
  await expect(page.locator('#admin-status')).toContainText('server rejected');
  await expect(page.locator('body')).not.toContainText('do not show private upstream');
});
