export function chapterCount(n: number) {
  const a = n % 10,
    b = n % 100;
  return `${n} ${a === 1 && b !== 11 ? 'глава' : a >= 2 && a <= 4 && (b < 12 || b > 14) ? 'главы' : 'глав'}`;
}
