import type { SupabaseClient,User } from '@supabase/supabase-js';
import { repository } from '../lib/storage';
import { ranks,titles,achievements,levelFromTotalXp,rankImage,titleStatus,emptyVerifiedStats,type VerifiedStats } from '../lib/reader-progression';

let activeUser: string | null=null;
let requestCount=0;
let clientRef: SupabaseClient | null=null;
const stat = (id:string,value:number|string) => { const node=document.getElementById(id); if(node) node.textContent=String(value); };
const awardProgress=(metric:string,s:VerifiedStats)=>metric==='chapters'?s.chapters:
 metric==='completedNovels'?s.completedNovels:metric==='readingDays'?s.readingDays:0;
async function paintLocalStats() {
  const local=await repository.getState();
  stat('reader-stat-reading',Object.values(local.library).filter(s=>s==='reading').length);
  stat('reader-stat-later',Object.values(local.library).filter(s=>s==='later').length);
}
function renderStats(s:VerifiedStats) {
  const level=levelFromTotalXp(s.total_xp);
  const hero=document.querySelector<HTMLElement>('.advancement-hero')!;
  hero.hidden=false;
  document.querySelectorAll<HTMLElement>('#reader-advancement .advancement-stats, #reader-advancement .advancement-section')
    .forEach(section=>{section.hidden=false;});
  stat('reader-level',`Level ${level.level}`);
  stat('reader-rank',level.rank.en);
  const current=document.getElementById('reader-current-emblem') as HTMLImageElement;
  current.src=rankImage(level.rank.id);
  current.alt=`${level.rank.en} rank emblem`;
  const avatar=document.getElementById('profile-avatar');
  if (avatar) avatar.dataset.readerRank=level.rank.id;
  const sidebar=document.getElementById('profile-sidebar-rank') as HTMLImageElement | null;
  if(sidebar){sidebar.src=rankImage(level.rank.id);sidebar.alt=`${level.rank.en} rank emblem`;sidebar.hidden=false;}
  const selected=titles.find(t=>t.id===s.selected_title&&titleStatus(t.id,s).unlocked)??titles[0];
  stat('reader-equipped-title',selected.en);
  const maxed=level.maxed;
  const progress=document.getElementById('reader-xp-progress') as HTMLProgressElement;
  progress.max=maxed?1:level.nextXp;
  progress.value=maxed?1:level.currentXp;
  stat('reader-xp-numbers',maxed?'MAX LEVEL · 500':`${level.currentXp.toLocaleString()} / ${level.nextXp.toLocaleString()} XP`);
  stat('reader-xp-remaining',maxed?'Maximum rank achieved':`${(level.nextXp-level.currentXp).toLocaleString()} XP to next level`);
  stat('reader-stat-chapters',s.chapters.toLocaleString());
  stat('reader-stat-novels',s.completedNovels.toLocaleString());
  stat('reader-stat-days',s.readingDays.toLocaleString());
  let unlockedAchievements=0;
  document.querySelectorAll<HTMLElement>('[data-rank-id]').forEach(tile=>{
    const min=Number(tile.dataset.rankMin);
    const rankId=tile.dataset.rankId;
    const currentRank=rankId===level.rank.id;
    const passed=level.level>=min&&!currentRank;
    tile.dataset.rankStatus=currentRank?'current':passed?'earned':'locked';
    tile.querySelector<HTMLElement>('[data-rank-state]')!.textContent=currentRank?'Current rank':passed?'Reached':'Locked';
  });
  document.querySelectorAll<HTMLElement>('[data-title-id]').forEach(tile=>{
    const item=titles.find(t=>t.id===tile.dataset.titleId)!;
    const state=titleStatus(item.id,s);
    const bar=tile.querySelector<HTMLProgressElement>('progress')!;
    bar.value=item.target?Math.min(item.target,state.progress):1;
    const progressText=tile.querySelector<HTMLElement>('[data-award-progress]')!;
    progressText.textContent=!state.available?'Awaiting verified server activity tracking':
      item.target?`${state.progress} / ${item.target}`: 'Available from the start';
    tile.dataset.unlocked=String(state.unlocked);
    const button=tile.querySelector<HTMLButtonElement>('button')!;
    const equipped=item.id===selected.id;
    button.disabled=!state.unlocked||equipped;
    button.textContent=equipped?'Equipped':state.unlocked?'Equip':'Locked';
  });
  document.querySelectorAll<HTMLElement>('[data-achievement-id]').forEach(tile=>{
    const item=achievements.find(a=>a.id===tile.dataset.achievementId)!;
    const value=awardProgress(item.metric,s);
    const unlocked=value>=item.target;
    if(unlocked) unlockedAchievements++;
    tile.dataset.unlocked=String(unlocked);
    tile.querySelector<HTMLProgressElement>('progress')!.value=Math.min(value,item.target);
    const verifiedDate=s.achievement_dates?.[item.id];
    const date=verifiedDate&&Number.isFinite(Date.parse(verifiedDate))
      ?new Date(verifiedDate).toLocaleDateString():null;
    tile.querySelector<HTMLElement>('[data-achievement-status]')!.textContent=unlocked?
      (date?`Unlocked · ${date}`:'Unlocked'):`${value} / ${item.target}`;
  });
  stat('reader-stat-achievements',unlockedAchievements);
  void paintLocalStats();
  return level.rank;
}
export function initReaderAdvancement(client: SupabaseClient) {
  clientRef=client;
  document.querySelectorAll<HTMLButtonElement>('[data-equip-title]').forEach(button=>{
    button.addEventListener('click',async()=>{
      const owner=activeUser;
      if(!owner||!clientRef||button.disabled)return;
      button.disabled=true;
      stat('reader-title-status','Equipping your title…');
      const {data,error}=await clientRef.rpc('reader_select_title',{p_title:button.dataset.equipTitle});
      if(owner!==activeUser)return;
      if(error||data!==true) {stat('reader-title-status','Unable to equip that title. Please try again.');button.disabled=false;return;}
      stat('reader-title-status','Title equipped.');
      await loadVerified(owner,requestCount);
    });
  });
  const modal=document.getElementById('reader-rank-unlocked') as HTMLDialogElement;
  document.getElementById('reader-rank-acknowledge')?.addEventListener('click',()=>modal.close());
  modal.addEventListener('cancel',()=>{});
  return (user:User|null)=>{
    activeUser=user?.id??null;
    const seq=++requestCount;
    const root=document.getElementById('reader-advancement')!;
    if(!user){
      root.dataset.status='signed-out';
      document.querySelector<HTMLElement>('.advancement-hero')!.hidden=true;
      document.querySelectorAll<HTMLElement>('#reader-advancement .advancement-stats, #reader-advancement .advancement-section').forEach(n=>n.hidden=true);
      stat('reader-advancement-status','Sign in to view your verified level and achievements.');
      if(modal.open)modal.close();
      return;
    }
    root.dataset.status='loading';
    stat('reader-advancement-status','Loading verified reading achievements…');
    void loadVerified(user.id,seq);
  };
}
async function loadVerified(userId:string,seq:number) {
  if(!clientRef)return;
  const {data,error}=await clientRef.rpc('reader_my_progress');
  if(userId!==activeUser||seq!==requestCount)return;
  if(error||!data||typeof data!=='object'||typeof data.total_xp!=='number') {
    document.getElementById('reader-advancement')!.dataset.status='unavailable';
    stat('reader-advancement-status','Verified progression is temporarily unavailable. Your saved account rewards have not been changed.');
    return;
  }
  const values={...emptyVerifiedStats(),...data} as VerifiedStats;
  const root=document.getElementById('reader-advancement')!;
  root.dataset.status='ready';
  stat('reader-advancement-status','');
  const rank=renderStats(values);
  // A first login simply remembers the initial rank. Only genuine promotions
  // display the modal, and acknowledgement persists server-side.
  if(values.last_rank_notified===rank.id)return;
  if(!values.last_rank_notified||ranks.findIndex(r=>r.id===values.last_rank_notified)<0){
    void clientRef.rpc('reader_mark_rank_seen',{p_rank:rank.id});
    return;
  }
  const before=ranks.findIndex(r=>r.id===values.last_rank_notified);
  const after=ranks.findIndex(r=>r.id===rank.id);
  if(after<=before)return;
  const modal=document.getElementById('reader-rank-unlocked') as HTMLDialogElement;
  (document.getElementById('reader-new-rank-image') as HTMLImageElement).src=rankImage(rank.id);
  stat('reader-new-rank-detail',`New rank: ${rank.en} · Level ${levelFromTotalXp(values.total_xp).level}. You've unlocked a new rank emblem!`);
  if(!modal.open)modal.showModal();
  const acknowledge=document.getElementById('reader-rank-acknowledge')!;
  let marked=false;
  const mark=()=>{
    if(marked)return;
    marked=true;
    modal.removeEventListener('close',mark);
    acknowledge.removeEventListener('click',mark);
    if(userId===activeUser)void clientRef?.rpc('reader_mark_rank_seen',{p_rank:rank.id});
  };
  // A click must persist the acknowledgement immediately; close also covers
  // Escape, native dialog dismissal and assistive-technology interactions.
  acknowledge.addEventListener('click',mark);
  modal.addEventListener('close',mark);
}
