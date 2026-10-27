import type { SupabaseClient } from '@supabase/supabase-js';
import { parseServerProgress, TITLES, type ServerProgress } from '../config/progression';

export class ProgressionError extends Error {}
/** Always use the authenticated Supabase RPC; localStorage progress is not proof of XP. */
export async function getReaderProgress(client: SupabaseClient): Promise<ServerProgress> {
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) throw new ProgressionError('Sign in to view your reader progression.');
  const { data, error } = await client.rpc('reader_my_progress');
  if (error) throw new ProgressionError('Reader progression is temporarily unavailable.');
  const parsed = parseServerProgress(data);
  if (!parsed) throw new ProgressionError('Reader progression data could not be verified.');
  return parsed;
}
export async function selectReaderTitle(client: SupabaseClient, id: string): Promise<void> {
  if (!TITLES.some(t => t.id === id && t.available)) throw new ProgressionError('This title is not available.');
  const { data, error } = await client.rpc('reader_select_title', { p_title: id });
  if (error || data !== true) throw new ProgressionError('This title is not unlocked or could not be selected.');
}
export async function acknowledgeReaderRank(client: SupabaseClient, rank: string) {
  const { error } = await client.rpc('reader_mark_rank_seen', { p_rank: rank });
  if (error) throw new ProgressionError('Unable to save the rank notification.');
}
