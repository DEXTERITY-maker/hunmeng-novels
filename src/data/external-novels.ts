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
  /** Optional Hunmeng editorial illustration; not an official source cover. */
  cover?: string;
  coverAlt?: string;
  summary: string;
  status: string;
  /** Date the reference was added to Hunmeng, not a chapter release date. */
  addedAt?: string;
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
    cover: '/images/editorial/highway-survival-art.webp',
    coverAlt: 'Hunmeng editorial illustration of a mobile workshop beside a deserted highway',
    summary: 'Transported into a highway survival game, Xie Changqing receives an old industrial lathe instead of a car. His Perfect Manufacturing talent turns an unlikely starting vehicle into the foundation for equipment, defenses and a mobile base.',
    status: 'Ongoing (original)',
    genres: ['Sci-Fi', 'Adventure', 'Survival'],
    tags: ['Crafting', 'Base Building', 'Game Elements', 'Apocalypse'],
    sourceName: 'WTR-Lab',
    sourceUrl: 'https://wtr-lab.com/en/novel/109475/highway-survival-lathe-is-also-a-car-i-handcraft-gatling-gun',
    originalUrl: 'https://fanqienovel.com/page/7673414027619339289',
    externalId: 'wtr-lab:109475',
  },
  {
    slug: 'lord-of-mysteries',
    title: 'Lord of Mysteries',
    originalTitle: '诡秘之主',
    author: '爱潜水的乌贼',
    cover: '/images/editorial/novels/lord-of-mysteries.svg',
    coverAlt: 'Hunmeng illustration of a clock and airship for Lord of Mysteries',
    summary: 'After awakening in a world of steam engines and hidden powers, Klein Moretti searches for answers among dangerous mysteries and secret organizations.',
    status: 'Completed',
    addedAt: '2026-11-03',
    genres: ['Fantasy', 'Mystery', 'Supernatural'],
    tags: ['Transmigration', 'Steampunk', 'Magic', 'Mystery Solving'],
    sourceName: 'Webnovel',
    sourceUrl: 'https://www.webnovel.com/book/11022733006234505',
    originalUrl: 'https://www.webnovel.com/book/9069458404256003',
    externalId: 'webnovel:11022733006234505',
  },
  {
    slug: 'cultivation-chat-group',
    title: 'Cultivation Chat Group',
    originalTitle: '修真聊天群',
    author: '圣骑士的传说',
    cover: '/images/editorial/novels/cultivation-chat-group.svg',
    coverAlt: 'Hunmeng illustration of mountains and a chat bubble for Cultivation Chat Group',
    summary: 'Student Song Shuhang joins an unusual chat group and discovers that its eccentric members are real cultivators whose world is much stranger than he imagined.',
    status: 'Completed',
    addedAt: '2026-11-03',
    genres: ['Urban life', 'Comedy', 'Xianxia'],
    tags: ['Cultivation', 'Modern Day', 'Supernatural'],
    sourceName: 'Webnovel',
    sourceUrl: 'https://www.webnovel.com/book/8299599706003805',
    originalUrl: 'https://www.webnovel.com/book/22387883000479202',
    externalId: 'webnovel:8299599706003805',
  },
  {
    slug: 'release-that-witch',
    title: 'Release That Witch',
    originalTitle: '放开那个女巫',
    author: '二目',
    cover: '/images/editorial/novels/release-that-witch.svg',
    coverAlt: 'Hunmeng illustration of a distant castle for Release That Witch',
    summary: 'A man awakens as a prince in a world where witches possess real magic, then works with them to develop a neglected territory and face its dangers.',
    status: 'Completed',
    addedAt: '2026-11-03',
    genres: ['Fantasy', 'Adventure'],
    tags: ['Transmigration', 'Kingdom Building', 'Industrialization', 'Witches'],
    sourceName: 'Webnovel',
    sourceUrl: 'https://www.webnovel.com/book/7931338406001705',
    originalUrl: 'https://www.webnovel.com/book/3922226004512203',
    externalId: 'webnovel:7931338406001705',
  },
  {
    slug: 'library-of-heavens-path',
    title: "Library of Heaven's Path",
    originalTitle: '天道图书馆',
    author: '横扫天涯',
    cover: '/images/editorial/novels/library-of-heavens-path.svg',
    coverAlt: 'Hunmeng illustration of an open book and stars for Library of Heaven’s Path',
    summary: 'Teacher Zhang Xuan discovers a mysterious library that records the flaws of what he observes, and uses it to guide students in a world of cultivation.',
    status: 'Completed',
    addedAt: '2026-11-03',
    genres: ['Fantasy', 'Adventure', 'Xuanhuan'],
    tags: ['Cultivation', 'Teachers', 'Student-Teacher Relationship', 'Transmigration'],
    sourceName: 'Webnovel',
    sourceUrl: 'https://www.webnovel.com/book/6831850602000905',
    originalUrl: 'https://www.webnovel.com/book/5598041504523203',
    externalId: 'webnovel:6831850602000905',
  },
  {
    slug: 'the-kings-avatar',
    title: "The King's Avatar",
    originalTitle: '全职高手',
    author: '蝴蝶蓝',
    cover: '/images/editorial/novels/the-kings-avatar.svg',
    coverAlt: 'Hunmeng illustration of a game controller and arena for The King’s Avatar',
    summary: 'After leaving his professional team, veteran player Ye Xiu returns to the online game Glory on a new server and begins rebuilding his career.',
    status: 'Completed',
    addedAt: '2026-11-03',
    genres: ['Game', 'Sports', 'Adventure'],
    tags: ['e-Sports', 'Gamers', 'Teamwork'],
    sourceName: 'Webnovel',
    sourceUrl: 'https://www.webnovel.com/book/7176992105000305',
    originalUrl: 'https://www.webnovel.com/book/22322981000467402',
    externalId: 'webnovel:7176992105000305',
  },
  {
    slug: 'guardians-of-the-dafeng',
    title: 'Guardians of the Dafeng',
    originalTitle: '大奉打更人',
    author: '卖报小郎君',
    cover: '/images/editorial/novels/guardians-of-the-dafeng.svg',
    coverAlt: 'Hunmeng illustration of a lantern and magnifying glass for Guardians of the Dafeng',
    summary: 'A police academy graduate finds himself imprisoned in an unfamiliar dynasty and uses deduction to investigate cases in a world of supernatural forces.',
    status: 'Completed',
    addedAt: '2026-11-03',
    genres: ['Fantasy', 'Mystery', 'Historical'],
    tags: ['Mystery Solving', 'Clever Protagonist', 'Transmigration', 'Cultivation'],
    sourceName: 'Webnovel',
    sourceUrl: 'https://www.webnovel.com/book/18909583306684705',
    originalUrl: 'https://www.webnovel.com/book/16413310204823304',
    externalId: 'webnovel:18909583306684705',
  },
];

export const externalNovelUrl = (slug: string) => `/sources/${slug}/`;
