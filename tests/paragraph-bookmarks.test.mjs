import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKMARK_STORAGE_KEY, MAX_BOOKMARK_BYTES, MAX_CLOUD_STATE_BYTES,
  addParagraphBookmark, assertBookmarkBudget, assertCloudStateBudget,
  bookmarkBytes, bookmarkDocument, bookmarkKey, deleteParagraphBookmark,
  findBookmarkParagraph, mergeBookmarks, normalizeParagraph, paragraphHash,
  sanitizeBookmarks, BookmarkLimitError, fitCloudState,
} from '../src/lib/bookmarks.ts';
import {mergeReaderStates} from '../src/lib/reader-sync-merge.ts';

const base = () => ({
  version: 1,
  settings: {font: 'serif', size: 20, lineHeight: 1.85, paragraphSpacing: 1.35, width: 720, theme: 'system'},
  library: {}, progress: {},
});
const input = async (blockId = 'block-1', chapterSlug = 'chapter-1', text = 'The old tower stood in the morning light.') => ({
  novelSlug: 'novel-one', chapterSlug, blockId,
  quote: normalizeParagraph(text).slice(0, 120),
  textHash: await paragraphHash(text),
});
const make = async (blockId = 'block-1', chapterSlug = 'chapter-1', text) =>
  addParagraphBookmark({}, await input(blockId, chapterSlug, text), 100).bookmark;
const countActive = entries => Object.values(entries).filter(b => !b.deleted).length;

test('add and repeated add have one paragraph key and do not advance revision', async () => {
  const bookmarkInput = await input();
  const first = addParagraphBookmark({}, bookmarkInput, 100);
  const second = addParagraphBookmark(first.bookmarks, bookmarkInput, 200);
  assert.equal(first.added, true);
  assert.equal(second.added, false);
  assert.equal(Object.keys(second.bookmarks).length, 1);
  assert.equal(second.bookmark.revision, 1);
  assert.equal(second.bookmark.createdAt, 100);
});

test('delete stores tombstone and add after deletion advances revision without duplicate', async () => {
  const bookmarkInput = await input();
  const key = bookmarkKey(bookmarkInput.novelSlug, bookmarkInput.chapterSlug, bookmarkInput.blockId);
  const first = addParagraphBookmark({}, bookmarkInput, 100);
  const deleted = deleteParagraphBookmark(first.bookmarks, key, 200);
  assert.equal(deleted[key].revision, 2);
  assert.equal(deleted[key].deleted, true);
  assert.equal(countActive(deleted), 0);
  assert.equal(deleteParagraphBookmark(deleted, key, 300)[key].revision, 2);
  const recreated = addParagraphBookmark(deleted, bookmarkInput, 400);
  assert.equal(Object.keys(recreated.bookmarks).length, 1);
  assert.equal(recreated.bookmark.revision, 3);
  assert.equal(recreated.bookmark.deleted, false);
});

test('two devices independently add different bookmarks and union merges both', async () => {
  const a = addParagraphBookmark({}, await input('block-2'), 100).bookmarks;
  const b = addParagraphBookmark({}, await input('block-5'), 100).bookmarks;
  assert.equal(countActive(mergeBookmarks(a, b)), 2);
  const merged = mergeReaderStates({...base(), bookmarks:a}, {...base(), bookmarks:b});
  assert.equal(Object.keys(merged.state.bookmarks).length, 2);
  assert.equal(merged.conflicts.length, 0);
});

test('offline stale active copy cannot resurrect a deletion, regardless of merge order', async () => {
  const original = addParagraphBookmark({}, await input(), 100).bookmarks;
  const key = Object.keys(original)[0];
  const deleted = deleteParagraphBookmark(original, key, 200);
  for (const entries of [mergeBookmarks(deleted, original), mergeBookmarks(original, deleted)]) {
    assert.equal(entries[key].deleted, true);
    assert.equal(entries[key].revision, 2);
  }
});

test('equal revision prefers deletion; deterministic tie-break is order independent', async () => {
  const original = addParagraphBookmark({}, await input(), 100).bookmarks;
  const key = Object.keys(original)[0];
  const deleted = {...original, [key]: {...original[key], deleted:true}};
  assert.equal(mergeBookmarks(original, deleted)[key].deleted, true);
  assert.equal(mergeBookmarks(deleted, original)[key].deleted, true);
  const other = {...original, [key]: {...original[key], updatedAt: 300}};
  assert.deepEqual(mergeBookmarks(original, other)[key], mergeBookmarks(other, original)[key]);
});

test('old reader state and absent cloud bookmarks are not interpreted as deletion', async () => {
  const local = addParagraphBookmark({}, await input(), 100).bookmarks;
  assert.equal(Object.keys(bookmarkDocument({version:1}).bookmarks).length, 0);
  assert.equal(Object.keys(sanitizeBookmarks(undefined)).length, 0);
  const m = mergeReaderStates({...base(),bookmarks:local}, base());
  assert.equal(Object.keys(m.state.bookmarks).length, 1);
  const oldClientCloud = {...base(), library:{'novel-one':'later'}};
  const restored = mergeReaderStates({...base(),bookmarks:local}, oldClientCloud);
  assert.equal(Object.keys(restored.state.bookmarks).length, 1);
  assert.equal(restored.state.library['novel-one'], 'later');
});

