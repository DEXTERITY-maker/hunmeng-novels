import { catalogFilterLabel } from '../lib/labels';
import { getCatalogIndex, refreshCatalogChapterCounts, type CatalogIndexNovel } from '../lib/client-data';
import { chapterCount } from '../lib/format';

const PAGE_SIZES = [24, 48];
const fold = (s: string) => s.normalize('NFKC').toLocaleLowerCase('en').trim();
const numberLabel = (x: number) => new Intl.NumberFormat('en-US').format(x);
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
const svgNS = 'http://www.w3.org/2000/svg';
function metaIcon(kind: 'book' | 'clock') {
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('width', '17');
  svg.setAttribute('height', '17');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.7');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', kind === 'book'
    ? 'M12 5.5C8.5 3.7 5 3.8 2.5 5v14c2.5-1.2 6-1.3 9.5.5 3.5-1.8 7-1.7 9.5-.5V5C19 3.8 15.5 3.7 12 5.5Z'
    : 'M12 6v6h5');
  if (kind === 'book') {
    const seam = document.createElementNS(svgNS, 'path');
    seam.setAttribute('d', 'M12 5.5v14');
    svg.append(path, seam);
  } else {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '9');
    svg.append(circle, path);
  }
  return svg;
}
function card(n: CatalogIndexNovel) {
  const article = make('article', undefined, 'novel-card catalog-novel-card');
  article.dataset.novel = n.slug;
  if (n.art === 'comprehension' || n.art === 'latency') {
    article.dataset.art = n.art;
    const art = make('div', undefined, 'catalog-card-art');
    art.setAttribute('aria-hidden', 'true');
    article.append(art);
  }
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
  body.append(make('p', n.genres.join(' · '), 'genre-line'));
  const h2 = make('h2');
  const title = make('a', n.title);
  title.href = n.url;
  h2.append(title);
  body.append(h2, make('p', n.originalTitle === n.title ? n.author : n.originalTitle + ' · ' + n.author, 'original-title'));
  body.append(make('p', n.description, 'card-description'));
  if (n.tags.length) {
    const tags = make('div', undefined, 'catalog-card-tags');
    tags.setAttribute('aria-label', 'Story tags');
    for (const tag of n.tags.slice(0, 3)) {
      const link = make('a', tag);
      link.href = '/catalog/?include=' + encodeURIComponent(tag);
      tags.append(link);
    }
    body.append(tags);
  }
  const stats = make('p', undefined, 'catalog-card-stats');
  if (n.rating) stats.append(make('span', '★ ' + n.rating.average.toFixed(1) + ' / 5 · ' + n.rating.count + ' ratings'));
  if (n.views !== null) stats.append(make('span', '◉ ' + numberLabel(n.views) + ' views'));
  if (stats.childElementCount) body.append(stats);

  const meta = make('p', undefined, 'catalog-card-meta fine');
  const chapters = make('span', undefined, 'catalog-meta-chapters');
  chapters.append(metaIcon('book'), document.createTextNode(' ' + n.chapterCount + ' chapters'));
  const status = make('span', undefined, 'catalog-meta-status');
  const dot = make('span', undefined, 'catalog-status-dot' + (n.originalStatus === 'Ongoing' ? ' is-ongoing' : ''));
  dot.setAttribute('aria-hidden', 'true');
  const translation = make('span', ' Translation: ' + n.translationStatus, 'catalog-translation-status sr-only');
  status.append(dot, document.createTextNode(n.originalStatus), translation);
  const updated = make('span', undefined, 'catalog-meta-updated');
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(n.updatedAt));
  const time = make('time', date);
  time.dateTime = n.updatedAt;
  updated.append(metaIcon('clock'), document.createTextNode(' Updated '), time);
  meta.append(chapters, status, updated);
  body.append(meta);
  const link = make('a', 'Read novel', 'text-link catalog-read-action');
  link.href = n.url;
  const arrow = make('span', '→');
  arrow.setAttribute('aria-hidden', 'true');
  link.append(document.createTextNode(' '), arrow);
  article.append(cover, body, link);
  return article;
}
function validField(field: Element | RadioNodeList | null, value: string) {
  if (field instanceof HTMLInputElement) {
    if (field.type === 'number') field.value = /^\d+$/.test(value) ? value : '';
    else field.value = value;
  } else if (field instanceof HTMLSelectElement) {
    const option = Array.from(field.options).find(option => fold(option.value) === fold(value));
    if (option) field.value = option.value;
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
    for (const key of ['search','category','genre','status','originalStatus','sort','size','minChapters','minRating','tagMode']) {
      const value = params.get(key);
      if (value !== null) validField(form.elements.namedItem(key), key === 'search' ? value : catalogFilterLabel(value));
    }
    for (const key of ['include','exclude']) {
      for (const tag of params.getAll(key)) {
        const checkbox = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((x) => x.name === key && fold(x.value) === fold(catalogFilterLabel(tag)));
        if (checkbox) checkbox.checked = true;
      }
    }
  };
  loadQuery();
  const options = document.querySelector<HTMLDetailsElement>('#catalog-options');
  const mobile = matchMedia('(max-width: 760px)');
  mobile.addEventListener('change', () => { if (options) options.open = !mobile.matches; });
  const tagSearch = form.querySelector<HTMLInputElement>('#catalog-tag-search')!;
  const tagGroup = form.querySelector<HTMLSelectElement>('#catalog-tag-group')!;
  const tagRows = Array.from(form.querySelectorAll<HTMLElement>('[data-tag-label]'));
  const updateTagPicker = () => {
    let shown = 0;
    for (const row of tagRows) {
      const checked = row.querySelector('input:checked') !== null;
      row.hidden = !checked && (!fold(row.dataset.tagLabel!).includes(fold(tagSearch.value)) ||
        Boolean(tagGroup.value && row.dataset.tagGroup !== tagGroup.value));
      if (!row.hidden) shown++;
    }
    const included = form.querySelectorAll('input[name="include"]:checked').length;
    const excluded = form.querySelectorAll('input[name="exclude"]:checked').length;
    document.getElementById('tag-selection-count')!.textContent = included || excluded
      ? `${included} included · ${excluded} excluded. Selected tags stay visible.` : 'No tags selected.';
    document.getElementById('tag-picker-empty')!.hidden = shown > 0;
  };
  updateTagPicker();
  if (form.querySelector('input[type="checkbox"]:checked')) {
    form.querySelector<HTMLDetailsElement>('.tag-filters')!.open = true;
    if (options && !mobile.matches) options.open = true;
  }
  try {
    const novels = await getCatalogIndex();
    const render = (syncUrl: boolean, requestedPage?: number) => {
      const f = new FormData(form);
      const q = fold(String(f.get('search') ?? ''));
      updateTagPicker();
      const selected = [...f.entries()].filter(([key,value]) => value && !['search','sort','size','tagMode'].includes(key)).length;
      const summary = document.getElementById('active-filter-count');
      if (summary) { summary.textContent = `Selected: ${selected}`; summary.hidden = selected === 0; }
      const required = f.getAll('include').map(String);
      const forbidden = f.getAll('exclude').map(String);
      const minChapters = Math.max(0, Number(f.get('minChapters') || 0));
      const minRating = Number(f.get('minRating') || 0);
      const filtered = novels.filter((n) =>
        (!q || fold([n.title,n.originalTitle,n.author,...n.tags].join(' ')).includes(q)) &&
        (!f.get('category') || n.categories.includes(String(f.get('category')))) &&
        (!f.get('genre') || n.genres.some(genre => fold(genre) === fold(String(f.get('genre'))))) &&
        (!f.get('status') || n.translationStatus === f.get('status')) &&
        (!f.get('originalStatus') || n.originalStatus === f.get('originalStatus')) &&
        n.chapterCount >= minChapters &&
        (!minRating || (n.rating !== null && n.rating.average >= minRating)) &&
        (required.length === 0 || (f.get('tagMode') === 'any'
          ? required.some((t) => n.tags.some(tag => fold(tag) === fold(t)))
          : required.every((t) => n.tags.some(tag => fold(tag) === fold(t))))) &&
        forbidden.every((t) => !n.tags.some(tag => fold(tag) === fold(t))),
      );
      const sort = String(f.get('sort') ?? 'updated');
      filtered.sort((a,b) => {
        if (sort === 'title') return a.title.localeCompare(b.title,'en');
        if (sort === 'chapters') return b.chapterCount - a.chapterCount || a.title.localeCompare(b.title,'en');
        if (sort === 'added') return (b.addedAt ?? '').localeCompare(a.addedAt ?? '') || a.title.localeCompare(b.title,'en');
        if (sort === 'rating') return (b.rating?.average ?? -1) - (a.rating?.average ?? -1) ||
          (b.rating?.count ?? 0) - (a.rating?.count ?? 0) || a.title.localeCompare(b.title,'en');
        if (sort === 'views') return (b.views ?? -1) - (a.views ?? -1) || a.title.localeCompare(b.title,'en');
        return b.updatedAt.localeCompare(a.updatedAt) || a.title.localeCompare(b.title,'en');
      });
      const sizeValue = Number(f.get('size'));
      const size = PAGE_SIZES.includes(sizeValue) ? sizeValue : PAGE_SIZES[0];
      const pages = Math.max(1, Math.ceil(filtered.length / size));
      const fromUrl = Number(new URLSearchParams(location.search).get('page') || 1);
      const desired = requestedPage ?? fromUrl;
      const page = Number.isSafeInteger(desired) ? Math.max(1, Math.min(desired, pages)) : 1;
      container.replaceChildren(...filtered.slice((page - 1) * size, page * size).map(card));
      count.textContent = 'Novels found: ' + filtered.length;
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
      if (['catalog-tag-search', 'catalog-tag-group'].includes((event.target as HTMLElement).id)) updateTagPicker();
      else onFilter();
    });
    form.addEventListener('change',(event) => {
      if ((event.target as HTMLElement).id === 'catalog-tag-group') updateTagPicker();
      else onFilter();
    });
    // Native controls reset after the event. Re-render in the next task, including collapsed fields.
    form.addEventListener('reset',()=>setTimeout(onFilter,0));
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
    void refreshCatalogChapterCounts(novels).then(changed => { if (changed) render(false); });
  } catch {
    count.textContent='Advanced search is temporarily unavailable. Available novels are shown below.';
  }
}
