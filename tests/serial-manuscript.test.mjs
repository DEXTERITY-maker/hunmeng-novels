import test from 'node:test';
import assert from 'node:assert/strict';
import { parseChapter, validateBody, validateSerials } from '../scripts/serial-manuscript.mjs';
test('chapter limits include spaces and Unicode characters, but exclude title and metadata', () => {
  const source = '---\nnumber: 1\ntitle: "An excluded title"\n---\n' + 'a '.repeat(1999) + '中🌍\n';
  const chapter = parseChapter(source);
  assert.equal(validateBody(chapter.body), 4000);
  assert.equal(validateBody('a'.repeat(5090)), 5090);
  assert.throws(() => validateBody('a'.repeat(3999)));
  assert.throws(() => validateBody('a'.repeat(5091)));
});
test('the actual published serial chapters satisfy the agreed length and the 50-chapter public cap', async () => {
  const report = await validateSerials();
  assert.equal(report[0].planned, 247);
  assert.ok(report[0].written > 0 && report[0].written <= 50);
});
