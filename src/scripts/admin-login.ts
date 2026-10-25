import { backendConfigured, BackendError, getStaffRole, signIn, signOut } from '../lib/backend';

export async function initAdminLogin() {
  const form = document.querySelector<HTMLFormElement>('#admin-login-form')!;
  const fields = document.querySelector<HTMLFieldSetElement>('#admin-login-fields')!;
  const status = document.getElementById('admin-login-status')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  let busy = false;
  const failure = (error: unknown) => {
    status.textContent = error instanceof BackendError ? error.message : 'Не удалось выполнить вход. Попробуйте снова.';
  };
  // Never accept next/redirect parameters. The sole destination is our editorial panel.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !backendConfigured) return;
    busy = true;
    fields.disabled = true;
    status.textContent = 'Проверяем вход и редакторскую роль…';
    try {
      await signIn(email.value.trim(), password.value);
      const role = await getStaffRole();
      if (!role) {
        await signOut();
        status.textContent = 'Нет доступа к редакции. Владелец должен выдать роль администратора или редактора.';
        return;
      }
      location.replace('/admin/');
    } catch (error) {
      await signOut();
      failure(error);
    } finally {
      password.value = '';
      fields.disabled = false;
      busy = false;
    }
  });
  if (!backendConfigured) {
    status.textContent = 'Сервер авторизации не настроен. Обратитесь к владельцу проекта.';
    return;
  }
  try {
    const role = await getStaffRole();
    if (role) { location.replace('/admin/'); return; }
    status.textContent = 'Введите email и пароль учётной записи редакции.';
  } catch (error) { failure(error); }
  fields.disabled = false;
}
