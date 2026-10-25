import { createClient, type AuthError } from '@supabase/supabase-js';

import { READER_AUTH_KEY } from './auth-constants';
export { READER_AUTH_KEY } from './auth-constants';
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
    return 'Too many attempts. Wait a moment and try again.';
  switch (authError?.code) {
    case 'invalid_credentials': return 'Unable to sign in. Check your email and password.';
    case 'email_not_confirmed': return 'Confirm your email using the link in the message first.';
    case 'signup_disabled': return 'New registrations are temporarily disabled.';
    case 'weak_password': return 'This password is too weak. Use at least 8 characters, including letters and numbers.';
    case 'email_address_not_authorized': return 'Email cannot be sent to this address yet. The site owner needs to configure email delivery.';
    case 'user_already_exists': return 'Unable to create an account. Try signing in or check your confirmation email.';
    default: return authError?.status && authError.status >= 500
      ? 'Sign-in is temporarily unavailable. Please try again later.'
      : 'Unable to complete the action. Check your connection and try again.';
  }
}
