import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {ranks,readerMasteryTiers,getReaderMastery,masteryImage} from '../src/lib/reader-progression.ts';
const root=process.cwd();
const keys=['novice','reader','experienced','connoisseur','master','legend'];
test('six individual transparent 640px WebP mastery illustrations are available',()=>{
 const resources=new Set();
 assert.deepEqual(readerMasteryTiers.map(tier=>tier.id),keys);
 for(const tier of readerMasteryTiers){
  const url=masteryImage(tier.id);
  assert.equal(url,`/images/mastery/${tier.id}.webp`);
  const path=join(root,'public',url.slice(1));
  const buf=readFileSync(path);
  assert.ok(statSync(path).size<200000);
  assert.equal(buf.toString('ascii',0,4),'RIFF');
  assert.equal(buf.toString('ascii',8,12),'WEBP');
  assert.equal(buf.toString('ascii',12,16),'VP8X');
  assert.ok(buf[20]&16,'Transparent image required');
  assert.equal(buf.readUIntLE(24,3)+1,640);
  assert.equal(buf.readUIntLE(27,3)+1,640);
  const hex=buf.toString('base64');
  assert.equal(resources.has(hex),false);
  resources.add(hex);
 }
});
test('rank and mastery progression remain independent with unchanged cutoffs',()=>{
 assert.equal(ranks.length,9);
 assert.deepEqual(ranks.map(rank=>[rank.id,rank.min,rank.max]),[
 ['iron',1,24],['bronze',25,59],['silver',60,109],
 ['gold',110,139],['dark-gold',140,174],['platinum',175,249],
 ['diamond',250,329],['legendary',330,419],['mythical',420,500]]);
 assert.deepEqual(readerMasteryTiers.map(tier=>[tier.id,tier.min,tier.max]),[
 ['novice',1,4],['reader',5,9],['experienced',10,19],
 ['connoisseur',20,34],['master',35,49],['legend',50,500]]);
 assert.equal(getReaderMastery(12).ru,'Опытный читатель');
 assert.equal(getReaderMastery(420).ru,'Легенда Hunmeng');
});
