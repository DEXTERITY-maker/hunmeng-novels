/**
 * Curated references to third-party works. These are NOT Hunmeng publications.
 * Never feed this collection to getLibrary(), the chapter reader, or publisher.
 * Source URLs are maintained as editorial metadata, not distribution rights.
 */
export interface ExternalNovel {
  slug: string;
  title: string;
  originalTitle: string;
  author: string;
  summary: string;
  status: string;
  genres: readonly string[];
  tags: readonly string[];
  sourceName: string;
  sourceUrl: string;
  originalUrl: string;
  externalId: string;
}

export const externalNovels: readonly ExternalNovel[] = [
  {
    slug: 'highway-survival-lathe-gatling',
    title: 'Highway Survival: Lathe Is Also a Car, I Handcraft Gatling Gun',
    originalTitle: '公路求生车床也是车我手搓加特林',
    author: '凨羽',
    summary: 'Transported into a highway survival game, Xie Changqing receives an old industrial lathe instead of a car. His Perfect Manufacturing talent turns an unlikely starting vehicle into the foundation for equipment, defenses and a mobile base.',
    status: 'Ongoing (original)',
    genres: ['Sci-Fi', 'Adventure', 'Survival'],
    tags: ['Crafting', 'Base Building', 'Game Elements', 'Apocalypse'],
    sourceName: 'WTR-Lab',
    sourceUrl: 'https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun',
    originalUrl: 'https://fanqienovel.com/page/7673414027619339289',
    externalId: 'wtr-lab:109475',
  },
];

export const externalNovelUrl = (slug: string) => `/sources/${slug}/`;
