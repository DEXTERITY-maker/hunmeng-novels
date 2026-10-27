import { createReaderClient } from '../lib/reader-auth';
/** Earn server-verified reading XP after actual reading activity.
 * The server owns all awards and deduplicates completed chapters per account.
 * Only chapter identifiers are sent; scroll position and client XP are NEVER trusted.
 */
export async function startReaderRewardTracking(novel: string, chapter: string, article: HTMLElement) {
  const client = createReaderClient();
  const { data: session } = await client.auth.getSession();
  if (!session.session) return;
  const { data: identity, error: verifyError } = await client.auth.getUser();
  if (verifyError || !identity.user || identity.user.id !== session.session.user.id) return;
  const { data: token, error: startError } = await client.rpc('reader_begin_chapter', {
    p_novel: novel, p_chapter: chapter,
  });
  if (startError || typeof token !== 'string' || !/^[0-9a-f-]{36}$/i.test(token)) return;
  let activeMs = 0;
  let lastTick = performance.now();
  let readingGesture = false;
  let movedThroughText = false;
  let startY = window.scrollY;
  let finished = false;
  let pending = false;
  let failedAttempts = 0;
  let disposed = false;
  const tick = () => {
    const now = performance.now();
    if (document.visibilityState === 'visible' && document.hasFocus())
      activeMs += Math.min(5000, now - lastTick);
    lastTick = now;
  };
  const gesture = (event: Event) => {
    if (!event.isTrusted) return;
    readingGesture = true;
  };
  const scrolling = () => {
    if (!readingGesture) return;
    if (Math.abs(window.scrollY - startY) > 120) movedThroughText = true;
  };
  const atEnd = () => {
    const box = article.getBoundingClientRect();
    return box.height > 160 && box.bottom <= innerHeight + 22 &&
      box.top <= Math.min(20,innerHeight * .06);
  };
  const tryFinish = async () => {
    if (disposed || finished || pending) return;
    tick();
    // Restoration, accidental taps and background time never unlock XP.
    if (!readingGesture || !movedThroughText || activeMs < 90000 || !atEnd()) return;
    pending = true;
    try {
      const { data, error } = await client.rpc('reader_finish_chapter', { p_session: token });
      if (!error && data === true) {
        finished = true;
        window.dispatchEvent(new Event('reader:verified-chapter-finished'));
      } else if (++failedAttempts >= 3) {
        // Avoid polling forever on invalid, expired or duplicate sessions.
        finished = true;
      }
    } catch {
      if (++failedAttempts >= 3) finished = true;
    } finally {
      pending = false;
    }
  };
  const refresh = () => {
    scrolling();
    void tryFinish();
  };
  const visibility = () => {
    tick();
    if (document.visibilityState === 'hidden') readingGesture = false;
  };
  const cleanup = () => {
    disposed = true;
    window.clearInterval(interval);
    window.removeEventListener('scroll', refresh);
    window.removeEventListener('wheel', gesture);
    window.removeEventListener('touchstart', gesture);
    window.removeEventListener('keydown', gesture);
    window.removeEventListener('pagehide', cleanup);
    document.removeEventListener('visibilitychange', visibility);
  };
  window.addEventListener('wheel', gesture, { passive: true });
  window.addEventListener('touchstart', gesture, { passive: true });
  window.addEventListener('keydown', gesture);
  window.addEventListener('scroll', refresh, { passive: true });
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', cleanup, { once: true });
  const interval = window.setInterval(() => {
    if (finished) { cleanup(); return; }
    void tryFinish();
  }, 3000);
}
