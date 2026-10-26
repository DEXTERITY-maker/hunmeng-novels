// Public requests carry only the publishable key. Postgres RLS decides which bodies exist for this reader.
const base = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const key = (import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? '';
export interface SerialEdition {
  slug: string;
  total_chapters: number;
  initial_chapters: number;
  timezone: string;
  launch_at: string | null;
}
export interface ReleasedChapter { number: number; title: string; body?: string }
async function read<T>(table: string, query: string): Promise<T> {
  if (!base || !key) throw new Error('The release service is unavailable.');
  const response = await fetch(`${base}/rest/v1/${table}?${query}`, {
    headers: { apikey: key }, cache: 'no-store', credentials: 'omit',
    referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('The release service is unavailable.');
  return await response.json() as T;
}
export async function getEdition(slug: string) {
  const rows = await read<SerialEdition[]>('serial_editions',
    `select=slug,total_chapters,initial_chapters,timezone,launch_at&slug=eq.${encodeURIComponent(slug)}`);
  return rows[0] ?? null;
}
export function getReleasedChapters(slug: string) {
  return read<ReleasedChapter[]>('serial_chapters',
    `select=number,title&novel_slug=eq.${encodeURIComponent(slug)}&order=number.asc`);
}
export async function getReleasedBody(slug: string, number: number) {
  if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid chapter.');
  const rows = await read<ReleasedChapter[]>('serial_chapters',
    `select=number,title,body&novel_slug=eq.${encodeURIComponent(slug)}&number=eq.${number}`);
  return rows[0] ?? null;
}
export function releaseLabel(edition: SerialEdition, number: number) {
  if (!edition.launch_at) return 'Daily releases have not started yet.';
  if (number <= edition.initial_chapters) return 'Available from launch';
  // Display only. Availability never uses the visitor's clock or this calculation.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: edition.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(edition.launch_at));
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const date = new Date(`${part('year')}-${part('month')}-${part('day')}T09:00:00Z`);
  date.setUTCDate(date.getUTCDate() + number - edition.initial_chapters);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: edition.timezone, day: 'numeric', month: 'short', year: 'numeric',
  }).format(date) + ' · 12:00 MSK';
}
