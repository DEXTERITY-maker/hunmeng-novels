import { getEdition, getReleasedChapters, releaseLabel } from '../lib/serial-release';
export async function initSerialContents() {
  const root = document.querySelector<HTMLElement>('[data-serial-contents]');
  if (!root) return;
  const status = root.querySelector<HTMLElement>('[data-release-status]')!;
  const refresh = root.querySelector<HTMLButtonElement>('[data-release-refresh]')!;
  let busy = false;
  const load = async () => {
    if (busy) return;
    busy = true; refresh.disabled = true;
    try {
      const slug = root.dataset.serialContents!;
      const [edition, chapters] = await Promise.all([getEdition(slug), getReleasedChapters(slug)]);
      const released = new Set(chapters.map(c => c.number));
      const local = Number(root.dataset.published);
      root.querySelectorAll<HTMLElement>('[data-release-number]').forEach(row => {
        const number = Number(row.dataset.releaseNumber);
        const available = number <= local || released.has(number);
        const link = row.querySelector<HTMLAnchorElement>('a')!;
        link.hidden = !available;
        row.querySelector<HTMLElement>('[data-locked-title]')!.hidden = available;
        row.querySelector<HTMLElement>('[data-release-date]')!.textContent = available ? 'Available' : edition
          ? releaseLabel(edition, number) : 'Not published yet';
      });
      status.textContent = edition?.launch_at
        ? `${Math.max(local, chapters.length)} of ${edition.total_chapters} chapters available. One more opens daily at 12:00 Moscow time.`
        : `${local} opening chapters available. The 247-chapter manuscript is being written. The daily release schedule has not started yet.`;
    } catch {
      status.textContent = 'Unable to check new releases. Previously published chapters below remain available. Please try again.';
    } finally { busy = false; refresh.disabled = false; }
  };
  refresh.addEventListener('click', () => void load());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void load(); });
  const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  await load();
}
