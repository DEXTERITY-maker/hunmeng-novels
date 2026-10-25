import { repository, onStorageChange } from '../lib/storage';
import { getCatalog, element } from '../lib/client-data';
import { type Shelf } from '../config/site';
import { readingAction } from '../lib/reading-action';
export async function initPersonal() {
  const catalog = await getCatalog().catch(() => []);
  const refresh = async () => {
    const state = await repository.getState();
    document.querySelectorAll<HTMLAnchorElement>('[data-continue]').forEach((link) => {
      const slug = link.dataset.continue!;
      const n = catalog.find((n) => n.slug === slug);
      const p = state.progress[slug];
      const c = n?.chapters.find((c) => c.slug === p?.chapterSlug);
      if (n) {
        const action = readingAction(n, p);
        link.href = action.url;
        link.textContent = action.label;
      }
      if (c) {
        document
          .querySelector(`[data-chapter-slug="${c.slug}"]`)
          ?.setAttribute('aria-current', 'true');
      }
    });
    for (const control of document.querySelectorAll<HTMLElement>('[data-library-control]')) {
      const shelf = state.library[control.dataset.slug!];
      control.querySelector<HTMLElement>('[data-add-library]')!.hidden = !!shelf;
      control.querySelector<HTMLElement>('.shelf-picker')!.hidden = !shelf;
      if (shelf) control.querySelector<HTMLSelectElement>('[data-shelf]')!.value = shelf;
    }
    const list = document.getElementById('continue-list'),
      section = document.getElementById('continue-section');
    if (list && section) {
      list.replaceChildren();
      const entries = Object.entries(state.progress)
        .sort(([, a], [, b]) => b.updatedAt - a.updatedAt);
      for (const [slug, p] of entries) {
        const n = catalog.find((n) => n.slug === slug);
        if (!n || state.library[slug] === 'completed' || state.library[slug] === 'dropped') continue;
        const action = readingAction(n, p), c = action.chapter;
        if (!c || action.kind === 'start' || action.kind === 'caught-up') continue;
        const a = element('a', undefined, 'continue-card');
        a.href = action.url;
        const img = element('img');
        img.src = n.cover;
        img.alt = '';
        img.width = 64;
        img.height = 94;
        const body = element('div');
        body.append(element('h3', n.title), element('p', `Глава ${c.number}. ${c.title}`));
        const bar = element('progress');
        bar.max = 1;
        bar.value = action.ratio;
        bar.setAttribute('aria-label', 'Прогресс текущей главы');
        const meter = element('div', undefined, 'continue-meter');
        meter.append(bar, element('span', `${Math.round(action.ratio * 100)}%`, 'continue-percent'));
        body.append(meter, element('span', action.label + ' →', 'text-link'));
        a.append(img, body);
        list.append(a);
        if (list.children.length === 3) break;
      }
      section.hidden = !list.children.length;
    }
  };
  document.querySelectorAll<HTMLElement>('[data-library-control]').forEach((control) => {
    const slug = control.dataset.slug!;
    control
      .querySelector('[data-add-library]')!
      .addEventListener('click', () => void repository.setShelf(slug, 'later'));
    control.querySelector<HTMLSelectElement>('[data-shelf]')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLSelectElement).value;
      void repository.setShelf(slug, v === 'remove' ? null : (v as Shelf));
    });
  });
  await refresh();
  onStorageChange(() => void refresh());
}
