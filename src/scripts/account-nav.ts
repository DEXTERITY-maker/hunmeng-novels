import { READER_AUTH_KEY } from '../lib/auth-constants';
export function initAccountNav() {
  const render = () => {
    let saved = false;
    try { saved = localStorage.getItem(READER_AUTH_KEY) !== null; } catch { /* anonymous navigation */ }
    document.querySelectorAll<HTMLElement>('[data-account-link]').forEach(link => {
      link.textContent = saved ? 'Profile' : 'Sign in';
    });
  };
  render();
  window.addEventListener('storage', event => { if (event.key === READER_AUTH_KEY || event.key === null) render(); });
  window.addEventListener('reader:auth-change', render);
  window.addEventListener('pageshow', render);
}
