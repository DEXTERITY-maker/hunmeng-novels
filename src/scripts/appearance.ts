import { repository, applySettings, onStorageChange, type Theme } from '../lib/storage';

export async function initAppearance() {
  const options = document.querySelectorAll<HTMLInputElement>('input[name="site-theme"], input[name="site-theme-quick"]');
  if (!options.length) return;
  const sync = async () => {
    const { theme } = await repository.getSettings();
    options.forEach(option => { option.checked = option.value === theme; });
    const label = document.querySelector<HTMLElement>('[data-account-theme-label]');
    if (label) label.textContent = theme === 'system' ? 'Appearance · System' :
      theme === 'sepia' ? 'Appearance · Sepia' : 'Appearance';
  };
  options.forEach(option => option.addEventListener('change', async () => {
    const theme = option.value as Theme;
    if (!['system', 'light', 'dark', 'sepia'].includes(theme)) return;
    const settings = { ...await repository.getSettings(), theme };
    await repository.setSettings(settings);
    applySettings(settings);
  }));
  await sync();
  onStorageChange(() => void sync());
}
