import test from 'node:test';
import assert from 'node:assert/strict';
import { readingAction } from '../src/lib/reading-action.ts';
const chapters=[{slug:'glava-1',number:1,url:'/novel/demo/glava-1/'},{slug:'glava-3',number:3,url:'/novel/demo/glava-3/'}];
const novel={firstUrl:chapters[0].url,chapters};
const progress=(slug,ratio)=>({chapterSlug:slug,ratio});
test('продолжение, переход в следующую опубликованную главу и начало без прогресса',()=>{
 assert.equal(readingAction(novel).kind,'start');
 assert.equal(readingAction(novel,progress('removed',1)).kind,'start');
 for(const ratio of [0,.3,.98,.994]) {
  const a=readingAction(novel,progress('glava-1',ratio));assert.equal(a.kind,'resume');assert.equal(a.url,chapters[0].url+'?resume=1');assert.equal(a.ratio,ratio);
 }
 for(const ratio of [.995,1]) {
  const a=readingAction(novel,progress('glava-1',ratio));assert.equal(a.kind,'next');assert.equal(a.url,chapters[1].url);assert.equal(a.ratio,0);
 }
});
test('последняя прочитанная глава означает конец опубликованных глав, новые главы возвращают продолжение',()=>{
 const p=progress('glava-3',1),a=readingAction(novel,p);
 assert.equal(a.kind,'caught-up');assert.equal(a.label,'Читать сначала');assert.equal(a.url,novel.firstUrl);
 const updated={...novel,chapters:[...chapters,{slug:'glava-4',number:4,url:'/novel/demo/glava-4/'}]};
 assert.equal(readingAction(updated,p).kind,'next');assert.equal(readingAction(updated,p).url,'/novel/demo/glava-4/');
 assert.equal(readingAction({...novel,chapters:[]},p).kind,'start');
});
