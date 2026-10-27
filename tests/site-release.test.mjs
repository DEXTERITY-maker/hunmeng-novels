import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('reader-facing release v0.1.0 has the correct version, category, date and real links', async () => {
  const [note, pkgText, lockText, versionRoute, homeText] = await Promise.all([
    fs.readFile('src/content/news/hunmeng-v0-1-0.md', 'utf8'),
    fs.readFile('package.json', 'utf8'),
    fs.readFile('package-lock.json', 'utf8'),
    fs.readFile('src/pages/version.json.ts', 'utf8'),
    fs.readFile('src/pages/index.astro', 'utf8'),
  ]);
  const pkg = JSON.parse(pkgText);
  const lock = JSON.parse(lockText);
  assert.equal(pkg.version, '0.1.0');
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.match(note, /^---\ntitle: "Hunmeng v0\.1\.0 — a new chapter for the website"/);
  assert.match(note, /^category: changelog$/m);
  assert.match(note, /^publishedAt: "2026-10-27"$/m);
  assert.match(note, /^order: 100$/m);
  assert.match(note, /\[Explore the catalog\]\(\/catalog\/\)/);
  assert.match(note, /\[Open your profile\]\(\/account\/\)/);
  assert.match(note, /#profile-reading|Reading settings/);
  assert.match(note, /remain stored in this browser/);
  assert.match(versionRoute, /import \{ version \} from '\.\.\/\.\.\/package\.json'/);
  assert.match(homeText, /getNews\(\)\)\.slice\(0, 3\)/);
  const frontmatter = note.split('---')[1];
  const excerpt = frontmatter.match(/^excerpt: "(.+)"$/m)?.[1];
  assert.ok(excerpt && excerpt.length >= 25 && excerpt.length <= 240);
});
