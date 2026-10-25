import { initProfile } from './profile';
import type { User } from '@supabase/supabase-js';
import { assertAuthStorage, clearReaderAuthStorage, createReaderClient, readerAuthConfigured, readerAuthMessage } from '../lib/reader-auth';

export async function initAccount() {
  const status = document.getElementById('account-status')!;
  const form = document.querySelector<HTMLFormElement>('#auth-form')!;
  const fields = document.querySelector<HTMLFieldSetElement>('#reader-auth-fields')!;
  const authFields = document.getElementById('auth-fields')!;
  const loggedIn = document.getElementById('auth-logged-in')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  const confirm = form.elements.namedItem('confirmPassword') as HTMLInputElement;
  const submit = document.getElementById('reader-auth-submit')!;
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]');
  const logout = document.querySelector<HTMLButtonElement>('#account-signout')!;
  const address = new URL(location.href);
  const code = address.searchParams.get('code');
  const callbackError = address.searchParams.has('error');
  let mode = address.searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  // Never read access/refresh tokens from a URL or honor a next/redirect destination.
  if (address.search || address.hash) history.replaceState(null, '', '/account/');
  window.addEventListener('hashchange', () => {
    if (location.hash) {
      history.replaceState(null, '', '/account/');
      status.textContent = 'Войдите по email и паролю. Данные входа из адресной строки не используются.';
    }
  });
  let busy = true;
  let updateProfile: ((user: User | null) => void) | undefined;
  const render = (user: User | null, message?: string) => {
    authFields.hidden = !!user;
    document.getElementById('account-title')!.textContent = user ? 'Мой профиль' : 'Вход и регистрация';
    document.getElementById('account-subtitle')!.textContent = user ? 'Ваше имя и удобный ритм чтения.' : 'Читать новеллы можно и без аккаунта.';
    document.title = (user ? 'Мой профиль' : 'Вход и регистрация') + ' — Хунмэнг новеллы';
    updateProfile?.(user);
    window.dispatchEvent(new CustomEvent('reader:auth-change'));
    loggedIn.hidden = !user;
    document.getElementById('account-email')!.textContent = user?.email ?? '';
    status.textContent = message ?? (user ? 'Вы вошли в аккаунт.' : 'Войдите или создайте аккаунт читателя.');
  };
  const setMode = (value: string) => {
    mode = value === 'signup' ? 'signup' : 'signin';
    const signup = mode === 'signup';
    document.getElementById('confirm-password-label')!.hidden = !signup;
    document.getElementById('signup-hint')!.hidden = !signup;
    confirm.disabled = !signup;
    confirm.required = signup;
    confirm.value = '';
    password.value = '';
    password.autocomplete = signup ? 'new-password' : 'current-password';
    password.minLength = signup ? 8 : 1;
    submit.textContent = signup ? 'Создать аккаунт' : 'Войти';
    buttons.forEach(button => {
      const active = button.dataset.authMode === mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('secondary', !active);
    });
  };
  setMode(mode);
  buttons.forEach(button => button.addEventListener('click', () => {
    if (busy) return;
    setMode(button.dataset.authMode!);
    status.textContent = mode === 'signup' ? 'Создайте аккаунт по email и паролю.' : 'Введите email и пароль.';
  }));
  // Attach before any asynchronous work, so a slow SDK never submits credentials to the static host.
  form.addEventListener('submit', event => { event.preventDefault(); });
  if (!readerAuthConfigured) { status.textContent = 'Сервис авторизации не настроен. Чтение без входа доступно.'; return; }
  try { assertAuthStorage(); }
  catch { status.textContent = 'Для входа разрешите сохранение данных сайта в браузере. Читать можно без аккаунта.'; return; }
  const client = createReaderClient();
  updateProfile = initProfile(client, () => render(null, 'Сессия завершена. Войдите снова.'));
  const refresh = async (message?: string) => {
    const {data:stored,error:sessionError} = await client.auth.getSession();
    if (sessionError) { render(null, 'Сессия завершена. Войдите снова.'); return; }
    if (!stored.session) { render(null,message); return; }
    const {data,error} = await client.auth.getUser();
    if (error) { render(null, readerAuthMessage(error)); return; }
    render(data.user,message);
  };
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') render(null, 'Вы вышли из аккаунта.');
    if (!busy && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'))
      setTimeout(() => { void refresh().catch(()=>render(null,'Не удалось проверить сессию. Повторите вход.')); }, 0);
  });
  form.addEventListener('submit', async () => {
    if (busy) return;
    if (mode === 'signup' && password.value !== confirm.value) {
      status.textContent = 'Пароли не совпадают.';
      confirm.focus(); return;
    }
    busy = true; fields.disabled = true;
    buttons.forEach(button=>button.disabled=true);
    status.textContent = mode === 'signup' ? 'Создаём аккаунт…' : 'Входим…';
    try {
      assertAuthStorage();
      if (mode === 'signup') {
        const {data,error} = await client.auth.signUp({email:email.value.trim(),password:password.value,
          options:{emailRedirectTo:new URL('/account/',location.origin).href}});
        if (error) {status.textContent=readerAuthMessage(error);return;}
        if (data.session) await refresh('Аккаунт создан. Вы вошли в Хунмэнг.');
        else render(null, 'Проверьте почту: если регистрация доступна для этого адреса, придёт письмо со ссылкой подтверждения. После подтверждения можно войти.');
      } else {
        const {error} = await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});
        if (error) {status.textContent=readerAuthMessage(error);return;}
        await refresh();
      }
    } catch { status.textContent='Не удалось выполнить действие. Проверьте соединение и доступ к хранилищу браузера.'; }
    finally {
      password.value='';confirm.value='';busy=false;fields.disabled=false;
      buttons.forEach(button=>button.disabled=false);
    }
  });
  logout.addEventListener('click', async()=>{
    if (busy) return;
    busy=true;logout.disabled=true;
    try {
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) {
        client.auth.stopAutoRefresh();
        clearReaderAuthStorage();
        // Reload to discard any SDK memory after local logout. The flag contains no credentials.
        sessionStorage.setItem('hunmeng-reader-local-logout','1');
        location.replace('/account/');return;
      }
      render(null,'Вы вышли из аккаунта. Библиотека на этом устройстве сохранена.');
    } catch {
      clearReaderAuthStorage();
      render(null,'Вход очищен в этом браузере. Сервер не подтвердил завершение сессии.');
    } finally {busy=false;logout.disabled=false;}
  });
  try {
    if (code && code.length <= 2048) {
      status.textContent='Подтверждаем почту…';
      const {error} = await client.auth.exchangeCodeForSession(code);
      if (error) render(null,'Не удалось завершить подтверждение. Откройте ссылку в том же браузере или войдите после подтверждения почты.');
      else await refresh('Почта подтверждена. Вы вошли в Хунмэнг.');
    } else if (callbackError || address.hash.includes('access_token')) {
      render(null,'Не удалось завершить подтверждение. Попробуйте войти по email и паролю.');
    } else await refresh();
    if (sessionStorage.getItem('hunmeng-reader-local-logout')) {
      sessionStorage.removeItem('hunmeng-reader-local-logout');
      render(null,'Вы вышли в этом браузере. Сервер не подтвердил завершение сессии.');
    }
  } catch {render(null,'Не удалось проверить сессию. Повторите вход.');}
  finally {busy=false;fields.disabled=false;}
}
