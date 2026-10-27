import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChapter, validateBody, validateSerials } from '../scripts/serial-manuscript.mjs';
test('chapter minimum includes spaces and Unicode characters, but exclude title and metadata', () => {
  const source = '---\nnumber: 1\ntitle: "An excluded title"\n---\n' + 'a '.repeat(1999) + '中🌍\n';
  const chapter = parseChapter(source);
  assert.equal(validateBody(chapter.body), 4000);
  assert.equal(validateBody('a'.repeat(5090)), 5090);
  assert.throws(() => validateBody('a'.repeat(3999)));
  assert.equal(validateBody('a'.repeat(5091)), 5091);
  assert.equal(validateBody('a'.repeat(12000)), 12000);
});
test('the published chapters satisfy the minimum length and the 50-chapter serial cap', async () => {
  const report = await validateSerials();
  assert.equal(report[0].planned, 247);
  assert.ok(report[0].written > 0 && report[0].written <= 50);
  assert.ok(report.find(s => s.slug === 'comprehension-against-the-heavens')?.chapters.every(c => c.characters >= 4000));
});
