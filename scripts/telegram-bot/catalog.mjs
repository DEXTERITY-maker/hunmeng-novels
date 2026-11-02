const SITE = 'https://hunmeng-novel.ru';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = value => typeof value === 'string' && DATE.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const validTitle = x => typeof x === 'string' && x.trim().length > 0 && x.length <= 1000;
const fetchJson = async (fetcher, url, options = {}) => {
  const response = await fetcher(url, {...options, signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Source unavailable');
  return response.json();
};

// catalog.json comes from the same published Pages deployment, never from main/GitHub.
export async function loadCatalog(env) {
  if (!env.ASSETS?.fetch) throw new Error('Published assets unavailable');
  const data = await fetchJson(env.ASSETS.fetch.bind(env.ASSETS), SITE + '/catalog.json');
  if (!Array.isArray(data)) throw new Error('Invalid published catalogue');
  const today = new Date().toISOString().slice(0, 10);
  const novels = data.map(n => {
    if (!SLUG.test(n.slug ?? '') || !validTitle(n.title) || !Array.isArray(n.chapters)) throw new Error('Invalid published catalogue');
    const chapters = n.chapters.filter(c => SLUG.test(c.slug ?? '') && Number.isSafeInteger(c.number) && c.number > 0 && validTitle(c.title) && validDate(c.publishedAt) && c.publishedAt <= today)
      .map(c => ({slug:c.slug, number:c.number, title:c.title, publishedAt:c.publishedAt, novelSlug:n.slug, novelTitle:n.title}));
    return {slug:n.slug, title:n.title, serial:n.serial === true, chapters};
  }).filter(n => n.chapters.length);
  if (new Set(novels.map(n => n.slug)).size !== novels.length) throw new Error('Duplicate novel');
  return novels.sort((a,b) => a.title.localeCompare(b.title, 'en'));
}

// Postgres RLS, using only the publishable key, proves each serial chapter is open.
export async function loadLatest(env, novels, fetcher = fetch) {
  const chapters = novels.flatMap(n => n.chapters);
  const serials = novels.filter(n => n.serial);
  if (serials.length) {
    const base = env.PUBLIC_SUPABASE_URL?.replace(/\/+$/, '');
    const key = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base ?? '') || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(key ?? '')) throw new Error('Public release service unavailable');
    const headers = {apikey:key};
    const editions = await fetchJson(fetcher, base + '/rest/v1/serial_editions?select=slug,initial_chapters,launch_at,timezone', {headers});
    if (!Array.isArray(editions)) throw new Error('Invalid release data');
    for (const novel of serials) {
      const edition = editions.find(e => e.slug === novel.slug);
      if (!edition || !Number.isSafeInteger(edition.initial_chapters) || edition.initial_chapters < 1 || edition.timezone !== 'Europe/Moscow') throw new Error('Invalid edition');
      if (!edition.launch_at) continue;
      const launch = new Date(edition.launch_at);
      if (Number.isNaN(+launch)) throw new Error('Invalid release date');
      // Ask RLS for only the newest public rows. A shell page alone is not proof of publication.
      const rows = await fetchJson(fetcher, base + '/rest/v1/serial_chapters?select=number,title&novel_slug=eq.' + novel.slug + '&order=number.desc&limit=10', {headers});
      if (!Array.isArray(rows)) throw new Error('Invalid release data');
      const launchMoscowDate = new Date(+launch + 3*3600000).toISOString().slice(0,10);
      for (const row of rows) {
        if (!Number.isSafeInteger(row.number) || row.number < 1 || !validTitle(row.title)) throw new Error('Invalid release data');
        if (novel.chapters.some(c => c.number === row.number)) continue;
        const date = new Date(launchMoscowDate + 'T09:00:00Z');
        date.setUTCDate(date.getUTCDate() + Math.max(0, row.number - edition.initial_chapters));
        const publishedAt = row.number <= edition.initial_chapters ? launch.toISOString() : date.toISOString();
        chapters.push({novelSlug:novel.slug,novelTitle:novel.title,slug:'chapter-'+row.number,number:row.number,title:row.title,publishedAt});
      }
    }
  }
  return chapters.sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) || a.novelTitle.localeCompare(b.novelTitle, 'en') || b.number-a.number);
}
export const novelUrl = slug => SITE + '/novel/' + slug + '/';
export const chapterUrl = chapter => novelUrl(chapter.novelSlug) + chapter.slug + '/';
