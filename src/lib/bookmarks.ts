/**
 * Paragraph bookmark data shared by the local store and cloud merge.
 * No reader UI, progress writes, rewards or database schema changes live here.
 */
export const BOOKMARK_STORAGE_KEY = 'hunmeng-novels:bookmarks:v1';
export const MAX_ACTIVE_BOOKMARKS = 100;
export const MAX_CHAPTER_BOOKMARKS = 10;
export const MAX_QUOTE_LENGTH = 120;
export const MAX_BOOKMARK_BYTES = 80 * 1024;
export const MAX_CLOUD_STATE_BYTES = 192 * 1024;

export interface ParagraphBookmark {
  novelSlug: string;
  chapterSlug: string;
  blockId: string;
  quote: string;
  textHash: string;
  createdAt: number;
  updatedAt: number;
  revision: number;
  deleted: boolean;
}
export type BookmarkEntries = Record<string, ParagraphBookmark>;
export type BookmarkInput = Pick<ParagraphBookmark, 'novelSlug' | 'chapterSlug' | 'blockId' | 'quote' | 'textHash'>;
export interface BookmarkDocument { version: 1; bookmarks: BookmarkEntries }
export interface ParagraphCandidate { blockId: string; text: string }
export type AnchorResult =
  | { status: 'found'; blockId: string; method: 'block' | 'quote' }
  | { status: 'not-found'; reason: 'missing' | 'ambiguous' };

