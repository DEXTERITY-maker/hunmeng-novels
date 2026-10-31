import type { SupabaseClient,User } from '@supabase/supabase-js';
import {halloweenPrizes,halloweenBadge} from '../lib/halloween-event';
type HalloweenAward={event_id:string;place:number;title_id:string;title:string;badge:string;awarded_at:string};
let halloweenAwards:HalloweenAward[]=[];
import { repository, onStorageChange } from '../lib/storage';
import { ranks,readerMasteryTiers,titles,achievements,levelFromTotalXp,getReaderMastery,nextRankMilestone,nextVerifiedAchievement,rankImage,masteryImage,titleStatus,emptyVerifiedStats,type VerifiedStats } from '../lib/reader-progression';

let activeUser: string | null=null;
let requestCount=0;
let clientRef: SupabaseClient | null=null;
type AchievementFilter = 'all' | 'unlocked' | 'locked';
let achievementFilter: AchievementFilter = 'all';
const stat = (id:string,value:number|string) => { const node=document.getElementById(id); if(node) node.textContent=String(value); };
const awardProgress=(metric:string,s:VerifiedStats)=>metric==='chapters'?s.chapters:
 metric==='completedNovels'?s.completedNovels:metric==='readingDays'?s.readingDays:0;
async function paintLocalStats() {
  const local=await repository.getState();
  stat('reader-stat-reading',Object.values(local.library).filter(s=>s==='reading').length);
  stat('reader-stat-later',Object.values(local.library).filter(s=>s==='later').length);
  stat('reader-stat-shelf-completed',Object.values(local.library).filter(s=>s==='completed').length);
}
/**
 * Reader-mastery badges are earned from server-verified XP, never local chapter data.
 * The local, per-account receipt prevents a repeat dialog on refresh without writing
 * anything to the protected progression tables. First observation establishes a
 * baseline rather than pretending a historic achievement was just unlocked.
 */
