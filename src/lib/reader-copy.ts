/** Russian display copy for the reference-led reader experience.
 * Progression thresholds, server XP and permission checks are unchanged.
 */
export const titleCopy: Record<string,string> = {
 novice:'Первое звание, доступное каждому читателю.',
 regular:'Читайте в 30 разных дней.',
 collector:'Добавьте 50 уникальных произведений в подтверждённую коллекцию.',
 scifi:'Завершите 10 фантастических произведений.',
 reviewer:'Опубликуйте 20 содержательных отзывов после модерации.',
 genres:'Завершите произведения в 10 разных жанрах.',
};
export const achievementCopy: Record<string,string> = {
 'first-chapter':'Прочитайте первую главу с подтверждённой наградой.',
 'ten-chapters':'Прочитайте 10 разных глав.',
 'fifty-chapters':'Прочитайте 50 разных глав.',
 'hundred-chapters':'Прочитайте 100 разных глав.',
 'five-hundred-chapters':'Прочитайте 500 разных глав.',
 'first-world':'Завершите первое произведение с подтверждённым прогрессом.',
 'five-worlds':'Завершите 5 произведений.',
 'ten-worlds':'Завершите 10 произведений.',
 'twenty-five-worlds':'Завершите 25 произведений.',
 'three-days':'Читайте в 3 разных дня.',
 'seven-days':'Читайте в 7 разных дней.',
 'thirty-days':'Читайте в 30 разных дней.',
 'one-hundred-days':'Читайте в 100 разных дней.',
};
export function remainingMetricLabel(metric: string, amount: number): string {
 const form=(one:string,few:string,many:string)=>{
  const n=Math.abs(amount)%100, last=n%10;
  return n>=11&&n<=14?many:last===1?one:last>=2&&last<=4?few:many;
 };
 if(metric==='chapters')return form('глава','главы','глав');
 if(metric==='completedNovels')return form('книга','книги','книг');
 return form('день','дня','дней');
}
