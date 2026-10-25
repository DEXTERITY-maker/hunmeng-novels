import { createClient, type AuthError } from '@supabase/supabase-js';

export const READER_AUTH_KEY = 'hunmeng-novels:reader-auth:v1';
const url = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const key = (import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
export const readerAuthConfigured = /^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(url) && key.startsWith('sb_publishable_');
export function assertAuthStorage() {
  const probe = READER_AUTH_KEY + ':check';
  localStorage.setItem(probe, '1');
  localStorage.removeItem(probe);
}
export function clearReaderAuthStorage() {
  for (const key of Object.keys(localStorage))
    if (key === READER_AUTH_KEY || key.startsWith(READER_AUTH_KEY + '-')) localStorage.removeItem(key);
}
export function createReaderClient() {
  if (!readerAuthConfigured) throw new Error('Auth not configured');
  return createClient(url, key, {
    auth: { storageKey: READER_AUTH_KEY, flowType: 'pkce', detectSessionInUrl: false,
      persistSession: true, autoRefreshToken: true, storage: localStorage },
    global: { fetch: (input, options) => fetch(input, { ...options,
      referrerPolicy: 'no-referrer', signal: options?.signal || AbortSignal.timeout(15000) }) },
  });
}
export function readerAuthMessage(error: unknown) {
  const authError = error as Partial<AuthError> | null;
  if (authError?.status === 429 || authError?.code === 'over_request_rate_limit' || authError?.code === 'over_email_send_rate_limit')
    return 'Слишком много попыток. Подождите немного и повторите.';
  switch (authError?.code) {
    case 'invalid_credentials': return 'Не удалось войти. Проверьте email и пароль.';
    case 'email_not_confirmed': return 'Сначала подтвердите email по ссылке из письма.';
    case 'signup_disabled': return 'Сервер временно не принимает новые регистрации.';
    case 'weak_password': return 'Пароль недостаточно надёжен. Используйте не менее 8 символов, буквы и цифры.';
    case 'email_address_not_authorized': return 'Сервис пока не может отправить письмо на этот адрес. Владельцу сайта нужно настроить отправку почты.';
    case 'user_already_exists': return 'Не удалось создать аккаунт. Попробуйте войти или проверьте письмо подтверждения.';
    default: return authError?.status && authError.status >= 500
      ? 'Сервис авторизации временно недоступен. Попробуйте позже.'
      : 'Не удалось выполнить действие. Проверьте соединение и повторите попытку.';
  }
}