function rememberMasteryPromotion(userId:string,currentId:string) {
  const next=readerMasteryTiers.findIndex(tier=>tier.id===currentId);
  if(next<0)return null;
  const key=`hunmeng-novels:mastery-seen:v1:${userId}`;
  try {
    const previous=window.localStorage.getItem(key);
    const previousIndex=readerMasteryTiers.findIndex(tier=>tier.id===previous);
    // Never decrease the remembered best tier even if the source is temporarily stale.
    if(previousIndex>=next)return null;
    window.localStorage.setItem(key,currentId);
    return previousIndex>=0?readerMasteryTiers[next]:null;
  }catch{
    // If persistence is unavailable, do not risk repeating the celebration.
    return null;
  }
}
function celebrateMastery(userId:string,seq:number,tier:typeof readerMasteryTiers[number]) {
  queueMicrotask(()=>{
    if(userId!==activeUser||seq!==requestCount)return;
    const modal=document.getElementById('reader-mastery-unlocked') as HTMLDialogElement;
    const image=document.getElementById('reader-mastery-unlocked-image') as HTMLImageElement;
    const rankModal=document.getElementById('reader-rank-unlocked') as HTMLDialogElement;
    const show=()=>{
      if(userId!==activeUser||seq!==requestCount||modal.open)return;
      image.src=masteryImage(tier.id);
      image.alt=`${tier.en} mastery emblem`;
      stat('reader-mastery-unlocked-detail',`${tier.en} · levels ${tier.min}–${tier.max}. Your new emblem is unlocked!`);
      modal.showModal();
    };
    // Native dialogs must not overlap. Give the existing server-verified rank
    // celebration priority, then present the separate reader-mastery badge.
    if(rankModal.open)rankModal.addEventListener('close',show,{once:true});
    else show();
  });
}
/** Filter presentation only; unlocks always use authenticated server progress. */
function paintAchievementFilter() {
  const tiles=[...document.querySelectorAll<HTMLElement>('#reader-advancement [data-achievement-id]')];
  let unlocked=0;
  let visible=0;
  for (const tile of tiles) {
    const earned=tile.dataset.unlocked==='true';
    if (earned) unlocked++;
    const show=achievementFilter==='all'||(achievementFilter==='unlocked'?earned:!earned);
    tile.hidden=!show;
    if(show) visible++;
  }
  document.querySelectorAll<HTMLButtonElement>('[data-achievement-filter]').forEach(button=>{
    button.setAttribute('aria-pressed',String(button.dataset.achievementFilter===achievementFilter));
  });
  stat('reader-stat-achievements',unlocked);
  const summary=document.getElementById('reader-achievements-summary');
  if(summary) summary.textContent=`${unlocked} of ${tiles.length} verified milestones unlocked`;
  const empty=document.getElementById('reader-achievements-empty');
  if(empty) empty.hidden=visible>0;
}
function renderStats(s:VerifiedStats) {
  const level=levelFromTotalXp(s.total_xp);
  const hero=document.querySelector<HTMLElement>('.advancement-hero')!;
  hero.hidden=false;
  document.querySelectorAll<HTMLElement>('#reader-advancement .advancement-stats, #reader-advancement .advancement-section')
    .forEach(section=>{section.hidden=false;});
  stat('reader-level',`Level ${level.level}`);
  stat('reader-rank',level.rank.en);
  const mastery=getReaderMastery(level.level);
  stat('reader-mastery-name',mastery.en);
  document.querySelectorAll<HTMLElement>('[data-mastery-id]').forEach(tile=>{
    const tierMin=Number(tile.dataset.masteryMin);
    const state=tile.dataset.masteryId===mastery.id?'current':
      level.level>=tierMin?'earned':'locked';
    tile.dataset.masteryStatus=state;
    const label=tile.querySelector<HTMLElement>('[data-mastery-state]');
    if(label)label.textContent=state==='current'?'Current step':state==='earned'?'Unlocked':'Locked';
  });
  const current=document.getElementById('reader-current-emblem') as HTMLImageElement;
  current.src=rankImage(level.rank.id);
  current.alt=`${level.rank.en} rank emblem`;
  const avatar=document.getElementById('profile-avatar');
  if (avatar) avatar.dataset.readerRank=level.rank.id;
  const sidebar=document.getElementById('profile-sidebar-rank') as HTMLImageElement | null;
  if(sidebar){sidebar.src=rankImage(level.rank.id);sidebar.alt=`${level.rank.en} rank emblem`;sidebar.hidden=false;}
  const selected=titles.find(t=>t.id===s.selected_title&&titleStatus(t.id,s).unlocked)??titles[0];
  const eventEquipped=halloweenAwards.find(award=>award.title_id===s.selected_title);
  stat('reader-equipped-title',eventEquipped?.title??selected.en);
  const maxed=level.maxed;
  const progress=document.getElementById('reader-xp-progress') as HTMLProgressElement;
  progress.max=maxed?1:level.nextXp;
  progress.value=maxed?1:level.currentXp;
  stat('reader-xp-numbers',maxed?'MAX LEVEL · 500':`${level.currentXp.toLocaleString()} / ${level.nextXp.toLocaleString()} XP`);
  stat('reader-xp-remaining',maxed?'Maximum rank achieved':`${(level.nextXp-level.currentXp).toLocaleString()} XP to next level`);
  const milestone=nextRankMilestone(s.total_xp);
  const preview=document.getElementById('reader-next-rank')!;
  const highest=document.getElementById('reader-highest-rank')!;
  preview.hidden=!milestone;
  highest.hidden=!!milestone;
  if(milestone){
    const emblem=document.getElementById('reader-next-rank-image') as HTMLImageElement;
    emblem.src=rankImage(milestone.rank.id);
    emblem.alt=`${milestone.rank.en} rank emblem`;
    stat('reader-next-rank-name',`${milestone.rank.en} · Level ${milestone.level}`);
    stat('reader-next-rank-remaining',`${milestone.remainingXp.toLocaleString()} verified XP remaining`);
    const bar=document.getElementById('reader-next-rank-progress') as HTMLProgressElement;
    bar.max=milestone.rangeXp;
    bar.value=milestone.progressXp;
    bar.setAttribute('aria-label',`Verified experience toward ${milestone.rank.en} rank`);
  }
  stat('reader-stat-chapters',s.chapters.toLocaleString());
  stat('reader-stat-novels',s.completedNovels.toLocaleString());
  stat('reader-stat-days',s.readingDays.toLocaleString());
  stat('reader-stat-reviews',typeof s.approvedReviews==='number'?s.approvedReviews.toLocaleString():'—');
  stat('reader-stat-collection',typeof s.verifiedLibrary==='number'?s.verifiedLibrary.toLocaleString():'—');
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
    const equipped=item.id===s.selected_title;
    button.disabled=!state.unlocked||equipped;
    button.textContent=equipped?'Equipped':state.unlocked?'Equip':'Locked';
  });
  document.querySelectorAll<HTMLElement>('[data-achievement-id]').forEach(tile=>{
    const item=achievements.find(a=>a.id===tile.dataset.achievementId)!;
    const value=awardProgress(item.metric,s);
    const unlocked=value>=item.target;
    tile.dataset.unlocked=String(unlocked);
    tile.querySelector<HTMLProgressElement>('progress')!.value=Math.min(value,item.target);
    const verifiedDate=s.achievement_dates?.[item.id];
    const date=verifiedDate&&Number.isFinite(Date.parse(verifiedDate))
      ?new Date(verifiedDate).toLocaleDateString():null;
    tile.querySelector<HTMLElement>('[data-achievement-status]')!.textContent=unlocked?
      (date?`Unlocked · ${date}`:'Unlocked'):`${value} / ${item.target}`;
  });
  const upcoming=nextVerifiedAchievement(s);
  const nextPreview=document.getElementById('reader-next-achievement')!;
  const allComplete=document.getElementById('reader-all-achievements')!;
  nextPreview.hidden=!upcoming;
  allComplete.hidden=!!upcoming;
  if(upcoming){
    const {achievement,progress,remaining}=upcoming;
    stat('reader-next-achievement-name',achievement.en);
    stat('reader-next-achievement-description',achievement.description);
    const measure=achievement.metric==='chapters'?'chapter':
      achievement.metric==='completedNovels'?'novel':'reading day';
    stat('reader-next-achievement-remaining',`${remaining.toLocaleString()} ${measure}${remaining===1?'':'s'} to unlock`);
    const bar=document.getElementById('reader-next-achievement-progress') as HTMLProgressElement;
    bar.max=achievement.target;
    bar.value=progress;
    bar.setAttribute('aria-label',`Verified progress toward ${achievement.en}`);
  }
  paintAchievementFilter();
  void paintLocalStats();
  return level.rank;
}
export function initReaderAdvancement(client: SupabaseClient) {
  clientRef=client;
  onStorageChange(()=>{if(activeUser)void paintLocalStats();});
  document.querySelectorAll<HTMLButtonElement>('[data-achievement-filter]').forEach(button=>{
    button.addEventListener('click',()=>{
      const selected=button.dataset.achievementFilter;
      if(selected!=='all'&&selected!=='unlocked'&&selected!=='locked')return;
      achievementFilter=selected;
      paintAchievementFilter();
    });
  });
  document.getElementById('halloween-profile-awards')?.addEventListener('click',async event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-equip-event-title]');
    if(!button||!clientRef||!activeUser||button.disabled)return;
    const award=halloweenAwards.find(item=>item.title_id===button.dataset.equipEventTitle);
    if(!award)return;
    const owner=activeUser;
    button.disabled=true;
    stat('halloween-profile-awards-status','Equipping verified event title…');
    const {data,error}=await clientRef.rpc('reader_select_title',{p_title:award.title_id});
    if(owner!==activeUser)return;
    if(error||data!==true){
      stat('halloween-profile-awards-status','Could not equip this title.');
      button.disabled=false;return;
    }
    stat('halloween-profile-awards-status','Event title equipped.');
    await loadVerified(owner,requestCount);
  });
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
  const masteryModal=document.getElementById('reader-mastery-unlocked') as HTMLDialogElement;
  document.getElementById('reader-mastery-acknowledge')!.addEventListener('click',()=>{
    if(masteryModal.open)masteryModal.close();
  });
  const modal=document.getElementById('reader-rank-unlocked') as HTMLDialogElement;
  const acknowledge=document.getElementById('reader-rank-acknowledge')!;
  // Acknowledge before closing: relying only on the asynchronous dialog
  // close event may lose the update during navigation or component teardown.
  const markSeen=()=>{
    const rank=modal.dataset.pendingRank;
    if(!rank || !activeUser || !clientRef)return;
    delete modal.dataset.pendingRank;
    void clientRef.rpc('reader_mark_rank_seen',{p_rank:rank}).then(()=>{});
  };
  acknowledge.addEventListener('click',()=>{
    markSeen();
    if(modal.open)modal.close();
  });
  modal.addEventListener('close',markSeen);
  return (user:User|null)=>{
    activeUser=user?.id??null;
    const seq=++requestCount;
    const root=document.getElementById('reader-advancement')!;
    if(!user){
      halloweenAwards=[];
      const rewardPanel=document.getElementById('halloween-profile-awards-section');
      if(rewardPanel)rewardPanel.hidden=true;
      document.getElementById('halloween-profile-awards')?.replaceChildren();
      root.dataset.status='signed-out';
      document.querySelector<HTMLElement>('.advancement-hero')!.hidden=true;
      document.querySelectorAll<HTMLElement>('#reader-advancement .advancement-stats, #reader-advancement .advancement-section').forEach(n=>n.hidden=true);
      stat('reader-advancement-status','Sign in to view your verified level and achievements.');
      delete modal.dataset.pendingRank;
      if(modal.open)modal.close();
      if(masteryModal.open)masteryModal.close();
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
  halloweenAwards=[];
  const root=document.getElementById('reader-advancement')!;
  root.dataset.status='ready';
  stat('reader-advancement-status','');
  const rank=renderStats(values);
  const mastery=getReaderMastery(levelFromTotalXp(values.total_xp).level);
  const unlocked=rememberMasteryPromotion(userId,mastery.id);
  if(unlocked)celebrateMastery(userId,seq,unlocked);
  void loadXpHistory(userId,seq);
  void loadHalloweenAwards(userId,seq,values);
  // A first login simply remembers the initial rank. Only genuine promotions
  // display the modal, and acknowledgement persists server-side.
  if(values.last_rank_notified===rank.id)return;
  if(!values.last_rank_notified||ranks.findIndex(r=>r.id===values.last_rank_notified)<0){
    void clientRef.rpc('reader_mark_rank_seen',{p_rank:rank.id}).then(()=>{});
    return;
  }
  const before=ranks.findIndex(r=>r.id===values.last_rank_notified);
  const after=ranks.findIndex(r=>r.id===rank.id);
  if(after<=before)return;
  const modal=document.getElementById('reader-rank-unlocked') as HTMLDialogElement;
  (document.getElementById('reader-new-rank-image') as HTMLImageElement).src=rankImage(rank.id);
  stat('reader-new-rank-detail',`New rank: ${rank.en} · Level ${levelFromTotalXp(values.total_xp).level}. You've unlocked a new rank emblem!`);
  modal.dataset.pendingRank=rank.id;
  if(!modal.open)modal.showModal();
}

/** Fetch read-only, RLS-scoped award events. Never derive account XP from local progress. */
async function loadXpHistory(userId:string,seq:number) {
  if (!clientRef) return;
  const status=document.getElementById('reader-xp-history-status');
  const list=document.getElementById('reader-xp-history-list');
  if (!status||!list) return;
  list.replaceChildren();
  status.textContent='Loading your reward history…';
  // A slow or unavailable service must never leave the account panel loading forever.
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),4000);
  let response;
  try {
    response=await clientRef.from('reader_xp_events')
      .select('event_kind,novel_slug,chapter_slug,xp,awarded_at')
      .order('awarded_at',{ascending:false}).limit(15)
      .abortSignal(controller.signal);
  } catch {
    if (userId===activeUser&&seq===requestCount) status.textContent='Reward history is temporarily unavailable.';
    return;
  } finally {
    window.clearTimeout(timeout);
  }
  if (userId!==activeUser||seq!==requestCount) return;
  const {data,error}=response;
  if(error) {
    status.textContent='Reward history is temporarily unavailable.';
    return;
  }
  if(!data?.length) {
    status.textContent='No verified XP awards yet. Complete a chapter to begin your journey.';
    return;
  }
  status.textContent='Your 15 most recent verified rewards.';
  for(const entry of data) {
    const row=document.createElement('li');
    const label=document.createElement('span');
    const isChapter=entry.event_kind==='chapter_finished';
    label.textContent=isChapter?'Chapter completed':
      entry.event_kind==='novel_finished'?'Novel completed':
      entry.event_kind==='event_reward'?'Halloween Reading Week prize':'Verified XP award';
    const detail=document.createElement('small');
    const date=Date.parse(entry.awarded_at);
    const when=Number.isFinite(date)?new Date(date).toLocaleDateString():'Date unavailable';
    const isEvent=entry.event_kind==='event_reward';
    detail.textContent=isEvent?
      `${entry.chapter_slug==='place-1'?'Place 1':entry.chapter_slug==='place-2'?'Place 2':entry.chapter_slug==='place-3'?'Place 3':'Event reward'} · ${when}`:
      `${entry.novel_slug} · ${when}`;
    const amount=document.createElement('strong');
    amount.textContent=`+${entry.xp} XP`;
    row.append(label,detail,amount);
    list.append(row);
  }
}

