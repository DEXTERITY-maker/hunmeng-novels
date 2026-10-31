import type { SupabaseClient } from '@supabase/supabase-js';
import { createReaderClient, readerAuthConfigured } from './reader-auth';
import { repository, sanitizeState, onStorageChange, type ReaderState } from './storage';
import { mergeReaderStates, type SyncChoice, type SyncConflict } from './reader-sync-merge';
import { bookmarkRepository, onBookmarkStorageChange } from './bookmark-storage';
import { assertBookmarkBudget, assertCloudStateBudget, sanitizeBookmarks, type BookmarkEntries } from './bookmarks';

const OWNER_KEY='hunmeng-novels:cloud-sync-owner:v1';
const PREVIOUS_OWNER_KEY='hunmeng-novels:cloud-sync-last-owner:v1';
const BASE_PREFIX='hunmeng-novels:cloud-sync-base:v1:';
let active:Promise<SyncResult>|null=null;
let started=false;
let timer:ReturnType<typeof setTimeout>|null=null;

export class SyncConflictError extends Error {
  constructor(public conflicts: SyncConflict[]) {
    super('Different reading positions need your choice before syncing.');
  }
}
export class SyncOwnershipError extends Error {
  constructor(){super('This browser was previously synced with another account. No data was transferred.');}
}
export interface SyncResult { userId:string; uploaded:boolean; conflictsResolved:number }
export function syncOwner():string|null {
  try { return localStorage.getItem(OWNER_KEY); } catch { return null; }
}
export function lastSyncOwner():string|null {
  try { return localStorage.getItem(PREVIOUS_OWNER_KEY)||syncOwner(); }catch{return syncOwner();}
}
export function isReaderSyncEnabled(userId:string):boolean { return syncOwner()===userId; }
export function disableReaderSync(userId:string) {
  if(syncOwner()===userId) try {
    localStorage.setItem(PREVIOUS_OWNER_KEY,userId);
    localStorage.removeItem(OWNER_KEY);
  } catch {}
  window.dispatchEvent(new Event('reader:sync-preference'));
}
const sorted=(v:Record<string,unknown>|undefined)=>Object.fromEntries(Object.entries(v??{}).sort(([a],[b])=>a.localeCompare(b)));
/** Excludes per-device global appearance settings from cloud comparisons. */
function snapshot(value:ReaderState & {bookmarks?: BookmarkEntries}):string {
  const s=sanitizeState(value);
  return JSON.stringify({
    library:sorted(s.library),progress:sorted(s.progress),
    shelfChanges:sorted(s.shelfChanges),novelSettings:sorted(s.novelSettings),
    bookmarks:sorted(sanitizeBookmarks(value.bookmarks)),
  });
}
function lastSynced(userId:string):{version:string;hash:string}|null {
  try {
    const value=JSON.parse(localStorage.getItem(BASE_PREFIX+userId)||'null');
    return typeof value?.version==='string'&&typeof value?.hash==='string'?value:null;
  }catch{return null;}
}
function rememberSync(userId:string,version:string,hash:string){
  try {localStorage.setItem(BASE_PREFIX+userId,JSON.stringify({version,hash}));}catch{}
}
async function perform(client:SupabaseClient, choice?:SyncChoice):Promise<SyncResult> {
  const {data:session,error:authError}=await client.auth.getSession();
  const userId=session.session?.user.id;
  if(authError || !userId) throw new Error('Sign in to sync your reading library.');
  const owner=lastSyncOwner();
  if(owner && owner!==userId) throw new SyncOwnershipError();
  for(let attempt=0;attempt<3;attempt++){
    // A failed connection must not leave the interface spinning indefinitely.
    const controller=new AbortController();
    const timeout=window.setTimeout(()=>controller.abort(),3500);
    let fetched;
    try {
      fetched=await client.from('novel_reader_state')
        .select('state,updated_at').eq('user_id',userId)
        .abortSignal(controller.signal).maybeSingle();
    }catch {
      throw new Error('Unable to read the cloud library. Your device copy is unchanged.');
    }finally {window.clearTimeout(timeout);}
    if(fetched.error) throw new Error('Unable to read the cloud library. Your device copy is unchanged.');
    const remote=fetched.data as {state:ReaderState;updated_at:string}|null;
    const before=await repository.getState();
    const deviceBookmarks=(await bookmarkRepository.getState()).bookmarks;
    const withBookmarks={...before,bookmarks:deviceBookmarks};
    const baseline=lastSynced(userId);
    // Three-way reconciliation: a device may freely advance when the cloud
    // has not changed since its last successful sync, and vice versa.
    // Simultaneous edits to the same book still need an explicit decision.
    let resolution=choice;
    if(!resolution&&baseline){
      if(!remote||baseline.version===remote.updated_at)resolution='device';
      else if(baseline.hash===snapshot(withBookmarks))resolution='cloud';
    }
    const result=mergeReaderStates(withBookmarks,remote?.state,resolution);
    if(result.conflicts.length&&!resolution) throw new SyncConflictError(result.conflicts);
    const cloudState:ReaderState & {bookmarks: BookmarkEntries}={
      ...result.state,
      // Reading appearance is device-specific; do not overwrite another device.
      settings:remote ? sanitizeState(remote.state).settings : before.settings,
    };
    // Never silently evict entries (including deletion markers) to fit cloud storage.
    assertBookmarkBudget(result.state.bookmarks);
    const changed=!remote || snapshot(cloudState)!==snapshot(remote.state);
    let version=remote?.updated_at??'';
    if(changed) {
      assertCloudStateBudget(cloudState);
      const stillSignedIn=await client.auth.getSession();
      if(stillSignedIn.data.session?.user.id!==userId)
        throw new Error('Account changed during sync. No cloud updates were sent.');
      if(remote){
        const requestedVersion=new Date().toISOString();
        const write=await client.from('novel_reader_state')
          .update({state:cloudState,updated_at:requestedVersion})
          .eq('user_id',userId).eq('updated_at',remote.updated_at)
          .select('updated_at').maybeSingle();
        if(write.error) throw new Error('Unable to update the cloud library. Your device copy is unchanged.');
        if(!write.data)continue; // Another device wrote first. Re-read, never blindly overwrite.
        const saved=Array.isArray(write.data)?write.data[0]:write.data;
        version=saved?.updated_at??requestedVersion;
      }else{
        const write=await client.from('novel_reader_state')
          .insert({user_id:userId,state:cloudState})
          .select('updated_at').maybeSingle();
        if(write.error){
          if(write.error.code==='23505')continue; // Concurrent first sign-in.
          throw new Error('Unable to create cloud reading storage. Your device copy is unchanged.');
        }
        const saved=Array.isArray(write.data)?write.data[0]:write.data;
        version=saved?.updated_at??'';
      }
    }
    const newest=await repository.getState();
    const newestBookmarks=(await bookmarkRepository.getState()).bookmarks;
    if(snapshot({...newest,bookmarks:newestBookmarks})===snapshot(withBookmarks)){
      // Preserve device-specific appearance and preferences even after import.
      // restoreState intentionally strips cloud-only bookmarks: local bookmarks
      // are persisted exclusively under hunmeng-novels:bookmarks:v1.
      await repository.restoreState({...newest,...result.state,settings:newest.settings});
      await bookmarkRepository.mergeImported(result.state.bookmarks);
    }else{
      // New bookmarks created during the request are unioned, never replaced.
      await bookmarkRepository.mergeImported(result.state.bookmarks);
      // Do not erase chapter progress written while the request was in flight.
      window.dispatchEvent(new Event('reader:sync-pending'));
    }
    if(version)rememberSync(userId,version,snapshot(result.state));
    return {userId,uploaded:changed,conflictsResolved:choice?result.conflicts.length:0};
  }
  throw new Error('Your library changed on another device. Please retry.');
}
export async function syncReaderState(client:SupabaseClient,choice?:SyncChoice):Promise<SyncResult> {
  if(active)return active;
  const promise=perform(client,choice);
  active=promise;
  try{return await promise;}finally{if(active===promise)active=null;}
}
export async function enableReaderSync(client:SupabaseClient,choice?:SyncChoice):Promise<SyncResult> {
  const result=await syncReaderState(client,choice);
  try {localStorage.setItem(PREVIOUS_OWNER_KEY,result.userId);localStorage.setItem(OWNER_KEY,result.userId);}
  catch {throw new Error('Allow browser storage to keep sync enabled.');}
  window.dispatchEvent(new Event('reader:sync-preference'));
  return result;
}
/** Sync only after a user has explicitly opted in for this account and browser. */
export function startReaderSync() {
  if(started || !readerAuthConfigured || typeof window==='undefined')return;
  started=true;
  let client:SupabaseClient|null=null;
  const queue=()=>{
    if(!syncOwner())return;
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{
      timer=null;
      if(!navigator.onLine||!syncOwner())return;
      client??=createReaderClient();
      void client.auth.getSession().then(async({data})=>{
        if(!data.session||!isReaderSyncEnabled(data.session.user.id))return;
        try{
          await syncReaderState(client!);
          window.dispatchEvent(new CustomEvent('reader:sync-status',{detail:'synced'}));
        }catch(error){
          window.dispatchEvent(new CustomEvent('reader:sync-status',{
            detail:error instanceof SyncConflictError?'conflict':'error'
          }));
        }
      }).catch(()=>{});
    },3500);
  };
  onStorageChange(queue);
  onBookmarkStorageChange(queue);
  window.addEventListener('online',queue);
  window.addEventListener('pageshow',queue);
  window.addEventListener('reader:sync-pending',queue);
  window.addEventListener('reader:sync-preference',queue);
  window.addEventListener('reader:auth-change',queue);
  queue();
}
