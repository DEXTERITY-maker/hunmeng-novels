import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const newsDir = new URL('../src/content/news/', import.meta.url);

test('published release notes use a neutral editorial voice', () => {
  const posts = readdirSync(newsDir).filter(name => name.endsWith('.md'));
  assert.ok(posts.length > 0);
  for (const file of posts) {
    const raw = readFileSync(new URL(file, newsDir), 'utf8');
    const match = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/.exec(raw);
    assert.ok(match, `${file}: valid news frontmatter`);
    if (!/^category:\s*changelog\s*$/m.test(match[1])) continue;
    // Release notes describe shipped features, not the author/assistant's actions.
    const narration = /\b(?:I|we|we've|we're|our)\b/i;
    assert.doesNotMatch(match[1] + '\n' + match[2], narration, `${file}: use “Added”, “Improved”, or “Unchanged” instead of first-person narration`);
  }
});
