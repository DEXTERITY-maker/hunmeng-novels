import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[0-9a-f]{40}$/;
const repoPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]+$/;

export async function verifyMainRevision({ expectedSha, repository, token,
  readHead = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  readStatus = () => execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }),
  fetchImpl = fetch } = {}) {
  if (!shaPattern.test(expectedSha ?? '') || !repoPattern.test(repository ?? '') ||
      repository.endsWith('/.') || repository.endsWith('/..') ||
      typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token)) {
    throw new Error('Release verification configuration is invalid.');
  }

  let head, status;
  try { head = readHead().trim(); status = readStatus(); }
  catch { throw new Error('Unable to verify the local release checkout.'); }
  if (head !== expectedSha) throw new Error('Release checkout does not match the expected revision.');
  if (typeof status !== 'string' || status.trim()) throw new Error('Release checkout contains uncommitted files.');

  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${repository}/git/ref/heads/main`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  } catch { throw new Error('Unable to verify the current main revision.'); }
  if (!response?.ok) throw new Error('GitHub did not confirm the current main revision.');
  let data;
  try { data = await response.json(); }
  catch { throw new Error('GitHub returned an invalid main revision response.'); }
  if (data?.ref !== 'refs/heads/main' || data.object?.type !== 'commit' || !shaPattern.test(data.object?.sha ?? ''))
    throw new Error('GitHub returned an invalid main revision response.');
  if (data.object.sha !== expectedSha) throw new Error('main has changed; the release is stale.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyMainRevision({ expectedSha: process.env.EXPECTED_DEPLOY_SHA,
    repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN })
    .then(() => console.log('The checked-out revision is still current on main.'))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
