// Статический фронтенд обращается к отдельному Supabase Auth/PostgREST.
// В браузере допустим только publishable key. НИКОГДА service_role.
const rawUrl = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const url = rawUrl?.replace(/\/+$/, '') ?? '';
const key = rawKey ?? '';
const SESSION_KEY = 'hunmeng-novels:session:v1';
export const backendConfigured = /^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(url) && key.length > 12;

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}
export type ApiRecord = Record<string, unknown>;
function storedSession(): Session | null {
  try {
    const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    if (!value || typeof value.access_token !== 'string' ||
        typeof value.refresh_token !== 'string' ||
        typeof value.user?.id !== 'string' ||
        typeof value.expires_at !== 'number') return null;
    return value as Session;
  } catch { return null; }
}
function setSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* Хранилище может быть запрещено. */ }
  window.dispatchEvent(new Event('hunmeng:auth-change'));
}
function parseSession(data: ApiRecord): Session {
  const user = data.user as Session['user'] | undefined;
  if (!user?.id || typeof data.access_token !== 'string' ||
      typeof data.refresh_token !== 'string' || typeof data.expires_in !== 'number')
    throw new Error('Для входа проверьте электронную почту и подтвердите регистрацию.');
  return { user, access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in };
}
async function authRequest(path: string, payload: ApiRecord, accessToken?: string): Promise<ApiRecord> {
  if (!backendConfigured) throw new Error('Сервер ещё не подключён к сайту.');
  const response = await fetch(url + '/auth/v1/' + path, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
    body: JSON.stringify(payload),
  });
  const body: ApiRecord = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(body.msg || body.error_description || body.message || 'Ошибка авторизации'));
  return body;
}
let refreshing: Promise<Session | null> | null = null;
export async function getSession(): Promise<Session | null> {
  const session = storedSession();
  if (!session || !backendConfigured) return null;
  if (session.expires_at > Date.now() / 1000 + 60) return session;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const data = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      const next = parseSession(data);
      setSession(next);
      return next;
    } catch {
      setSession(null);
      return null;
    }
  })();
  try { return await refreshing; } finally { refreshing = null; }
}
export async function signIn(email: string, password: string) {
  const session = parseSession(await authRequest('token?grant_type=password', { email, password }));
  setSession(session);
  return session;
}
export async function signUp(email: string, password: string) {
  const result = await authRequest('signup', { email, password });
  if (result.access_token) setSession(parseSession(result));
  return result;
}
export async function signOut() {
  const session = await getSession();
  if (session) {
    try { await authRequest('logout', {}, session.access_token); } catch { /* Очистить и локально. */ }
  }
  setSession(null);
}
export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  const response = await fetch(url + '/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + session.access_token },
  });
  if (!response.ok) {
    if (response.status === 401) setSession(null);
    return null;
  }
  return await response.json() as { id: string; email?: string };
}
export async function rest<T = ApiRecord[]>(table: string, method = 'GET',
  query = '', body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const session = await getSession();
  if (!session) throw new Error('Нужно войти в аккаунт.');
  if (!/^[a-z_]+$/.test(table)) throw new Error('Некорректная таблица.');
  const response = await fetch(url + '/rest/v1/' + table + (query ? '?' + query : ''), {
    method,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(String(error.message || error.details || 'Сервер отклонил запрос'));
  }
  if (response.status === 204) return [] as T;
  return await response.json() as T;
}
export async function getStaffRole(): Promise<'admin'|'editor'|null> {
  const user = await getUser();
  if (!user) return null;
  const rows = await rest<{ role: 'admin'|'editor' }[]>('novel_staff','GET',
    'select=role&user_id=eq.' + encodeURIComponent(user.id));
  return rows[0]?.role ?? null;
}


const GOOGLE_OAUTH_PKCE_KEY = 'hunmeng-google-pkce:v1';
function b64url(bytes: Uint8Array) {
  let raw = '';
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export async function beginGoogleSignIn() {
  if (!backendConfigured) throw new Error('Сервер авторизации не подключён.');
  if (!window.crypto?.subtle) throw new Error('Для Google-входа требуется HTTPS.');
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = b64url(new Uint8Array(bytes));
  try {
    sessionStorage.setItem(GOOGLE_OAUTH_PKCE_KEY, verifier);
  } catch {
    throw new Error('Разрешите сохранение данных сайта для Google-входа.');
  }
  const target = new URL(url + '/auth/v1/authorize');
  target.searchParams.set('provider', 'google');
  target.searchParams.set('redirect_to', new URL('/account/', location.origin).href);
  target.searchParams.set('code_challenge', challenge);
  target.searchParams.set('code_challenge_method', 's256');
  location.assign(target.href);
}
export async function completeGoogleSignIn(): Promise<boolean> {
  const address = new URL(location.href);
  const code = address.searchParams.get('code');
  const error = address.searchParams.get('error');
  if (!code && !error) return false;
  const description = address.searchParams.get('error_description');
  for (const field of ['code', 'error', 'error_description']) address.searchParams.delete(field);
  history.replaceState(history.state, '', address.pathname + address.search + address.hash);
  let verifier: string | null = null;
  try {
    verifier = sessionStorage.getItem(GOOGLE_OAUTH_PKCE_KEY);
    sessionStorage.removeItem(GOOGLE_OAUTH_PKCE_KEY);
  } catch { /* Cannot exchange without the verifier. */ }
  if (error) throw new Error('Google OAuth: ' + (description || error).slice(0, 240));
  if (!verifier || !/^[A-Za-z0-9_-]{43}$/.test(verifier)) {
    throw new Error('Повторите Google-вход в той же вкладке браузера.');
  }
  const tokens = await authRequest('token?grant_type=pkce', {
    auth_code: code, code_verifier: verifier,
  });
  setSession(parseSession(tokens));
  return true;
}
