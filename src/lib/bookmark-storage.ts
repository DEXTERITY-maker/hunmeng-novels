import {
  BOOKMARK_STORAGE_KEY, addParagraphBookmark, assertBookmarkBudget, bookmarkDocument,
  deleteParagraphBookmark, emptyBookmarkDocument, mergeBookmarks, type BookmarkDocument,
  type BookmarkEntries, type BookmarkInput,
} from './bookmarks';

/**
 * Separate storage key: old reader clients can rewrite hunmeng-novels:v1 without
 * destroying paragraph bookmarks. No Supabase calls happen in this module.
 */
let memory = emptyBookmarkDocument();
const notify = () => window.dispatchEvent(new Event('reader:bookmarks-change'));
function read(): BookmarkDocument {
  try {
    const raw = localStorage.getItem(BOOKMARK_STORAGE_KEY);
    if (raw !== null) memory = bookmarkDocument(JSON.parse(raw));
    return structuredClone(memory);
  } catch {
    window.dispatchEvent(new Event('reader:storage-error'));
    return structuredClone(memory);
  }
}
function write(next: BookmarkEntries): void {
  assertBookmarkBudget(next);
  const state: BookmarkDocument = {version: 1, bookmarks: next};
  // Do not update the memory cache or announce success until persistence succeeds.
  try {
    localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(state));
  } catch {
    window.dispatchEvent(new Event('reader:storage-error'));
    throw new Error('Cannot save paragraph bookmarks on this device. Existing data was not changed.');
  }
  memory = structuredClone(state);
  notify();
}
export const bookmarkRepository = {
  async getState(): Promise<BookmarkDocument> { return read(); },
  async add(input: BookmarkInput): Promise<{added: boolean; bookmark: import('./bookmarks').ParagraphBookmark}> {
    const {bookmarks, bookmark, added} = addParagraphBookmark(read().bookmarks, input);
    if (added) write(bookmarks);
    return {added, bookmark};
  },
  async remove(key: string): Promise<void> {
    const old = read().bookmarks;
    const next = deleteParagraphBookmark(old, key);
    if (JSON.stringify(old) !== JSON.stringify(next)) write(next);
  },
  /**
   * Cloud data is always UNIONED with the latest local state. Even if a
   * previous client dropped the cloud bookmarks field, local items survive.
   */
  async mergeImported(cloud: unknown): Promise<void> {
    const current = read().bookmarks;
    const merged = mergeBookmarks(current, cloud);
    if (JSON.stringify(current) !== JSON.stringify(merged)) write(merged);
  },
};
export function onBookmarkStorageChange(callback: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === BOOKMARK_STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener('storage', storage);
  window.addEventListener('reader:bookmarks-change', callback);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener('reader:bookmarks-change', callback);
  };
}
