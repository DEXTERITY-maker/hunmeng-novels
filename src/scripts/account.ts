import { backendConfigured, signIn, signOut, signUp, getUser } from '../lib/backend';
import { syncReaderState } from '../lib/sync';

export async function initAccount() {
  const status = document.getElementById('account-status')!;
  const form = document.querySelector<HTMLFormElement>('#auth-form')!;
  const authFields = document.getElementById('auth-fields')!;
  const loggedIn = document.getElementById('auth-logged-in')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const refresh = async () => {
    const user = await getUser();
    authFields.hidden = !!user;
    loggedIn.hidden = !user;
    status.textContent = user ? 'Вы вошли: ' + (user.email ?? 'аккаунт') :
      backendConfigured ? 'Войдите или зарегистрируйтесь, чтобы синхронизировать библиотеку.' :
      'Сервер ещё не подключён. Локальная библиотека работает как прежде.';
    submit.disabled = !backendConfigured;
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Проверка аккаунта…';
    try {
      if ((form.elements.namedItem('mode') as HTMLSelectElement).value === 'signup') {
        const result = await signUp(email.value.trim(), password.value);
        status.textContent = result.access_token
          ? 'Аккаунт создан и вход выполнен.'
          : 'Проверьте письмо для подтверждения регистрации.';
      } else {
        await signIn(email.value.trim(), password.value);
        await syncReaderState();
      }
      await refresh();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Ошибка соединения.';
    } finally { submit.disabled = !backendConfigured; }
  });
  document.getElementById('account-sync')?.addEventListener('click', async () => {
    status.textContent = 'Синхронизация…';
    try { await syncReaderState(); status.textContent = 'Библиотека синхронизирована.'; }
    catch(error) { status.textContent = error instanceof Error ? error.message : 'Синхронизация не выполнена.'; }
  });
  document.getElementById('account-signout')?.addEventListener('click', async () => {
    await signOut();
    await refresh();
  });
  await refresh();
}
