import { repository, onStorageChange } from '../lib/storage';
import { getCatalog, element, catalogUpdatedEvent } from '../lib/client-data';
import { shelves, type Shelf } from '../config/site';
import { chapterCount } from '../lib/format';
import { readingAction } from '../lib/reading-action';
export async function initLibrary() {
  let active: Shelf = 'reading';
  const list = document.getElementById('library-list')!;
  try {
    const catalog = await getCatalog();
    const render = async () => {
      const state = await repository.getState();
      list.replaceChildren();
      document
        .querySelectorAll<HTMLButtonElement>('[data-shelf-tab]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.shelfTab === active)));
      for (const shelf of Object.keys(shelves) as Shelf[])
        document.querySelector(`[data-shelf-count="${shelf}"]`)!.textContent = String(
          catalog.filter((n) => state.library[n.slug] === shelf).length,
        );
      for (const n of catalog.filter((n) => state.library[n.slug] === active)) {
        const p = state.progress[n.slug],
          c = n.chapters.find((c) => c.slug === p?.chapterSlug);
        const action = readingAction(n, p);
        const row = element('article', undefined, 'library-row');
        const img = element('img');
        img.src = n.cover;
        img.alt = '';
        img.width = 78;
        img.height = 114;
        const body = element('div');
        const title = element('h2'),
          link = element('a', n.title);
        link.href = n.url;
        title.append(link);
        body.append(
          title,
          element(
            'p',
            action.kind === 'caught-up'
              ? 'You are all caught up'
              : c
                ? `Chapter ${c.number} of ${n.chapterCount}`
                : `${chapterCount(n.chapterCount)} · ${n.translationStatus}`,
            'fine',
          ),
        );
        const read = element('a', action.label + ' →', 'text-link');
        read.href = action.url;
        body.append(read);
        const label = element('label', 'Shelf');
        const select = element('select');
        select.setAttribute('aria-label', `Shelf: ${n.title}`);
        for (const [value, text] of Object.entries(shelves)) {
          const op = element('option', text);
          op.value = value;
          select.append(op);
        }
        const remove = element('option', 'Remove from library');
        remove.value = 'remove';
        select.append(remove);
        select.value = active;
        select.addEventListener(
          'change',
          () =>
            void repository.setShelf(
              n.slug,
              select.value === 'remove' ? null : (select.value as Shelf),
            ),
        );
        label.append(select);
        row.append(img, body, label);
        list.append(row);
      }
      document.getElementById('library-empty')!.hidden = !!list.children.length;
      document.getElementById('library-count')!.textContent =
        `${shelves[active]}: ${list.children.length}`;
    };
    document.querySelectorAll<HTMLButtonElement>('[data-shelf-tab]').forEach((b) =>
      b.addEventListener('click', () => {
        active = b.dataset.shelfTab as Shelf;
        void render();
      }),
    );
    await render();
    onStorageChange(() => void render());
    window.addEventListener(catalogUpdatedEvent, () => void render());
  } catch {
    document.getElementById('library-empty')!.textContent =
      'Unable to load your library. Refresh the page.';
  }
}
