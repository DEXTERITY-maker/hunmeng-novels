import { createReaderClient } from './reader-auth';
import type { User } from '@supabase/supabase-js';

/**
 * Writing studio shares the exact same Supabase Auth client/storage as /account/.
 * Old backend.ts has a separate legacy session key and must NOT be used here.
 * Studio drafts stay protected by the existing author_* RLS policies.
 */
let client: ReturnType<typeof createReaderClient> | null = null;
const sdk = () => client ?? (client = createReaderClient());
const url = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/,'') ?? '';
const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined ?? '';

export async function studioUser(): Promise<User | null> {
  const { data: stored, error: sessionError } = await sdk().auth.getSession();
  if (sessionError) throw new Error('Could not check your session. Try reloading the page.');
  if (!stored.session) return null;
  const { data, error } = await sdk().auth.getUser();
  if (error) {
    if (error.status === 401 || error.status === 403 || error.name === 'AuthSessionMissingError') return null;
    throw new Error('Could not verify your session. Check your connection.');
  }
  return data.user;
}
export function onStudioSignedOut(callback: () => void) {
  return sdk().auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') callback();
  }).data.subscription;
}
export async function studioRest<T>(table: string, method='GET', query='', body?: unknown): Promise<T> {
  if (!/^author_(novels|chapters|revisions)$/.test(table)) throw new Error('Invalid studio resource.');
  const {data,error} = await sdk().auth.getSession();
  if (error || !data.session) throw new Error('Your session has ended. Please sign in again.');
  const path = '/rest/v1/' + table + (query ? '?' + query : '');
  const response = await fetch(url+path, {
    method,
    headers:{
      apikey:key,
      Authorization:'Bearer '+data.session.access_token,
      'Content-Type':'application/json',
      Prefer:'return=representation',
    },
    ...(body===undefined ? {} : {body:JSON.stringify(body)}),
    credentials:'omit',
    cache:'no-store',
    referrerPolicy:'no-referrer',
    signal:AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new Error('Your session has ended. Please sign in again.');
  if (!response.ok) throw new Error(
    response.status === 403 ? 'You do not have permission to edit this draft.' :
    'The server could not complete the studio request. Try again.');
  if (response.status === 204) return [] as T;
  return await response.json() as T;
}
