import { READER_AUTH_KEY } from '../lib/auth-constants';
import { readProfile } from '../lib/profile';
export function initAccountNav() {
  const render = () => {
    let user: { user_metadata?: unknown } | undefined;
    try {
      const saved = JSON.parse(localStorage.getItem(READER_AUTH_KEY) ?? 'null');
      // A local display hint only. Every account action still verifies its session.
      if (saved?.user && (!saved.expires_at || saved.expires_at > Date.now() / 1000)) user = saved.user;
    } catch { /* anonymous navigation */ }
    const saved = !!user;
    document.querySelectorAll<HTMLElement>('[data-account-link]').forEach(link => {
      link.textContent = saved ? 'Profile' : 'Sign in';
    });
    const profile = readProfile(user?.user_metadata);
    document.querySelectorAll<HTMLElement>('[data-account-guest]').forEach(el => { el.hidden = saved; });
    document.querySelectorAll<HTMLElement>('[data-account-member]').forEach(el => { el.hidden = !saved; });
    const name = document.querySelector<HTMLElement>('[data-header-name]');
    if (name) name.textContent = saved ? profile.nickname : 'Welcome to Hunmeng';
    const avatar = document.querySelector<HTMLElement>('[data-header-avatar]');
    if (avatar) {
      const icon = avatar.querySelector('svg');
      if (icon) icon.toggleAttribute('hidden', saved);
      let initial = avatar.querySelector<HTMLElement>('[data-avatar-initial]');
      if (!initial) {
        initial = document.createElement('span');
        initial.dataset.avatarInitial = '';
        avatar.append(initial);
      }
      initial.textContent = saved ? [...profile.nickname][0].toLocaleUpperCase('en') : '';
      avatar.dataset.avatar = saved ? profile.avatar_color : '';
    }
  };
  render();
  window.addEventListener('storage', event => { if (event.key === READER_AUTH_KEY || event.key === null) render(); });
  window.addEventListener('reader:auth-change', render);
  window.addEventListener('pageshow', render);
  document.querySelector<HTMLButtonElement>('[data-header-signout]')?.addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled) return;
    const accountSignout = document.querySelector<HTMLButtonElement>('#account-signout');
    if (accountSignout) {
      accountSignout.click();
      const menu = button.closest('details');
      if (menu) menu.open = false;
      return;
    }
    button.disabled = true;
    const status = document.querySelector<HTMLElement>('[data-header-account-status]')!;
    status.hidden = false;
    status.textContent = 'Signing out…';
    try {
      const { createReaderClient, clearReaderAuthStorage } = await import('../lib/reader-auth');
      const client = createReaderClient();
      const { error } = await client.auth.signOut({ scope: 'local' });
      client.auth.stopAutoRefresh();
      clearReaderAuthStorage();
      if (error) sessionStorage.setItem('hunmeng-reader-local-logout', '1');
      // Discard SDK memory and keep library, progress and preferences on this device.
      location.assign('/account/');
    } catch {
      button.disabled = false;
      status.textContent = 'Unable to sign out. Open your profile and try again.';
    }
  });
}
