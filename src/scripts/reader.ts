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
  let perNovel = !!state.novelSettings[slug];
  let settings = perNovel ? state.novelSettings[slug] : state.settings;
  // Keep an intentional Read later shelf selection intact when the user opens a chapter.
  if (!state.library[slug]) await repository.setShelf(slug, 'reading');
  applySettings(settings);
  const form = document.getElementById('settings-form') as HTMLFormElement;
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
    form.querySelector<HTMLOutputElement>('[data-output="sidePadding"]')!.value = `${settings.sidePadding} px`;
    (form.elements.namedItem('novelOverride') as HTMLInputElement).checked = perNovel;
    const preview = document.querySelector<HTMLElement>('.reader-settings-preview');
    if (preview) preview.dataset.font = settings.font;
  };
  fill();
  let restoring = true;
  let lastY = window.scrollY;
  let shown = true;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let frame = 0;
  let lastSave = 0;
  let readingIntentAt = 0;
  let chapterComplete = !!(state.completedChapters[slug]?.[chapterSlug] ||
    (state.progress[slug]?.chapterSlug === chapterSlug && state.progress[slug]?.completed));
  let updateSequence = 0;

  const toggler = document.getElementById('show-reader-controls')!;
  const show = (visible: boolean) => {
    shown = visible;
    document.body.classList.toggle('controls-hidden', !visible);
    toggler.hidden = visible;
  };
  const fingerprint = (block: HTMLElement): string => {
    const content = (block.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 150);
    let hash = 2166136261;
    for (let i = 0; i < content.length; i++) {
      hash ^= content.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  };
  const visibleBlock = () => {
    // Content blocks are in document order. Binary search avoids scanning hundreds
    // of paragraphs on each scroll frame in long novels.
    let lo = 0, hi = blocks.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (blocks[mid].getBoundingClientRect().bottom <= 88) lo = mid + 1;
      else hi = mid;
    }
    return blocks[Math.min(lo, blocks.length - 1)];
  };
  const position = () => {
    const y = window.scrollY;
    const start = article.getBoundingClientRect().top + y;
    const span = article.offsetHeight - window.innerHeight;
    const end = start + article.offsetHeight;
    const ratio = span <= 0 ? (y + innerHeight >= end ? 1 : 0)
      : Math.max(0, Math.min(1, (y - start) / span));
    const block = visibleBlock();
    const box = block?.getBoundingClientRect();
    return {
      chapterSlug,
      chapterNumber,
      blockId: block?.id || '',
      offset: box?.top || 0,
      blockSignature: block ? fingerprint(block) : undefined,
      blockFraction: box ? Math.max(0, Math.min(1, (88 - box.top) / Math.max(1, box.height))) : 0,
      ratio,
      updatedAt: Date.now(),
      completed: chapterComplete,
    };
  };
  const paint = () => {
    const p = position();
    (document.getElementById('reading-progress') as HTMLProgressElement).value = p.ratio * 100;
    document.getElementById('progress-label')!.textContent = Math.round(p.ratio * 100) + '%';
    if (!restoring && !chapterComplete && readingIntentAt > 0 &&
      Date.now() - readingIntentAt < 30_000 &&
      p.ratio >= 0.995 && article.getBoundingClientRect().bottom <= innerHeight - 4) {
      chapterComplete = true;
      void repository.markChapterRead(slug, chapterSlug, Date.now());
      save();
    }
  };
  const save = () => {
    if (restoring) return;
    lastSave = Date.now();
    void repository.saveProgress(slug, position());
  };
  const scheduleSave = () => {
    clearTimeout(saveTimer);
    if (Date.now() - lastSave > 8_000) save();
    saveTimer = setTimeout(save, 350);
  };
  const restore = async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const p = state.progress[slug];
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Direct links and chapter-to-chapter navigation start at the beginning;
    // only an explicit Continue link or reload restores the saved anchor.
    if (p?.chapterSlug === chapterSlug &&
      (new URLSearchParams(location.search).has('resume') || nav?.type === 'reload')) {
      let block = document.getElementById(p.blockId);
      if (block && p.blockSignature && fingerprint(block) !== p.blockSignature)
        block = null;
      if (!block && p.blockSignature)
        block = blocks.find(candidate => fingerprint(candidate) === p.blockSignature) ?? null;
      if (block) {
        const box = block.getBoundingClientRect();
        const delta = p.blockFraction === undefined ? p.offset : 88 - p.blockFraction * box.height;
        window.scrollTo({ top: Math.max(0, window.scrollY + box.top - delta), behavior: 'instant' });
      } else {
        window.scrollTo({
          top: Math.max(0, article.getBoundingClientRect().top + window.scrollY +
            p.ratio * Math.max(0, article.offsetHeight - innerHeight)),
          behavior: 'instant',
        });
      }
    }
    restoring = false;
    lastY = window.scrollY;
    paint();
    save();
  };

  // User intent is recorded separately from scroll events: programmatic restore,
  // relayout, and auto scrolling cannot silently mark chapters as completed.
  const markReadingIntent = () => { readingIntentAt = Date.now(); };
  window.addEventListener('wheel', markReadingIntent, { passive: true });
  window.addEventListener('touchmove', markReadingIntent, { passive: true });
  document.addEventListener('keydown', event => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'End', 'Home'].includes(event.key) &&
      !(event.target as HTMLElement).closest('input,select,textarea,button,[contenteditable]'))
      markReadingIntent();
  });
  window.addEventListener('scroll', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      paint();
      if (restoring) return;
      const y = window.scrollY, delta = y - lastY;
      if (!settingsDialog.open && !tocDialog.open && !focusMode) {
        if (y < 120 || delta < -7) show(true);
        else if (delta > 7) show(false);
      }
      if (Math.abs(delta) > 7) lastY = y;
      scheduleSave();
    });
  }, { passive: true });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  // Local data also survives long reading sessions without changing tabs.
  const periodicSave = window.setInterval(() => { if (!document.hidden) save(); }, 9_000);
  window.addEventListener('pagehide', () => clearInterval(periodicSave), { once: true });
  toggler.addEventListener('click', () => show(true));
  article.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('a,button,input,label') || window.getSelection()?.toString()) return;
    show(!shown);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach(button =>
    button.addEventListener('click', () => {
      show(true);
      (button.dataset.open?.startsWith('settings') ? settingsDialog : tocDialog).showModal();
    }),
  );
  for (const dialog of [settingsDialog, tocDialog]) {
    dialog.querySelector('[data-close]')!.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => {
      if (e.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom) dialog.close();
      }
    });
    dialog.addEventListener('close', () => { lastY = window.scrollY; show(true); save(); });
  }
  const preserve = () => {
    const block = visibleBlock();
    if (!block) return null;
    const box = block.getBoundingClientRect();
    return { block, fraction: Math.max(0, Math.min(1, (88 - box.top) / Math.max(1, box.height))) };
  };
  const update = async (next: Settings, bookOnly = perNovel) => {
    const anchor = preserve();
    const generation = ++updateSequence;
    settings = next;
    perNovel = bookOnly;
    applySettings(settings);
    fill();
    await document.fonts.ready;
    if (generation !== updateSequence) return;
    if (anchor) {
      const box = anchor.block.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, window.scrollY + box.top +
        anchor.fraction * box.height - 88), behavior: 'instant' });
    }
    if (perNovel) await repository.setNovelSettings(slug, settings);
    else {
      await repository.setNovelSettings(slug, null);
      await repository.setSettings(settings);
    }
    paint();
    save();
  };
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', event => {
    const scope = event.target as HTMLInputElement;
    if (scope.name === 'novelOverride') {
      if (scope.checked) void update({ ...settings }, true);
      else void update({ ...state.settings }, false);
      return;
    }
    const f = new FormData(form);
    void update({
      font: f.get('font') as Settings['font'],
      theme: f.get('theme') as Settings['theme'],
      size: Number(f.get('size')),
      lineHeight: Number(f.get('lineHeight')),
      width: Number(f.get('width')),
      paragraphSpacing: Number(f.get('paragraphSpacing')),
      sidePadding: Number(f.get('sidePadding')),
    });
  });
  document.getElementById('reset-settings')!.addEventListener('click',
    () => void update({ ...defaults }));
  window.addEventListener('resize', () => {
    if (!restoring) {
      paint();
      scheduleSave();
    }
  });
  await restore();
}
