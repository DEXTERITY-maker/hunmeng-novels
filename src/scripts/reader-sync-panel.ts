import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  syncOwner, isReaderSyncEnabled, enableReaderSync, disableReaderSync,
  syncReaderState, SyncConflictError, SyncOwnershipError, startReaderSync,
} from '../lib/sync';
import type { SyncChoice } from '../lib/reader-sync-merge';

export function initReaderSyncPanel(client:SupabaseClient){
  const panel=document.getElementById('reader-cloud-sync');
  if(!panel)return (_user:User|null)=>{};
  const status=panel.querySelector<HTMLElement>('#reader-cloud-sync-status')!;
  const enable=panel.querySelector<HTMLButtonElement>('#reader-sync-enable')!;
  const now=panel.querySelector<HTMLButtonElement>('#reader-sync-now')!;
  const pause=panel.querySelector<HTMLButtonElement>('#reader-sync-pause')!;
  const conflict=panel.querySelector<HTMLElement>('#reader-sync-conflict')!;
  const detail=panel.querySelector<HTMLElement>('#reader-sync-conflict-detail')!;
  const choices=Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-sync-choice]'));
  let userId:string|null=null;
  let busy=false;
  const paint=()=>{
    const owned=userId?syncOwner():null;
    const mismatch=!!(userId&&owned&&owned!==userId);
    const enabled=!!(userId&&isReaderSyncEnabled(userId));
    enable.hidden=!userId||enabled||mismatch;
    now.hidden=!enabled;
    pause.hidden=!enabled;
    if(!busy) {
      if(mismatch)status.textContent='This browser is linked to another reader account. No data was merged. Sign in with the original account to pause its sync first.';
      else if(!userId)status.textContent='Sign in to manage your cloud library.';
      else if(!enabled)status.textContent='Sync is off. Your library is saved only on this device until you enable it.';
      else status.textContent='Sync enabled for this account. Changes are uploaded after you stop reading.';
    }
    for(const button of [enable,now,pause,...choices])button.disabled=busy;
  };
  const run=async(choice?:SyncChoice)=>{
    const current=userId;
    if(!current||busy)return;
    busy=true;
    status.textContent='Comparing the library on this device with your cloud copy…';
    paint();
    try {
      const result=isReaderSyncEnabled(current)
        ?await syncReaderState(client,choice)
        :await enableReaderSync(client,choice);
      if(userId!==current)return;
      conflict.hidden=true;
      detail.textContent='';
      status.textContent=result.conflictsResolved
        ?'Your choice was saved. Both devices can continue reading.'
        :result.uploaded?'Your library is backed up to your account.':'Your library matches the cloud copy.';
    }catch(error){
      if(userId!==current)return;
      if(error instanceof SyncConflictError){
        conflict.hidden=false;
        detail.textContent=error.conflicts.length+' reading item(s) differ between devices. Nothing has been overwritten.';
        status.textContent='Choose which position to keep before syncing.';
      }else if(error instanceof SyncOwnershipError){
        conflict.hidden=true;
        status.textContent=error.message;
      }else{
        status.textContent=error instanceof Error?error.message:'Sync is unavailable. Your local library is intact.';
      }
    }finally{const saved=status.textContent;busy=false;paint();if(userId===current && saved)status.textContent=saved;}
  };
  enable.addEventListener('click',()=>void run());
  now.addEventListener('click',()=>void run());
  pause.addEventListener('click',()=>{
    if(userId)disableReaderSync(userId);
    conflict.hidden=true;
    paint();
  });
  choices.forEach(button=>button.addEventListener('click',()=>{
    const choice=button.dataset.syncChoice;
    if(choice==='cloud'||choice==='device')void run(choice);
  }));
  window.addEventListener('reader:sync-status',(event)=>{
    if(!userId||!isReaderSyncEnabled(userId))return;
    const state=(event as CustomEvent).detail;
    if(state==='conflict'){
      // Re-read conflict details for the visible choice dialog.
      void run();
    }else if(state==='error'&&!busy){
      status.textContent='Cloud sync is temporarily unavailable. Your reading progress is still saved locally.';
    }
  });
  return (user:User|null)=>{
    userId=user?.id??null;
    conflict.hidden=true;
    busy=false;
    paint();
  };
}
