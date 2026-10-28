import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Candidate definitions only: deployment and XP continue to use the existing
// reader-progression.ts / Supabase functions until a separately reviewed rollout.
const draft = JSON.parse(readFileSync(new URL('../src/data/ranks-v2.json', import.meta.url), 'utf8'));
const ranks = draft.ranks;

test('v2 rank proposal covers all 500 levels without overlaps or gaps', () => {
  assert.equal(draft.maxLevel, 500);
  assert.equal(ranks.length, 13);
  assert.equal(ranks[0].min, 1);
  assert.equal(ranks.at(-1).max, draft.maxLevel);
  assert.equal(new Set(ranks.map(rank => rank.id)).size, ranks.length);
  for (let i = 0; i < ranks.length; i++) {
    const rank = ranks[i];
    assert.ok(rank.id && rank.en && rank.ru && rank.accent);
    assert.ok(Number.isInteger(rank.min) && Number.isInteger(rank.max));
    assert.ok(rank.min <= rank.max);
    if (i > 0) assert.equal(ranks[i-1].max + 1, rank.min);
  }
  const coverage = ranks.flatMap(rank => Array.from({length: rank.max - rank.min + 1}, (_, n) => rank.min + n));
  assert.equal(coverage.length, 500);
  assert.deepEqual(coverage, Array.from({length:500}, (_, i) => i + 1));
});

test('agreed milestone order and boundary transitions', () => {
  const lookup = level => ranks.find(rank => level >= rank.min && level <= rank.max)?.id;
  const transitions = [
    [1, 'wood'], [24, 'wood'], [25, 'iron'], [49, 'iron'],
    [50, 'bronze'], [74, 'bronze'], [75, 'silver'], [99, 'silver'],
    [100, 'gold'], [124, 'gold'], [125, 'dark-gold'], [149, 'dark-gold'],
    [150, 'platinum'], [199, 'platinum'], [200, 'titanium'], [249, 'titanium'],
    [250, 'emerald'], [299, 'emerald'], [300, 'sapphire'], [349, 'sapphire'],
    [350, 'diamond'], [399, 'diamond'], [400, 'legendary'],
    [449, 'legendary'], [450, 'mythical'], [500, 'mythical'],
  ];
  for (const [level, expected] of transitions) assert.equal(lookup(level), expected, 'level ' + level);
  assert.equal(ranks.findIndex(r => r.id === 'dark-gold') + 1,
               ranks.findIndex(r => r.id === 'platinum'));
});
