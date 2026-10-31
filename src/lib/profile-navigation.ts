/** Canonical account tabs. Legacy #reading/#profile/#account links keep working. */
export type ProfileTab = 'profile-details' | 'profile-reading' | 'profile-account';
const aliases: Record<string,ProfileTab> = {
  'profile':'profile-details', 'details':'profile-details', 'profile-details':'profile-details',
  'reading':'profile-reading', 'profile-reading':'profile-reading',
  'account':'profile-account', 'profile-account':'profile-account',
};
export const profileOverviewTabs = ['overview','progress','titles-achievements','xp-history'] as const;
export function resolveProfileTab(hash: string): ProfileTab | null {
  const clean = hash.replace(/^#/,'').toLowerCase();
  return profileOverviewTabs.some(tab=>tab===clean) ? 'profile-details' : aliases[clean] ?? null;
}
export function profileHash(hash: string): string {
  const tab = resolveProfileTab(hash);
  const clean=hash.replace(/^#/,'').toLowerCase();
  if(profileOverviewTabs.some(item=>item===clean))return '#'+clean;
  return tab ? '#'+tab : '';
}
