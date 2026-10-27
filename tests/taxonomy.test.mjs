import test from 'node:test';
import assert from 'node:assert/strict';
import { getTaxonomy } from '../src/lib/taxonomy.ts';
import reference from '../src/data/taxonomy.json' with { type: 'json' };

test('reference vocabulary has unique names and complete group totals', () => {
  const labels = reference.tagGroups.flatMap(group => group.tags).map(label => label.toLowerCase());
  assert.equal(reference.genres.length, 40);
  assert.equal(reference.tagGroups.length, 11);
  assert.equal(reference.source.referenceTagEntries, 888);
  assert.equal(labels.length, 886);
  assert.equal(new Set(labels).size, labels.length);
});

test('counts are local books, case variants merge, and custom labels survive', () => {
  const taxonomy = getTaxonomy([
    { genres: ['Science fiction', 'Urban fantasy'], tags: ['Magic', 'magic', 'New York', 'My custom tag'] },
    { genres: ['Science fiction'], tags: ['Magic'] },
  ]);
  assert.equal(taxonomy.tags.find(term => term.label === 'Magic').count, 2);
  assert.equal(taxonomy.tags.filter(term => term.label.toLowerCase() === 'magic').length, 1);
  assert.equal(taxonomy.tags.find(term => term.label === 'System').count, 0);
  assert.equal(taxonomy.tags.find(term => term.label === 'New York').group, 'Worldbuilding');
  assert.equal(taxonomy.tags.find(term => term.label === 'My custom tag').group, 'Hunmeng tags');
  assert.equal(taxonomy.genres.find(term => term.label === 'Science fiction').count, 2);
  assert.equal(taxonomy.genres.find(term => term.label === 'Urban fantasy').count, 1);
});
