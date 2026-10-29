import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('legacy Timeweb deployment stays disabled without owner-approved rollback', async () => {
  const workflow = await readFile('.github/workflows/check.yml', 'utf8');
  const start = workflow.indexOf('  deploy-timeweb:');
  assert.notEqual(start, -1, 'legacy job retained for review / possible rollback');
  const job = workflow.slice(start);
  assert.match(job, /^\s+if:\s*\$\{\{ false \}\}/m, 'no Timeweb dispatch from push or manual CI');
  assert.doesNotMatch(job, /if:\s*github\.ref\s*==.*push/, 'no dual publisher');
});

test('production canonical URL points at the active custom domain', async () => {
  const config = await readFile('src/config/site.ts', 'utf8');
  assert.match(config, /url:\s*'https:\/\/hunmeng-novel\.ru'/);
});

test('Cloudflare production deployment is explicit and SHA-pinned', async () => {
  const workflow = await readFile('.github/workflows/pages-manual-draft.yml', 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  // One explicitly approved one-off release can be emitted by merging its
  // exactly named commit. No untagged main push or pull_request may deploy.
  assert.match(workflow, /^\s+push:/m);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event_name == 'push' && startsWith\(github\.event\.head_commit\.message,/);
  assert.match(workflow, /fix\(ui\): publish mobile polish 2026-10-29 \[deploy cloudflare\]/);
  assert.doesNotMatch(workflow, /^\s+pull_request:/m);
  assert.match(workflow, /APPROVED_SHA.*GITHUB_SHA/);
  assert.match(workflow, /SITE_URL: https:\/\/hunmeng-novel\.ru/);
});
