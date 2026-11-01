import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConfig, licenseValid, sourceCanImport, providerUrl, chapterUrl,
  validateFeed, validateFullChapter, syncLicensedSource,
} from '../scripts/chapter-sync-core.mjs';

const raw = {
  slug: 'licensed-novel',
  baseUrl: 'https://api.publisher.org',
  listPath: '/v1/novels/licensed-novel/chapters',
  chapterPathPrefix: '/v1/chapters/',
  apiAccessConfirmed: true,
  republicationConfirmed: true,
  translationConfirmed: true,
  licenseReference: 'Signed publishing agreement ref 2026-10-01',
  licenseExpires: '2099-12-31',
};
const source = validateConfig({ sources: [raw] })[0];
const original = {
  id: '00000000-0000-4000-a000-000000000001',
  slug: 'licensed-novel',
  rights_status: 'verified',
  rights_evidence: 'Signed licensing grant on file at editorial office',
  verified_at: '2026-10-01T00:00:00Z',
  permission_translate: true,
  permission_publish: true,
  rights_valid_until: '2099-12-31',
};
const mk = (n) => ({ id: 'item-' + n, number: n, title: 'Глава ' + n });
const body = (meta) => ({ id: meta.id, number: meta.number, text: 'Авторизованный текст главы. '.repeat(7) });

test('requires documented license, safe URL and a unique source slug', () => {
  assert.equal(validateConfig({ sources: [] }).length, 0);
  assert.throws(() => validateConfig({ sources: [raw, raw] }), /duplicate/);
  assert.throws(() => validateConfig({ sources: [{ ...raw, apiAccessConfirmed: false }] }), /rights/);
  assert.throws(() => validateConfig({ sources: [{ ...raw, baseUrl: 'http://api.publisher.org' }] }), /HTTPS/);
  assert.throws(() => validateConfig({ sources: [{ ...raw, baseUrl: 'https://localhost' }] }), /HTTPS/);
  assert.throws(() => validateConfig({ sources: [{ ...raw, baseUrl: 'https://wtr-lab.com' }] }), /HTTPS/);
  assert.throws(() => validateConfig({ sources: [{ ...raw, chapterPathPrefix: '//other/' }] }), /path/);
  assert.throws(() => validateConfig({ sources: [{ ...raw, licenseExpires: '2026-02-30' }] }), /rights/);
  assert.equal(licenseValid(source, '2026-11-01'), true);
  assert.equal(licenseValid(source, '2100-01-01'), false);
  assert.equal(sourceCanImport(source, original, '2026-11-01'), true);
  assert.equal(sourceCanImport(source, { ...original, rights_status: 'revoked' }, '2026-11-01'), false);
  assert.equal(sourceCanImport(source, { ...original, permission_publish: false }, '2026-11-01'), false);
});

test('provider paths cannot redirect to another origin', () => {
  assert.equal(chapterUrl(source, 'item-2'), 'https://api.publisher.org/v1/chapters/item-2');
  assert.equal(providerUrl(source, source.listPath, 'abc&next=1'),
    'https://api.publisher.org/v1/novels/licensed-novel/chapters?cursor=abc%26next%3D1');
  assert.throws(() => chapterUrl(source, '../secrets'), /ID/);
  assert.throws(() => providerUrl(source, '//other-host/file'), /path/);
});

test('rejects duplicate and malformed chapters and inconsistent bodies', () => {
  assert.deepEqual(validateFeed({ chapters: [mk(1)], next_cursor: null }).chapters[0], {
    id: 'item-1', number: 1, title: 'Глава 1',
    description: 'Глава 1 из лицензированного источника.',
  });
  assert.throws(() => validateFeed({ chapters: [mk(1), mk(1)] }), /Repeated/);
  assert.throws(() => validateFeed({ chapters: [mk(1)], next_cursor: {} }), /cursor/);
  assert.throws(() => validateFeed({ chapters: [{ ...mk(1), number: 0 }] }), /metadata/);
  assert.throws(() => validateFullChapter(body(mk(1)), mk(2)), /match/);
  assert.throws(() => validateFullChapter({ ...body(mk(1)), text: '<script>bad</script>' }, mk(1)), /body|plain-text/);
  assert.equal(validateFullChapter(body(mk(1)), mk(1)).status, 'draft');
  assert.equal(validateFullChapter(body(mk(1)), mk(1)).translated_text, '');
});

test('dry run discovers chapters without fetching bodies or changing Supabase', async () => {
  let writes = 0;
  let reads = 0;
  const adapter = {
    readSource: async () => original,
    listPage: async () => ({ chapters: [mk(1), mk(2), mk(3)], next_cursor: null }),
    existingNumbers: async () => new Set([2]),
    loadChapter: async () => { reads++; throw new Error('must not read body'); },
    insertDraft: async () => { writes++; return true; },
  };
  const result = await syncLicensedSource(source, adapter, { dryRun: true, now: '2026-11-01' });
  assert.deepEqual(result, {
    slug: 'licensed-novel', discovered: 2, imported: 0, existing: 1,
    truncated: false, dryRun: true,
  });
  assert.equal(writes, 0);
  assert.equal(reads, 0);
});

test('imports three chapters exactly once and never auto-approves', async () => {
  const records = new Map([[1, { status: 'published' }]]);
  const pages = [
    { chapters: [mk(1), mk(2)], next_cursor: 'page2' },
    { chapters: [mk(3), mk(4)], next_cursor: null },
  ];
  let insertions = 0;
  const adapter = {
    readSource: async () => ({ ...original }),
    listPage: async (_s, cursor) => pages[cursor ? 1 : 0],
    existingNumbers: async (_id, nums) => new Set(nums.filter(n => records.has(n))),
    loadChapter: async (_s, id) => body({ id, number: Number(id.replace('item-', '')) }),
    insertDraft: async (_id, chapter) => {
      if (records.has(chapter.chapter_number)) return false;
      assert.equal(chapter.status, 'draft');
      assert.equal(chapter.translated_text, '');
      records.set(chapter.chapter_number, chapter);
      insertions++;
      return true;
    },
  };
  const first = await syncLicensedSource(source, adapter, { dryRun: false, now: '2026-11-01' });
  assert.equal(first.imported, 3);
  assert.equal(first.existing, 1);
  const second = await syncLicensedSource(source, adapter, { dryRun: false, now: '2026-11-01' });
  assert.equal(second.imported, 0);
  assert.equal(second.existing, 4);
  assert.equal(insertions, 3);
});

test('revoked rights stop imports immediately before storing text', async () => {
  let reads = 0;
  let writes = 0;
  const adapter = {
    readSource: async () => (++reads >= 3 ? { ...original, rights_status: 'revoked' } : original),
    listPage: async () => ({ chapters: [mk(1)], next_cursor: null }),
    existingNumbers: async () => new Set(),
    loadChapter: async () => body(mk(1)),
    insertDraft: async () => { writes++; return true; },
  };
  await assert.rejects(
    () => syncLicensedSource(source, adapter, { dryRun: false, now: '2026-11-01' }),
    /rights changed/,
  );
  assert.equal(writes, 0);
});

test('prevents cursor loops and bounds work per execution', async () => {
  const adapter = {
    readSource: async () => original,
    listPage: async () => ({ chapters: [], next_cursor: 'same' }),
    existingNumbers: async () => new Set(),
  };
  await assert.rejects(
    () => syncLicensedSource(source, adapter, { now: '2026-11-01' }),
    /cursor/,
  );
});
