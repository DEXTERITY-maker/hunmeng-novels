import { repository, normalizeSettings, defaults, applySettings, onStorageChange, type Settings } from '../lib/storage';
export async function initPreferences() {
  const form = document.querySelector<HTMLFormElement>('#preferences-form');
  if (!form) return;
  const preview = document.getElementById('preferences-preview')!;
  const status = document.getElementById('preferences-status')!;
  const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const value = (): Settings => normalizeSettings(Object.fromEntries([...new FormData(form)].map(([k,v])=>[k,['size','lineHeight','width','paragraphSpacing'].includes(k)?Number(v):v])), defaults);
  const renderPreview = () => {
    const s = value();
    document.getElementById('pref-size-value')!.textContent = `${s.size} px`;
    document.getElementById('pref-leading-value')!.textContent = String(s.lineHeight);
    document.getElementById('pref-width-value')!.textContent = `${s.width} px`;
    document.getElementById('pref-paragraph-value')!.textContent = `${s.paragraphSpacing.toFixed(2).replace(/0$/, '').replace(/\.$/, '')} em`;
    preview.style.fontSize = `${s.size}px`; preview.style.lineHeight = String(s.lineHeight);
    preview.style.maxWidth = `${s.width}px`;
    preview.style.setProperty('--reader-paragraph-space', `${s.paragraphSpacing}em`);
    preview.dataset.font = s.font;
    preview.dataset.previewTheme = s.theme;
  };
  const fill = async () => {
    const s = await repository.getSettings();
    Object.entries(s).forEach(([name,v])=> { input(name).value = String(v); });
    renderPreview();
  };
  form.addEventListener('input', renderPreview);
  form.addEventListener('submit', event => {
    event.preventDefault();
    void repository.setSettings(value()).then(()=> { applySettings(value()); status.textContent='Settings saved on this device.'; });
  });
  document.getElementById('preferences-reset')!.addEventListener('click', ()=> {
    void repository.setSettings({...defaults}).then(()=> { applySettings(defaults); status.textContent='Default settings restored.'; });
  });
  onStorageChange(()=>void fill());
  await fill();
}