test('progress conflicts never discard independent bookmarks', async () => {
  const local = addParagraphBookmark({}, await input(), 100).bookmarks;
  const progress = (chapterSlug) => ({chapterSlug,chapterNumber:1,blockId:'block-1',offset:0,ratio:.2,updatedAt:100});
  const a = {...base(),bookmarks:local,progress:{'novel-one':progress('chapter-1')}};
  const b = {...base(),progress:{'novel-one':progress('chapter-2')}};
  const unresolved = mergeReaderStates(a,b);
  assert.equal(unresolved.conflicts[0].kind, 'chapter-position');
  assert.equal(Object.keys(unresolved.state.bookmarks).length, 1);
  assert.equal(Object.keys(mergeReaderStates(a,b,'cloud').state.bookmarks).length, 1);
});

test('at most 10 active bookmarks per chapter; rejection preserves caller state', async () => {
  let entries = {};
  for (let i=0;i<10;i++)
    entries = addParagraphBookmark(entries,await input('block-'+i),100).bookmarks;
  const before = JSON.stringify(entries);
  assert.throws(()=>addParagraphBookmark(entries,{
    novelSlug:'novel-one',chapterSlug:'chapter-1',blockId:'block-10',
    quote:'Hello',textHash:'a'.repeat(64)},100), BookmarkLimitError);
  assert.equal(JSON.stringify(entries),before);
});

test('at most 100 active bookmarks per reader across chapters', async () => {
  let entries = {};
  for (let chapter=1;chapter<=10;chapter++) for (let block=0;block<10;block++)
    entries=addParagraphBookmark(entries,{
      novelSlug:'novel-one',chapterSlug:'chapter-'+chapter,blockId:'block-'+block,
      quote:'A',textHash:'a'.repeat(64)},100).bookmarks;
  assert.equal(countActive(entries),100);
  assert.throws(()=>addParagraphBookmark(entries,{
    novelSlug:'novel-one',chapterSlug:'chapter-11',blockId:'block-0',
    quote:'A',textHash:'a'.repeat(64)},200),/100 active/);
});

test('quote length, location, hash and malformed historic entries are rejected', async () => {
  const initial = await input();
  for(const broken of [
    {...initial,quote:'x'.repeat(121)}, {...initial,blockId:'script'}, {...initial,textHash:'bad'},
    {...initial,novelSlug:'../../user'},
  ]) assert.throws(()=>addParagraphBookmark({},broken,100));
  const good = addParagraphBookmark({},initial,100).bookmarks;
  assert.equal(Object.keys(sanitizeBookmarks({...good,'invalid':good[Object.keys(good)[0]]})).length,1);
});

test('80 KiB bookmark budget protects tombstones and existing entries', async () => {
  const item = await make();
  const large = {};
  for(let i=0;i<400;i++)
    large['novel-one/chapter-1/block-'+i] = {...item,blockId:'block-'+i,deleted:true,revision:2};
  assert.ok(bookmarkBytes(large)>MAX_BOOKMARK_BYTES);
  assert.throws(()=>assertBookmarkBudget(large),BookmarkLimitError);
  assert.equal(Object.keys(large).length,400);
  // Refuse even if deletion markers, rather than silently discard history.
});

test('cloud payload is rejected with safety margin, without mutation', async () => {
  const original = {version:1,library:{},progress:{},settings:base().settings,novelSettings:{'novel-one':{note:'x'.repeat(MAX_CLOUD_STATE_BYTES)}}};
  const before = JSON.stringify(original);
  assert.throws(()=>assertCloudStateBudget(original),BookmarkLimitError);
  assert.equal(JSON.stringify(original),before);
  assert.doesNotThrow(()=>assertCloudStateBudget({...base(),bookmarks:{}}));
});

test('hash normalizes whitespace and Unicode; exact block resolves', async () => {
  assert.equal(await paragraphHash('  The  old\n tower '),await paragraphHash('The old tower'));
  const bookmark = await make('block-3','chapter-1','The old tower stood in the morning light.');
  assert.deepEqual(await findBookmarkParagraph(bookmark,[
    {blockId:'block-2',text:'Before.'},
    {blockId:'block-3',text:'The old tower stood in the morning light.'},
  ]),{status:'found',blockId:'block-3',method:'block'});
});

test('inserting a paragraph before anchor shifts blockId; quote fallback finds it', async () => {
  const text = 'The morning light reached the old tower.';
  const bookmark = await make('block-2','chapter-1',text);
  const result = await findBookmarkParagraph(bookmark,[
    {blockId:'block-0',text:'A new opening.'},
    {blockId:'block-1',text:'Earlier text.'},
    {blockId:'block-2',text:'Another earlier text.'},
    {blockId:'block-3',text},
  ]);
  assert.deepEqual(result,{status:'found',blockId:'block-3',method:'quote'});
});

