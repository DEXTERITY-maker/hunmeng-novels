/** Halloween Reading Week. Display helpers and offline test oracle; PostgreSQL remains authoritative. */
export const HALLOWEEN_EVENT_ID = 'halloween-2026';
export const HALLOWEEN_START = '2026-10-31T21:00:00Z';
export const HALLOWEEN_END = '2026-11-07T21:00:00Z';
export const halloweenPrizes = [
  {place: 1, key: 'gold', xp: 3000, titleId: 'halloween-2026-gold', title: 'Lantern of the Long Night'},
  {place: 2, key: 'silver', xp: 2000, titleId: 'halloween-2026-silver', title: 'Keeper of the Autumn Moon'},
  {place: 3, key: 'bronze', xp: 1000, titleId: 'halloween-2026-bronze', title: 'Reader of the Falling Leaves'},
] as const;
export const halloweenBadge = (key: 'gold' | 'silver' | 'bronze', small = false) =>
  `/images/events/halloween-2026/${key}${small ? '-128' : ''}.webp`;
/** UTC interval is inclusive at its start and exclusive at its end. */
export function halloweenInWindow(value: string | number | Date): boolean {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= Date.parse(HALLOWEEN_START) && time < Date.parse(HALLOWEEN_END);
}
/** Unicode letters and digits, spaces, underscore and hyphen; case-insensitive unique names are DB-enforced. */
export function halloweenValidName(value: unknown): value is string {
  return typeof value === 'string' &&
    [...value].length >= 3 && [...value].length <= 24 &&
    value === value.trim() &&
    /^[\p{L}\p{N} _-]+$/u.test(value);
}
export type HalloweenParticipant = {userId: string; displayName: string};
export type HalloweenXpEvent = {userId: string; eventKind: string; awardedAt: string};
export type HalloweenRanking = HalloweenParticipant & {place: number; chapters: number; lastChapterAt: string | null};
/** Test oracle: only verified chapter_finished events; late joins include earlier in-window XP. */
export function halloweenRank(
  participants: HalloweenParticipant[], events: HalloweenXpEvent[],
): HalloweenRanking[] {
  const totals = new Map<string, {chapters: number; lastChapterAt: string | null}>();
  for (const event of events) {
    if (event.eventKind !== 'chapter_finished' || !halloweenInWindow(event.awardedAt)) continue;
    const entry = totals.get(event.userId) ?? {chapters: 0, lastChapterAt: null};
    entry.chapters++;
    if (!entry.lastChapterAt || Date.parse(event.awardedAt) > Date.parse(entry.lastChapterAt))
      entry.lastChapterAt = event.awardedAt;
    totals.set(event.userId, entry);
  }
  const ranked = participants.map(participant => ({
    ...participant, ...(totals.get(participant.userId) ?? {chapters: 0, lastChapterAt: null}),
  }));
  ranked.sort((a, b) =>
    b.chapters - a.chapters ||
    (a.lastChapterAt ? Date.parse(a.lastChapterAt) : Infinity) -
      (b.lastChapterAt ? Date.parse(b.lastChapterAt) : Infinity) ||
    a.userId.localeCompare(b.userId));
  return ranked.map((item, index) => ({...item, place: index + 1}));
}
