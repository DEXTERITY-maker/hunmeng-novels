/** Device-local display preferences, separate from reading progress and XP. */
export type PersonalTerm = { from: string; to: string };
export const PERSONAL_TERMS_PREFIX = 'hunmeng-novels:personal-term:v1:';
export const PERSONAL_TERMS_LIMIT = 50;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const validTerm = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 100 && !/[\p{C}]/u.test(value);

export function personalTermPrefix(slug: string): string {
  if (!slugPattern.test(slug)) throw new Error('Invalid novel');
  return PERSONAL_TERMS_PREFIX + slug + ':';
}

export function validPersonalTerm(term: unknown): term is PersonalTerm {
  if (!term || typeof term !== 'object' || Array.isArray(term)) return false;
  const entry = term as Record<string, unknown>;
  return validTerm(entry.from) && validTerm(entry.to);
}

/** Each term has its own key, so edits to different terms do not overwrite one another. */
export function readPersonalTerms(storage: Storage, slug: string): PersonalTerm[] {
  const prefix = personalTermPrefix(slug);
  const terms: PersonalTerm[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (!raw || raw.length > 1000) continue;
    try {
      const term: unknown = JSON.parse(raw);
      if (validPersonalTerm(term) && key === prefix + encodeURIComponent(term.from)) terms.push(term);
    } catch { /* Ignore malformed entries without altering existing data. */ }
  }
  return terms.sort((a, b) => a.from.localeCompare(b.from)).slice(0, PERSONAL_TERMS_LIMIT);
}

export function savePersonalTerm(storage: Storage, slug: string, term: PersonalTerm): void {
  if (!validPersonalTerm(term)) throw new Error('Invalid replacement');
  const key = personalTermPrefix(slug) + encodeURIComponent(term.from);
  if (storage.getItem(key) === null && readPersonalTerms(storage, slug).length >= PERSONAL_TERMS_LIMIT)
    throw new Error('Too many replacements');
  storage.setItem(key, JSON.stringify(term));
}

export function removePersonalTerm(storage: Storage, slug: string, from: string): void {
  if (!validTerm(from)) throw new Error('Invalid replacement');
  storage.removeItem(personalTermPrefix(slug) + encodeURIComponent(from));
}

/** Exact, case-sensitive, non-recursive substitutions; longest source wins. */
export function createPersonalTermReplacer(terms: readonly PersonalTerm[]): (text: string) => string {
  const unique = new Map<string, string>();
  for (const term of terms) if (validPersonalTerm(term) && !unique.has(term.from)) unique.set(term.from, term.to);
  if (!unique.size) return text => text;
  const escaped = [...unique.keys()].sort((a, b) => b.length - a.length)
    .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('|'), 'g');
  return text => text.replace(pattern, match => unique.get(match)!);
}
export function replacePersonalTerms(text: string, terms: readonly PersonalTerm[]): string {
  return createPersonalTermReplacer(terms)(text);
}