test('edited text beyond short quote keeps quote fallback; edited quote yields not found', async () => {
  const longText='Some memorable opening. '+ 'x'.repeat(180);
  const item=await input('block-2','chapter-1',longText);
  const b=addParagraphBookmark({}, {...item,quote:'Some memorable opening.'},100).bookmark;
  assert.deepEqual(await findBookmarkParagraph(b,[
    {blockId:'block-2',text:'Some memorable opening. '+ 'y'.repeat(180)},
  ]),{status:'found',blockId:'block-2',method:'quote'});
  assert.deepEqual(await findBookmarkParagraph(b,[
    {blockId:'block-2',text:'A completely rewritten passage.'},
  ]),{status:'not-found',reason:'missing'});
});

test('two identical paragraphs are ambiguous, not a silent jump to wrong passage', async () => {
  const text='Two paragraphs may look exactly alike.';
  const b=await make('block-1','chapter-1',text);
  const result=await findBookmarkParagraph(b,[
    {blockId:'block-1',text},{blockId:'block-2',text},
  ]);
  assert.deepEqual(result,{status:'not-found',reason:'ambiguous'});
});

test('deleted original paragraph returns not found', async () => {
  const b=await make('block-5','chapter-1','The lost paragraph.');
  assert.deepEqual(await findBookmarkParagraph(b,[
    {blockId:'block-4',text:'An unrelated paragraph.'},
    {blockId:'block-5',text:'A different paragraph.'},
  ]),{status:'not-found',reason:'missing'});
});

test('separate localStorage key survives old reader client rewriting the main key', async () => {
  const storage=new Map();
  globalThis.window={dispatchEvent:()=>{}};
  globalThis.localStorage={
    getItem:k=>storage.get(k)??null,
    setItem:(k,v)=>storage.set(k,v),
  };
  const {bookmarkRepository} = await import('../src/lib/bookmark-storage.ts');
  await bookmarkRepository.add(await input());
  assert.equal(storage.has(BOOKMARK_STORAGE_KEY),true);
  storage.set('hunmeng-novels:v1',JSON.stringify(base()));
  assert.equal(Object.keys((await bookmarkRepository.getState()).bookmarks).length,1);
  // A stale cloud response without bookmarks also cannot erase the local copy.
  await bookmarkRepository.mergeImported(undefined);
  assert.equal(Object.keys((await bookmarkRepository.getState()).bookmarks).length,1);
  delete globalThis.window;
  delete globalThis.localStorage;
});

test('two devices may together exceed the creation limits; merge and sync never throw', async () => {
  const a = {}, b = {};
  for (let i = 0; i < 60; i++) {
    const x = await make('block-' + i, 'chapter-' + (i % 10 + 1), 'Device A paragraph ' + i);
    a[bookmarkKey(x.novelSlug, x.chapterSlug, x.blockId)] = x;
    const y = await make('block-' + (100 + i), 'chapter-' + (i % 10 + 1), 'Device B paragraph ' + i);
    b[bookmarkKey(y.novelSlug, y.chapterSlug, y.blockId)] = y;
  }
  const merged = mergeBookmarks(a, b);
  assert.equal(Object.values(merged).filter(x => !x.deleted).length, 120);
  assert.doesNotThrow(() => mergeReaderStates({...base(), bookmarks: a}, {...base(), bookmarks: b}));
  // A new bookmark is refused while over the limit...
  await assert.rejects(async () => addParagraphBookmark(merged, await input('block-999', 'chapter-1', 'One more paragraph.')), BookmarkLimitError);
  // ...but deleting is always allowed, so the reader can get back under it.
  const key = Object.keys(merged)[0];
  const afterDelete = deleteParagraphBookmark(merged, key);
  assert.equal(afterDelete[key].deleted, true);
});

test('an oversized bookmark field is left out of the cloud row instead of blocking sync', async () => {
  const big = {};
  for (let i = 0; i < 1200; i++) {
    const x = await make('block-' + i, 'chapter-1', 'Tombstone ' + i);
    big[bookmarkKey(x.novelSlug, x.chapterSlug, x.blockId)] = {...x, deleted: true, revision: 2};
  }
  const state = {...base(), library: {'novel-one': 'reading'}, bookmarks: big};
  const fitted = fitCloudState(state);
  assert.equal(fitted.bookmarksOmitted, true);
  assert.equal('bookmarks' in fitted.state, false);
  assert.deepEqual(fitted.state.library, {'novel-one': 'reading'});
  assert.equal(Object.keys(state.bookmarks).length, 1200);
  const small = fitCloudState({...base(), bookmarks: {}});
  assert.equal(small.bookmarksOmitted, false);
});

