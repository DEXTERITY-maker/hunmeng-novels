import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateSerials } from '../scripts/serial-manuscript.mjs';

const importer = fileURLToPath(new URL('../scripts/import-public-domain.mjs', import.meta.url));
const workflow = fileURLToPath(new URL('../.github/workflows/test-public-domain.yml', import.meta.url));
const revision = 'a'.repeat(40);
const books = Array.from({ length: 10 }, (_, index) => ({
  slug: `fixture-book-${index + 1}`,
  repo: `fixture_book_${index + 1}`,
  sha: revision,
  url: `https://standardebooks.org/ebooks/fixture/book-${index + 1}`,
  title: `Fixture Book ${index + 1}`,
  author: 'Alex Fixture',
  originalPublicationYear: 1900,
  authorDeathYear: 1940,
  description: 'A fictional public-domain fixture used to test the complete import process.',
  genres: ['Fantasy'],
  tags: [],
}));

function workspace(t, options = {}) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hunmeng-import-fixture-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const root = path.join(temporary, 'workspace');
  const upstream = path.join(temporary, 'upstream');
  const bin = path.join(temporary, 'bin');
  const log = path.join(temporary, 'git.log');
  const selected = options.books ?? books;
  const write = (file, contents) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  };

  write(path.join(root, 'src/data/public-domain-seed.json'), JSON.stringify({ maxBooksPerRun: 10, books: selected }));
  write(path.join(root, 'src/data/serials.json'), '[]');
  write(path.join(upstream, 'LICENSE.md'), options.license ?? 'This fixture is public domain. Editorial work is CC0.');
  const items = [1, 2, 3].map(n => `<item id="c${n}" href="text/chapter-${n}.xhtml"/>`).join('\n');
  const spine = [1, 2, 3].map(n => `<itemref idref="c${n}"/>`).join('\n');
  write(path.join(upstream, 'src/epub/content.opf'),
    `<package><metadata><dc:language>${options.language ?? 'en'}</dc:language>` +
    `<dc:creator>${options.creator ?? 'Alex Fixture'}</dc:creator></metadata>` +
    `<manifest>${items}</manifest><spine>${spine}</spine></package>`);
  const prose = [1, 2, 3].map(n => `Fixture chapter ${n}. ` + 'A local fixture sentence for readers. '.repeat(options.short ? 1 : 450));
  prose.forEach((text, i) => write(path.join(upstream, `src/epub/text/chapter-${i + 1}.xhtml`),
    `<html><body><p>${text}</p></body></html>`));

  // The importer executes this local stub in place of git. No test can contact GitHub.
  write(path.join(bin, 'git'), `#!${process.execPath}\n` + String.raw`
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'clone') {
  if (!/^https:\/\/github\.com\/standardebooks\/[a-z0-9_-]+\.git$/.test(args.at(-2))) {
    throw new Error('Unexpected source URL');
  }
  fs.cpSync(process.env.HUNMENG_TEST_UPSTREAM, args.at(-1), { recursive: true });
  fs.appendFileSync(process.env.HUNMENG_TEST_GIT_LOG, 'clone\n');
} else if (args[0] === '-C' && args[2] === 'sparse-checkout') {
  // The fixture already has only the files needed by the importer.
} else if (args[0] === '-C' && args[2] === 'rev-parse' && args[3] === 'HEAD') {
  process.stdout.write(process.env.HUNMENG_TEST_HEAD + '\n');
} else {
  throw new Error('Unexpected git command');
}
`);
  fs.chmodSync(path.join(bin, 'git'), 0o755);

  const existing = options.existing ?? [];
  for (const book of existing) {
    write(path.join(root, 'src/content/novels', `${book.slug}.json`), `existing novel ${book.slug}\n`);
    write(path.join(root, 'src/content/glossaries', `${book.slug}.json`), `existing glossary ${book.slug}\n`);
    write(path.join(root, 'src/content/chapters', book.slug, 'chapter-1.md'), `existing chapter ${book.slug}\n`);
  }

  const run = (extraEnv = {}) => execFileSync(process.execPath, [importer], {
    cwd: root,
    env: { ...process.env, PATH: bin, HUNMENG_PUBLIC_DOMAIN_LIMIT: '10',
      HUNMENG_TEST_UPSTREAM: upstream, HUNMENG_TEST_GIT_LOG: log,
      HUNMENG_TEST_HEAD: revision, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { root, log, prose, selected, run };
}

function snapshot(root, relative = 'src/content') {
  const folder = path.join(root, relative);
  if (!fs.existsSync(folder)) return {};
  const result = {};
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) Object.assign(result, snapshot(root, name));
    else result[name] = createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
  }
  return result;
}

