import { getEdition, getReleasedBody, releaseLabel } from '../lib/serial-release';
import { initReader } from './reader';

export async function initSerialReader(): Promise<boolean> {
  const main = document.querySelector<HTMLElement>('[data-serial-chapter]');
  if (!main) return false;
  const slug = main.dataset.novel!;
  const number = Number(main.dataset.number);
  const article = document.getElementById('chapter-text')!;
  const status = document.getElementById('serial-status')!;
  const retry = document.getElementById('serial-retry') as HTMLButtonElement;
  let busy = false, finished = false;
  const load = async () => {
    if (busy || finished) return;
    busy = true;
    retry.disabled = true;
    try {
      const [edition, chapter] = await Promise.all([getEdition(slug), getReleasedBody(slug, number)]);
      if (chapter && typeof chapter.body === 'string' && chapter.body.length >= 4000) {
        // Manuscripts are plain prose; no HTML or Markdown from a remote body is executed.
        const paragraphs = chapter.body.split(/\n\s*\n/).map(text => {
          const p = document.createElement('p');
          p.textContent = text;
          return p;
        });
        article.replaceChildren(...paragraphs);
        main.setAttribute('data-reader', '');
        document.querySelectorAll<HTMLElement>('[data-release-unlock]').forEach(el => el.hidden = false);
        document.getElementById('serial-gate')!.hidden = true;
        finished = true;
        await initReader();
      } else {
        status.textContent = edition?.launch_at
          ? `This chapter is locked. ${releaseLabel(edition, number)}. Availability is checked on the server.`
          : 'This chapter is not published yet. Daily releases will begin when the complete manuscript is ready.';
      }
    } catch {
      status.textContent = 'Unable to check this chapter right now. Please try again.';
    } finally {
      busy = false;
      retry.disabled = false;
    }
  };
  retry.addEventListener('click', () => void load());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void load();
  });
  // An open locked tab discovers the release without a page rebuild; server time remains authoritative.
  const interval = window.setInterval(() => { if (!document.hidden) void load(); }, 15000);
  window.addEventListener('pagehide', () => clearInterval(interval), { once: true });
  await load();
  return true;
}
