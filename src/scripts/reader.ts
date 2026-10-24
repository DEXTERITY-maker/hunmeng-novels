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
  let settings = state.settings;
  if (!state.library[slug] || state.library[slug] === 'later')
    await repository.setShelf(slug, 'reading');
  applySettings(settings);
  const form = document.getElementById('settings-form') as HTMLFormElement;
  const settingsDialog = document.getElementById('reader-settings') as HTMLDialogElement;
  const tocDialog = document.getElementById('reader-toc') as HTMLDialogElement;
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
      if (!settingsDialog.open && !tocDialog.open) {
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
    if ((e.target as HTMLElement).closest('a,button') || window.getSelection()?.toString()) return;
    show(!shown);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((button) =>
    button.addEventListener('click', () => {
      show(true);
      (button.dataset.open === 'settings' ? settingsDialog : tocDialog).showModal();
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
    await repository.setSettings(settings);
    paint();
    save();
  };
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', () => {
    const f = new FormData(form);
    void update({
      font: f.get('font') as Settings['font'],
      theme: f.get('theme') as Settings['theme'],
      size: Number(f.get('size')),
      lineHeight: Number(f.get('lineHeight')),
      width: Number(f.get('width')),
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
