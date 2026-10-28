import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canPreparePublication } from '../src/lib/novel-requests/core.ts';
import {
  PENDING_RIGHTS,
  buildDraft,
  describeMatches,
  moderate,
  runPrototypeScenario,
  submitRequest,
} from '../src/lib/novel-requests/scenario.ts';
import {
  FIXTURE_TODAY,
  fixtureAdapter,
  fixtureCatalog,
  fixtureConfig,
  fixtureModeration,
  fixtureRequests,
} from '../src/lib/novel-requests/prototype-fixtures.ts';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenario = (input, steps = fixtureModeration) =>
  runPrototypeScenario(input, fixtureConfig, steps, FIXTURE_TODAY);

test('unsupported or invalid URLs are rejected before matching', () => {
  const rejectedInputs = [
    fixtureRequests.unsupportedHost,
    fixtureRequests.unsupportedPath,
    { ...fixtureRequests.exact, url: 'http://fiction-archive.test/work/4242' },
    { ...fixtureRequests.exact, url: 'https://fiction-archive.test:8443/work/4242' },
    { ...fixtureRequests.exact, url: 'https://reader@fiction-archive.test/work/4242' },
    { ...fixtureRequests.exact, url: 'https://fiction-archive.test/work/42x' },
    { ...fixtureRequests.exact, url: `https://fiction-archive.test/work/4242/${'x'.repeat(2100)}` },
  ];
  for (const input of rejectedInputs) {
    const result = scenario(input);
    assert.equal(result.kind, 'rejected');
    assert.equal(result.request.reason, 'unsupported-or-invalid-url');
    assert.equal(result.draft, null);
  }
  assert.deepEqual(describeMatches([]), []);
});

test('exact duplicate is explained by recognized provider and external ID', () => {
  const result = scenario(fixtureRequests.exact);
  assert.equal(result.kind, 'draft');
  const exact = result.request.matches.find(match => match.workId === 'work-lantern');
  assert.ok(exact);
  assert.equal(exact.kind, 'exact');
  assert.ok(exact.reasons.includes('Same recognized source and external ID'));
  assert.equal(result.request.source.provider, 'fiction-archive');
  assert.equal(result.request.source.externalId, '4242');
});

test('probable duplicate is explained by title and author, never upgraded to exact', () => {
  const result = scenario(fixtureRequests.probable);
  assert.equal(result.kind, 'draft');
  const probable = result.request.matches.find(match => match.workId === 'work-lantern');
  assert.ok(probable);
  assert.equal(probable.kind, 'probable');
  assert.ok(probable.reasons.includes('Matching original or alternative title'));
  assert.ok(probable.reasons.includes('Matching author'));
  assert.ok(!probable.reasons.includes('Same recognized source and external ID'));
});

test('similar chapter titles stay advisory and never merge works', () => {
  const before = structuredClone(fixtureCatalog);
  const result = scenario(fixtureRequests.chapters);
  assert.equal(result.kind, 'draft');
  const probable = result.request.matches.find(match => match.workId === 'work-lantern');
  assert.ok(probable);
  assert.equal(probable.kind, 'probable');
  assert.ok(probable.reasons.some(reason => /matching numbered chapter titles/.test(reason)));
  assert.equal(result.request.mergePerformed, false);
  assert.equal(result.draft.mergePerformed, false);
  assert.deepEqual(structuredClone(fixtureCatalog), before, 'catalog must stay unchanged');
  assert.equal(fixtureCatalog.length, before.length);
});

test('moderation rejects missing moderator, empty reason and invalid transitions', () => {
  const recognized = submitRequest(fixtureRequests.exact, fixtureConfig);
  assert.equal(recognized.kind, 'recognized');
  assert.throws(() => moderate(recognized, []), /At least one moderation step/);
  assert.throws(
    () =>
      moderate(recognized, [
        { actorId: '', to: 'review', reason: 'review', at: '2026-10-28T10:00:00Z' },
      ]),
    /Invalid moderation decision/,
  );
  assert.throws(
    () =>
      moderate(recognized, [
        { actorId: 'moderator', to: 'review', reason: ' ', at: '2026-10-28T10:00:00Z' },
      ]),
    /Invalid moderation decision/,
  );
  assert.throws(
    () =>
      moderate(recognized, [
        { actorId: 'moderator', to: 'draft', reason: 'skip review', at: '2026-10-28T10:00:00Z' },
      ]),
    /Invalid moderation decision/,
  );
});

