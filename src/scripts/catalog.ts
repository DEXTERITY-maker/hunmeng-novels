import { getCatalog } from '../lib/client-data';
const fold = (s: string) => s.normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё', 'е').trim();
export async function initCatalog() {
  const form = document.querySelector<HTMLFormElement>('#catalog-filters')!,
    container = document.getElementById('catalog-results')!;
  const query = new URLSearchParams(window.location.search);
  const searchField = form.elements.namedItem('search');
  if (searchField instanceof HTMLInputElement && query.has('search'))
    searchField.value = query.get('search') ?? '';
  const genreField = form.elements.namedItem('genre');
  if (genreField instanceof HTMLSelectElement && query.has('genre')) {
    const genre = query.get('genre') ?? '';
    if (Array.from(genreField.options).some((option) => option.value === genre))
      genreField.value = genre;
  }
  try {
    const novels = await getCatalog(),
      cards = new Map(
        Array.from(container.querySelectorAll<HTMLElement>('[data-novel]')).map((c) => [
          c.dataset.novel!,
          c,
        ]),
      );
    const apply = () => {
      const f = new FormData(form),
        q = fold(String(f.get('search') || '')),
        include = f.getAll('include').map(String),
        exclude = f.getAll('exclude').map(String);
      const filtered = novels.filter(
        (n) =>
          (!q || fold(n.title + ' ' + n.originalTitle).includes(q)) &&
          (!f.get('genre') || n.genres.includes(String(f.get('genre')))) &&
          (!f.get('status') || n.translationStatus === f.get('status')) &&
          (!f.get('originalStatus') || n.originalStatus === f.get('originalStatus')) &&
          include.every((t) => n.tags.includes(t)) &&
          !exclude.some((t) => n.tags.includes(t)),
      );
      filtered.sort((a, b) =>
        f.get('sort') === 'title'
          ? a.title.localeCompare(b.title, 'ru')
          : f.get('sort') === 'chapters'
            ? b.chapterCount - a.chapterCount
            : b.updatedAt.localeCompare(a.updatedAt),
      );
      for (const c of cards.values()) c.hidden = true;
      for (const n of filtered) {
        const c = cards.get(n.slug)!;
        c.hidden = false;
        container.append(c);
      }
      document.getElementById('result-count')!.textContent = `Найдено новелл: ${filtered.length}`;
      document.getElementById('catalog-empty')!.hidden = filtered.length > 0;
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', apply);
    form.addEventListener('change', apply);
    form.addEventListener('reset', () => setTimeout(apply, 0));
    apply();
  } catch {
    document.getElementById('result-count')!.textContent =
      'Поиск временно недоступен. Все новеллы показаны ниже.';
  }
}
