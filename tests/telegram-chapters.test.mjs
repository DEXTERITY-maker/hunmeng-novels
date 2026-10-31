import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chapterKey,chapterLink,announcement,decideChapters,applyChapterMarker,
  parseChapterMarkdown,validateReleasedChapters,deliverChapters,
} from '../scripts/telegram-chapters-core.mjs';

const chapter=(number,novelSlug='novel-one')=>({novelSlug,novelTitle:'Novel One',number,slug:'chapter-'+number,title:'Title '+number});
const initialized=()=>({version:1,initialized:true,deployedSha:null,chapters:{}});

test('first run baselines old chapters without notifications',()=>{
  const d=decideChapters(null,[chapter(1),chapter(2)]);
  assert.equal(d.baseline,true);
  assert.equal(d.pending.length,0);
  assert.equal(d.mark.length,2);
});
test('repeat run does not repost',()=>{
  const sent=applyChapterMarker(initialized(),chapter(1),'sent');
  assert.deepEqual(decideChapters(sent,[chapter(1)]).pending,[]);
});
test('missed day and two simultaneous chapter releases are recovered',()=>{
  const old=applyChapterMarker(initialized(),chapter(1),'baseline');
  assert.deepEqual(decideChapters(old,[chapter(1),chapter(2),chapter(3)]).pending.map(c=>c.number),[2,3]);
});
test('Supabase outage or incomplete release results never trigger posts',()=>{
  assert.throws(()=>validateReleasedChapters(undefined,[]),/unavailable/);
  assert.throws(()=>validateReleasedChapters([{slug:'novel-one',initial_chapters:85,launch_at:'2026-10-01'}],[]),/Incomplete/);
  assert.throws(()=>decideChapters(initialized(),undefined),/unavailable/);
});
test('removed chapter stays remembered when it is later restored',()=>{
  const old=applyChapterMarker(initialized(),chapter(2),'sent');
  assert.deepEqual(decideChapters(old,[]).pending,[]);
  assert.deepEqual(decideChapters(old,[chapter(2)]).pending,[]);
});
test('REST data includes only published chapters past the initial release',()=>{
  const editions=[{slug:'novel-one',initial_chapters:2,launch_at:'2026-10-01'}];
  const rows=[1,2,3,4].map(number=>({novel_slug:'novel-one',number,title:'Title '+number}));
  assert.deepEqual(validateReleasedChapters(editions,rows).map(x=>x.number),[3,4]);
  assert.throws(()=>validateReleasedChapters(editions,[...rows,{novel_slug:'other',number:1,title:'Bad'}]),/Unrecognized/);
});
test('chapter URLs and spoiler-free English announcement use production domain',()=>{
  assert.equal(chapterLink(chapter(7)),'https://hunmeng-novel.ru/novel/novel-one/chapter-7/');
  assert.equal(announcement(chapter(7)),'Novel One\nChapter 7: Title 7\nNew chapter is out on Hunmeng\nhttps://hunmeng-novel.ru/novel/novel-one/chapter-7/');
  assert.throws(()=>chapterLink({...chapter(7),slug:'../admin'}),/slug/);
});
test('ordinary local chapter front matter is read without including its body',()=>{
  const c=parseChapterMarkdown('---\nnovelSlug: "novel-one"\nslug: "chapter-9"\nnumber: 9\ntitle: "A Safe Title"\n---\nStory body','novel-one');
  assert.equal(chapterKey(c),'novel-one:9');
  assert.equal(c.title,'A Safe Title');
});
test('fake Telegram sender confirms once after durable reservation',async()=>{
  const actions=[];
  let current=initialized();
  const deps={persist:async next=>{actions.push('persist:'+next.chapters['novel-one:1']?.status);current=next;},send:async ch=>{actions.push('telegram:'+ch.number);return {message_id:11};}};
  await deliverChapters(current,[chapter(1)],deps);
  await deliverChapters(current,[chapter(1)],deps);
  assert.deepEqual(actions,['persist:reserved','telegram:1','persist:sent']);
  assert.equal(current.chapters['novel-one:1'].messageId,11);
});
test('ambiguous Telegram failure retains reservation, never auto-retries',async()=>{
  let current=initialized(),calls=0;
  const deps={persist:async next=>{current=next;},send:async()=>{calls++;throw Error('timeout');}};
  await assert.rejects(()=>deliverChapters(current,[chapter(1)],deps),/timeout/);
  assert.equal(current.chapters['novel-one:1'].status,'reserved');
  await deliverChapters(current,[chapter(1)],deps);
  assert.equal(calls,1);
});
test('persistence failure prevents any Telegram send',async()=>{
  let sends=0;
  await assert.rejects(()=>deliverChapters(initialized(),[chapter(1)],{persist:async()=>{throw Error('failed');},send:async()=>{sends++;}}),/failed/);
  assert.equal(sends,0);
});
