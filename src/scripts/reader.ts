import { repository, defaults, applySettings, type Settings } from '../lib/storage';
export async function initReader() {
  const main = document.querySelector<HTMLElement>('[data-reader]');
  if (!main) return;
  const slug = main.dataset.novel!,
    chapterSlug = main.dataset.chapter!,
    chapterNumber = Number(main.dataset.number);
  const article = document.getElementById('chapter-text')!,
    blocks = Array.from(article.children) as HTMLElement[];
  blocks.forEach((b, i) => {
    b.id = `block-${i}`;
  });
  const state = await repository.getState();
  let novelSpecific = Boolean(state.novelSettings?.[slug]);
  let settings = state.novelSettings?.[slug] ?? state.settings;
  // Keep an intentional Read later shelf selection intact when the user opens a chapter.
  if (!state.library[slug]) await repository.setShelf(slug, 'reading');
  applySettings(settings);
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const novelToggle = document.getElementById('reader-novel-settings') as HTMLInputElement;
  novelToggle.checked = novelSpecific;
  const settingsDialog = document.getElementById('reader-settings') as HTMLDialogElement;
  const tocDialog = document.getElementById('reader-toc') as HTMLDialogElement;
  const bookmark = document.getElementById('reader-save-later') as HTMLButtonElement;
  const moreMenu = document.querySelector<HTMLDetailsElement>('.reader-more');
  const focusToggle = moreMenu?.querySelector<HTMLButtonElement>('[data-reader-focus]');
  const wordCount = document.querySelector<HTMLElement>('[data-reader-words]');
  if (wordCount) {
    const count = (article.textContent ?? '').trim().split(/\s+/u).filter(Boolean).length;
    if (count > 0) { wordCount.textContent = `${new Intl.NumberFormat('en-US').format(count)} words`; wordCount.hidden = false; }
  }
  let shelf = (await repository.getState()).library[slug] ?? 'reading';
  const paintBookmark = () => {
    const saved = shelf === 'later';
    bookmark.setAttribute('aria-pressed', String(saved));
    bookmark.setAttribute('aria-label', saved ? 'Remove from Read later' : 'Save novel to Read later');
    bookmark.title = saved ? 'Remove from Read later' : 'Save novel to Read later';
  };
  paintBookmark();
  bookmark.addEventListener('click', async () => {
    shelf = shelf === 'later' ? 'reading' : 'later';
    await repository.setShelf(slug, shelf);
    paintBookmark();
  });
  let focusMode = false;
  focusToggle?.addEventListener('click', () => {
    focusMode = !focusMode;
    focusToggle.setAttribute('aria-pressed', String(focusMode));
    focusToggle.textContent = focusMode ? 'Exit focus mode' : 'Focus mode';
    document.body.classList.toggle('reader-focus-mode', focusMode);
    if (moreMenu) moreMenu.open = false;
    show(!focusMode);
  });
  document.addEventListener('click', (event) => {
    if (moreMenu?.open && !(event.target as Element).closest('.reader-more')) moreMenu.open = false;
  });
  const fill = () => {
    for (const [key, value] of Object.entries(settings)) {
      const field = form.elements.namedItem(key);
      if (field instanceof RadioNodeList) field.value = String(value);
      else if (field instanceof HTMLInputElement) field.value = String(value);
    }
    form.querySelector<HTMLOutputElement>('[data-output="size"]')!.value = `${settings.size} px`;
    form.querySelector<HTMLOutputElement>('[data-output="lineHeight"]')!.value = String(
      settings.lineHeight,
    ).replace('.', ',');
    form.querySelector<HTMLOutputElement>('[data-output="width"]')!.value = `${settings.width} px`;
    form.querySelector<HTMLOutputElement>('[data-output="paragraphSpacing"]')!.value = `${Number(settings.paragraphSpacing.toFixed(2))} em`;
    const preview = document.querySelector<HTMLElement>('.reader-settings-preview');
    if (preview) preview.dataset.font = settings.font;
  };
  fill();
  let restoring = true,
    lastY = window.scrollY,
    shown = true,
    timer: ReturnType<typeof setTimeout> | undefined;
  const toggler = document.getElementById('show-reader-controls')!;
  const show = (visible: boolean) => {
    shown = visible;
    document.body.classList.toggle('controls-hidden', !visible);
    toggler.hidden = visible;
  };
  const position = () => {
    const y = window.scrollY;
    const start = article.offsetTop;
    const end = start + article.offsetHeight;
    const span = end - start - window.innerHeight;
    const ratio =
      span <= 0
        ? y + window.innerHeight >= end
          ? 1
          : 0
        : Math.max(0, Math.min(1, (y - start) / span));
    const block = blocks.find((b) => b.getBoundingClientRect().bottom > 88) || blocks.at(-1);
    return {
      chapterSlug,
      chapterNumber,
      blockId: block?.id || '',
      offset: block?.getBoundingClientRect().top || 0,
      ratio,
      updatedAt: Date.now(),
    };
  };
  const paint = () => {
    const p = position();
    (document.getElementById('reading-progress') as HTMLProgressElement).value = p.ratio * 100;
    document.getElementById('progress-label')!.textContent = `${Math.round(p.ratio * 100)}%`;
  };
  const save = () => {
    if (!restoring) void repository.saveProgress(slug, position());
  };
  // A periodic checkpoint protects progress on mobile when pagehide is skipped.
  const checkpoint = window.setInterval(() => {
    if (!document.hidden) save();
  }, 15000);
  window.addEventListener('pagehide', () => window.clearInterval(checkpoint), { once: true });
  const restore = async () => {
    await document.fonts.ready;
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    const p = state.progress[slug];
    // Only an explicit Continue link or reload restores. Chapter navigation starts at the top.
    const nav = performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined;
    if (
      p?.chapterSlug === chapterSlug &&
      (new URLSearchParams(location.search).has('resume') || nav?.type === 'reload')
    ) {
      const block = document.getElementById(p.blockId);
      if (block) window.scrollTo(0, window.scrollY + block.getBoundingClientRect().top - p.offset);
      else
        window.scrollTo(
          0,
          article.offsetTop + p.ratio * Math.max(0, article.offsetHeight - window.innerHeight),
        );
    }
    restoring = false;
    lastY = window.scrollY;
    paint();
    save();
  };
  window.addEventListener(
    'scroll',
    () => {
      paint();
      if (restoring) return;
      const y = window.scrollY,
        delta = y - lastY;
      if (!settingsDialog.open && !tocDialog.open && !focusMode) {
        if (y < 120 || delta < -7) show(true);
        else if (delta > 7) show(false);
      }
      if (Math.abs(delta) > 7) lastY = y;
      clearTimeout(timer);
      timer = setTimeout(save, 250);
    },
    { passive: true },
  );
  window.addEventListener('pagehide', save);
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  toggler.addEventListener('click', () => show(true));
  article.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a,button,input,label') || window.getSelection()?.toString()) return;
    show(!shown);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((button) =>
    button.addEventListener('click', () => {
      show(true);
      (button.dataset.open?.startsWith('settings') ? settingsDialog : tocDialog).showModal();
    }),
  );
  for (const dialog of [settingsDialog, tocDialog]) {
    dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          dialog.close();
      }
    });
    dialog.addEventListener('close', () => {
      lastY = window.scrollY;
      show(true);
      save();
    });
  }
  const preserve = () => {
    const block = blocks.find((b) => b.getBoundingClientRect().bottom > 88);
    return block ? { block, top: block.getBoundingClientRect().top } : null;
  };
  const update = async (next: Settings) => {
    const anchor = preserve();
    settings = next;
    applySettings(settings);
    fill();
    await document.fonts.ready;
    if (anchor)
      window.scrollTo(0, window.scrollY + anchor.block.getBoundingClientRect().top - anchor.top);
    if (novelSpecific) await repository.setNovelSettings(slug, settings);
    else await repository.setSettings(settings);
    paint();
    save();
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  novelToggle.addEventListener('change', async () => {
    novelSpecific = novelToggle.checked;
    const latest = await repository.getState();
    // Enabling copies the current appearance; disabling restores the shared settings.
    if (novelSpecific) await repository.setNovelSettings(slug, settings);
    else {
      await repository.setNovelSettings(slug, null);
      await update(latest.settings);
    }
    if (novelSpecific) fill();
  });
  form.addEventListener('input', (event) => {
    // The scope checkbox is not a reading preference. Its change handler
    // switches repositories, so never overwrite global settings on toggle.
    if (event.target === novelToggle) return;
    const f = new FormData(form);
    void update({
      font: f.get('font') as Settings['font'],
      theme: f.get('theme') as Settings['theme'],
      size: Number(f.get('size')),
      lineHeight: Number(f.get('lineHeight')),
      width: Number(f.get('width')),
      paragraphSpacing: Number(f.get('paragraphSpacing')),
    });
  });
  document
    .getElementById('reset-settings')!
    .addEventListener('click', () => void update({ ...defaults }));
  window.addEventListener('resize', () => {
    paint();
  });
  await restore();
}