export class BookmarkLimitError extends Error {
  constructor(message: string) { super(message); this.name = 'BookmarkLimitError'; }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const slug = (s: unknown): s is string =>
  typeof s === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 120;
const block = (s: unknown): s is string =>
  typeof s === 'string' && /^block-(0|[1-9]\d*)$/.test(s) && s.length <= 24;
const validTime = (x: unknown): x is number =>
  typeof x === 'number' && Number.isSafeInteger(x) && x >= 0;
const utf8Bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function bookmarkKey(novelSlug: string, chapterSlug: string, blockId: string): string {
  if (!slug(novelSlug) || !slug(chapterSlug) || !block(blockId))
    throw new Error('Invalid paragraph bookmark location.');
  return novelSlug + '/' + chapterSlug + '/' + blockId;
}
export function normalizeParagraph(text: string): string {
  return text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}
export async function paragraphHash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeParagraph(text));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
function validBookmark(value: unknown): value is ParagraphBookmark {
  if (!isObject(value)) return false;
  if (!slug(value.novelSlug) || !slug(value.chapterSlug) || !block(value.blockId)) return false;
  if (typeof value.quote !== 'string' || !value.quote.trim() ||
    [...value.quote].length > MAX_QUOTE_LENGTH || value.quote.length > 480) return false;
  if (typeof value.textHash !== 'string' || !/^[0-9a-f]{64}$/.test(value.textHash)) return false;
  return validTime(value.createdAt) && validTime(value.updatedAt) &&
    validTime(value.revision) && value.revision >= 1 &&
    typeof value.deleted === 'boolean';
}
/** Unknown or absent cloud bookmark fields are treated as empty, never as deletion. */
export function sanitizeBookmarks(value: unknown): BookmarkEntries {
  const result: BookmarkEntries = Object.create(null);
  if (!isObject(value)) return result;
  for (const [key, item] of Object.entries(value)) {
    if (!validBookmark(item)) continue;
    if (key !== bookmarkKey(item.novelSlug, item.chapterSlug, item.blockId)) continue;
    result[key] = { ...item };
  }
  return result;
}
export const emptyBookmarkDocument = (): BookmarkDocument => ({version: 1, bookmarks: {}});
export function bookmarkDocument(value: unknown): BookmarkDocument {
  if (!isObject(value) || value.version !== 1) return emptyBookmarkDocument();
  return {version: 1, bookmarks: sanitizeBookmarks(value.bookmarks)};
}
export function bookmarkBytes(entries: BookmarkEntries): number {
  return utf8Bytes({version: 1, bookmarks: entries});
}
export function assertBookmarkBudget(entries: BookmarkEntries): void {
  const active = Object.values(entries).filter(bookmark => !bookmark.deleted);
  if (active.length > MAX_ACTIVE_BOOKMARKS)
    throw new BookmarkLimitError('Maximum of 100 active paragraph bookmarks reached.');
  const perChapter = new Map<string, number>();
  for (const b of active) {
    const key = b.novelSlug + '/' + b.chapterSlug;
    const next = (perChapter.get(key) ?? 0) + 1;
    if (next > MAX_CHAPTER_BOOKMARKS)
      throw new BookmarkLimitError('Maximum of 10 bookmarks in this chapter reached.');
    perChapter.set(key, next);
  }
  if (bookmarkBytes(entries) > MAX_BOOKMARK_BYTES)
    throw new BookmarkLimitError('Bookmark storage is full (80 KiB). Existing bookmarks were not changed.');
}
export function assertCloudStateBudget(state: unknown): void {
  if (utf8Bytes(state) > MAX_CLOUD_STATE_BYTES)
    throw new BookmarkLimitError('Cloud reading storage is nearly full. Nothing was uploaded or deleted.');
}
export function addParagraphBookmark(
  raw: unknown, input: BookmarkInput, now = Date.now(),
): {bookmarks: BookmarkEntries; bookmark: ParagraphBookmark; added: boolean} {
  const entries = sanitizeBookmarks(raw);
  const key = bookmarkKey(input.novelSlug, input.chapterSlug, input.blockId);
  if (!validTime(now) || !validBookmark({...input, createdAt: now, updatedAt: now, revision: 1, deleted: false}))
    throw new Error('Invalid bookmark. Select a paragraph with a short quote and valid text hash.');
  const old = entries[key];
  if (old && !old.deleted) return {bookmarks: entries, bookmark: old, added: false};
  const bookmark: ParagraphBookmark = {
    ...input, createdAt: old?.createdAt ?? now, updatedAt: now,
    revision: (old?.revision ?? 0) + 1, deleted: false,
  };
  if (!Number.isSafeInteger(bookmark.revision)) throw new BookmarkLimitError('Bookmark revision limit reached.');
  const result = {...entries, [key]: bookmark};
  assertBookmarkBudget(result);
  return {bookmarks: result, bookmark, added: true};
}
export function deleteParagraphBookmark(raw: unknown, key: string, now = Date.now()): BookmarkEntries {
  const entries = sanitizeBookmarks(raw);
  const old = entries[key];
  if (!old || old.deleted) return entries;
  if (!validTime(now) || !Number.isSafeInteger(old.revision + 1))
    throw new Error('Invalid bookmark deletion revision.');
  const result = {...entries, [key]: {...old, revision: old.revision + 1, updatedAt: now, deleted: true}};
  assertBookmarkBudget(result);
  return result;
}
function winner(a: ParagraphBookmark, b: ParagraphBookmark): ParagraphBookmark {
  if (a.revision !== b.revision) return a.revision > b.revision ? a : b;
  if (a.deleted !== b.deleted) return a.deleted ? a : b;
  // Stable tiebreak independent of device clocks or merge direction.
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}
export function mergeBookmarks(deviceRaw: unknown, cloudRaw: unknown): BookmarkEntries {
  const device = sanitizeBookmarks(deviceRaw), cloud = sanitizeBookmarks(cloudRaw);
  const result: BookmarkEntries = Object.create(null);
  for (const key of new Set([...Object.keys(device), ...Object.keys(cloud)]))
    result[key] = device[key] && cloud[key] ? winner(device[key], cloud[key]) : (device[key] ?? cloud[key]);
  return result;
}
/**
 * Fail closed on ambiguous matching paragraphs; never jump to an arbitrary duplicate.
 * The block index is not persistent through chapter editing, so the hash must match.
 */
export async function findBookmarkParagraph(
  bookmark: ParagraphBookmark, paragraphs: readonly ParagraphCandidate[],
): Promise<AnchorResult> {
  const candidates = paragraphs.filter(p => block(p.blockId));
  const target = candidates.find(p => p.blockId === bookmark.blockId);
  if (target && await paragraphHash(target.text) === bookmark.textHash) {
    const duplicates = candidates.filter(p => normalizeParagraph(p.text) === normalizeParagraph(target.text));
    if (duplicates.length === 1) return {status: 'found', blockId: target.blockId, method: 'block'};
    return {status: 'not-found', reason: 'ambiguous'};
  }
  const needle = normalizeParagraph(bookmark.quote);
  if (!needle) return {status: 'not-found', reason: 'missing'};
  const matches = candidates.filter(p => normalizeParagraph(p.text).includes(needle));
  if (matches.length === 1) return {status: 'found', blockId: matches[0].blockId, method: 'quote'};
  return {status: 'not-found', reason: matches.length > 1 ? 'ambiguous' : 'missing'};
}
