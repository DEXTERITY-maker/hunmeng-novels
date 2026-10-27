import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseChapter, validateBody, validateSerials } from '../scripts/serial-manuscript.mjs';
test('chapter length limits include spaces and Unicode characters, but exclude title and metadata', () => {
  const source = '---\nnumber: 1\ntitle: "An excluded title"\n---\n' + 'a '.repeat(1999) + '中🌍\n';
  const chapter = parseChapter(source);
  assert.equal(validateBody(chapter.body), 4000);
  assert.equal(validateBody('a'.repeat(5090)), 5090);
  assert.throws(() => validateBody('a'.repeat(3999)));
  assert.equal(validateBody('a'.repeat(5091)), 5091);
  assert.equal(validateBody('a'.repeat(8500)), 8500);
  assert.throws(() => validateBody('a'.repeat(8501)));
});
test('the published chapters satisfy the 4000–8500 length limits and the configured serial release cap', async () => {
  const report = await validateSerials();
  assert.equal(report[0].planned, 247);
  const serials = JSON.parse(await readFile(new URL('../src/data/serials.json', import.meta.url), 'utf8'));
  const plan = serials.find(s => s.slug === 'the-latency-of-tomorrow');
  const published = report.find(s => s.slug === plan.slug);
  assert.ok(published.written > 0 && published.written <= plan.initialChapters);
  assert.ok(report.find(s => s.slug === 'comprehension-against-the-heavens')?.chapters.every(c => c.characters >= 4000 && c.characters <= 8500));
});
