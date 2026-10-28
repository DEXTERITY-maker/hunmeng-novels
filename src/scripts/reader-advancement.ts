import type { SupabaseClient,User } from '@supabase/supabase-js';
import { repository, onStorageChange } from '../lib/storage';
import { achievementCopy, remainingMetricLabel } from '../lib/reader-copy';
import { ranks,titles,achievements,levelFromTotalXp,nextRankMilestone,nextVerifiedAchievement,rankImage,titleStatus,emptyVerifiedStats,type VerifiedStats } from '../lib/reader-progression';

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
  if(summary) summary.textContent=`Открыто ${unlocked} из ${tiles.length} подтверждённых достижений`;
  const empty=document.getElementById('reader-achievements-empty');
  if(empty) empty.hidden=visible>0;
}
function renderStats(s:VerifiedStats) {
  const level=levelFromTotalXp(s.total_xp);
  const hero=document.querySelector<HTMLElement>('.advancement-hero')!;
  hero.hidden=false;
  document.querySelectorAll<HTMLElement>('#reader-advancement .advancement-stats, #reader-advancement .advancement-section')
    .forEach(section=>{section.hidden=false;});
  stat('reader-level',`Уровень ${level.level}`);
  stat('reader-rank',level.rank.ru);
  const current=document.getElementById('reader-current-emblem') as HTMLImageElement;
  current.src=rankImage(level.rank.id);
  current.alt=`Эмблема ранга «${level.rank.ru}»`;
  const avatar=document.getElementById('profile-avatar');
  if (avatar) avatar.dataset.readerRank=level.rank.id;
  const sidebar=document.getElementById('profile-sidebar-rank') as HTMLImageElement | null;
  if(sidebar){sidebar.src=rankImage(level.rank.id);sidebar.alt=`Эмблема ранга «${level.rank.ru}»`;sidebar.hidden=false;}
  const selected=titles.find(t=>t.id===s.selected_title&&titleStatus(t.id,s).unlocked)??titles[0];
  stat('reader-equipped-title',selected.ru);
  const maxed=level.maxed;
  const progress=document.getElementById('reader-xp-progress') as HTMLProgressElement;
  progress.max=maxed?1:level.nextXp;
  progress.value=maxed?1:level.currentXp;
  stat('reader-xp-numbers',maxed?'МАКСИМАЛЬНЫЙ УРОВЕНЬ · 500':`${level.currentXp.toLocaleString()} / ${level.nextXp.toLocaleString()} XP`);
  stat('reader-xp-remaining',maxed?'Максимальный уровень достигнут':`${(level.nextXp-level.currentXp).toLocaleString('ru-RU')} XP до следующего уровня`);
  const milestone=nextRankMilestone(s.total_xp);
  const preview=document.getElementById('reader-next-rank')!;
  const highest=document.getElementById('reader-highest-rank')!;
  preview.hidden=!milestone;
  highest.hidden=!!milestone;
  if(milestone){
    const emblem=document.getElementById('reader-next-rank-image') as HTMLImageElement;
    emblem.src=rankImage(milestone.rank.id);
    emblem.alt=`Эмблема ранга «${milestone.rank.ru}»`;
    stat('reader-next-rank-name',`${milestone.rank.ru} · уровень ${milestone.level}`);
    stat('reader-next-rank-remaining',`Осталось ${milestone.remainingXp.toLocaleString('ru-RU')} подтверждённого XP`);
    const bar=document.getElementById('reader-next-rank-progress') as HTMLProgressElement;
    bar.max=milestone.rangeXp;
    bar.value=milestone.progressXp;
    bar.setAttribute('aria-label',`Опыт до ранга «${milestone.rank.ru}»`);
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
    tile.querySelector<HTMLElement>('[data-rank-state]')!.textContent=currentRank?'Текущий ранг':passed?'Достигнут':'Закрыт';
  });
  document.querySelectorAll<HTMLElement>('[data-title-id]').forEach(tile=>{
    const item=titles.find(t=>t.id===tile.dataset.titleId)!;
    const state=titleStatus(item.id,s);
    const bar=tile.querySelector<HTMLProgressElement>('progress')!;
    bar.value=item.target?Math.min(item.target,state.progress):1;
    const progressText=tile.querySelector<HTMLElement>('[data-award-progress]')!;
    progressText.textContent=!state.available?'Ожидается подтверждённая активность':
      item.target?`${state.progress} / ${item.target}`: 'Доступно с самого начала';
    tile.dataset.unlocked=String(state.unlocked);
    const button=tile.querySelector<HTMLButtonElement>('button')!;
    const equipped=item.id===selected.id;
    button.disabled=!state.unlocked||equipped;
    button.textContent=equipped?'Используется':state.unlocked?'Выбрать':'Закрыто';
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
      (date?`Получено · ${date}`:'Получено'):`${value} / ${item.target}`;
  });
  const upcoming=nextVerifiedAchievement(s);
  const nextPreview=document.getElementById('reader-next-achievement')!;
  const allComplete=document.getElementById('reader-all-achievements')!;
  nextPreview.hidden=!upcoming;
  allComplete.hidden=!!upcoming;
  if(upcoming){
    const {achievement,progress,remaining}=upcoming;
    stat('reader-next-achievement-name',achievement.ru);
    stat('reader-next-achievement-description',achievementCopy[achievement.id]);
    stat('reader-next-achievement-remaining',`${remaining.toLocaleString('ru-RU')} ${remainingMetricLabel(achievement.metric,remaining)} до открытия`);
    const bar=document.getElementById('reader-next-achievement-progress') as HTMLProgressElement;
    bar.max=achievement.target;
    bar.value=progress;
    bar.setAttribute('aria-label',`Подтверждённый прогресс: ${achievement.ru}`);
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
  document.querySelectorAll<HTMLButtonElement>('[data-equip-title]').forEach(button=>{
    button.addEventListener('click',async()=>{
      const owner=activeUser;
      if(!owner||!clientRef||button.disabled)return;
      button.disabled=true;
      stat('reader-title-status','Выбираем звание…');
      const {data,error}=await clientRef.rpc('reader_select_title',{p_title:button.dataset.equipTitle});
      if(owner!==activeUser)return;
      if(error||data!==true) {stat('reader-title-status','Не удалось выбрать звание. Попробуйте ещё раз.');button.disabled=false;return;}
      stat('reader-title-status','Звание выбрано.');
      await loadVerified(owner,requestCount);
    });
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
      root.dataset.status='signed-out';
      document.querySelector<HTMLElement>('.advancement-hero')!.hidden=true;
      document.querySelectorAll<HTMLElement>('#reader-advancement .advancement-stats, #reader-advancement .advancement-section').forEach(n=>n.hidden=true);
      stat('reader-advancement-status','Войдите, чтобы увидеть уровень и подтверждённые достижения.');
      delete modal.dataset.pendingRank;
      if(modal.open)modal.close();
      return;
    }
    root.dataset.status='loading';
    stat('reader-advancement-status','Загружаем подтверждённые достижения…');
    void loadVerified(user.id,seq);
  };
}
async function loadVerified(userId:string,seq:number) {
  if(!clientRef)return;
  const {data,error}=await clientRef.rpc('reader_my_progress');
  if(userId!==activeUser||seq!==requestCount)return;
  if(error||!data||typeof data!=='object'||typeof data.total_xp!=='number') {
    document.getElementById('reader-advancement')!.dataset.status='unavailable';
    stat('reader-advancement-status','Прогресс временно недоступен. Сохранённые награды аккаунта не изменены.');
    return;
  }
  const values={...emptyVerifiedStats(),...data} as VerifiedStats;
  const root=document.getElementById('reader-advancement')!;
  root.dataset.status='ready';
  stat('reader-advancement-status','');
  const rank=renderStats(values);
  void loadXpHistory(userId,seq);
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
  stat('reader-new-rank-detail',`Новый ранг: ${rank.ru} · уровень ${levelFromTotalXp(values.total_xp).level}. Открыта новая эмблема!`);
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
  status.textContent='Загружаем историю наград…';
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
    if (userId===activeUser&&seq===requestCount) status.textContent='История наград временно недоступна.';
    return;
  } finally {
    window.clearTimeout(timeout);
  }
  if (userId!==activeUser||seq!==requestCount) return;
  const {data,error}=response;
  if(error) {
    status.textContent='История наград временно недоступна.';
    return;
  }
  if(!data?.length) {
    status.textContent='Пока нет подтверждённых наград XP. Завершите главу, чтобы начать путь.';
    return;
  }
  status.textContent='Последние 15 подтверждённых наград.';
  for(const entry of data) {
    const row=document.createElement('li');
    const label=document.createElement('span');
    const isChapter=entry.event_kind==='chapter_finished';
    label.textContent=isChapter?'Глава завершена':'Книга завершена';
    const detail=document.createElement('small');
    const date=Date.parse(entry.awarded_at);
    const when=Number.isFinite(date)?new Date(date).toLocaleDateString():'Дата недоступна';
    detail.textContent=`${entry.novel_slug} · ${when}`;
    const amount=document.createElement('strong');
    amount.textContent=`+${entry.xp} XP`;
    row.append(label,detail,amount);
    list.append(row);
  }
}
