import { HALLOWEEN_START, HALLOWEEN_END } from '../lib/halloween-event';

/** Presentational DOM relocation only. Progress, XP, shelves and RPC code stay unchanged. */
export function initProfileDashboard() {
  const root = document.getElementById('reader-advancement');
  if (!root) return;
  const move = (node: Element | null, id: string) => {
    const slot = document.getElementById(id);
    if (node && slot) slot.append(node);
  };
  const member = document.getElementById('auth-logged-in');
  move(root.querySelector('.advancement-hero'), 'profile-rank-slot');
  move(root.querySelector('.advancement-stats'), 'profile-metrics-slot');
  move(document.querySelector('.advancement-title-line:has(#reader-equipped-title)'), 'profile-title-slot');
  move(document.getElementById('profile-recent-reading'), 'profile-continue-slot');
  move(document.getElementById('reader-next-achievement'), 'profile-goal-slot');
  move(document.getElementById('reader-all-achievements'), 'profile-goal-slot');
  move(document.getElementById('halloween-profile-awards-section'), 'profile-event-awards-slot');
  move(document.getElementById('reader-next-rank'), 'profile-next-rank-slot');
  move(document.getElementById('reader-highest-rank'), 'profile-next-rank-slot');
  move(root.querySelector('.reader-mastery-section'), 'profile-mastery-slot');
  move(root.querySelector('[aria-labelledby="rank-gallery-title"]'), 'profile-rank-gallery-slot');
  move(root.querySelector('[aria-labelledby="reader-titles-heading"]'), 'profile-titles-slot');
  move(root.querySelector('[aria-labelledby="reader-achievements-heading"]'), 'profile-achievements-slot');
  move(root.querySelector('[aria-labelledby="reader-xp-history-heading"]'), 'profile-xp-history-slot');

  const titleLine = document.querySelector('.advancement-journey-actions');
  // Keep the existing nine-rank destination rather than duplicating its state.
  move(titleLine, 'profile-rank-gallery-slot');

  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-overview-tab]')];
  const valid = new Set(tabs.map(tab => tab.dataset.overviewTab));
  const select = (id: string, focus = false) => {
    if (!valid.has(id)) id = 'overview';
    for (const tab of tabs) {
      const active = tab.dataset.overviewTab === id;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      const panel = document.getElementById(tab.getAttribute('aria-controls')!);
      if (panel) panel.hidden = !active;
      if (focus && active) tab.focus();
    }
  };
  const fromHash = () => {
    const hash = location.hash.slice(1);
    select(valid.has(hash) ? hash : 'overview');
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      const id = tab.dataset.overviewTab!;
      select(id);
      if (location.hash !== '#' + id) window.history.pushState(null, '', '#' + id);
    });
    tab.addEventListener('keydown', event => {
      const last = tabs.length - 1;
      let next = index;
      if (event.key === 'ArrowRight') next = index === last ? 0 : index + 1;
      else if (event.key === 'ArrowLeft') next = index === 0 ? last : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = last;
      else return;
      event.preventDefault();
      const target = tabs[next];
      const id = target.dataset.overviewTab!;
      select(id, true);
      if (location.hash !== '#' + id) window.history.replaceState(null, '', '#' + id);
    });
  });
  window.addEventListener('hashchange', fromHash);
  window.addEventListener('popstate', fromHash);
  fromHash();

  // A presentational summary of the live rank; no alternative calculation.
  const rankSummary = document.getElementById('profile-current-rank-summary');
  const level = document.getElementById('reader-level');
  const rank = document.getElementById('reader-rank');
  const updateRank = () => {
    if (rankSummary && level && rank) rankSummary.textContent = 'Current rank: ' + rank.textContent + ' · ' + level.textContent;
  };
  if (level && rank) {
    new MutationObserver(updateRank).observe(level, {childList: true, characterData: true, subtree: true});
    new MutationObserver(updateRank).observe(rank, {childList: true, characterData: true, subtree: true});
    updateRank();
  }

  // Mirror the existing verified goal progress as a compact visual fraction.
  // The goal, its value and its eligibility still come from ReaderAdvancement.
  const goalBar = document.getElementById('reader-next-achievement-progress') as HTMLProgressElement | null;
  if (goalBar && !document.getElementById('profile-goal-ratio')) {
    const ratio = document.createElement('output');
    ratio.id = 'profile-goal-ratio';
    ratio.className = 'profile-goal-ratio';
    ratio.setAttribute('aria-label', 'Goal progress');
    goalBar.insertAdjacentElement('afterend', ratio);
    const refreshRatio = () => { ratio.textContent = Math.round(goalBar.value) + ' / ' + Math.round(goalBar.max); };
    new MutationObserver(refreshRatio).observe(goalBar, {attributes: true, attributeFilter: ['value','max']});
    refreshRatio();
  }

  // Preview the actual rows from the verified, read-only XP history response.
  const historyList = document.getElementById('reader-xp-history-list');
  const recent = document.getElementById('profile-recent-xp-list');
  const recentStatus = document.getElementById('profile-recent-xp-status');
  const historyStatus = document.getElementById('reader-xp-history-status');
  const updateRecent = () => {
    if (!historyList || !recent || !recentStatus) return;
    const entries = [...historyList.children].slice(0, 3);
    recent.replaceChildren(...entries.map(node => node.cloneNode(true)));
    recentStatus.textContent = entries.length ? '' : historyStatus?.textContent || 'No verified XP awards yet.';
  };
  if (historyList) new MutationObserver(updateRecent).observe(historyList, {childList:true});
  if (historyStatus) new MutationObserver(updateRecent).observe(historyStatus, {childList:true,characterData:true,subtree:true});
  updateRecent();

  // Existing Halloween award RPC controls this section's hidden state.
  // The invitation is a non-award fallback only during the actual event.
  const awards = document.getElementById('halloween-profile-awards-section');
  const card = document.getElementById('profile-event-card');
  const invite = document.getElementById('profile-event-invitation');
  const refreshAwards = () => {
    if (!awards || !card || !invite) return;
    const now = Date.now();
    const running = now >= Date.parse(HALLOWEEN_START) && now < Date.parse(HALLOWEEN_END);
    const earned = !awards.hidden;
    invite.hidden = earned || !running;
    card.hidden = !earned && !running;
  };
  if (awards) new MutationObserver(refreshAwards).observe(awards, {attributes:true,attributeFilter:['hidden']});
  if (member) new MutationObserver(refreshAwards).observe(member, {attributes:true,attributeFilter:['hidden']});
  refreshAwards();

  const edit = document.getElementById('profile-edit-dialog') as HTMLDialogElement | null;
  const open = document.getElementById('profile-edit-open') as HTMLButtonElement | null;
  const close = document.getElementById('profile-edit-close') as HTMLButtonElement | null;
  const status = document.getElementById('profile-status');
  open?.addEventListener('click', () => {
    if (!edit || edit.open) return;
    if (status) status.textContent = '';
    edit.showModal();
    edit.querySelector<HTMLInputElement>('[name="nickname"]')?.focus();
  });
  close?.addEventListener('click', () => edit?.close());
  edit?.addEventListener('close', () => open?.focus());
  if (status) new MutationObserver(() => {
    if (status.textContent === 'Profile saved.' && edit?.open) edit.close();
  }).observe(status, {childList:true,characterData:true,subtree:true});
}
