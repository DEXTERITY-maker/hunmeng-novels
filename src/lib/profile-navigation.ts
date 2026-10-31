/** Canonical account tabs. Legacy #reading/#profile/#account links keep working. */
export type ProfileTab = 'profile-details' | 'profile-reading' | 'profile-account';
const aliases: Record<string,ProfileTab> = {
  'profile':'profile-details', 'details':'profile-details', 'profile-details':'profile-details',
  'reading':'profile-reading', 'profile-reading':'profile-reading',
  'account':'profile-account', 'profile-account':'profile-account',
  'overview':'profile-details', 'progress':'profile-details',
  'titles-achievements':'profile-details', 'xp-history':'profile-details',
};
export function resolveProfileTab(hash: string): ProfileTab | null {
  return aliases[hash.replace(/^#/,'').toLowerCase()] ?? null;
}
export function profileHash(hash: string): string {
  const tab = resolveProfileTab(hash);
  const value=hash.replace(/^#/, '').toLowerCase();
  return tab ? '#'+(['overview','progress','titles-achievements','xp-history'].includes(value) ? value : tab) : '';
}
