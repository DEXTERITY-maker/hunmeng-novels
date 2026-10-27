import reference from '../data/taxonomy.json' with { type: 'json' };

type ClassifiedNovel = { genres: string[]; tags: string[] };
export type TaxonomyTerm = { label: string; count: number; group: string };
const key = (label: string) => label.normalize('NFKC').toLocaleLowerCase('en').trim();
const localGroups: Record<string, string> = {
  'exceptional comprehension': 'Power Systems', 'great dao': 'Power Systems',
  'new york': 'Worldbuilding', 'near future': 'Worldbuilding', 'sea': 'Worldbuilding',
  'chinese protagonist': 'Protagonist Archetypes', 'missing brother': 'Narrative',
  'mystery': 'Narrative', 'slow-paced': 'Tone & Atmosphere', 'cozy': 'Tone & Atmosphere',
};

/** Merge the reference vocabulary with real site metadata; count each book once. */
export function getTaxonomy(novels: ClassifiedNovel[]) {
  function terms(kind: 'genres' | 'tags', seeds: { label: string; group: string }[]) {
    const map = new Map<string, TaxonomyTerm>();
    for (const seed of seeds) map.set(key(seed.label), { ...seed, count: 0 });
    for (const novel of novels) {
      for (const id of new Set(novel[kind].map(key))) {
        const label = novel[kind].find(value => key(value) === id)!;
        const term = map.get(id) ?? { label, count: 0, group: kind === 'genres' ? 'Genres' : localGroups[id] ?? 'Hunmeng tags' };
        // Published spelling stays usable in old catalog URLs and manuscript metadata.
        if (term.count === 0) term.label = label;
        term.count++;
        map.set(id, term);
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'en'));
  }
  const genres = terms('genres', reference.genres.map(label => ({ label, group: 'Genres' })));
  const tags = terms('tags', reference.tagGroups.flatMap(group => group.tags.map(label => ({ label, group: group.name }))));
  const groups = [...reference.tagGroups.map(group => group.name)];
  if (tags.some(tag => tag.group === 'Hunmeng tags')) groups.push('Hunmeng tags');
  return { genres, tags, groups };
}
