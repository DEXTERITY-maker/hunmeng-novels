import { repository, applySettings, onStorageChange, type Theme } from '../lib/storage';

export async function initAppearance() {
  const select = document.querySelector<HTMLSelectElement>('#site-theme');
  if (!select) return;
  const sync = async () => { select.value = (await repository.getSettings()).theme; };
  await sync();
  select.addEventListener('change', async () => {
    const theme = select.value as Theme;
    if (!['system', 'light', 'dark', 'sepia'].includes(theme)) return;
    const settings = { ...await repository.getSettings(), theme };
    await repository.setSettings(settings);
    applySettings(settings);
  });
  onStorageChange(() => void sync());
}
