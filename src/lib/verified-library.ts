import { createReaderClient, readerAuthConfigured } from './reader-auth';

/**
 * Verified library credit is separate from local shelves.
 * Only deliberate, authenticated user additions may create a server record.
 * Never award XP here; the database validates the catalog and deduplicates.
 */
let client: ReturnType<typeof createReaderClient> | null = null;
export async function recordVerifiedLibraryAdd(slug: string): Promise<boolean> {
  if (!readerAuthConfigured || !navigator.onLine ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return false;
  try {
    client ??= createReaderClient();
    const {data:session,error} = await client.auth.getSession();
    if(error || !session.session) return false;
    const {data, error:awardError} = await client.rpc('reader_record_library_add',{p_novel:slug});
    if(awardError) return false;
    if(data===true) window.dispatchEvent(new CustomEvent('reader:collection-updated'));
    return data===true;
  } catch { return false; }
}