/** Optional add-on RPC: old deployments lack it, and verified progression still works. */
async function loadHalloweenAwards(userId:string,seq:number,stats:VerifiedStats){
  if(!clientRef)return;
  const section=document.getElementById('halloween-profile-awards-section');
  const list=document.getElementById('halloween-profile-awards');
  if(!section||!list)return;
  let result;
  try{result=await clientRef.rpc('reader_halloween_my_awards');}
  catch{return;}
  if(userId!==activeUser||seq!==requestCount)return;
  if(result.error||!Array.isArray(result.data))return;
  halloweenAwards=(result.data as HalloweenAward[]).filter(award=>
    award.event_id==='halloween-2026'&&halloweenPrizes.some(prize=>
      prize.place===award.place&&prize.key===award.badge&&prize.titleId===award.title_id));
  list.replaceChildren();
  section.hidden=halloweenAwards.length===0;
  if(!halloweenAwards.length)return;
  const selected=halloweenAwards.find(a=>a.title_id===stats.selected_title);
  if(selected)stat('reader-equipped-title',selected.title);
  for(const award of halloweenAwards){
    const prize=halloweenPrizes.find(p=>p.place===award.place)!;
    const article=document.createElement('article');article.className='halloween-profile-award';
    const fallback=document.createElement('span');fallback.className='halloween-badge-placeholder';
    fallback.textContent='✦';fallback.setAttribute('aria-hidden','true');
    const image=document.createElement('img');image.className='halloween-profile-award-image';
    image.width=72;image.height=72;
    image.alt='Place '+prize.place+' '+prize.key+' Halloween emblem';image.hidden=true;
    image.onload=()=>{image.hidden=false;fallback.hidden=true;};
    image.onerror=()=>{image.hidden=true;fallback.hidden=false;};
    image.src=halloweenBadge(prize.key,true);
    const info=document.createElement('div');info.className='halloween-profile-award-info';
    const title=document.createElement('strong');title.textContent='Place '+prize.place+' · '+award.title;
    const caption=document.createElement('small');
    caption.textContent='Halloween Reading Week · +'+prize.xp.toLocaleString()+' XP';
    info.append(title,caption);
    const button=document.createElement('button');button.type='button';
    button.className='button secondary';button.dataset.equipEventTitle=award.title_id;
    const equipped=award.title_id===stats.selected_title;
    button.textContent=equipped?'Equipped':'Equip title';button.disabled=equipped;
    article.append(fallback,image,info,button);list.append(article);
  }
}