function importedBooks(root) {
  const folder = path.join(root, 'src/content/novels');
  return fs.existsSync(folder) ? fs.readdirSync(folder).filter(name => name.endsWith('.json')).sort() : [];
}

function importedText(root, book) {
  const folder = path.join(root, 'src/content/chapters', book.slug);
  return fs.readdirSync(folder)
    .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
    .map(name => fs.readFileSync(path.join(folder, name), 'utf8').split('\n---\n')[1])
    .join('').replace(/\s+/g, '');
}

test('an empty catalog imports all ten complete books and a repeat changes nothing', async t => {
  const fixture = workspace(t);
  assert.match(fixture.run(), /TOTAL_NEW_BOOKS=10/);
  assert.equal(importedBooks(fixture.root).length, 10);
  const expectedText = fixture.prose.join('').replace(/\s+/g, '');
  const validation = await validateSerials(fixture.root);
  assert.equal(validation.length, 10);
  for (const book of books) {
    assert.equal(importedText(fixture.root, book), expectedText);
    const novel = JSON.parse(fs.readFileSync(path.join(fixture.root, 'src/content/novels', `${book.slug}.json`), 'utf8'));
    const glossary = JSON.parse(fs.readFileSync(path.join(fixture.root, 'src/content/glossaries', `${book.slug}.json`), 'utf8'));
    assert.equal(novel.slug, book.slug);
    assert.equal(novel.originalUrl, book.url);
    assert.deepEqual(glossary, { novelSlug: book.slug, terms: [] });
  }
  const before = snapshot(fixture.root);
  assert.match(fixture.run(), /TOTAL_NEW_BOOKS=0/);
  assert.deepEqual(snapshot(fixture.root), before);
  assert.equal(fs.readFileSync(fixture.log, 'utf8').trim().split('\n').length, 10);
});

test('a partially filled catalog imports only missing books without altering existing material', t => {
  const existing = books.slice(0, 4);
  const fixture = workspace(t, { existing });
  const before = snapshot(fixture.root);
  assert.match(fixture.run(), /TOTAL_NEW_BOOKS=6/);
  assert.equal(importedBooks(fixture.root).length, 10);
  const after = snapshot(fixture.root);
  for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, file);
  const expectedText = fixture.prose.join('').replace(/\s+/g, '');
  for (const book of books.slice(4)) assert.equal(importedText(fixture.root, book), expectedText);
  assert.equal(fs.readFileSync(fixture.log, 'utf8').trim().split('\n').length, 6);
  assert.match(fixture.run(), /TOTAL_NEW_BOOKS=0/);
  assert.deepEqual(snapshot(fixture.root), after);
});

test('a full catalog creates no new files and leaves novels and chapters untouched', t => {
  const fixture = workspace(t, { existing: books });
  const before = snapshot(fixture.root);
  assert.match(fixture.run(), /TOTAL_NEW_BOOKS=0/);
  assert.deepEqual(snapshot(fixture.root), before);
  assert.equal(importedBooks(fixture.root).length, 10);
  assert.equal(fs.existsSync(fixture.log), false);
});

