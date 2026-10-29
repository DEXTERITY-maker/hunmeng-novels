/**
 * Server-only Supabase Auth adapter for the future novel-request runtime.
 * This module never creates a session, never persists JWTs and never uses the
 * service-role/secret key. Keep out of browser imports and static page bundles.
 */
import { createClient } from '@supabase/supabase-js';
import { createSupabaseIdentityVerifier } from './supabase-identity.ts';

export function createServerSupabaseIdentity(projectUrl: string, publishableKey: string) {
  let url: URL;
  try { url = new URL(projectUrl); } catch { throw new Error('Invalid Supabase project URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname))
    throw new Error('Invalid Supabase project URL');
  if (typeof publishableKey !== 'string' || publishableKey.length < 20 || /\s/.test(publishableKey))
    throw new Error('Missing Supabase publishable key');
  const supabase = createClient(url.origin, publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  // getUser(jwt) contacts Supabase Auth and verifies the access token server-side.
  // No role is inferred from editable user_metadata, and access tokens are not logged.
  return createSupabaseIdentityVerifier(supabase.auth);
}
