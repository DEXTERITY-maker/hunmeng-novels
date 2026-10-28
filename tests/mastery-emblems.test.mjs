import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {ranks,readerMasteryTiers,getReaderMastery,masteryImage} from '../src/lib/reader-progression.ts';
const root=process.cwd();
const keys=['novice','reader','experienced','connoisseur','master','legend'];
test('six different transparent, compact, labeled SVG illustrations are available',()=>{
 const resources=new Set();
 assert.deepEqual(readerMasteryTiers.map(tier=>tier.id),keys);
 for(const tier of readerMasteryTiers){
  const name=masteryImage(tier.id);
  assert.equal(name,`/images/mastery/${tier.id}.svg`);
  const path=join(root,'public',name.slice(1));
  const svg=readFileSync(path,'utf8');
  assert.ok(statSync(path).size<25000,`${tier.id} should remain lightweight`);
  assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg,/viewBox="0 0 260 300"/);
  assert.match(svg,/role="img"/);
  assert.match(svg,/<title id="title">/);
  assert.ok(svg.includes(tier.ru));
  assert.match(svg,/<filter id="shine"/);
  assert.match(svg,/<linearGradient id="bookGold"/);
  assert.doesNotMatch(svg,/<(rect|image)[^>]+(?:fill="#fff"|href="https?:)/);
  assert.ok(svg.includes('M72 166 Q99 153 130 169'),`book symbol must be present in ${tier.id}`);
  assert.equal(resources.has(svg),false,'All emblems must be individually illustrated');
  resources.add(svg);
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
