import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkCandidateIndex } from '../src/lib/novel-requests/matching-index.ts';
import { findMatches } from '../src/lib/novel-requests/core.ts';

const work = (id, values = {}) => ({ id, titles: [], authors: [], sources: [], chapters: [], ...values });
const chapters = [
  { number: 1, title: 'The hidden garden opens' },
  { number: 2, title: 'A promise in the rain' },
  { number: 3, title: 'The lantern at midnight' },
];
const source = { provider: 'fixture', externalId: '42', url: 'https://fixture.test/work/42' };

test('index retains source, alias/author and three-chapter candidates without scanning unrelated works', async () => {
  const unrelated = Array.from({ length: 1000 }, (_, i) => work(`other-${i}`, { titles: [`Different ${i}`], authors: [`Author ${i}`] }));
  const catalog = [...unrelated, work('source', { sources: [source] }),
    work('alias', { titles: ['Another name', 'Ａ Story'], authors: ['A Writer'] }),
    work('chapters', { chapters })];
  const input = work('request', { titles: ['a story'], authors: ['A. Writer'], sources: [source], chapters });
  const index = createWorkCandidateIndex(catalog);
  const candidates = await index.reader().works(input);
  assert.equal(candidates.length, 3);
  assert.deepEqual(findMatches(input, candidates), findMatches(input, catalog));
});

test('index does not treat repeated or generic chapter names as independent evidence', () => {
  const generic = [1, 2, 3].map(number => ({ number, title: `Chapter ${number}` }));
  const catalog = [work('generic', { chapters: generic }), work('repeated', { chapters })];
  const index = createWorkCandidateIndex(catalog);
  assert.deepEqual(index.candidates(work('query', { chapters: generic })), []);
  assert.deepEqual(index.candidates(work('query', { chapters: [chapters[0], chapters[0], chapters[0]] })), []);
});

test('indexed search matches exhaustive results for mixed deterministic fixtures', () => {
  const catalog = Array.from({ length: 250 }, (_, i) => work(`w-${i}`, {
    titles: [`title ${i % 43}`, `alias ${i % 37}`], authors: [`writer ${i % 29}`],
    sources: [{ provider: `source-${i % 4}`, externalId: `${i % 73}`, url: 'https://fixture.test/' }],
    chapters: chapters.map((chapter, n) => ({ number: n + 1, title: `${chapter.title} group ${i % 19}` })),
  }));
  const index = createWorkCandidateIndex(catalog);
  for (let i = 0; i < 250; i++) {
    const input = work(`new-${i}`, { titles: [`alias ${i % 37}`], authors: [`writer ${i % 29}`],
      sources: i % 3 ? [] : [{ provider: `source-${i % 4}`, externalId: `${i % 73}`, url: 'https://fixture.test/' }],
      chapters: i % 2 ? [] : catalog[i].chapters });
    assert.deepEqual(findMatches(input, index.candidates(input)), findMatches(input, catalog), `fixture ${i}`);
  }
});

test('snapshot cannot be changed by mutations to source or returned candidate data', () => {
  const catalog = [work('known', { titles: ['Original'], authors: ['Writer'] })];
  const index = createWorkCandidateIndex(catalog);
  const input = work('new', { titles: ['Original'], authors: ['Writer'] });
  catalog[0].titles[0] = 'Changed';
  const first = index.candidates(input);
  first[0].titles[0] = 'Also changed';
  assert.equal(index.candidates(input)[0].titles[0], 'Original');
});
