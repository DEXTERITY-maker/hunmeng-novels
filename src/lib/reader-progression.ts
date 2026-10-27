/**
 * Hunmeng reader progression. Rank is derived from verified, server-issued XP;
 * titles are independent unlocks and can be equipped only after validation.
 * Values here are display/balance definitions. The database is the XP authority.
 */
export const MAX_LEVEL = 500;
export const CHAPTER_XP = 80;
export const COMPLETED_NOVEL_XP = 400;
export const ranks = [
  {id:'iron',en:'Iron',ru:'Железный',min:1,max:24,accent:'#84929b',description:'The journey begins.'},
  {id:'bronze',en:'Bronze',ru:'Бронзовый',min:25,max:59,accent:'#ba7a49',description:'A growing devotion to stories.'},
  {id:'silver',en:'Silver',ru:'Серебряный',min:60,max:109,accent:'#a9c7da',description:'A keen eye for new worlds.'},
  {id:'gold',en:'Gold',ru:'Золотой',min:110,max:139,accent:'#ddb75b',description:'An accomplished reader.'},
  {id:'dark-gold',en:'Dark Gold',ru:'Тёмно-золотой',min:140,max:174,accent:'#ab7a36',description:'A rare, enduring dedication.'},
  {id:'platinum',en:'Platinum',ru:'Платиновый',min:175,max:249,accent:'#bdc4e6',description:'A luminous collection of journeys.'},
  {id:'diamond',en:'Diamond',ru:'Алмазный',min:250,max:329,accent:'#6ecae8',description:'Clarity forged through countless tales.'},
  {id:'legendary',en:'Legendary',ru:'Легендарный',min:330,max:419,accent:'#e3ad61',description:'The mark of an extraordinary reader.'},
  {id:'mythical',en:'Mythical',ru:'Мифический',min:420,max:500,accent:'#ae83eb',description:'At the summit of Hunmeng.'},
] as const;
export type Rank = (typeof ranks)[number];
export const rankImage = (id: string) => `/images/ranks/${id}.svg`;
export const getRank = (level: number): Rank =>
  ranks.find(r => level >= r.min && level <= r.max) ?? (level > MAX_LEVEL ? ranks[8] : ranks[0]);
// Balanced nonconstant XP curve. Level 1->2 costs 500XP;
// leveling becomes steadily more demanding without an exponential wall.
export function xpForNextLevel(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  const n = Math.max(0, Math.floor(level) - 1);
  return 500 + 4*n + Math.floor(26*Math.sqrt(n));
}
export function levelFromTotalXp(rawXp: number) {
  let remaining = Number.isFinite(rawXp) ? Math.max(0, Math.floor(rawXp)) : 0;
  let level = 1;
  while (level < MAX_LEVEL && remaining >= xpForNextLevel(level)) {
    remaining -= xpForNextLevel(level);
    level++;
  }
  return {level,rank:getRank(level),currentXp:level===MAX_LEVEL ? 0 : remaining,
    nextXp:xpForNextLevel(level),maxed:level===MAX_LEVEL};
}
export const titles = [
  {id:'novice',en:'Novice Reader',ru:'Новичок-читатель',target:0,metric:'always',description:'Your first title. Available to every reader.'},
  {id:'regular',en:'Regular Reader',ru:'Постоянный читатель',target:30,metric:'readingDays',description:'Read on 30 different days.'},
  {id:'collector',en:'Collector',ru:'Коллекционер',target:50,metric:'verifiedLibrary',description:'Add 50 unique novels to your verified library.'},
  {id:'scifi',en:'Science Fiction Enthusiast',ru:'Ценитель фантастики',target:10,metric:'scifiNovels',description:'Finish 10 science fiction novels.'},
  {id:'reviewer',en:'Reviewer',ru:'Рецензент',target:20,metric:'approvedReviews',description:'Publish 20 approved, meaningful reviews.'},
  {id:'genres',en:'Genre Sage',ru:'Знаток жанров',target:10,metric:'completedGenres',description:'Finish novels in 10 distinct genres.'},
] as const;
export const achievements = [
  {id:'first-chapter',en:'First Chapter',ru:'Первая глава',metric:'chapters',target:1,description:'Complete your first verified chapter.'},
  {id:'ten-chapters',en:'Story Seeker',ru:'Искатель историй',metric:'chapters',target:10,description:'Complete 10 different chapters.'},
  {id:'hundred-chapters',en:'Page Voyager',ru:'Путешественник по страницам',metric:'chapters',target:100,description:'Complete 100 different chapters.'},
  {id:'thirty-days',en:'A Daily Chapter',ru:'Чтение каждый день',metric:'readingDays',target:30,description:'Read on 30 different days.'},
  {id:'ten-worlds',en:'Ten Worlds',ru:'Десять миров',metric:'completedNovels',target:10,description:'Finish 10 verified completed novels.'},
] as const;
export type ProgressMetric = (typeof titles)[number]['metric'] | (typeof achievements)[number]['metric'];
export interface VerifiedStats {
  total_xp:number;chapters:number;completedNovels:number;readingDays:number;scifiNovels:number;completedGenres:number;
  selected_title:string;last_rank_notified:string | null;
}
export const emptyVerifiedStats = (): VerifiedStats => ({
  total_xp:0,chapters:0,completedNovels:0,readingDays:0,scifiNovels:0,completedGenres:0,
  selected_title:'novice',last_rank_notified:null,
});
export function titleStatus(id:string, stats: VerifiedStats) {
  const item=titles.find(t=>t.id===id);
  if (!item) return {progress:0,unlocked:false,available:false};
  if (item.metric==='always') return {progress:0,unlocked:true,available:true};
  if (item.metric==='verifiedLibrary'||item.metric==='approvedReviews')
    return {progress:0,unlocked:false,available:false};
  const progress=Math.max(0,Number(stats[item.metric]||0));
  return {progress,unlocked:progress>=item.target,available:true};
}
