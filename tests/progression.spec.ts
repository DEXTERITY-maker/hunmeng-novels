import { test, expect } from '@playwright/test';
import { MAX_LEVEL, RANKS, TITLES, levelFromXp, progressionFromXp, rankForLevel, totalXpForLevel, xpForNextLevel } from '../src/config/progression';

test('all nine rank boundaries are contiguous and correctly ordered', () => {
  expect(RANKS.map(rank => rank.id)).toEqual(['iron','bronze','silver','gold','dark-gold','platinum','diamond','legendary','mythical']);
  expect(RANKS[0].min).toBe(1);
  expect(RANKS[RANKS.length - 1].max).toBe(MAX_LEVEL);
  for (let i = 0; i < RANKS.length; i++) {
    const rank = RANKS[i];
    expect(rankForLevel(rank.min).id).toBe(rank.id);
    expect(rankForLevel(rank.max).id).toBe(rank.id);
    if (i > 0) expect(rank.min).toBe(RANKS[i-1].max + 1);
  }
});
test('XP progression is strictly increasing and stops at level 500', () => {
  expect(progressionFromXp(0)).toMatchObject({level:1, totalXp:0, maxLevel:false, rank:{id:'iron'}});
  for (let level = 1; level < MAX_LEVEL; level++) {
    const threshold = totalXpForLevel(level + 1);
    expect(threshold).toBeGreaterThan(totalXpForLevel(level));
    expect(levelFromXp(threshold - 1)).toBe(level);
    expect(levelFromXp(threshold)).toBe(level + 1);
    expect(xpForNextLevel(level)).toBeGreaterThan(0);
  }
  expect(progressionFromXp(totalXpForLevel(500))).toMatchObject({level:500,maxLevel:true,nextLevelXp:0,rank:{id:'mythical'}});
});
test('default title is independent of rank and additional titles have requirements', () => {
  expect(TITLES[0]).toMatchObject({id:'novice-reader',threshold:0});
  expect(TITLES.slice(1).every(title => title.threshold > 0)).toBe(true);
});
