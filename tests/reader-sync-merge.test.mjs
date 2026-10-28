import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeReaderStates} from '../src/lib/reader-sync-merge.ts';
const base=()=>({version:1,settings:{font:'serif',size:20,lineHeight:1.85,paragraphSpacing:1.35,width:720,theme:'system'},library:{},progress:{}});
const progress=(chapter,ratio,updatedAt)=>({chapterSlug:chapter,chapterNumber:1,blockId:'block-3',offset:0,ratio,updatedAt});

test('merge keeps independent books on both devices',()=>{
 const local={...base(),library:{'book-one':'reading'},progress:{'book-one':progress('chapter-1',.5,10)}};
 const cloud={...base(),library:{'book-two':'later'},progress:{'book-two':progress('chapter-1',.8,20)}};
 const m=mergeReaderStates(local,cloud);
 assert.equal(m.conflicts.length,0);
 assert.deepEqual(m.state.library,{'book-one':'reading','book-two':'later'});
 assert.equal(m.state.progress['book-two'].ratio,.8);
});
test('different chapters never overwrite one another without explicit choice',()=>{
 const local={...base(),progress:{'book-one':progress('chapter-4',.9,30)}};
 const cloud={...base(),progress:{'book-one':progress('chapter-6',.4,15)}};
 const unresolved=mergeReaderStates(local,cloud);
 assert.deepEqual(unresolved.conflicts,[{slug:'book-one',kind:'chapter-position'}]);
 assert.equal(unresolved.state.progress['book-one'].chapterSlug,'chapter-6');
 assert.equal(mergeReaderStates(local,cloud,'device').state.progress['book-one'].chapterSlug,'chapter-4');
 assert.equal(mergeReaderStates(local,cloud,'cloud').state.progress['book-one'].chapterSlug,'chapter-6');
});
test('changing shelf on two devices produces conflict and keeps deliberate removals',()=>{
 const local={...base(),library:{},shelfChanges:{'book-one':{shelf:null,updatedAt:200}}};
 const cloud={...base(),library:{'book-one':'reading'},shelfChanges:{'book-one':{shelf:'reading',updatedAt:100}}};
 assert.equal(mergeReaderStates(local,cloud).conflicts[0].kind,'shelf');
 const selected=mergeReaderStates(local,cloud,'device').state;
 assert.equal(selected.library['book-one'],undefined);
 assert.equal(selected.shelfChanges?.['book-one']?.shelf,null);
});
test('nearby in-chapter locations use newer anchor, not scroll pixels',()=>{
 const local={...base(),progress:{'book-one':progress('chapter-1',.51,20)}};
 const cloud={...base(),progress:{'book-one':progress('chapter-1',.50,30)}};
 const m=mergeReaderStates(local,cloud);
 assert.deepEqual(m.conflicts,[]);
 assert.equal(m.state.progress['book-one'].updatedAt,30);
});
