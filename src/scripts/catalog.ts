import { getCatalogIndex, type CatalogIndexNovel } from '../lib/client-data';

const PAGE_SIZES = [24, 48];
const fold = (s: string) => s.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
const numberLabel = (x: number) => new Intl.NumberFormat('ru-RU').format(x);
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
function card(n: CatalogIndexNovel) {
  const article = make('article', undefined, 'novel-card catalog-novel-card');
  article.dataset.novel = n.slug;
  const cover = make('a', undefined, 'cover-link');
  cover.href = n.url;
  cover.tabIndex = -1;
  cover.setAttribute('aria-hidden', 'true');
  const image = make('img');
  image.src = n.cover;
  image.alt = '';
  image.width = 260;
  image.height = 380;
  image.loading = 'lazy';
  cover.append(image);
  const body = make('div', undefined, 'novel-copy');
  body.append(make('p', n.categories.length ? n.categories.join(' · ') : n.genres.join(' · '), 'genre-line'));
  const h2 = make('h2');
  const title = make('a', n.title);
  title.href = n.url;
  h2.append(title);
  body.append(h2, make('p', n.originalTitle + ' · ' + n.author, 'original-title'));
  body.append(make('p', n.description, 'card-description'));
  const stats = make('p', undefined, 'catalog-card-stats');
  stats.append(
    make('span', '★ ' + (n.rating ? n.rating.average.toFixed(1) + ' / 5 · ' + n.rating.count + ' оценок' : 'Нет оценок')),
    make('span', '◉ ' + (n.views === null ? 'Нет данных о просмотрах' : numberLabel(n.views) + ' просмотров')),
  );
  body.append(stats);
  const meta = make('p', undefined, 'fine');
  meta.append(document.createTextNode(n.chapterCount + ' глав · ' + n.translationStatus + ' · '));
  const time = make('time', new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(n.updatedAt)));
  time.dateTime = n.updatedAt;
  meta.append(time);
  body.append(meta);
  const link = make('a', 'Открыть новеллу →', 'text-link');
  link.href = n.url;
  body.append(link);
  article.append(cover, body);
  return article;
}
function validField(field: Element | RadioNodeList | null, value: string) {
  if (field instanceof HTMLInputElement) {
    if (field.type === 'number') field.value = /^\d+$/.test(value) ? value : '';
    else field.value = value;
  } else if (field instanceof HTMLSelectElement) {
    if (Array.from(field.options).some((option) => option.value === value)) field.value = value;
  }
}
function linkFor(form: HTMLFormElement, page: number) {
  const params = new URLSearchParams(new FormData(form) as unknown as URLSearchParams);
  for (const [key, value] of [...params]) if (!value) params.delete(key);
  if (page > 1) params.set('page', String(page));
  else params.delete('page');
  return location.pathname + (params.size ? '?' + params.toString() : '');
}
export async function initCatalog() {
  const form = document.querySelector<HTMLFormElement>('#catalog-filters');
  const container = document.getElementById('catalog-results');
  const pager = document.getElementById('catalog-pagination');
  const count = document.getElementById('result-count');
  const empty = document.getElementById('catalog-empty');
  if (!form || !container || !pager || !count || !empty) return;

  const loadQuery = () => {
    form.reset();
    const params = new URLSearchParams(location.search);
    for (const key of ['search','category','genre','status','originalStatus','sort','size','minChapters','minRating']) {
      const value = params.get(key);
      if (value !== null) validField(form.elements.namedItem(key), value);
    }
    for (const key of ['include','exclude']) {
      for (const tag of params.getAll(key)) {
        const checkbox = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((x) => x.name === key && x.value === tag);
        if (checkbox) checkbox.checked = true;
      }
    }
  };
  loadQuery();
  try {
    const novels = await getCatalogIndex();
    const render = (syncUrl: boolean, requestedPage?: number) => {
      const f = new FormData(form);
      const q = fold(String(f.get('search') ?? ''));
      const required = f.getAll('include').map(String);
      const forbidden = f.getAll('exclude').map(String);
      const minChapters = Math.max(0, Number(f.get('minChapters') || 0));
      const minRating = Number(f.get('minRating') || 0);
      const filtered = novels.filter((n) =>
        (!q || fold([n.title,n.originalTitle,n.author,...n.tags].join(' ')).includes(q)) &&
        (!f.get('category') || n.categories.includes(String(f.get('category')))) &&
        (!f.get('genre') || n.genres.includes(String(f.get('genre')))) &&
        (!f.get('status') || n.translationStatus === f.get('status')) &&
        (!f.get('originalStatus') || n.originalStatus === f.get('originalStatus')) &&
        n.chapterCount >= minChapters &&
        (!minRating || (n.rating !== null && n.rating.average >= minRating)) &&
        required.every((t) => n.tags.includes(t)) &&
        forbidden.every((t) => !n.tags.includes(t)),
      );
      const sort = String(f.get('sort') ?? 'updated');
      filtered.sort((a,b) => {
        if (sort === 'title') return a.title.localeCompare(b.title,'ru');
        if (sort === 'chapters') return b.chapterCount - a.chapterCount || a.title.localeCompare(b.title,'ru');
        if (sort === 'added') return (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.title.localeCompare(b.title,'ru');
        if (sort === 'rating') return (b.rating?.average ?? -1) - (a.rating?.average ?? -1) ||
          (b.rating?.count ?? 0) - (a.rating?.count ?? 0) || a.title.localeCompare(b.title,'ru');
        if (sort === 'views') return (b.views ?? -1) - (a.views ?? -1) || a.title.localeCompare(b.title,'ru');
        return b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title,'ru');
      });
      const sizeValue = Number(f.get('size'));
      const size = PAGE_SIZES.includes(sizeValue) ? sizeValue : PAGE_SIZES[0];
      const pages = Math.max(1, Math.ceil(filtered.length / size));
      const fromUrl = Number(new URLSearchParams(location.search).get('page') || 1);
      const desired = requestedPage ?? fromUrl;
      const page = Number.isSafeInteger(desired) ? Math.max(1, Math.min(desired, pages)) : 1;
      container.replaceChildren(...filtered.slice((page - 1) * size, page * size).map(card));
      count.textContent = 'Найдено новелл: ' + filtered.length;
      empty.hidden = filtered.length > 0;
      pager.replaceChildren();
      pager.hidden = pages <= 1;
      const addPage = (label: string, destination: number, active = false) => {
        const a = make('a', label, active ? 'current' : '');
        a.href = linkFor(form, destination);
        if (active) a.setAttribute('aria-current', 'page');
        pager.append(a);
      };
      if (pages > 1) {
        if (page > 1) addPage('←',page - 1);
        for (let i = Math.max(1,page-2);i<=Math.min(pages,page+2);i++) addPage(String(i),i,i===page);
        if (page < pages) addPage('→',page+1);
      }
      if (syncUrl) history.replaceState(null,'',linkFor(form,page));
    };
    const onFilter = () => render(true,1);
    form.addEventListener('submit',(e)=>{e.preventDefault();onFilter();});
    form.addEventListener('input',(event)=> {
      if ((event.target as HTMLInputElement).name !== 'search') onFilter();
      else onFilter();
    });
    form.addEventListener('change',onFilter);
    form.addEventListener('reset',()=>queueMicrotask(onFilter));
    pager.addEventListener('click',(e)=>{
      const a=(e.target as Element).closest('a');
      if (!a || !pager.contains(a)) return;
      const params=new URL(a.href).searchParams;
      e.preventDefault();
      render(true,Number(params.get('page')||1));
      document.getElementById('result-count')?.scrollIntoView({block:'start'});
    });
    window.addEventListener('popstate',()=>{loadQuery();render(false);});
    render(false);
  } catch {
    count.textContent='Расширенный поиск временно недоступен. Ниже показаны доступные новеллы.';
  }
}
