/** Hunmeng progression: mirror the live Supabase reader_* RPC contract.
 * XP is issued by the server from verified reading sessions, not localStorage.
 * Never derive privileges or award XP from these presentation helpers.
 */
export const MAX_LEVEL = 500;
export const RANKS = [
  { id: 'iron', en: 'Iron', ru: 'Железный', min: 1, max: 24, description: 'The first page of your journey.' },
  { id: 'bronze', en: 'Bronze', ru: 'Бронзовый', min: 25, max: 59, description: 'A steady path through new stories.' },
  { id: 'silver', en: 'Silver', ru: 'Серебряный', min: 60, max: 109, description: 'The promise of deeper worlds.' },
  { id: 'gold', en: 'Gold', ru: 'Золотой', min: 110, max: 139, description: 'Stories treasured like gold.' },
  { id: 'dark-gold', en: 'Dark Gold', ru: 'Тёмно-золотой', min: 140, max: 174, description: 'The rare wisdom of enduring readers.' },
  { id: 'platinum', en: 'Platinum', ru: 'Платиновый', min: 175, max: 249, description: 'A brilliant literary legacy.' },
  { id: 'diamond', en: 'Diamond', ru: 'Алмазный', min: 250, max: 329, description: 'A spirit sharpened by a thousand pages.' },
  { id: 'legendary', en: 'Legendary', ru: 'Легендарный', min: 330, max: 419, description: 'An exceptional chapter in Hunmeng history.' },
  { id: 'mythical', en: 'Mythical', ru: 'Мифический', min: 420, max: 500, description: 'The summit of the reader\'s journey.' },
] as const;
export type ReaderRankId = (typeof RANKS)[number]['id'];
/** IDs and thresholds are the authoritative reader_select_title RPC contract.
 * Collector and Reviewer cannot be awarded until trustworthy server metrics exist.
 */
export const TITLES = [
  { id: 'novice', en: 'Novice Reader', ru: 'Новичок-читатель', metric: 'default', threshold: 0, available: true },
  { id: 'regular', en: 'Consistent Reader', ru: 'Постоянный читатель', metric: 'readingDays', threshold: 30, available: true },
  { id: 'collector', en: 'Collector', ru: 'Коллекционер', metric: 'collection', threshold: 50, available: false },
  { id: 'scifi', en: 'Fantasy Connoisseur', ru: 'Ценитель фантастики', metric: 'scifiNovels', threshold: 10, available: true },
  { id: 'reviewer', en: 'Reviewer', ru: 'Рецензент', metric: 'reviews', threshold: 20, available: false },
  { id: 'genres', en: 'Genre Expert', ru: 'Знаток жанров', metric: 'completedGenres', threshold: 10, available: true },
] as const;
export const ACHIEVEMENTS = [
  { id: 'first-chapter', en: 'First Chapter', ru: 'Первая глава', metric: 'chapters', threshold: 1, icon: 'book' },
  { id: 'ten-chapters', en: 'Ten Chapters', ru: 'Десять глав', metric: 'chapters', threshold: 10, icon: 'sparkle' },
  { id: 'hundred-chapters', en: 'A Hundred Chapters', ru: 'Сто глав', metric: 'chapters', threshold: 100, icon: 'star' },
  { id: 'thirty-days', en: 'A Month of Reading', ru: 'Месяц чтения', metric: 'readingDays', threshold: 30, icon: 'calendar' },
  { id: 'ten-worlds', en: 'Ten Worlds', ru: 'Десять миров', metric: 'completedNovels', threshold: 10, icon: 'globe' },
] as const;
/** XP for the step from level L to L+1.
 * Must match public.reader_xp_for_next() in Supabase.
 */
export function xpForNextLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  return n === MAX_LEVEL ? 0 : 500 + 4 * (n - 1) + Math.floor(26 * Math.sqrt(n - 1));
}
const thresholds: number[] = [0, 0];
for (let level = 2; level <= MAX_LEVEL; level++) thresholds[level] = thresholds[level - 1] + xpForNextLevel(level - 1);
export function totalXpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  return thresholds[n];
}
export function levelFromXp(xp: number): number {
  const value = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  let low = 1, high = MAX_LEVEL;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (totalXpForLevel(mid) <= value) low = mid;
    else high = mid - 1;
  }
  return low;
}
export function rankForLevel(level: number) {
  const safe = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  return RANKS.find(rank => safe >= rank.min && safe <= rank.max)!;
}
export function progressionFromXp(xp: number) {
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0;
  const level = levelFromXp(safeXp);
  const next = xpForNextLevel(level);
  return { level, rank: rankForLevel(level), totalXp: safeXp,
    levelXp: next ? safeXp - totalXpForLevel(level) : 0, nextLevelXp: next,
    maxLevel: level === MAX_LEVEL };
}
/** Sanitize untrusted network shapes; only the Supabase server issues XP. */
export interface ServerProgress {
  total_xp: number;
  level: number;
  rank: ReaderRankId;
  selected_title: string;
  last_rank_notified: string | null;
  chapters: number;
  completedNovels: number;
  readingDays: number;
  scifiNovels: number;
  completedGenres: number;
  achievement_dates: Record<string, string | null>;
}
export function parseServerProgress(value: unknown): ServerProgress | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const numbers = ['total_xp','level','chapters','completedNovels','readingDays','scifiNovels','completedGenres'] as const;
  for (const key of numbers) {
    if (!Number.isSafeInteger(raw[key]) || (raw[key] as number) < 0) return null;
  }
  const xp = raw.total_xp as number;
  const expected = progressionFromXp(xp);
  if (raw.level !== expected.level || raw.rank !== expected.rank.id) return null;
  const dates = raw.achievement_dates && typeof raw.achievement_dates === 'object' && !Array.isArray(raw.achievement_dates)
    ? raw.achievement_dates as Record<string, unknown> : {};
  const achievement_dates: Record<string, string | null> = {};
  for (const achievement of ACHIEVEMENTS) {
    const date = dates[achievement.id];
    achievement_dates[achievement.id] = typeof date === 'string' && Number.isFinite(Date.parse(date)) ? date : null;
  }
  return { total_xp: xp, level: expected.level, rank: expected.rank.id,
    selected_title: TITLES.some(t => t.id === raw.selected_title) ? raw.selected_title as string : 'novice',
    last_rank_notified: typeof raw.last_rank_notified === 'string' ? raw.last_rank_notified : null,
    chapters: raw.chapters as number, completedNovels: raw.completedNovels as number,
    readingDays: raw.readingDays as number, scifiNovels: raw.scifiNovels as number,
    completedGenres: raw.completedGenres as number, achievement_dates };
}
