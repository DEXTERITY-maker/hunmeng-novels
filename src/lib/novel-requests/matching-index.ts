/** Offline immutable candidate index; no source fetching or database access. */
import { chapterSignature, normalizeName, type WorkEvidence } from './core.ts';
import type { CatalogReader } from './handler.ts';

type Index = Map<string, Set<number>>;
function add(index: Index, key: string, position: number): void {
  if (!key) return;
  const existing = index.get(key);
  if (existing) existing.add(position);
  else index.set(key, new Set([position]));
}
const sourceKey = (provider: string, externalId: string): string =>
  provider && externalId ? JSON.stringify([provider, externalId]) : '';

/**
 * Build once per catalog version. Candidate generation has the same qualifying
 * signals as findMatches: exact source, title+author, or 3 distinct chapter
 * signatures. A missing result cannot be treated as proof of uniqueness.
 */
export function createWorkCandidateIndex(input: readonly WorkEvidence[]) {
  const copy = (work: WorkEvidence): WorkEvidence => ({
    id: work.id, titles: [...work.titles], authors: [...work.authors],
    sources: work.sources.map(source => ({ ...source })),
    chapters: work.chapters.map(chapter => ({ ...chapter })),
  });
  const works = input.map(copy);
  const titles: Index = new Map(), authors: Index = new Map(), sources: Index = new Map(), chapters: Index = new Map();
  works.forEach((work, i) => {
    for (const title of work.titles) add(titles, normalizeName(title), i);
    for (const author of work.authors) add(authors, normalizeName(author), i);
    for (const source of work.sources) add(sources, sourceKey(source.provider, source.externalId), i);
    for (const chapter of work.chapters) add(chapters, chapterSignature(chapter) ?? '', i);
  });
  return {
    candidates(evidence: WorkEvidence): readonly WorkEvidence[] {
      const found = new Set<number>();
      for (const source of evidence.sources)
        for (const i of sources.get(sourceKey(source.provider, source.externalId)) ?? []) found.add(i);
      const authorCandidates = new Set<number>();
      for (const author of evidence.authors)
        for (const i of authors.get(normalizeName(author)) ?? []) authorCandidates.add(i);
      for (const title of evidence.titles)
        for (const i of titles.get(normalizeName(title)) ?? []) if (authorCandidates.has(i)) found.add(i);
      const chapterCounts = new Map<number, number>();
      const signatures = new Set(evidence.chapters.map(chapterSignature).filter((s): s is string => s !== null));
      for (const signature of signatures) for (const i of chapters.get(signature) ?? []) {
        const count = (chapterCounts.get(i) ?? 0) + 1;
        chapterCounts.set(i, count);
        if (count >= 3) found.add(i);
      }
      return [...found].sort((a, b) => a - b).map(i => copy(works[i]));
    },
    /** Handler-compatible reader for this in-memory catalog snapshot. */
    reader(): CatalogReader { return { works: async evidence => this.candidates(evidence) }; },
  };
}
