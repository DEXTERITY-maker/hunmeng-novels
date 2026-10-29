import test from 'node:test';
import assert from 'node:assert/strict';
import { personalTermPrefix, readPersonalTerms, removePersonalTerm, replacePersonalTerms,
  savePersonalTerm, PERSONAL_TERMS_LIMIT } from '../src/lib/personal-terms.ts';

function storage() {
  const map = new Map();
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
    getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key) };
}

test('exact replacements are literal, longest-first and never applied recursively', () => {
  assert.equal(replacePersonalTerms('A+B AB A+B', [{ from: 'A+B', to: 'AB' }, { from: 'AB', to: '<b>new</b>' }]), 'AB <b>new</b> AB');
  assert.equal(replacePersonalTerms('Anna Ann anna', [{ from: 'Ann', to: 'X' }, { from: 'Anna', to: 'Y' }]), 'Y X anna');
  assert.equal(replacePersonalTerms('same', []), 'same');
});

test('replacements are separate by novel and preserve other local data', () => {
  const s = storage();
  s.setItem('hunmeng-novels:v1', '{"existing":"progress"}');
  savePersonalTerm(s, 'novel-one', { from: 'Ilya', to: 'Mira' });
  savePersonalTerm(s, 'novel-two', { from: 'Ilya', to: 'Lena' });
  savePersonalTerm(s, 'novel-one', { from: 'Ilya', to: 'Anna' });
  assert.deepEqual(readPersonalTerms(s, 'novel-one'), [{ from: 'Ilya', to: 'Anna' }]);
  assert.deepEqual(readPersonalTerms(s, 'novel-two'), [{ from: 'Ilya', to: 'Lena' }]);
  removePersonalTerm(s, 'novel-one', 'Ilya');
  assert.deepEqual(readPersonalTerms(s, 'novel-one'), []);
  assert.equal(s.getItem('hunmeng-novels:v1'), '{"existing":"progress"}');
  assert.equal(readPersonalTerms(s, 'novel-two').length, 1);
});

test('invalid or malformed input is ignored, limited, and never deletes other data', () => {
  const s = storage(), prefix = personalTermPrefix('novel-one');
  s.setItem(prefix + 'bad', '{bad');
  s.setItem(prefix + 'mismatch', JSON.stringify({ from: 'other', to: 'Y' }));
  assert.deepEqual(readPersonalTerms(s, 'novel-one'), []);
  assert.throws(() => savePersonalTerm(s, 'bad/slug', { from: 'A', to: 'B' }));
  assert.throws(() => savePersonalTerm(s, 'novel-one', { from: '', to: 'B' }));
  assert.throws(() => savePersonalTerm(s, 'novel-one', { from: 'A\nB', to: 'B' }));
  for (let i = 0; i < PERSONAL_TERMS_LIMIT; i++) savePersonalTerm(s, 'novel-one', { from: `A${i}`, to: 'B' });
  assert.throws(() => savePersonalTerm(s, 'novel-one', { from: 'overflow', to: 'B' }));
  savePersonalTerm(s, 'novel-one', { from: 'A0', to: 'C' });
  assert.equal(readPersonalTerms(s, 'novel-one').length, PERSONAL_TERMS_LIMIT);
  assert.equal(s.getItem(prefix + 'bad'), '{bad');
});
