/** Server-only adapter: getUser(jwt) checks the token with Supabase Auth. */
import type { IdentityVerifier } from './handler.ts';

type SupabaseUser = {
  id: string;
  is_anonymous?: boolean;
  banned_until?: string | null;
  deleted_at?: string | null;
};
export type SupabaseAuthReader = {
  getUser(jwt: string): Promise<{
    data: { user: SupabaseUser | null };
    error: { status?: number } | null;
  }>;
};

/** Never trusts decoded JWT contents or user-editable role metadata. */
export function createSupabaseIdentityVerifier(auth: SupabaseAuthReader): IdentityVerifier {
  return {
    async verify(token) {
      if (!token) return null;
      const { data, error } = await auth.getUser(token);
      if (error) {
        if (error.status === 401 || error.status === 403) return null;
        throw new Error('Authentication service unavailable');
      }
      const user = data?.user;
      if (!user) return null;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id))
        throw new Error('Invalid authenticated user');
      if (user.banned_until && !Number.isFinite(Date.parse(user.banned_until)))
        throw new Error('Invalid account state');
      const active = !user.is_anonymous && !user.deleted_at &&
        (!user.banned_until || Date.parse(user.banned_until) <= Date.now());
      return { userId: user.id, role: 'user', active };
    },
  };
}
