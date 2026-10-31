import test from 'node:test';
import assert from 'node:assert/strict';
import {HALLOWEEN_START,HALLOWEEN_END,halloweenInWindow,halloweenValidName,halloweenRank,halloweenBadge,halloweenPrizeWinners} from '../src/lib/halloween-event.ts';

const people=[{userId:'a',displayName:'Autumn'},{userId:'b',displayName:'Moon'},{userId:'c',displayName:'Lantern'}];
const xp=(userId,awardedAt,eventKind='chapter_finished')=>({userId,awardedAt,eventKind});
test('November 1 at 00:00 MSK is counted, November 8 at 00:00 MSK is excluded',()=>{
 assert.equal(HALLOWEEN_START,'2026-10-31T21:00:00Z');
 assert.equal(HALLOWEEN_END,'2026-11-07T21:00:00Z');
 assert.equal(halloweenInWindow(HALLOWEEN_START),true);
 assert.equal(halloweenInWindow('2026-11-07T20:59:59.999Z'),true);
 assert.equal(halloweenInWindow(HALLOWEEN_END),false);
 assert.equal(halloweenInWindow('2026-10-31T20:59:59.999Z'),false);
});
test('tie breaks by earlier last counted chapter, then stable user id',()=>{
 const rows=halloweenRank(people,[
  xp('a','2026-11-02T12:00:00Z'),xp('b','2026-11-02T11:00:00Z'),
  xp('c','2026-11-02T11:00:00Z'),
 ]);
 assert.deepEqual(rows.map(r=>r.userId),['b','c','a']);
 assert.deepEqual(rows.map(r=>r.place),[1,2,3]);
});
test('late joins receive earlier verified chapters and rewards never count as chapters',()=>{
 const rows=halloweenRank(people,[
  xp('a','2026-11-01T02:00:00Z'),xp('a','2026-11-03T02:00:00Z'),
  xp('a','2026-11-03T03:00:00Z','event_reward'),
  xp('b','2026-11-07T21:00:00Z'),xp('c','2026-10-31T20:59:59Z'),
 ]);
 assert.equal(rows[0].userId,'a');
 assert.equal(rows[0].chapters,2);
 assert.equal(rows[1].chapters,0);
});
test('name restrictions include Unicode letters and reject spaces-only, punctuation and nontrimmed',()=>{
 for(const v of ['Alex','Мороз_1','秋夜-12','Night Reader','a-b','Reader 2026'])assert.equal(halloweenValidName(v),true,v);
 for(const v of ['a','  ',' Alice','Alice ','A!B','X@Y','a'.repeat(25),'x\ny',null])assert.equal(halloweenValidName(v),false,String(v));
});
test('names that pose as the site or its staff are reserved',()=>{
 for(const v of ['Hunmeng','hunmeng_fan','Admin','The Moderator','Official Reader','Support','STAFF'])assert.equal(halloweenValidName(v),false,v);
 assert.equal(halloweenValidName('Night Owl'),true);
});
test('staff and zero-chapter readers never take prizes; next eligible readers move up',()=>{
 const rows=[{place:1,chapters:40,team:true,display_name:'T'},{place:2,chapters:30,team:false,display_name:'A'},
  {place:3,chapters:20,team:false,display_name:'B'},{place:4,chapters:10,team:false,display_name:'C'},{place:5,chapters:0,team:false,display_name:'D'}];
 assert.deepEqual(halloweenPrizeWinners(rows).map(r=>r.display_name),['A','B','C']);
 assert.deepEqual(halloweenPrizeWinners(rows.slice(0,2)).map(r=>r.display_name),['A']);
});
test('badge paths use supplied filenames without requiring assets to exist yet',()=>{
 assert.equal(halloweenBadge('gold'),'/images/events/halloween-2026/gold.webp');
 assert.equal(halloweenBadge('bronze',true),'/images/events/halloween-2026/bronze-128.webp');
});
