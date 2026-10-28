/** Canonical account tabs. Legacy #reading/#profile/#account links keep working. */
export type ProfileTab = 'profile-details' | 'profile-reading' | 'profile-account';
const aliases: Record<string,ProfileTab> = {
  'profile':'profile-details', 'details':'profile-details', 'profile-details':'profile-details',
  'reading':'profile-reading', 'profile-reading':'profile-reading',
  'account':'profile-account', 'profile-account':'profile-account',
};
export function resolveProfileTab(hash: string): ProfileTab | null {
  return aliases[hash.replace(/^#/,'').toLowerCase()] ?? null;
}
export function profileHash(hash: string): string {
  const tab = resolveProfileTab(hash);
  return tab ? '#'+tab : '';
}
