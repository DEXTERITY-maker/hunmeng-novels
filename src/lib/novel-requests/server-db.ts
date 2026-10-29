/** Server-only configuration for a future Supabase transaction-pooler client. */
import type { QueryExecutor } from './postgres-store.ts';

type PoolOptions = {
  connectionString: string;
  ssl: { rejectUnauthorized: true };
  max: number;
  connectionTimeoutMillis: number;
  idleTimeoutMillis: number;
  statement_timeout: number;
  query_timeout: number;
};
type Pool = QueryExecutor & { end(): Promise<void> };
type PoolFactory = (options: PoolOptions) => Pool;

const CREATE = 'select private.request_store_create($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) as result';
const READ = 'select * from private.request_store_read($1,$2,$3)';

/**
 * Inject a compatible server-side PostgreSQL pool implementation. Never call
 * from a browser, never log the connection string, and never use an owner,
 * postgres, service-role or shared account as the login. The named login role
 * must be separately provisioned and granted ONLY the tested executor role.
 * This factory does not provision credentials, connect, or expose a route.
 */
export function createRequestDatabaseExecutor(
  connectionString: string,
  projectRef: string,
  createPool: PoolFactory,
): QueryExecutor & { close(): Promise<void> } {
  if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error('Invalid database configuration');
  let url: URL;
  try { url = new URL(connectionString); } catch { throw new Error('Invalid database configuration'); }
  let username: string;
  try { username = decodeURIComponent(url.username); } catch { throw new Error('Invalid database configuration'); }
  // Supabase shared transaction pooler: disallow URL options which might
  // override TLS or other safety settings in a PostgreSQL driver.
  if (!['postgres:', 'postgresql:'].includes(url.protocol) ||
      !/^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(url.hostname) ||
      url.port !== '6543' || url.pathname !== '/postgres' || url.search || url.hash ||
      username !== `hunmeng_request_login.${projectRef}` || !url.password || typeof createPool !== 'function')
    throw new Error('Invalid database configuration');
  let pool: Pool;
  try {
    pool = createPool({ connectionString, ssl: { rejectUnauthorized: true }, max: 2,
      connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 5000, query_timeout: 8000 });
  } catch { throw new Error('Request database unavailable'); }
  return {
    async query(text, values) {
      if (text !== CREATE && text !== READ) throw new Error('Database operation not allowed');
      try { return await pool.query(text, values); }
      catch { throw new Error('Request database unavailable'); }
    },
    async close() {
      try { await pool.end(); } catch { throw new Error('Request database unavailable'); }
    },
  };
}
