import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLicensedChapterBatch, rightsVerified } from '../src/lib/authorized-chapter-batch.mjs';
import { extractOutput, validateTranslation, canTranslate, validOriginal } from '../scripts/translate-authorized.mjs';
const verified = {
  rights_status: 'verified', permission_translate: true, permission_publish: true,
  verified_at: '2026-10-31T10:00:00Z',
  rights_evidence: 'Signed permission from publisher to translate and host this work',
  rights_valid_until: '2027-12-31',
};
const text = 'Licensed original manuscript content. '.repeat(4);
const chapter = (n = 1, override = {}) => ({
  chapter_number: n, chapter_slug: 'chapter-' + n,
  chapter_title: 'Chapter ' + n,
  chapter_description: 'Description for licensed chapter ' + n,
  original_text: text, translated_text: '',
  ...override,
});
test('fail closed for unverified, revoked, expired or partial permissions', () => {
  assert.equal(rightsVerified(verified, '2026-11-01'), true);
  assert.equal(canTranslate(verified), true);
  for (const changes of [
    { rights_status:'pending' }, { rights_status:'revoked' },
    { permission_translate:false }, { permission_publish:false },
    { verified_at:null }, { rights_evidence:'unknown' },
    { rights_valid_until:'2026-10-31' },
  ]) assert.equal(rightsVerified({ ...verified, ...changes }, '2026-11-01'), false);
  assert.equal(rightsVerified(null), false);
});
test('batch imports private drafts only and keeps chapter text intact', () => {
  const drafts = parseLicensedChapterBatch(JSON.stringify({ chapters: [chapter(1), chapter(2)] }));
  assert.equal(drafts.length, 2);
  assert.equal(drafts[0].status, 'draft');
  assert.equal(drafts[0].original_text, text.trim());
  assert.equal(drafts[0].translated_text, '');
  assert.deepEqual(Object.keys(drafts[0]).sort(),
    ['chapter_number','chapter_slug','chapter_title','chapter_description','original_text','translated_text','status'].sort());
});
test('reject unbounded, malformed and conflicting chapter imports', () => {
  const rejects = [
    '{invalid', JSON.stringify({ chapters: [] }),
    JSON.stringify({ chapters: Array.from({length:11}, (_,i) => chapter(i+1)) }),
    JSON.stringify({ chapters: [chapter(1), chapter(1)] }),
    JSON.stringify({ chapters: [chapter(1,{chapter_slug:'../evil'})] }),
    JSON.stringify({ chapters: [chapter(1,{chapter_number:1.5})] }),
    JSON.stringify({ chapters: [chapter(1,{original_text:'short'})] }),
    JSON.stringify({ chapters: [chapter(1,{translated_text:'short'})] }),
    JSON.stringify({ chapters: [chapter(1,{status:'approved'})] }),
    JSON.stringify({ chapters: [chapter(1,{source_id:'forced'})] }),
    JSON.stringify({ chapters: [chapter(1,{translated_text:'a'.repeat(300001)})] }),
    JSON.stringify({ chapters: [chapter(1,{chapter_description:'a'})] }),
  ];
  for (const value of rejects) assert.throws(() => parseLicensedChapterBatch(value));
});
test('AI translation stays draft until review and rejects incomplete or unsafe content', () => {
  assert.equal(validOriginal(text), true);
  assert.equal(validOriginal('short'), false);
  assert.equal(validateTranslation('English translation paragraph. '.repeat(4), text), true);
  assert.equal(validateTranslation(text, text), false);
  assert.equal(validateTranslation('<script>alert(1)</script>'.repeat(10), text), false);
  assert.equal(validateTranslation('TODO '.repeat(40), text), false);
  const message = 'English translation paragraph. '.repeat(4);
  assert.equal(extractOutput({status:'completed',output:[{content:[{type:'output_text',text:message}]}]}), message.trim());
  assert.throws(() => extractOutput({status:'incomplete',output:[]}));
  assert.throws(() => extractOutput({status:'completed',output:[{content:[]}]}));
});
test('translation workflow is opt-in and does not expose an HTTP scraping endpoint', async () => {
  const { readFile } = await import('node:fs/promises');
  const flow = await readFile('.github/workflows/translate-authorized.yml','utf8');
  const publisher = await readFile('.github/workflows/publish-approved.yml','utf8');
  assert.match(flow,/workflow_dispatch/);
  assert.match(flow,/default: false/);
  assert.doesNotMatch(flow,/cron:|schedule:/);
  assert.match(flow,/HUNMENG_TRANSLATION_EXECUTE/);
  assert.match(flow,/HUNMENG_AI_PROCESSING_AUTHORIZED/);
  assert.match(flow,/confirm_ai_processing_rights/);
  assert.match(publisher,/HUNMENG_PUBLISH_ENABLED/);
});
