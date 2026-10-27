import type { SupabaseClient, User } from '@supabase/supabase-js';
import { ACHIEVEMENTS, RANKS, TITLES, progressionFromXp, type ServerProgress } from '../config/progression';
import { repository } from '../lib/storage';
import { acknowledgeReaderRank, getReaderProgress, selectReaderTitle } from '../lib/reader-progression';

export function initProgression(client: SupabaseClient) {
  const root = document.querySelector<HTMLElement>('[data-reader-progression]');
  if (!root) return (_user: User | null) => {};
  const content = document.getElementById('progression-content')!;
  const status = document.getElementById('progression-status')!;
  const titleStatus = document.getElementById('progression-title-status')!;
  const rankDialog = document.getElementById('reader-rank-up') as HTMLDialogElement;
  const rankDialogClose = document.getElementById('reader-rank-up-close')!;
  const get = (id: string) => document.getElementById(id)!;
  let revision = 0;
  let activeUser: string | null = null;
  let active: ServerProgress | null = null;
  const format = (number: number) => new Intl.NumberFormat('en-US').format(number);
  const label = (id: string) => TITLES.find(t => t.id === id)?.en ?? TITLES[0].en;
  const paint = async (data: ServerProgress) => {
    const stage = progressionFromXp(data.total_xp);
    const rank = RANKS.find(r => r.id === data.rank)!;
    const box = root.querySelector<HTMLElement>('.progression-identity')!;
    box.dataset.rank = rank.id;
    get('profile-avatar').dataset.readerRank = rank.id;
    const emblem = get('progression-emblem') as HTMLImageElement;
    emblem.src = '/images/ranks/' + rank.id + '.svg';
    emblem.alt = rank.en + ' reader rank';
    get('progression-rank-name').textContent = rank.en;
    get('progression-level').textContent = 'Level ' + data.level;
    get('progression-title').textContent = label(data.selected_title);
    get('progression-xp').textContent = stage.maxLevel ? format(data.total_xp) + ' total XP' :
      format(stage.levelXp) + ' / ' + format(stage.nextLevelXp) + ' XP';
    get('progression-remaining').textContent = stage.maxLevel ? 'Maximum level reached' :
      format(stage.nextLevelXp - stage.levelXp) + ' XP to next level';
    const bar = get('progression-xp-bar') as HTMLProgressElement;
    bar.max = Math.max(1,stage.nextLevelXp);
    bar.value = stage.maxLevel ? bar.max : stage.levelXp;
    for (const key of ['chapters','completedNovels','readingDays','scifiNovels','completedGenres'] as const)
      root.querySelector<HTMLElement>(`[data-progress-stat="${key}"]`)!.textContent = format(data[key]);
    const local = await repository.getState();
    root.querySelector<HTMLElement>('[data-progress-stat="readingOnDevice"]')!.textContent =
      format(Object.values(local.library).filter(shelf => shelf === 'reading').length);
    for (const badge of root.querySelectorAll<HTMLElement>('[data-rank-card]')) {
      const id = badge.dataset.rankCard!;
      const item = RANKS.find(r => r.id === id)!;
      const state = item.max < data.level ? 'Achieved' : item.id === rank.id ? 'Current rank' : 'Locked';
      badge.dataset.state = item.id === rank.id ? 'current' : item.max < data.level ? 'achieved' : 'locked';
      badge.querySelector<HTMLElement>('[data-rank-state]')!.textContent = state;
      if (item.id === rank.id) badge.setAttribute('aria-current','step');
      else badge.removeAttribute('aria-current');
    }
    for (const t of TITLES) {
      const card = root.querySelector<HTMLElement>(`[data-title-card="${t.id}"]`)!;
      const button = card.querySelector<HTMLButtonElement>('button')!;
      const count = t.metric === 'default' ? 0 : t.metric === 'readingDays' ? data.readingDays :
        t.metric === 'scifiNovels' ? data.scifiNovels : t.metric === 'completedGenres' ? data.completedGenres : null;
      const unlocked = t.available && (t.id === 'novice' || count !== null && count >= t.threshold);
      card.dataset.unlocked = String(unlocked);
      card.querySelector<HTMLElement>('[data-title-condition]')!.textContent =
        !t.available ? 'Pending a trustworthy server metric' :
        t.id === 'novice' ? 'Unlocked from the start' :
        `${format(Math.min(count ?? 0, t.threshold))} / ${t.threshold} verified`;
      button.disabled = !unlocked || t.id === data.selected_title;
      button.textContent = t.id === data.selected_title ? 'Equipped' : unlocked ? 'Equip title' : 'Locked';
    }
    for (const achievement of ACHIEVEMENTS) {
      const card = root.querySelector<HTMLElement>(`[data-achievement="${achievement.id}"]`)!;
      const count = data[achievement.metric];
      const date = data.achievement_dates[achievement.id];
      const earned = Boolean(date);
      card.dataset.unlocked = String(earned);
      const bar = card.querySelector('progress')!;
      bar.value = Math.min(count, achievement.threshold);
      card.querySelector<HTMLElement>('[data-achievement-progress]')!.textContent =
        `${format(Math.min(count,achievement.threshold))} / ${format(achievement.threshold)}`;
      card.querySelector<HTMLElement>('[data-achievement-date]')!.textContent = earned
        ? 'Unlocked ' + new Date(date!).toLocaleDateString()
        : 'Not yet unlocked';
    }
    content.hidden = false;
  };
  rankDialogClose.addEventListener('click', () => rankDialog.close());
  const load = async (userId: string, serial: number) => {
    try {
      const data = await getReaderProgress(client);
      if (serial !== revision || activeUser !== userId) return;
      active = data;
      await paint(data);
      if (serial !== revision || activeUser !== userId) return;
      status.textContent = 'Your achievements and XP are verified by your reader account.';
      // Null represents a brand-new account, not a promotion.
      const firstVisit = !data.last_rank_notified;
      const promoted = data.last_rank_notified && data.last_rank_notified !== data.rank;
      if (firstVisit) {
        void acknowledgeReaderRank(client, data.rank).catch(() => {});
      } else if (promoted && !rankDialog.open) {
        (get('reader-rank-up-emblem') as HTMLImageElement).src = '/images/ranks/' + data.rank + '.svg';
        get('reader-rank-up-description').textContent =
          `Level ${data.level} · ${RANKS.find(r=>r.id===data.rank)!.en}. Your new emblem is ready.`;
        rankDialog.showModal();
        rankDialog.addEventListener('close', () => {
          void acknowledgeReaderRank(client, data.rank).catch(() => {});
        }, { once: true });
      }
    } catch {
      if (serial !== revision || activeUser !== userId) return;
      content.hidden = true;
      status.textContent = 'Unable to load verified reader progression. Check your connection and try again.';
    }
  };
  root.querySelectorAll<HTMLButtonElement>('[data-select-title]').forEach(button =>
    button.addEventListener('click', async () => {
      if (!activeUser || !active || button.disabled) return;
      const userId = activeUser, serial = revision, title = button.dataset.selectTitle!;
      button.disabled = true;
      titleStatus.textContent = 'Saving title…';
      try {
        await selectReaderTitle(client, title);
        if (serial !== revision || activeUser !== userId) return;
        titleStatus.textContent = 'Your selected title was saved to your account.';
        await load(userId, serial);
      } catch {
        if (serial !== revision || activeUser !== userId) return;
        titleStatus.textContent = 'Unable to select this title. Try again.';
        // Server state determines unlocks, never optimistically equip.
        void load(userId, serial);
      }
    }));
  return (user: User | null) => {
    const nextUser = user?.id ?? null;
    if (activeUser === nextUser) return;
    activeUser = nextUser;
    active = null;
    revision++;
    rankDialog.close();
    content.hidden = true;
    titleStatus.textContent = '';
    status.textContent = nextUser ? 'Loading your reader progression…' : '';
    if (nextUser) void load(nextUser, revision);
  };
}
