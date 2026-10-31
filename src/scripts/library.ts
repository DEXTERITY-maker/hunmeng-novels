import { repository, onStorageChange } from '../lib/storage';
import { recordVerifiedLibraryAdd } from '../lib/verified-library';
import { getCatalog, element, catalogUpdatedEvent } from '../lib/client-data';
import { shelves, type Shelf } from '../config/site';
import { readingAction } from '../lib/reading-action';

/** Decorative art is chosen from a fixed allowlist, never from user input. */
const illustrated = (art: string | undefined) => art === 'comprehension' || art === 'latency';

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
        const p = state.progress[n.slug];
        const c = n.chapters.find((chapter) => chapter.slug === p?.chapterSlug);
        const action = readingAction(n, p);
        const row = element('article', undefined, 'library-row library-novel-row');
        row.dataset.novel = n.slug;
        if (illustrated(n.art)) {
          row.dataset.art = n.art;
          const art = element('div', undefined, 'library-row-art');
          art.setAttribute('aria-hidden', 'true');
          row.append(art);
        }

        const coverLink = element('a', undefined, 'library-row-cover');
        coverLink.href = n.url;
        coverLink.setAttribute('aria-label', `View ${n.title}`);
        const img = element('img');
        img.src = n.cover;
        img.alt = '';
        img.width = 100;
        img.height = 146;
        img.loading = 'lazy';
        coverLink.append(img);

        const body = element('div', undefined, 'library-row-copy');
        const title = element('h2'), link = element('a', n.title);
        link.href = n.url;
        title.append(link);
        body.append(title);
        if (n.author) body.append(element('p', n.author, 'library-row-author'));

        // A chapter number is shown only when there is an actual saved position.
        const detail = element('p',
          c
            ? `Chapter ${c.number} of ${n.chapterCount}`
            : p && p.chapterNumber > 0
              ? `Chapter ${p.chapterNumber} of ${n.chapterCount}`
              : `${n.chapterCount} chapters · ${n.translationStatus}`,
          'fine library-row-chapter');
        body.append(detail);
        if (action.kind === 'caught-up') body.append(element('p', 'You are all caught up', 'fine library-row-caught-up'));

        const chapterProgress = c && p ? Math.round(Math.max(0, Math.min(1, p.ratio)) * 100) : 0;
        const progressBar = element('progress') as HTMLProgressElement;
        progressBar.max = 100;
        progressBar.value = chapterProgress;
        progressBar.setAttribute('aria-label', `${n.title}: chapter ${c?.number ?? p?.chapterNumber ?? 0} progress`);
        progressBar.className = 'library-chapter-progress';
        body.append(progressBar);
        if (c && p) body.append(element('p', `Current chapter: ${chapterProgress}%`, 'fine library-row-percent'));
        const date = p?.updatedAt && p.updatedAt > 0
          ? `Last read: ${new Date(p.updatedAt).toLocaleDateString()}`
          : `Updated: ${new Date(n.updatedAt).toLocaleDateString()}`;
        body.append(element('p', date, 'fine library-row-date'));

        const read = element('a', action.label + ' →', 'text-link library-row-action');
        read.href = action.url;
        body.append(read);

        const label = element('label', 'Shelf', 'library-row-picker');
        const select = element('select');
        select.setAttribute('aria-label', `Shelf: ${n.title}`);
        for (const [value, text] of Object.entries(shelves)) {
          const option = element('option', text);
          option.value = value;
          select.append(option);
        }
        const remove = element('option', 'Remove from library');
        remove.value = 'remove';
        select.append(remove);
        select.value = active;
        select.addEventListener('change', () => {
          const choice = select.value;
          void repository.setShelf(n.slug, choice === 'remove' ? null : choice as Shelf)
            .then(() => { if (choice !== 'remove') return recordVerifiedLibraryAdd(n.slug); });
        });
        label.append(select);
        row.append(coverLink, body, label);
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
