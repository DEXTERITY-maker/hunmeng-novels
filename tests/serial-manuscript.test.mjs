import test from 'node:test';
import assert from 'node:assert/strict';
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
test('withdrawn originals are absent; remaining serials satisfy chapter validation', async () => {
  const report = await validateSerials();
  for (const slug of ['comprehension-against-the-heavens', 'the-latency-of-tomorrow'])
    assert.equal(report.some(item => item.slug === slug), false);
  for (const serial of report) {
    assert.ok(serial.chapters.every(chapter => chapter.characters >= 4000 && chapter.characters <= 8500));
    if (serial.planned !== null) assert.ok(serial.written <= serial.planned);
  }
});
