// Only the public publishable key belongs in a static bundle. RLS is the access boundary.
const url = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const key = (import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
export const backendConfigured = /^https:\/\/[a-z0-9.-]+\.supabase\.co$/.test(url) && key.startsWith('sb_publishable_');
const SESSION_KEY = 'hunmeng-novels:session:v1';
const ADMIN_SESSION_KEY = 'hunmeng-novels:admin-session:v1';
const isAdmin = () => location.pathname.startsWith('/admin/');
const sessionStore = () => isAdmin() ? sessionStorage : localStorage;
const sessionKey = () => isAdmin() ? ADMIN_SESSION_KEY : SESSION_KEY;

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user: { id: string; email?: string };
}
export type ApiRecord = Record<string, unknown>;
export type StaffRole = 'admin' | 'editor';
export class BackendError extends Error {
  status: number;
  constructor(message: string, status = 0) { super(message); this.status = status; }
}
let generation = 0;
function storedSession(): Session | null {
  try {
    const value = JSON.parse(sessionStore().getItem(sessionKey()) || 'null');
    if (!value || typeof value.access_token !== 'string' || !value.access_token ||
        typeof value.refresh_token !== 'string' || !value.refresh_token ||
        typeof value.user?.id !== 'string' || !value.user.id ||
        !Number.isFinite(value.expires_at)) return null;
    return value as Session;
  } catch { return null; }
}
function setSession(session: Session | null) {
  generation++;
  try {
    if (session) sessionStore().setItem(sessionKey(), JSON.stringify(session));
    else sessionStore().removeItem(sessionKey());
  } catch {
    if (session) throw new BackendError('Разрешите сохранение данных сайта в этой вкладке для входа.');
  }
  window.dispatchEvent(new Event('hunmeng:auth-change'));
  if (!session) window.dispatchEvent(new Event('hunmeng:session-ended'));
}
function parseSession(data: ApiRecord): Session {
  const user = data.user as Session['user'] | undefined;
  if (!user?.id || typeof data.access_token !== 'string' || !data.access_token ||
      typeof data.refresh_token !== 'string' || !data.refresh_token ||
      typeof data.expires_in !== 'number' || !Number.isFinite(data.expires_in) || data.expires_in <= 0)
    throw new BackendError('Сервер не подтвердил вход. Проверьте подтверждение электронной почты.');
  return { user, access_token: data.access_token, refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in };
}
async function request(path: string, options: RequestInit = {}) {
  if (!backendConfigured) throw new BackendError('Сервер авторизации не настроен.');
  try {
    return await fetch(url + path, { ...options, cache: 'no-store', credentials: 'omit',
      referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new BackendError('Не удалось связаться с сервером. Проверьте подключение и повторите попытку.');
  }
}
async function authRequest(path: string, payload: ApiRecord, accessToken?: string): Promise<ApiRecord> {
  const response = await request('/auth/v1/' + path, {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}) },
    body: JSON.stringify(payload),
  });
  const body: ApiRecord = await response.json().catch(() => ({}));
  // Never reflect upstream messages containing private values or English diagnostics.
  if (!response.ok) throw new BackendError(response.status === 429
    ? 'Слишком много попыток. Подождите и попробуйте снова.'
    : response.status >= 500 ? 'Сервер авторизации временно недоступен.'
    : 'Не удалось войти. Проверьте email, пароль и подтверждение почты.', response.status);
  return body;
}
let refreshing: Promise<Session | null> | null = null;
export async function getSession(): Promise<Session | null> {
  const session = storedSession();
  if (!session || !backendConfigured) return null;
  if (session.expires_at > Date.now() / 1000 + 60) return session;
  if (refreshing) return refreshing;
  const startedAt = generation;
  refreshing = (async () => {
    try {
      const data = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      if (generation !== startedAt) return null;
      const next = parseSession(data);
      setSession(next);
      return next;
    } catch (error) {
      if (generation === startedAt) setSession(null);
      if (error instanceof BackendError && error.status === 0) throw error;
      return null;
    }
  })();
  try { return await refreshing; } finally { refreshing = null; }
}
export async function signIn(email: string, password: string) {
  if (isAdmin()) {
    try {
      sessionStorage.setItem(ADMIN_SESSION_KEY + ':check', '1');
      sessionStorage.removeItem(ADMIN_SESSION_KEY + ':check');
    } catch { throw new BackendError('Разрешите сохранение данных сайта в этой вкладке для входа.'); }
  }
  const session = parseSession(await authRequest('token?grant_type=password', { email, password }));
  setSession(session);
  return session;
}
export async function signUp(email: string, password: string) {
  const result = await authRequest('signup', { email, password });
  if (result.access_token) setSession(parseSession(result));
  return result;
}
/** Always clear local credentials first. False means revocation was not confirmed. */
export async function signOut(): Promise<boolean> {
  const session = storedSession();
  setSession(null);
  if (!session) return true;
  try { await authRequest('logout?scope=local', {}, session.access_token); return true; }
  catch { return false; }
}
export async function getUser() {
  const session = await getSession();
  if (!session) return null;
  const response = await request('/auth/v1/user', {
    headers: { apikey: key, Authorization: 'Bearer ' + session.access_token },
  });
  if (response.status === 401 || response.status === 403) { setSession(null); return null; }
  if (!response.ok) throw new BackendError('Не удалось проверить сессию. Повторите попытку.', response.status);
  const user = await response.json();
  if (typeof user.id !== 'string') throw new BackendError('Сервер не подтвердил пользователя.');
  return user as { id: string; email?: string };
}
export async function rest<T = ApiRecord[]>(table: string, method = 'GET',
  query = '', body?: unknown, extraHeaders: Record<string, string> = {}): Promise<T> {
  const session = await getSession();
  if (!session) throw new BackendError('Сессия завершена. Войдите снова.', 401);
  if (!/^[a-z_]+$/.test(table)) throw new BackendError('Некорректная таблица.');
  const response = await request('/rest/v1/' + table + (query ? '?' + query : ''), {
    method, headers: { apikey: key, Authorization: 'Bearer ' + session.access_token,
      'Content-Type': 'application/json', Prefer: 'return=representation', ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401) {
    setSession(null);
    throw new BackendError('Сессия завершена. Войдите снова.', 401);
  }
  if (!response.ok) throw new BackendError(response.status === 403
    ? 'Нет прав для этого действия. Обратитесь к владельцу проекта.'
    : 'Сервер отклонил действие. Проверьте данные, права на произведение и статус вычитки.', response.status);
  if (response.status === 204) return [] as T;
  return await response.json() as T;
}
export async function getStaffRole(): Promise<StaffRole | null> {
  const user = await getUser();
  if (!user) return null;
  const rows = await rest<{ role: string }[]>('novel_staff', 'GET',
    'select=role&user_id=eq.' + encodeURIComponent(user.id));
  const role = rows[0]?.role;
  return role === 'admin' || role === 'editor' ? role : null;
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