test('a draft never receives verified rights and never passes the publication gate', () => {
  const result = scenario(fixtureRequests.exact);
  assert.equal(result.kind, 'draft');
  assert.equal(result.draft.rights.status, 'pending');
  assert.equal(result.draft.rights.evidence, '');
  assert.equal(result.draft.rights.verifiedBy, null);
  assert.equal(result.draft.rights.translate, false);
  assert.equal(result.draft.rights.publish, false);
  assert.equal(result.draft.canPreparePublication, false);
  assert.equal(result.draft.publicationAllowed, false);
  assert.equal(canPreparePublication(result.draft.rights, FIXTURE_TODAY), false);
  assert.deepEqual(PENDING_RIGHTS, {
    status: 'pending',
    evidence: '',
    verifiedBy: null,
    validUntil: null,
    translate: false,
    publish: false,
  });
});

test('only explicitly permitted metadata is carried into the draft; no texts or covers', () => {
  const result = scenario({
    ...fixtureRequests.exact,
    metadata: {
      ...fixtureRequests.exact.metadata,
      description: 'Should be dropped',
      cover: 'https://fiction-archive.test/covers/4242.webp',
      originalText: 'Full chapter body should be dropped',
      translatedText: 'Full translation should be dropped',
    },
  });
  assert.equal(result.kind, 'draft');
  assert.deepEqual(Object.keys(result.draft.metadata).sort(), [
    'authors',
    'chapterTitles',
    'originalTitle',
  ]);
  const serialized = JSON.stringify(result.draft);
  for (const forbidden of ['Should be dropped', 'covers/4242', 'Full chapter body', 'Full translation']) {
    assert.ok(!serialized.includes(forbidden), `draft must not contain ${forbidden}`);
  }
  for (const chapter of result.draft.metadata.chapterTitles) {
    assert.deepEqual(Object.keys(chapter).sort(), ['number', 'title']);
  }
});

test('draft requires the moderated draft state', () => {
  const recognized = submitRequest(fixtureRequests.exact, fixtureConfig);
  assert.equal(recognized.kind, 'recognized');
  assert.throws(() => buildDraft(recognized, FIXTURE_TODAY), /draft state/);
});

test('prototype modules contain no network code', () => {
  const files = [
    'src/lib/novel-requests/scenario.ts',
    'src/lib/novel-requests/prototype-fixtures.ts',
    'scripts/novel-request-prototype.mjs',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    assert.ok(!/\bfetch\s*\(/.test(source), `${file} must not call fetch`);
    assert.ok(!/XMLHttpRequest|node:https?\b|from 'https?'/.test(source), `${file} must not import HTTP clients`);
    assert.ok(!/\.request\s*\(/.test(source), `${file} must not perform HTTP requests`);
  }
  assert.equal(fixtureAdapter.hosts.length, 2);
  assert.ok(fixtureAdapter.hosts.every(host => host.endsWith('.test')));
});

test('local command-line prototype runs on fictional data', () => {
  const output = execFileSync(process.execPath, ['scripts/novel-request-prototype.mjs', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  const payload = JSON.parse(output);
  assert.equal(payload.mode, 'prototype');
  assert.equal(payload.fictional, true);
  assert.equal(payload.networkUsed, false);
  assert.equal(payload.catalogMutated, false);
  assert.equal(payload.results.length, 5);

  const exact = payload.results.find(entry => entry.scenario === 'exact');
  assert.equal(exact.draftProduced, true);
  assert.equal(exact.result.kind, 'draft');
  assert.equal(exact.result.rights.status, 'pending');
  assert.ok(exact.result.matches.some(match => match.kind === 'exact'));

  const invalid = payload.results.find(entry => entry.scenario === 'unsupported-host');
  assert.equal(invalid.draftProduced, false);
  assert.equal(invalid.result.kind, 'rejected');
  assert.equal(invalid.result.reason, 'unsupported-or-invalid-url');

  const humanReadable = execFileSync(
    process.execPath,
    ['scripts/novel-request-prototype.mjs', '--scenario', 'chapters'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  assert.match(humanReadable, /prototype/i);
  assert.match(humanReadable, /No network/);
  assert.match(humanReadable, /merge performed: no/);
  assert.match(humanReadable, /rights=pending/);
});
