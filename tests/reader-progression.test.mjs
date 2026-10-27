import test from 'node:test';
import assert from 'node:assert/strict';
import {ranks,getRank,MAX_LEVEL,xpForNextLevel,levelFromTotalXp,titleStatus,emptyVerifiedStats} from '../src/lib/reader-progression.ts';

test('nine complete contiguous ranks, Gold -> Dark Gold -> Platinum',()=>{
 assert.equal(ranks.length,9);
 assert.equal(ranks[4].en,'Dark Gold');
 assert.equal(ranks[4].min,140);
 for(let i=0;i<ranks.length-1;i++) assert.equal(ranks[i].max+1,ranks[i+1].min);
 assert.equal(ranks[0].min,1);
 assert.equal(ranks.at(-1).max,MAX_LEVEL);
 for(const [level,id] of [[1,'iron'],[24,'iron'],[25,'bronze'],[59,'bronze'],[60,'silver'],
  [109,'silver'],[110,'gold'],[139,'gold'],[140,'dark-gold'],[174,'dark-gold'],
  [175,'platinum'],[249,'platinum'],[250,'diamond'],[329,'diamond'],
  [330,'legendary'],[419,'legendary'],[420,'mythical'],[500,'mythical']])
  assert.equal(getRank(level).id,id);
});
test('XP curve is increasing, starts at 500, caps at level 500',()=>{
 assert.equal(xpForNextLevel(1),500);
 let total=0,last=0;
 for(let level=1;level<MAX_LEVEL;level++){
  const required=xpForNextLevel(level);
  assert.ok(required>=last);
  assert.equal(levelFromTotalXp(total).level,level);
  assert.equal(levelFromTotalXp(total+required-1).level,level);
  total+=required;last=required;
 }
 const max=levelFromTotalXp(total);
 assert.equal(max.level,500);assert.equal(max.rank.id,'mythical');
 assert.equal(max.nextXp,0);assert.equal(levelFromTotalXp(total+100000).level,500);
});
test('title is separate from rank and unsupported metrics do not fabricate progress',()=>{
 const initial=emptyVerifiedStats();
 assert.deepEqual(titleStatus('novice',initial),{progress:0,unlocked:true,available:true});
 assert.equal(titleStatus('collector',initial).available,false);
 assert.equal(titleStatus('reviewer',initial).available,false);
 assert.equal(titleStatus('regular',{...initial,readingDays:30}).unlocked,true);
});
