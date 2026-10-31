import { defaults, sanitizeState, type ReaderState } from './storage.ts';
import type { Shelf } from '../config/site';
import { mergeBookmarks, type BookmarkEntries } from './bookmarks';

export type SyncChoice = 'device' | 'cloud';
export interface SyncConflict { slug: string; kind: 'shelf' | 'chapter-position' }
export interface MergeResult { state: ReaderState & {bookmarks: BookmarkEntries}; conflicts: SyncConflict[] }

/**
 * Strict conservative merge: do not guess when devices disagree on a book.
 * Missing keys do not mean deletion; explicit shelf tombstones do.
 * XP and achievements never participate in reader-state synchronization.
 */
export function mergeReaderStates(deviceRaw: unknown, cloudRaw: unknown, choice?: SyncChoice): MergeResult {
  const device=sanitizeState(deviceRaw ?? {version:1,settings:defaults});
  const cloud=sanitizeState(cloudRaw ?? {version:1,settings:defaults});
  const state: ReaderState={
    ...device, library:{}, progress:{}, shelfChanges:{},
    novelSettings:{...cloud.novelSettings,...device.novelSettings},
  };
  const conflicts: SyncConflict[]=[];
  const keys=new Set([
    ...Object.keys(device.library),...Object.keys(cloud.library),
    ...Object.keys(device.shelfChanges??{}),...Object.keys(cloud.shelfChanges??{}),
  ]);
  for(const slug of keys){
    const l=Object.prototype.hasOwnProperty.call(device.library,slug) || Object.prototype.hasOwnProperty.call(device.shelfChanges??{},slug);
    const r=Object.prototype.hasOwnProperty.call(cloud.library,slug) || Object.prototype.hasOwnProperty.call(cloud.shelfChanges??{},slug);
    const a=device.shelfChanges?.[slug]?.shelf ?? device.library[slug] ?? null;
    const b=cloud.shelfChanges?.[slug]?.shelf ?? cloud.library[slug] ?? null;
    let source:ReaderState;
    if(l && r && a!==b){
      conflicts.push({slug,kind:'shelf'});
      source=choice==='device'?device:cloud;
    } else if(l&&!r)source=device;
    else if(r&&!l)source=cloud;
    else if(a===b)source=(device.shelfChanges?.[slug]?.updatedAt??0)>=(cloud.shelfChanges?.[slug]?.updatedAt??0)?device:cloud;
    else source=cloud;
    const shelf: Shelf|null=source.shelfChanges?.[slug]?.shelf ?? source.library[slug] ?? null;
    if(shelf)state.library[slug]=shelf;
    const change=source.shelfChanges?.[slug];
    if(change)state.shelfChanges![slug]=change;
  }
  const books=new Set([...Object.keys(device.progress),...Object.keys(cloud.progress)]);
  for(const slug of books){
    const a=device.progress[slug],b=cloud.progress[slug];
    if(!a){state.progress[slug]=b;continue;}
    if(!b){state.progress[slug]=a;continue;}
    if(a.chapterSlug===b.chapterSlug && Math.abs(a.ratio-b.ratio)<=0.03){
      state.progress[slug]=a.updatedAt>=b.updatedAt?a:b;
    }else{
      conflicts.push({slug,kind:'chapter-position'});
      state.progress[slug]=choice==='device'?a:b;
    }
  }
  // Bookmark tombstones and active anchors are independent of shelf/progress
  // conflict decisions. Missing cloud fields (old clients) mean nothing was
  // reported, not that previously known bookmarks have been deleted.
  const deviceBookmarks = deviceRaw && typeof deviceRaw === 'object'
    ? (deviceRaw as {bookmarks?: unknown}).bookmarks : undefined;
  const cloudBookmarks = cloudRaw && typeof cloudRaw === 'object'
    ? (cloudRaw as {bookmarks?: unknown}).bookmarks : undefined;
  return {state:{...sanitizeState(state),bookmarks:mergeBookmarks(deviceBookmarks,cloudBookmarks)},conflicts};
}
