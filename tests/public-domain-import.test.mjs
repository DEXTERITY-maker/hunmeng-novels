import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const data = JSON.parse(fs.readFileSync('src/data/public-domain-seed.json', 'utf8'));
test('first batch contains exactly 10 distinct, fully pinned original English classics', () => {
  assert.equal(data.books.length, 10);
  assert.equal(data.maxBooksPerRun, 10);
  assert.equal(new Set(data.books.map(b => b.slug)).size, 10);
  for (const b of data.books) {
    assert.match(b.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(b.repo, /^[a-z0-9_-]+$/);
    assert.match(b.sha, /^[0-9a-f]{40}$/);
    assert.match(b.url, /^https:\/\/standardebooks\.org\/ebooks\//);
    assert.ok(b.originalPublicationYear <= 1930);
    assert.ok(b.authorDeathYear <= 1950);
    assert.ok(b.description.length >= 40);
    assert.ok(b.genres.length > 0);
  }
});
test('native chapter importer and safe workflow are syntactically valid and gated', () => {
  execFileSync(process.execPath, ['--check','scripts/import-public-domain.mjs']);
  const source = fs.readFileSync('scripts/import-public-domain.mjs','utf8');
  const action = fs.readFileSync('.github/workflows/import-public-domain.yml','utf8');
  assert.match(source, /sourceFiles\(dest,b\)/);
  assert.match(source, /source completeness mismatch|Source completeness mismatch/);
  assert.match(source, /No chapter files/);
  assert.match(source, /if\(head!==b\.sha\)/);
  assert.match(source, /CC0/);
  assert.match(action, /group: hunmeng-pages-production/);
  assert.match(action, /npm test/);
  assert.match(action, /npm run build/);
  assert.match(action, /scripts\/validate-serials\.mjs/);
  assert.match(action, /cloudflare\/wrangler-action@v4/);
  assert.doesNotMatch(action, /schedule:|cron:/);
});
