import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {ranks,readerMasteryTiers,getReaderMastery} from '../src/lib/reader-progression.ts';

const root=process.cwd();
test('nine embellished SVG rank assets exist and keep Gold, Dark Gold, Platinum sequence',()=>{
 assert.equal(ranks.length,9);
 assert.deepEqual(ranks.slice(3,6).map(rank=>rank.id),['gold','dark-gold','platinum']);
 for(const rank of ranks){
   const svg=readFileSync(join(root,'public','images','ranks',rank.id+'.svg'),'utf8');
   assert.match(svg,/<svg[^>]+viewBox="0 0 200 224"/);
   assert.match(svg,/<title>/);
   assert.match(svg,/<radialGradient/);
   assert.match(svg,/<text x="100"/);
 }
});
test('six reader mastery steps cover all 500 levels without changing server XP',()=>{
 assert.equal(readerMasteryTiers.length,6);
 assert.equal(readerMasteryTiers[0].min,1);
 assert.equal(readerMasteryTiers.at(-1).max,500);
 for(let i=1;i<readerMasteryTiers.length;i++)
   assert.equal(readerMasteryTiers[i].min,readerMasteryTiers[i-1].max+1);
 assert.equal(getReaderMastery(12).ru,'Опытный читатель');
 assert.equal(getReaderMastery(50).ru,'Легенда Hunmeng');
});
test('feature announcements have actual reader-facing news markdown',()=>{
 const files=['rank-world-design-2026-10-28.md','reading-progress-updates-2026-10-28.md','achievements-and-rank-progress-2026-10-28.md'];
 for(const file of files){
   const body=readFileSync(join(root,'src','content','news',file),'utf8');
   assert.match(body,/publishedAt: "2026-10-28"/);
   assert.match(body,/category: (changelog|announcements)/);
   assert.match(body,/\[.*?\]\(\/(?:ranks|account|library)\//);
   assert.ok(body.length>500);
 }
});
