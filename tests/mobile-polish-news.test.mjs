import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const path = 'src/content/news/mobile-browsing-and-reading-2026-10-29.md';

test('mobile refresh announcement is a genuine, newest changelog entry', async () => {
  const text = await readFile(path, 'utf8');
  assert.match(text, /^title: ".{8,}"$/m);
  assert.match(text, /^excerpt: ".{25,240}"$/m);
  assert.match(text, /^category: changelog$/m);
  assert.match(text, /^publishedAt: "2026-10-29"$/m);
  assert.match(text, /^order: 500$/m);
  assert.match(text, /compact mobile home|more compact mobile home|more welcoming home page/i);
  assert.match(text, /Sort by/);
  assert.match(text, /published chapters/i);
  assert.match(text, /reading toolbar/i);
  assert.match(text, /\[Explore the updated catalog\]\(\/catalog\/\)/);
  assert.doesNotMatch(text, /\[.*\]\(\/requests\/\)/);
  const all = await readdir('src/content/news');
  assert.equal(all.filter(name => name === 'mobile-browsing-and-reading-2026-10-29.md').length, 1);
});
