import { backendConfigured, getSession, rest } from './backend';
import { site } from '../config/site';
import { repository, sanitizeState, onStorageChange, type ReaderState } from './storage';

let synchronizing = false;
let scheduled: ReturnType<typeof setTimeout> | null = null;
export async function syncReaderState() {
  if (!site.features.accounts || synchronizing || !backendConfigured) return;
  const session = await getSession();
  if (!session) return;
  synchronizing = true;
  try {
    const rows = await rest<{ state: ReaderState }[]>('novel_reader_state', 'GET',
      'select=state&user_id=eq.' + encodeURIComponent(session.user.id));
    const local = await repository.getState();
    let merged = sanitizeState(local);
    if (rows[0]?.state) {
      const remote = sanitizeState(rows[0].state);
      merged = {
        ...local,
        library: { ...remote.library, ...local.library },
        progress: { ...remote.progress },
      };
      for (const [slug, progress] of Object.entries(local.progress)) {
        if (!merged.progress[slug] || progress.updatedAt >= merged.progress[slug].updatedAt)
          merged.progress[slug] = progress;
      }
      // Настройки чтения на текущем устройстве сохраняют приоритет.
      await repository.restoreState(merged);
    }
    await rest('novel_reader_state','POST','',
      {user_id: session.user.id, state: merged, updated_at: new Date().toISOString()},
      {Prefer:'resolution=merge-duplicates,return=representation'});
    window.dispatchEvent(new Event('hunmeng:sync-success'));
  } finally { synchronizing = false; }
}
export function startReaderSync() {
  if (!site.features.accounts || !backendConfigured || typeof window === 'undefined') return;
  const queue = () => {
    if (synchronizing) return;
    if (scheduled) clearTimeout(scheduled);
    scheduled = setTimeout(() => { void syncReaderState().catch(() => {}); }, 1500);
  };
  onStorageChange(queue);
  void syncReaderState().catch(() => {});
  window.addEventListener('online', queue);
  window.addEventListener('hunmeng:auth-change', queue);
}
