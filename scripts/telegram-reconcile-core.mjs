import {createHash} from 'node:crypto';

export const LEDGER_REF = 'refs/heads/telegram-notification-state';
const KEY = /^([a-z0-9]+(?:-[a-z0-9]+)*):([1-9][0-9]*)$/;
const SHA = /^[a-f0-9]{40}$/;
const digest = text => createHash('sha256').update(text).digest('hex');
const fail = message => { throw new Error(message); };

/** Pure proposal: never touches Git, Telegram, the input state, or pre-existing entries. */
export function createReconciliation({state, manifest, published, expectedKeys, originalText}) {
  if (!state || state.version !== 1 || state.initialized !== true || !state.chapters || typeof state.chapters !== 'object' || Array.isArray(state.chapters)) fail('Invalid ledger');
  if (!SHA.test(manifest.ledger_head ?? '') || !SHA.test(manifest.published_sha ?? '') || !SHA.test(state.deployedSha ?? '')) fail('Invalid revision');
  if (Object.values(state.chapters).some(v => v?.status === 'reserved')) fail('Reserved notices require separate reconciliation');
  const groups = [manifest.baseline, manifest.new, manifest.ambiguous];
  if (manifest.version !== 1 || groups.some(x => !Array.isArray(x))) fail('Invalid classification');
  const keys = groups.flat();
  if (!keys.length || keys.some(x => {if(typeof x !== 'string')return true;const m=KEY.exec(x);return !m || !Number.isSafeInteger(Number(m[2]));}) || new Set(keys).size !== keys.length) fail('Invalid or duplicate chapter keys');
  const actual = [...expectedKeys].sort();
  // All currently pending notices must be explicitly classified. Never reduce a
  // large backlog to an unknown small batch that the normal workflow could post.
  const unresolved = keys.filter(k => !Object.hasOwn(state.chapters, k));
  if (JSON.stringify([...unresolved].sort()) !== JSON.stringify(actual)) fail('Pending chapter set changed or is incomplete');
  const next = structuredClone(state);
  for (const key of manifest.baseline) {
    if (Object.hasOwn(state.chapters, key)) fail('Baseline candidate already exists in ledger');
    const m = KEY.exec(key), chapter = published.get(key);
    if (!chapter || chapter.novelSlug !== m[1] || chapter.number !== Number(m[2]) || !chapter.slug || !chapter.title || !chapter.novelTitle) fail('Candidate differs from published chapter');
    next.chapters[key] = {status:'baseline',slug:chapter.slug,title:chapter.title,novelTitle:chapter.novelTitle};
  }
  const blockers = [...manifest.new, ...manifest.ambiguous].filter(key => !Object.hasOwn(state.chapters,key));
  const after = JSON.stringify(next,null,2)+'\n';
  const planId = digest(JSON.stringify({ledgerHead:manifest.ledger_head,publishedSha:manifest.published_sha,manifestHash:digest(JSON.stringify(manifest)),beforeHash:digest(originalText),afterHash:digest(after),blockers}));
  return {next, after, planId, blockers, baselineCount:manifest.baseline.length};
}

export function ensureApplicable(plan, confirmation) {
  if (plan.blockers.length) fail('Unresolved notices remain; application is forbidden');
  if (confirmation !== plan.planId) fail('Plan confirmation does not match exact current state');
}

/** The new commit must be a direct child of the exact reviewed ledger head. */
export function pushWithLease(git, commit, expectedHead) {
  if (!SHA.test(commit) || !SHA.test(expectedHead)) fail('Invalid commit');
  if (git(['rev-parse', commit+'^']) !== expectedHead) fail('Commit parent does not match reviewed ledger');
  if (git(['ls-remote','origin',LEDGER_REF]).split(/\s+/)[0] !== expectedHead) fail('Ledger changed; create a new plan');
  // Git checks the lease atomically on the server. A concurrent writer cannot be overwritten.
  git(['push','--force-with-lease='+LEDGER_REF+':'+expectedHead,'origin',commit+':'+LEDGER_REF]);
  if (git(['ls-remote','origin',LEDGER_REF]).split(/\s+/)[0] !== commit) fail('Ledger changed after push; reconcile before doing anything else');
}
