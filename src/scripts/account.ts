import { backendConfigured, signIn, signOut, signUp, getUser, beginGoogleSignIn, completeGoogleSignIn } from '../lib/backend';
import { syncReaderState } from '../lib/sync';

export async function initAccount() {
  const status = document.getElementById('account-status')!;
  const form = document.querySelector<HTMLFormElement>('#auth-form')!;
  const authFields = document.getElementById('auth-fields')!;
  const loggedIn = document.getElementById('auth-logged-in')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  const google = document.querySelector<HTMLButtonElement>('#google-sign-in')!;
  const refresh = async () => {
    const user = await getUser();
    authFields.hidden = !!user;
    loggedIn.hidden = !user;
    status.textContent = user ? 'Вы вошли: ' + (user.email ?? 'аккаунт') :
      backendConfigured ? 'Войдите или зарегистрируйтесь, чтобы синхронизировать библиотеку.' :
      'Сервер ещё не подключён. Локальная библиотека работает как прежде.';
    submit.disabled = !backendConfigured;
    google.disabled = !backendConfigured;
  };
  google.addEventListener('click', async () => {
    google.disabled = true;
    status.textContent = 'Перенаправляем в Google…';
    try {
      await beginGoogleSignIn();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Не удалось начать Google-вход.';
      google.disabled = !backendConfigured;
    }
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Проверка аккаунта…';
    try {
      if ((form.elements.namedItem('mode') as HTMLSelectElement).value === 'signup') {
        const result = await signUp(email.value.trim(), password.value);
        await refresh();
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
  const query = new URL(location.href).searchParams;
  if (query.has('code') || query.has('error')) {
    status.textContent = 'Завершаем вход через Google…';
    try {
      if (await completeGoogleSignIn()) {
        await refresh();
        status.textContent = 'Вход через Google выполнен.';
        try {
          await syncReaderState();
          status.textContent = 'Вход через Google выполнен. Библиотека синхронизирована.';
        } catch {
          status.textContent = 'Вход выполнен, но синхронизация пока недоступна. Повторите её вручную.';
        }
      }
    } catch (error) {
      await refresh();
      status.textContent = error instanceof Error ? error.message : 'Не удалось завершить Google-вход.';
    }
  } else {
    await refresh();
  }
}
