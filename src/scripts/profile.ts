import type { SupabaseClient, User } from '@supabase/supabase-js';
import { readProfile, validateNickname } from '../lib/profile';
import { readerAuthMessage } from '../lib/reader-auth';
import { initPreferences } from './preferences';
export function initProfile(client: SupabaseClient, onExpired: () => void) {
  const form = document.querySelector<HTMLFormElement>('#profile-form')!;
  const fields = document.querySelector<HTMLFieldSetElement>('#profile-fields')!;
  const status = document.getElementById('profile-status')!;
  const nickname = form.elements.namedItem('nickname') as HTMLInputElement;
  const bio = form.elements.namedItem('bio') as HTMLTextAreaElement;
  let current: User | null = null;
  let saving = false;
  const paint = (user: User, fill: boolean) => {
    const profile = readProfile(user.user_metadata);
    document.getElementById('profile-name')!.textContent = profile.nickname;
    const avatar = document.getElementById('profile-avatar')!;
    avatar.textContent = [...profile.nickname][0].toLocaleUpperCase('ru');
    avatar.dataset.avatar = profile.avatar_color;
    document.getElementById('account-confirmed')!.textContent = user.email_confirmed_at ? 'Email подтверждён' : 'Подтверждение email не получено';
    if (fill) {
      nickname.value = profile.nickname; bio.value = profile.bio;
      form.querySelector<HTMLInputElement>(`input[name="avatar_color"][value="${profile.avatar_color}"]`)!.checked = true;
    }
  };
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!current || saving) return;
    const name = validateNickname(nickname.value);
    if (!name) { status.textContent='Проверьте никнейм: от 3 до 24 символов, начиная с буквы или цифры.'; nickname.focus(); return; }
    if (bio.value.length > 160) { status.textContent='Описание должно быть не длиннее 160 символов.'; return; }
    const metadata = readProfile({nickname:name,bio:bio.value.trim(),avatar_color:new FormData(form).get('avatar_color')});
    const userId = current.id;
    saving = true; fields.disabled = true; status.textContent='Сохраняем профиль…';
    try {
      const verified = await client.auth.getUser();
      if (verified.error) {
        if (verified.error.status === 401 || verified.error.status === 403 || verified.error.name === 'AuthSessionMissingError') {
          onExpired(); status.textContent='Сессия завершена. Войдите снова.';
        } else if (current?.id === userId) status.textContent='Не удалось проверить сессию. Проверьте соединение и повторите сохранение.';
        return;
      }
      if (current?.id !== userId) return;
      if (verified.data.user?.id !== userId) { onExpired(); return; }
      // Allow-list presentation fields. Metadata never controls staff roles or editorial access.
      const {data,error} = await client.auth.updateUser({data:metadata});
      if (error) {
        if (error.status === 401 || error.status === 403) onExpired();
        else if (current?.id === userId) status.textContent = readerAuthMessage(error);
        return;
      }
      if (current?.id !== userId) return;
      if (data.user) { current=data.user; paint(data.user,true); status.textContent='Профиль сохранён.'; }
    } catch { status.textContent='Не удалось сохранить профиль. Проверьте соединение и повторите попытку.'; }
    finally { saving=false; fields.disabled=!current; }
  });
  void initPreferences();
  return (user: User | null) => {
    const changed = current?.id !== user?.id;
    current=user; fields.disabled=!user || saving;
    if (user) paint(user,changed);
    else { form.reset(); status.textContent=''; }
  };
}