test('the per-run limit still applies to a partially filled catalog', t => {
  const fixture = workspace(t, { existing: books.slice(0, 4) });
  assert.match(fixture.run({ HUNMENG_PUBLIC_DOMAIN_LIMIT: '2' }), /TOTAL_NEW_BOOKS=2/);
  assert.equal(importedBooks(fixture.root).length, 6);
});

test('a mismatched pinned revision is rejected before content is written', t => {
  const fixture = workspace(t, { books: books.slice(0, 1) });
  assert.throws(() => fixture.run({ HUNMENG_TEST_HEAD: 'b'.repeat(40) }), /Pinned revision changed/);
  assert.deepEqual(snapshot(fixture.root), {});
});

for (const [label, options, error] of [
  ['a missing public-domain declaration', { license: 'Editorial work is CC0.' }, /No public-domain\/CC0 statement/],
  ['a missing CC0 declaration', { license: 'This fixture is public domain.' }, /No public-domain\/CC0 statement/],
  ['a non-English edition', { language: 'fr' }, /Only original English language sources/],
  ['a mismatched author', { creator: 'Someone Else' }, /Author mismatch/],
  ['an incomplete source', { short: true }, /Book text too short/],
]) {
  test(`rejects ${label} before writing content`, t => {
    const fixture = workspace(t, { ...options, books: books.slice(0, 1) });
    assert.throws(() => fixture.run(), error);
    assert.deepEqual(snapshot(fixture.root), {});
  });
}

for (const [label, changes] of [
  ['an ineligible author', { authorDeathYear: 1951 }],
  ['an unapproved source URL', { url: 'https://example.test/ebooks/unauthorized' }],
  ['an unsafe book slug', { slug: '../unauthorized' }],
  ['an unsafe repository name', { repo: '../unauthorized' }],
  ['a malformed pinned SHA', { sha: 'not-a-sha' }],
]) {
  test(`rejects ${label} before fetching or writing`, t => {
    const fixture = workspace(t, { books: [{ ...books[0], ...changes }] });
    assert.throws(() => fixture.run(), /Unreviewed public domain record/);
    assert.deepEqual(snapshot(fixture.root), {});
    assert.equal(fs.existsSync(fixture.log), false);
  });
}

test('duplicate manifest slugs are rejected before fetching or writing', t => {
  const fixture = workspace(t, { books: [books[0], books[0]] });
  assert.throws(() => fixture.run(), /Bad or duplicate public-domain manifest/);
  assert.deepEqual(snapshot(fixture.root), {});
  assert.equal(fs.existsSync(fixture.log), false);
});

test('an invalid per-run limit is rejected before fetching or writing', t => {
  const fixture = workspace(t);
  assert.throws(() => fixture.run({ HUNMENG_PUBLIC_DOMAIN_LIMIT: '11' }), /Daily cap invalid/);
  assert.deepEqual(snapshot(fixture.root), {});
  assert.equal(fs.existsSync(fixture.log), false);
});

test('an existing chapter directory without novel metadata is never overwritten', t => {
  const fixture = workspace(t, { books: books.slice(0, 1) });
  const chapter = path.join(fixture.root, 'src/content/chapters', books[0].slug, 'chapter-1.md');
  fs.mkdirSync(path.dirname(chapter), { recursive: true });
  fs.writeFileSync(chapter, 'pre-existing chapter\n');
  const before = snapshot(fixture.root);
  assert.throws(() => fixture.run(), /Chapter slug conflict/);
  assert.deepEqual(snapshot(fixture.root), before);
  assert.equal(fs.existsSync(fixture.log), false);
});

test('the pull request workflow runs offline import fixtures without assuming ten new files', () => {
  const source = fs.readFileSync(workflow, 'utf8');
  assert.match(source, /- 'tests\/public-domain-import\*\.test\.mjs'/);
  assert.match(source, /node --test tests\/public-domain-import\*\.test\.mjs/);
  assert.doesNotMatch(source, /git ls-files --others --exclude-standard src\/content\/novels/);
  assert.doesNotMatch(source, /run:\s*node scripts\/import-public-domain\.mjs/);
});
