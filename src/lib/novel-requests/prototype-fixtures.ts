/**
 * Fictional fixtures for the local novel-request prototype.
 *
 * Every host, work, author and chapter title in this file is invented and uses
 * the reserved `.test` domain. Nothing here may be treated as a real source,
 * permission or catalog entry. The fixture adapter performs no network access:
 * it only parses URL shapes that the prototype explicitly declares supported.
 */
import type { SourceAdapter } from './core.ts';
import type { CatalogWork, ModerationStep, PrototypeConfig, RequestInput } from './scenario.ts';

export const FIXTURE_PROVIDER_ARCHIVE = 'fiction-archive';
export const FIXTURE_PROVIDER_SHELF = 'serialshelf';

/** Parses only `https://fiction-archive.test/work/<digits>` and the shelf equivalent. */
export const fixtureAdapter: SourceAdapter = {
  hosts: ['fiction-archive.test', 'serialshelf.test'],
  identify(url) {
    if (url.hostname === 'fiction-archive.test') {
      const match = /^\/work\/(\d{1,9})$/.exec(url.pathname);
      if (!match) return null;
      return {
        provider: FIXTURE_PROVIDER_ARCHIVE,
        externalId: match[1],
        url: `https://fiction-archive.test/work/${match[1]}`,
      };
    }
    if (url.hostname === 'serialshelf.test') {
      const match = /^\/book\/(\d{1,9})$/.exec(url.pathname);
      if (!match) return null;
      return {
        provider: FIXTURE_PROVIDER_SHELF,
        externalId: match[1],
        url: `https://serialshelf.test/book/${match[1]}`,
      };
    }
    return null;
  },
};

export const fixtureChapters = [
  { number: 1, title: 'The lantern that never went out' },
  { number: 2, title: 'A debt paid in silver' },
  { number: 3, title: 'Nine steps to the river' },
] as const;

export const fixtureCatalog: readonly CatalogWork[] = [
  {
    id: 'work-lantern',
    titles: ['The Lantern of Ninth Street', 'Фонарь Девятой улицы'],
    authors: ['A. Marlowe'],
    sources: [
      {
        provider: FIXTURE_PROVIDER_ARCHIVE,
        externalId: '4242',
        url: 'https://fiction-archive.test/work/4242',
      },
    ],
    chapters: fixtureChapters.map(chapter => ({ number: chapter.number, title: chapter.title })),
    publishedSlug: 'the-lantern-of-ninth-street',
  },
  {
    id: 'work-river',
    titles: ['Across the Silent River', 'За тихой рекой'],
    authors: ['I. Petrova'],
    sources: [
      {
        provider: FIXTURE_PROVIDER_SHELF,
        externalId: '777',
        url: 'https://serialshelf.test/book/777',
      },
    ],
    chapters: [
      { number: 1, title: 'A crossing at first light' },
      { number: 2, title: 'The ferryman counts twice' },
      { number: 3, title: 'What the water kept' },
    ],
    publishedSlug: 'across-the-silent-river',
  },
  {
    id: 'work-dawn',
    titles: ['A Promise at Dawn'],
    authors: ['N. Okonkwo'],
    sources: [
      {
        provider: FIXTURE_PROVIDER_ARCHIVE,
        externalId: '9001',
        url: 'https://fiction-archive.test/work/9001',
      },
    ],
    chapters: [
      { number: 1, title: 'A promise made in error' },
      { number: 2, title: 'The quiet before the market' },
      { number: 3, title: 'Dawn arrives anyway' },
    ],
    publishedSlug: 'a-promise-at-dawn',
  },
];

export const fixtureConfig: PrototypeConfig = {
  adapters: [fixtureAdapter],
  catalog: fixtureCatalog,
  metadataPolicy: {
    allowedFields: ['originalTitle', 'alternativeTitles', 'authors', 'chapterTitles'],
    evidence: 'Fictional fixture adapter: metadata permission documented for this local prototype only',
  },
};

export const fixtureModeration: readonly ModerationStep[] = [
  {
    actorId: 'fixture-moderator-1',
    to: 'review',
    reason: 'Prototype review against the fictional catalog',
    at: '2026-10-28T10:00:00Z',
  },
  {
    actorId: 'fixture-moderator-1',
    to: 'draft',
    reason: 'No blocking duplicate in the fictional catalog; rights still unverified',
    at: '2026-10-28T10:05:00Z',
  },
];

export const fixtureRequests: Record<string, RequestInput> = {
  /** Same provider and external ID as work-lantern: exact, advisory only. */
  exact: {
    requestId: 'request-exact-1',
    url: 'https://fiction-archive.test/work/4242?tracking=fictional#top',
    submittedBy: 'fixture-reader-1',
    submittedAt: '2026-10-28T09:59:00Z',
    metadata: {
      originalTitle: 'The Lantern of Ninth Street',
      authors: ['A. Marlowe'],
      chapterTitles: fixtureChapters.map(chapter => ({ number: chapter.number, title: chapter.title })),
    },
  },
  /** Different provider, but the same title and author: probable, never exact. */
  probable: {
    requestId: 'request-probable-1',
    url: 'https://serialshelf.test/book/5150',
    submittedBy: 'fixture-reader-2',
    submittedAt: '2026-10-28T09:59:30Z',
    metadata: {
      alternativeTitles: ['The Lantern of Ninth Street'],
      authors: ['A Marlowe'],
    },
  },
  /** Only three distinctive chapter titles match: probable, still no merge. */
  chapters: {
    requestId: 'request-chapters-1',
    url: 'https://serialshelf.test/book/5151',
    submittedBy: 'fixture-reader-3',
    submittedAt: '2026-10-28T09:59:45Z',
    metadata: {
      originalTitle: 'Night Gate',
      authors: ['Unknown Scribe'],
      chapterTitles: fixtureChapters.map(chapter => ({ number: chapter.number, title: chapter.title })),
    },
  },
  /** Unsupported host: rejected before any matching. */
  unsupportedHost: {
    requestId: 'request-invalid-1',
    url: 'https://unknown-source.test/work/1',
    submittedBy: 'fixture-reader-4',
    submittedAt: '2026-10-28T10:00:15Z',
    metadata: { originalTitle: 'The Lantern of Ninth Street' },
  },
  /** Recognized host but unsupported path: rejected. */
  unsupportedPath: {
    requestId: 'request-invalid-2',
    url: 'https://fiction-archive.test/series/4242',
    submittedBy: 'fixture-reader-4',
    submittedAt: '2026-10-28T10:00:30Z',
    metadata: {},
  },
};

/** Named scenarios used by the local command-line prototype. */
export const fixtureScenarios: readonly { readonly name: string; readonly input: RequestInput }[] = [
  { name: 'exact', input: fixtureRequests.exact },
  { name: 'probable', input: fixtureRequests.probable },
  { name: 'chapters', input: fixtureRequests.chapters },
  { name: 'unsupported-host', input: fixtureRequests.unsupportedHost },
  { name: 'unsupported-path', input: fixtureRequests.unsupportedPath },
];

export const FIXTURE_TODAY = '2026-10-28';
