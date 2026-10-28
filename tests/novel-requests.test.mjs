import test from 'node:test';
import assert from 'node:assert/strict';
import { identifySource, findMatches, canPreparePublication } from '../src/lib/novel-requests/core.ts';
const work = (id, extra = {}) => ({ id, titles: [], authors: [], sources: [], chapters: [], ...extra });
const chapters = ['The vanished lantern', 'Across the silent river', 'A promise at dawn'].map((title, i) => ({number: i + 1, title}));
const source = {provider: 'fixture', externalId: '42', url: 'https://example.org/book/42'};
const adapter = {hosts: ['example.org'], identify: url => /^\/book\/\d+$/.test(url.pathname) ? {provider: 'fixture', externalId: url.pathname.split('/').at(-1), url: `https://example.org${url.pathname}`} : null};
test('source identification rejects credentials, ports, unrecognized hosts and paths', () => {
  assert.deepEqual(identifySource('https://example.org/book/42?ref=a#x', [adapter]), source);
  for (const u of ['http://example.org/book/42', 'https://example.org.evil.test/book/42', 'https://user@example.org/book/42', 'https://example.org:444/book/42', 'https://example.org/other/42']) assert.equal(identifySource(u, [adapter]), null);
});
test('recognized external id is exact; aliases and authors provide probable match', () => {
  const input = work('new', {titles: ['Ａ Story'], authors: ['A. Writer'], sources: [source]});
  const matches = findMatches(input, [work('b', {titles:['a story'], authors:['A Writer']}), work('a', {sources:[source]}), work('c', {titles:['a story']})]);
  assert.deepEqual(matches.map(m => [m.workId,m.kind]), [['a','exact'],['b','probable']]);
  assert.ok(matches[1].reasons.includes('Matching original or alternative title'));
});
test('matching chapter structure catches different titles, but generic chapter numbers do not', () => {
  let input = work('new', {titles:['New name'], chapters});
  assert.equal(findMatches(input, [work('old', {titles:['Old name'], chapters})])[0].kind, 'probable');
  const generic = [1,2,3].map(number => ({number,title:`Chapter ${number}`}));
  assert.deepEqual(findMatches(work('new',{chapters:generic}), [work('old',{chapters:generic})]), []);
  assert.deepEqual(findMatches(work('new',{chapters:[chapters[0],chapters[0],chapters[0]]}), [work('old',{chapters})]), []);
});
test('rights gate fails closed on missing, revoked, expired, malformed or partial rights', () => {
  const rights = {status:'verified', evidence:'Permission documented in signed agreement', verifiedBy:'editor', validUntil:'2027-01-01', translate:true, publish:true};
  assert.equal(canPreparePublication(rights,'2026-10-28'), true);
  for (const change of [{status:'pending'}, {status:'revoked'}, {evidence:''}, {verifiedBy:null}, {publish:false}, {translate:false}, {validUntil:'2026-10-27'}, {validUntil:'2026-02-30'}]) assert.equal(canPreparePublication({...rights,...change},'2026-10-28'), false);
});
test('metadata selection requires policy evidence and keeps only explicitly allowed fields', async () => {
  const {selectPermittedMetadata} = await import('../src/lib/novel-requests/core.ts');
  const input = {originalTitle:' Original ', authors:[' Writer '], alternativeTitles:[' Alt '], chapterTitles:chapters, description:'not permitted', cover:'https://example.org/image'};
  assert.deepEqual(selectPermittedMetadata(input,{allowedFields:['originalTitle'],evidence:''}), {});
  assert.deepEqual(selectPermittedMetadata(input,{allowedFields:['originalTitle','authors'],evidence:'API permission reviewed'}),{originalTitle:'Original',authors:['Writer']});
});
test('moderation requires an allowed transition, actor and reason', async () => {
  const {makeDecision} = await import('../src/lib/novel-requests/core.ts');
  assert.equal(makeDecision('submitted','review','moderator','Initial review','2026-10-28T10:00:00Z').to,'review');
  assert.throws(() => makeDecision('submitted','draft','moderator','skip','2026-10-28T10:00:00Z'));
  assert.throws(() => makeDecision('review','rejected','','reason','2026-10-28T10:00:00Z'));
  assert.throws(() => makeDecision('review','rejected','mod',' ','2026-10-28T10:00:00Z'));
});
