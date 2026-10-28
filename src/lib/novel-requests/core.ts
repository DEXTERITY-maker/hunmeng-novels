/** Offline building blocks. No network access, persistence, or publication side effects. */
export type SourceIdentity = { provider: string; externalId: string; url: string };
export type Chapter = { number: number; title: string };
export type WorkEvidence = {
  id: string;
  titles: string[];
  authors: string[];
  sources: SourceIdentity[];
  chapters: Chapter[];
};
export type Match = { workId: string; kind: 'exact' | 'probable'; reasons: string[] };

/** A URL is an identifier only after an explicit adapter recognizes its shape. */
export function identifySource(input: string, adapters: readonly SourceAdapter[]): SourceIdentity | null {
  if (input.length > 2048) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  for (const adapter of adapters) {
    if (!adapter.hosts.includes(url.hostname.toLowerCase())) continue;
    // Query strings and fragments are not sent anywhere. The adapter must explicitly
    // decide whether the URL's path and parameters identify the same work.
    return adapter.identify(url);
  }
  return null;
}
export type SourceAdapter = {
  hosts: readonly string[];
  identify(url: URL): SourceIdentity | null;
};

export function normalizeName(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('und')
    .replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}
function names(values: string[]): Set<string> {
  return new Set(values.map(normalizeName).filter(Boolean));
}
function intersects(a: Set<string>, b: Set<string>): boolean {
  return [...a].some(value => b.has(value));
}
function chapterSignature(chapter: Chapter): string | null {
  if (!Number.isSafeInteger(chapter.number) || chapter.number < 1) return null;
  const title = normalizeName(chapter.title);
  // Numeric or generic chapter names are insufficient independent evidence.
  if (title.length < 8 || /^(chapter|chap|глава|第)\s*\d+$/u.test(title) || /^\d+$/u.test(title)) return null;
  return `${chapter.number}:${title}`;
}

/** All evidence is advisory except a recognized provider + external ID.
 * Chapter structure never silently merges works, even when strongly similar. */
export function findMatches(input: WorkEvidence, candidates: readonly WorkEvidence[]): Match[] {
  const inputTitles = names(input.titles);
  const inputAuthors = names(input.authors);
  const inputChapters = new Set(input.chapters.map(chapterSignature).filter((s): s is string => s !== null));
  const results: Match[] = [];
  for (const work of candidates) {
    if (work.id === input.id) continue;
    const sameSource = input.sources.some(a => work.sources.some(b =>
      a.provider === b.provider && a.externalId === b.externalId && !!a.provider && !!a.externalId));
    const title = intersects(inputTitles, names(work.titles));
    const author = intersects(inputAuthors, names(work.authors));
    const chapters = new Set(work.chapters.map(chapterSignature).filter((s): s is string => s !== null));
    const shared = [...inputChapters].filter(value => chapters.has(value)).length;
    const reasons: string[] = [];
    if (sameSource) reasons.push('Same recognized source and external ID');
    if (title) reasons.push('Matching original or alternative title');
    if (author) reasons.push('Matching author');
    if (shared >= 3) reasons.push(`${shared} matching numbered chapter titles`);
    if (sameSource || (title && author) || shared >= 3) {
      results.push({workId: work.id, kind: sameSource ? 'exact' : 'probable', reasons});
    }
  }
  return results.sort ( (a, b) => Number(b.kind === 'exact') - Number(a.kind === 'exact') || a.workId.localeCompare(b.workId));
}

export type Rights = { status: 'pending' | 'verified' | 'expired' | 'revoked'; evidence: string; verifiedBy: string | null; validUntil: string | null; translate: boolean; publish: boolean };
/** UI advisory only: existing database guards remain authoritative. Date is UTC YYYY-MM-DD. */
export function canPreparePublication(rights: Rights, today: string): boolean {
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
  return validDate(today) && rights.status === 'verified' && rights.evidence.trim().length >= 20 && !!rights.verifiedBy?.trim() && rights.translate && rights.publish && (!rights.validUntil || (validDate(rights.validUntil) && rights.validUntil >= today));
}

export type MetadataField = 'originalTitle' | 'alternativeTitles' | 'authors' | 'chapterTitles';
export type MetadataPolicy = { allowedFields: readonly MetadataField[]; evidence: string };
export type MetadataInput = { originalTitle?: string; alternativeTitles?: string[]; authors?: string[]; chapterTitles?: Chapter[] };
/** Receives already-obtained metadata from a trusted adapter. It never fetches URLs,
 * accepts descriptions, cover images or chapter bodies, or infers rights. */
export function selectPermittedMetadata(input: MetadataInput, policy: MetadataPolicy): MetadataInput {
  if (!policy.evidence.trim()) return {};
  const out: MetadataInput = {};
  const clean = (s: string) => s.trim().slice(0, 250);
  if (policy.allowedFields.includes('originalTitle') && typeof input.originalTitle === 'string') out.originalTitle = clean(input.originalTitle);
  if (policy.allowedFields.includes('alternativeTitles') && Array.isArray(input.alternativeTitles)) out.alternativeTitles = input.alternativeTitles.filter(s => typeof s === 'string').slice(0, 50).map(clean).filter(Boolean);
  if (policy.allowedFields.includes('authors') && Array.isArray(input.authors)) out.authors = input.authors.filter(s => typeof s === 'string').slice(0, 50).map(clean).filter(Boolean);
  if (policy.allowedFields.includes('chapterTitles') && Array.isArray(input.chapterTitles)) out.chapterTitles = input.chapterTitles.slice(0, 10000).filter(c => c && Number.isSafeInteger(c.number) && c.number > 0 && typeof c.title === 'string').map(c => ({number:c.number, title:clean(c.title)}));
  return out;
}

export type RequestStatus = 'submitted' | 'review' | 'needs_rights' | 'draft' | 'converted' | 'rejected';
export type Decision = { from: RequestStatus; to: RequestStatus; actorId: string; reason: string; at: string };
const transitions: Record<RequestStatus, readonly RequestStatus[]> = {
  submitted: ['review', 'rejected'], review: ['needs_rights', 'draft', 'rejected'],
  needs_rights: ['review', 'rejected'], draft: ['review', 'converted', 'rejected'],
  converted: [], rejected: ['review'],
};
/** The caller must authorize the actor and persist this decision transactionally on the server. */
export function makeDecision(from: RequestStatus, to: RequestStatus, actorId: string, reason: string, at: string): Decision {
  if (!transitions[from]?.includes(to) || !actorId.trim() || !reason.trim() || !Number.isFinite(Date.parse(at))) throw new Error('Invalid moderation decision');
  return {from, to, actorId: actorId.trim(), reason: reason.trim(), at: new Date(at).toISOString()};
}
