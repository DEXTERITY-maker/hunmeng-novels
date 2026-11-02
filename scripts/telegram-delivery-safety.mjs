/** Fail-closed Telegram transport. Never log a token, URL, request body or Telegram description. */
const validStatus = n => Number.isInteger(n) && n >= 100 && n <= 599 ? n : null;
const retryAfterSeconds = n => Number.isSafeInteger(n) && n > 0 && n <= 3600 ? n : null;

export class TelegramRequestError extends Error {
  constructor(kind, status = null, retryAfter = null) {
    super('Telegram ' + kind);
    this.name = 'TelegramRequestError';
    this.kind = kind;
    this.status = validStatus(status);
    this.retryAfter = retryAfterSeconds(retryAfter);
  }
}

export function safeTelegramFailure(error) {
  if (!(error instanceof TelegramRequestError)) return 'unknown_failure';
  return 'kind=' + error.kind + '; http=' + (error.status ?? 'unknown') + '; retry_after=' + (error.retryAfter ?? 'none');
}

export function reservedChapterKeys(state) {
  return Object.entries(state?.chapters ?? {})
    .filter(([, entry]) => entry?.status === 'reserved')
    .map(([key]) => key).sort();
}

/** Explicit Telegram rejection (including HTTP 429) is recorded, never automatically retried.
 * A timeout is ambiguous, so any reserved chapter requires manual reconciliation.
 */
export function createTelegramRequest({token, fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))} = {}) {
  return async (method, body) => {
    if (!token) throw new TelegramRequestError('missing_secret');
    // Conservative channel pacing; starts before the first post too.
    if (method === 'sendMessage') await sleep(3000);
    let response;
    try {
      response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
        method: body ? 'POST' : 'GET',
        headers: body ? {'content-type': 'application/json'} : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new TelegramRequestError('transport_unconfirmed');
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new TelegramRequestError('invalid_response', response.status); }
    if (!response.ok || payload?.ok !== true) {
      throw new TelegramRequestError('api_rejection', response.status, payload?.parameters?.retry_after);
    }
    // HTTP success without a confirmed message ID must stay reserved.
    if (method === 'sendMessage' && (!Number.isSafeInteger(payload?.result?.message_id) || payload.result.message_id <= 0)) {
      throw new TelegramRequestError('unconfirmed_message', response.status);
    }
    return payload.result;
  };
}


/** Deliberately allowlisted one-off recovery; refuses any other chapter or ledger state. */
export function selectManualRecovery(state, key) {
  if (key !== 'dracula:1') throw new Error('Manual recovery target not allowed');
  const reserved = reservedChapterKeys(state);
  if (reserved.length !== 1 || reserved[0] !== key) throw new Error('Exactly one matching reserved chapter required');
  const record = state.chapters[key];
  if (record.status !== 'reserved' || record.slug !== 'chapter-1' ||
      record.title !== 'Part 1' || record.novelTitle !== 'Dracula')
    throw new Error('Reserved chapter metadata differs from approved recovery');
  return {novelSlug:'dracula',number:1,slug:record.slug,title:record.title,novelTitle:record.novelTitle};
}
