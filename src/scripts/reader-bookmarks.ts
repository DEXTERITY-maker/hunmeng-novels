import {
  bookmarkKey, findBookmarkParagraph, normalizeParagraph, paragraphHash,
  BookmarkLimitError, MAX_ACTIVE_BOOKMARKS, MAX_CHAPTER_BOOKMARKS,
  type ParagraphBookmark,
} from '../lib/bookmarks';
import { bookmarkRepository, onBookmarkStorageChange } from '../lib/bookmark-storage';

interface ChapterLabel { slug: string; number: number; title: string }
interface ReaderBookmarkOptions {
  novelSlug: string;
  chapterSlug: string;
  chapterNumber: number;
  article: HTMLElement;
  paragraphs: HTMLElement[];
  tocDialog: HTMLDialogElement;
  moreMenu: HTMLDetailsElement | null;
}

/**
 * Paragraph bookmarks never write ReaderState or call saveProgress.
 * All anchor matching, revision handling and size limits remain in phase-one modules.
 */
export async function initParagraphBookmarks(options: ReaderBookmarkOptions): Promise<void> {
  const {novelSlug, chapterSlug, article, tocDialog, moreMenu} = options;
  const paragraphs = options.paragraphs.filter(p => p.tagName === 'P' && Boolean(normalizeParagraph(p.textContent ?? '')));
  const menuAction = document.getElementById('reader-paragraph-bookmark-action') as HTMLButtonElement | null;
  const status = document.getElementById('reader-bookmark-status') as HTMLElement | null;
  const tabContents = document.getElementById('reader-toc-contents-tab') as HTMLButtonElement | null;
  const tabBookmarks = document.getElementById('reader-toc-bookmarks-tab') as HTMLButtonElement | null;
  const contentsPanel = document.getElementById('reader-toc-contents-panel') as HTMLElement | null;
  const bookmarksPanel = document.getElementById('reader-toc-bookmarks-panel') as HTMLElement | null;
  const list = document.getElementById('reader-bookmark-list') as HTMLOListElement | null;
  const empty = document.getElementById('reader-bookmark-empty') as HTMLElement | null;
  const count = document.getElementById('reader-bookmark-count') as HTMLElement | null;
  if (!menuAction || !status || !tabContents || !tabBookmarks || !contentsPanel ||
      !bookmarksPanel || !list || !empty || !count) return;

  const chapters: ChapterLabel[] = (() => {
    try { return JSON.parse(bookmarksPanel.dataset.chapters || '[]') as ChapterLabel[]; }
    catch { return []; }
  })();
  const labels = new Map(chapters.map(chapter => [chapter.slug, chapter]));
  const elementById = new Map(paragraphs.map(paragraph => [paragraph.id, paragraph]));
  let active = new Map<string, ParagraphBookmark>();
  let resolvedByBlock = new Map<string, string>();
  let busy = false;
  let pending = 0;
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  const message = (text: string) => {
    clearTimeout(messageTimer);
    status.textContent = text;
    status.hidden = !text;
    if (text) messageTimer = setTimeout(() => { status.hidden = true; }, 6500);
  };
  const visibleParagraph = (): HTMLElement | undefined => {
    const top = Math.max(88, document.querySelector('.reader-header')?.getBoundingClientRect().bottom ?? 0);
    return paragraphs.find(paragraph => {
      const rect = paragraph.getBoundingClientRect();
      return rect.bottom > top && rect.top < window.innerHeight - 48;
    });
  };
  const onThisChapter = (bookmark: ParagraphBookmark) =>
    bookmark.novelSlug === novelSlug && bookmark.chapterSlug === chapterSlug;
  const onThisNovel = (bookmark: ParagraphBookmark) => bookmark.novelSlug === novelSlug;
  const currentKey = (paragraph: HTMLElement) => bookmarkKey(novelSlug, chapterSlug, paragraph.id);
  const activeBookmark = (paragraph: HTMLElement) => active.get(resolvedByBlock.get(paragraph.id) ?? currentKey(paragraph));
  const setTab = (which: 'contents' | 'bookmarks') => {
    const bookmarks = which === 'bookmarks';
    tabContents.setAttribute('aria-pressed', String(!bookmarks));
    tabBookmarks.setAttribute('aria-pressed', String(bookmarks));
    contentsPanel.hidden = bookmarks;
    bookmarksPanel.hidden = !bookmarks;
    if (bookmarks) bookmarksPanel.scrollTop = 0;
  };
  tabContents.addEventListener('click', () => setTab('contents'));
  tabBookmarks.addEventListener('click', () => setTab('bookmarks'));
  tocDialog.addEventListener('reader:toc-open', () => setTab('contents'));

  const paintMenu = () => {
    const paragraph = visibleParagraph();
    const saved = paragraph && activeBookmark(paragraph);
    menuAction.textContent = saved ? 'Remove bookmark' : 'Bookmark this paragraph';
    menuAction.setAttribute('aria-label', saved ? 'Remove bookmark from this paragraph' : 'Bookmark this paragraph');
    menuAction.disabled = busy || !paragraph;
    menuAction.title = !paragraph ? 'Scroll to a paragraph to bookmark it' : menuAction.textContent;
  };

  const markerById = new Map<string, HTMLButtonElement>();
  for (const paragraph of paragraphs) {
    // An empty button keeps chapter text, word counts and paragraph SHA-256 unchanged.
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'reader-paragraph-bookmark-marker';
    button.setAttribute('aria-label', 'Bookmark this paragraph');
    button.title = 'Bookmark this paragraph';
    button.tabIndex = -1; // Unsaved paragraphs remain accessible through the header menu.
    paragraph.classList.add('reader-paragraph-bookmarkable');
    paragraph.append(button);
    markerById.set(paragraph.id, button);
    button.addEventListener('click', () => void toggleParagraph(paragraph, true));
  }

  const renderList = () => {
    list.replaceChildren();
    const items = [...active.entries()].filter(([,bookmark]) => onThisNovel(bookmark))
      .sort(([,a],[,b]) => b.createdAt - a.createdAt);
    count.textContent = String(items.length);
    empty.hidden = items.length !== 0;
    for (const [key, bookmark] of items) {
      const li = document.createElement('li');
      li.className = 'reader-bookmark-item';
      const heading = document.createElement('strong');
      const chapter = labels.get(bookmark.chapterSlug);
      heading.textContent = chapter
        ? 'Chapter ' + chapter.number + ' · ' + chapter.title
        : 'Chapter ' + bookmark.chapterSlug;
      const quote = document.createElement('p');
      quote.className = 'reader-bookmark-quote';
      quote.textContent = '“' + bookmark.quote + '”';
      const date = document.createElement('time');
      const value = new Date(bookmark.createdAt);
      if (Number.isFinite(value.getTime())) {
        date.dateTime = value.toISOString();
        date.textContent = value.toLocaleDateString('en-US', {year:'numeric',month:'short',day:'numeric'});
      } else date.textContent = 'Saved bookmark';
      const actions = document.createElement('div');
      actions.className = 'reader-bookmark-item-actions';
      const open = document.createElement('a');
      open.textContent = 'Open';
      open.setAttribute('aria-label', 'Open bookmark in ' + heading.textContent);
      open.href = '/novel/' + novelSlug + '/' + bookmark.chapterSlug + '/?bookmark=' + encodeURIComponent(key);
      open.addEventListener('click', () => { tocDialog.dataset.bookmarkAction = 'true'; });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', 'Remove bookmark in ' + heading.textContent);
      remove.addEventListener('click', async () => {
        tocDialog.dataset.bookmarkAction = 'true';
        if (!confirm('Remove this paragraph bookmark?')) return;
        try {
          await bookmarkRepository.remove(key);
          message('Bookmark removed.');
        } catch { message('Could not remove the bookmark. Please check device storage.'); }
      });
      actions.append(open, remove);
      li.append(heading, quote, date, actions);
      list.append(li);
    }
  };

  const refresh = async () => {
    const run = ++pending;
    const state = await bookmarkRepository.getState();
    if (run !== pending) return;
    active = new Map(Object.entries(state.bookmarks).filter(([,bookmark]) => !bookmark.deleted));
    const candidates = paragraphs.map(paragraph => ({blockId: paragraph.id, text: paragraph.textContent ?? ''}));
    const savedInChapter = [...active.values()].filter(onThisChapter);
    const matches = await Promise.all(savedInChapter.map(async bookmark => ({
      bookmark, key: bookmarkKey(bookmark.novelSlug, bookmark.chapterSlug, bookmark.blockId),
      found: await findBookmarkParagraph(bookmark, candidates),
    })));
    if (run !== pending) return;
    const marked = new Set(matches.flatMap(({found}) => found.status === 'found' ? [found.blockId] : []));
    resolvedByBlock = new Map(matches.flatMap(({found,key}) => found.status === 'found' ? [[found.blockId, key] as const] : []));
    for (const paragraph of paragraphs) {
      const button = markerById.get(paragraph.id)!;
      const saved = marked.has(paragraph.id);
      paragraph.classList.toggle('reader-paragraph-bookmarked', saved);
      button.setAttribute('aria-label', saved ? 'Remove bookmark from this paragraph' : 'Bookmark this paragraph');
      button.title = saved ? 'Remove bookmark' : 'Bookmark this paragraph';
      button.tabIndex = saved ? 0 : -1;
    }
    renderList();
    paintMenu();
  };

  const toggleParagraph = async (paragraph: HTMLElement, confirmRemoval: boolean) => {
    if (busy) return;
    busy = true;
    paintMenu();
    const key = resolvedByBlock.get(paragraph.id) ?? currentKey(paragraph);
    try {
      const before = (await bookmarkRepository.getState()).bookmarks[key];
      if (before && !before.deleted) {
        if (confirmRemoval && !confirm('Remove this paragraph bookmark?')) return;
        await bookmarkRepository.remove(key);
        message('Bookmark removed.');
      } else {
        const text = normalizeParagraph(paragraph.textContent ?? '');
        const hash = await paragraphHash(text);
        const quote = Array.from(text).slice(0, 120).join('');
        await bookmarkRepository.add({novelSlug, chapterSlug, blockId:paragraph.id, quote, textHash:hash});
        message('Paragraph bookmark saved on this device.');
      }
    } catch (error) {
      message(error instanceof BookmarkLimitError
        ? 'Bookmark limit reached: up to ' + MAX_ACTIVE_BOOKMARKS + ' per reader and ' +
          MAX_CHAPTER_BOOKMARKS + ' per chapter (80 KiB total). Remove older bookmarks to add another.'
        : 'Unable to save this bookmark. Check device storage and try again.');
    } finally {
      busy = false;
      await refresh();
      if (moreMenu) moreMenu.open = false;
    }
  };
  menuAction.addEventListener('click', () => {
    const paragraph = visibleParagraph();
    if (paragraph) void toggleParagraph(paragraph, false);
    else message('Scroll until a paragraph is visible, then choose Bookmark this paragraph.');
  });
  moreMenu?.addEventListener('toggle', paintMenu);
  window.addEventListener('scroll', paintMenu, {passive: true});
  window.addEventListener('resize', paintMenu);
  onBookmarkStorageChange(() => void refresh());

  await refresh();

  const params = new URLSearchParams(location.search);
  const requested = params.get('bookmark');
  if (!requested) return;
  params.delete('bookmark');
  history.replaceState(null, '', location.pathname + (params.size ? '?' + params : '') + location.hash);
  // A link to another chapter is handled after that chapter has actually loaded.
  const bookmark = active.get(requested);
  if (!bookmark || !onThisChapter(bookmark)) {
    window.scrollTo({top:0,behavior:'auto'});
    message('This paragraph bookmark is unavailable. The chapter opened at the beginning.');
    return;
  }
  await document.fonts.ready;
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const found = await findBookmarkParagraph(bookmark, paragraphs.map(p => ({blockId:p.id,text:p.textContent ?? ''})));
  if (found.status === 'found') {
    const target = elementById.get(found.blockId);
    if (target) {
      target.scrollIntoView({block:'start',behavior:'auto'});
      target.classList.add('reader-bookmark-highlight');
      setTimeout(() => target.classList.remove('reader-bookmark-highlight'), 2600);
      message('Opened paragraph bookmark.');
      return;
    }
  }
  window.scrollTo({top:0,behavior:'auto'});
  message('The saved paragraph could not be found after the chapter was edited. The chapter opened at the beginning.');
}
