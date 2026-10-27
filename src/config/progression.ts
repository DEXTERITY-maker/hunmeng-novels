/** Hunmeng progression rules. XP and rank are derived, never accepted from user metadata. */
export const MAX_LEVEL = 500;
export const RANKS = [
  { id: 'iron', en: 'Iron', ru: 'Железный', min: 1, max: 24 },
  { id: 'bronze', en: 'Bronze', ru: 'Бронзовый', min: 25, max: 59 },
  { id: 'silver', en: 'Silver', ru: 'Серебряный', min: 60, max: 109 },
  { id: 'gold', en: 'Gold', ru: 'Золотой', min: 110, max: 139 },
  { id: 'dark-gold', en: 'Dark Gold', ru: 'Тёмно-золотой', min: 140, max: 174 },
  { id: 'platinum', en: 'Platinum', ru: 'Платиновый', min: 175, max: 249 },
  { id: 'diamond', en: 'Diamond', ru: 'Алмазный', min: 250, max: 329 },
  { id: 'legendary', en: 'Legendary', ru: 'Легендарный', min: 330, max: 419 },
  { id: 'mythical', en: 'Mythical', ru: 'Мифический', min: 420, max: 500 },
] as const;
export const TITLES = [
  { id: 'novice-reader', en: 'Novice Reader', ru: 'Новичок-читатель', kind: 'default', threshold: 0 },
  { id: 'consistent-reader', en: 'Consistent Reader', ru: 'Постоянный читатель', kind: 'reading-days', threshold: 30 },
  { id: 'collector', en: 'Collector', ru: 'Коллекционер', kind: 'unique-library-books', threshold: 50 },
  { id: 'fantasy-connoisseur', en: 'Fantasy Connoisseur', ru: 'Ценитель фантастики', kind: 'completed-fantasy', threshold: 10 },
  { id: 'reviewer', en: 'Reviewer', ru: 'Рецензент', kind: 'approved-reviews', threshold: 20 },
  { id: 'genre-expert', en: 'Genre Expert', ru: 'Знаток жанров', kind: 'completed-genres', threshold: 10 },
] as const;
/** Required XP for a single level-up. Server must use the identical formula. */
export function xpForNextLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  return n === MAX_LEVEL ? 0 : Math.ceil(250 + 35 * n + 0.75 * n * n);
}
export function totalXpForLevel(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number.isFinite(level) ? level : 1)));
  let xp = 0;
  for (let i = 1; i < n; i++) xp += xpForNextLevel(i);
  return xp;
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
  const start = totalXpForLevel(level);
  const next = xpForNextLevel(level);
  return { level, rank: rankForLevel(level), totalXp: safeXp, levelXp: next ? safeXp - start : 0, nextLevelXp: next, maxLevel: level === MAX_LEVEL };
}
