/**
 * Staging-only composition of the disconnected intake components.
 *
 * This deliberately DOES NOT register an Astro/Cloudflare HTTP endpoint,
 * create database credentials, enable a grant or install a Supabase migration.
 * Database role provisioning, durable edge/IP rate limiting, matching evidence
 * persistence and isolated Supabase role tests remain release blockers.
 */
import { createServerSupabaseIdentity } from './server-supabase-auth.ts';
import { createRequesterReferenceDeriver, type SourceRegistry, type CatalogReader, type RateLimiter } from './handler.ts';
import { createPostgresRequestStore, type QueryExecutor } from './postgres-store.ts';
import { handleRequestHttp } from './http.ts';
import type { SourceAdapter } from './core.ts';

export type IsolatedRequestRuntimeConfig = {
  readonly supabaseUrl: string;
  readonly supabasePublishableKey: string;
  readonly requesterReferenceSecret: Uint8Array;
  readonly allowedOrigins: readonly string[];
  readonly database: QueryExecutor;
  readonly sources: SourceRegistry;
  readonly allowedAdapters: readonly SourceAdapter[];
  readonly catalog: CatalogReader;
  readonly rateLimiter: RateLimiter;
};

export function createIsolatedNovelRequestRuntime(config: IsolatedRequestRuntimeConfig) {
  if (!config || !config.database || !config.sources || !config.catalog ||
      !config.rateLimiter || !config.allowedAdapters?.length || !config.allowedOrigins?.length)
    throw new Error('Isolated request dependencies are not configured');
  const identity = createServerSupabaseIdentity(config.supabaseUrl, config.supabasePublishableKey);
  const requesterReferences = createRequesterReferenceDeriver(config.requesterReferenceSecret);
  const store = createPostgresRequestStore(config.database);
  const dependencies = {
    identity, requesterReferences, sources: config.sources,
    allowedAdapters: config.allowedAdapters, catalog: config.catalog,
    rateLimiter: config.rateLimiter, store,
  };
  return (request: Request) => handleRequestHttp(request, {
    allowedOrigins: config.allowedOrigins,
    dependencies,
  });
}
