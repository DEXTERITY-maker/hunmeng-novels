import { repository, normalizeSettings, defaults, applySettings, onStorageChange, type Settings } from '../lib/storage';

/** One shared repository powers account preferences and the in-chapter reader. */
export async function initPreferences() {
  const form = document.querySelector<HTMLFormElement>('#preferences-form');
  if (!form) return;
  const preview = document.getElementById('preferences-preview')!;
  const status = document.getElementById('preferences-status')!;
  const input = (name: string) =>
    form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement;
  const value = (): Settings => normalizeSettings(
    Object.fromEntries([...new FormData(form)].map(([key, val]) =>
      [key, ['size', 'lineHeight', 'width', 'paragraphSpacing', 'sidePadding'].includes(key) ? Number(val) : val])),
    defaults,
  );
  const renderPreview = () => {
    const s = value();
    document.getElementById('pref-size-value')!.textContent = s.size + ' px';
    document.getElementById('pref-leading-value')!.textContent = String(s.lineHeight);
    document.getElementById('pref-width-value')!.textContent = s.width + ' px';
    document.getElementById('pref-padding-value')!.textContent = s.sidePadding + ' px';
    document.getElementById('pref-paragraph-value')!.textContent =
      s.paragraphSpacing.toFixed(2).replace(/0$/, '').replace(/\.$/, '') + ' em';
    preview.style.fontSize = s.size + 'px';
    preview.style.lineHeight = String(s.lineHeight);
    preview.style.maxWidth = s.width + 'px';
    preview.style.paddingInline = s.sidePadding + 'px';
    preview.style.setProperty('--reader-paragraph-space', s.paragraphSpacing + 'em');
    preview.dataset.font = s.font;
    preview.dataset.previewTheme = s.theme;
  };
  const setForm = (settings: Settings) => {
    for (const [key, val] of Object.entries(settings)) input(key).value = String(val);
    renderPreview();
  };
  let pending: Settings | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = async () => {
    clearTimeout(timer);
    if (!pending) return;
    const updated = pending;
    pending = null;
    await repository.setSettings(updated);
    status.textContent = 'Preferences saved on this device.';
  };
  const queueSave = () => {
    pending = value();
    applySettings(pending);
    renderPreview();
    status.textContent = 'Saving preferences…';
    clearTimeout(timer);
    timer = setTimeout(() => void save(), 220);
  };
  form.addEventListener('input', queueSave);
  form.addEventListener('change', queueSave);
  form.addEventListener('submit', event => {
    event.preventDefault();
    pending = value();
    void save();
  });
  document.getElementById('preferences-reset')!.addEventListener('click', () => {
    setForm(defaults);
    pending = { ...defaults };
    applySettings(defaults);
    void save().then(() => { status.textContent = 'Default settings restored.'; });
  });
  onStorageChange(() => {
    if (pending) return;
    void repository.getSettings().then(setForm);
  });
  window.addEventListener('pagehide', () => { if (pending) void save(); });
  setForm(await repository.getSettings());
}
