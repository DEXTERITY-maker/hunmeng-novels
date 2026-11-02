import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = '.github/workflows/';
const group = 'hunmeng-pages-production';
const expected = 'a'.repeat(40);
const other = 'b'.repeat(40);
const token = 'fixture-token-never-log';
const repository = 'DEXTERITY-maker/hunmeng-novels';
const workflows = [
  { file: 'pages-manual-draft.yml', job: 'deploy', deploy: 'pages' },
  { file: 'import-public-domain.yml', job: 'ingest', deploy: 'pages', generated: true, conditional: true },
  { file: 'publish-approved.yml', job: 'publish' },
  { file: 'publish-historical-covers.yml', job: 'covers', deploy: 'pages', generated: true },
  { file: 'publish-alice-historical-cover.yml', job: 'publish-cover', deploy: 'pages', generated: true },
];

function workflow(file) { return readFileSync(dir + file, 'utf8'); }
function job(source, name) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === `  ${name}:`);
  assert.notEqual(start, -1, `missing job ${name}`);
  const next = lines.findIndex((line, i) => i > start && /^  [\w-]+:\s*$/.test(line));
  return lines.slice(start, next < 0 ? undefined : next).join('\n');
}
function steps(source) {
  const starts = [...source.matchAll(/^      - (?=(?:name|uses|run):)/gm)].map(match => match.index);
  return starts.map((start, i) => source.slice(start, starts[i + 1] ?? source.length));
}
function admission(source, name) {
  const match = /^    if: >-\n((?: {6,}.+\n)+)/m.exec(job(source, name));
  assert.ok(match, `missing admission condition: ${name}`);
  const condition = match[1].replace(/\s+/g, ' ').trim();
  const pattern = /startsWith\(github\.event\.head_commit\.message,\s*'([^']+)'\)/g;
  return { subjects: [...condition.matchAll(pattern)].map(item => item[1]),
    shape: condition.replace(pattern, 'MATCH') };
}
const loadGuard = () => import('../scripts/verify-main-revision.mjs');
function response(sha = expected) {
  return new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha } }), { status: 200 });
}
function options(overrides = {}) {
  return { expectedSha: expected, repository, token, readHead: () => expected, readStatus: () => '',
    fetchImpl: async () => response(), ...overrides };
}
async function guardedDeploy(opts, deploy) {
  const { verifyMainRevision } = await loadGuard();
  await verifyMainRevision(opts);
  deploy();
}

test('all main writers and deployment jobs share a job-level, non-cancelling queue', () => {
  for (const entry of workflows) {
    const text = workflow(entry.file);
    assert.doesNotMatch(text.split(/^jobs:\s*$/m)[0], /^concurrency:\s*$/m, entry.file);
    const header = job(text, entry.job).split(/^    steps:\s*$/m)[0];
    assert.match(header, new RegExp(`^    concurrency:\\n      group: ${group}\\n      queue: max\\n      cancel-in-progress: false$`, 'm'), entry.file);
  }
});

test('all checked-in main writers and deployment workflows are included in the shared queue', () => {
  const detected = readdirSync(dir).filter(file => file.endsWith('.yml')).filter(file => {
    const text = workflow(file);
    return /git push origin HEAD:main|command: pages deploy |run: node scripts\/deploy-timeweb\.mjs/.test(text);
  }).sort();
  assert.deepEqual(detected, [...workflows.map(item => item.file), 'check.yml'].sort());
  assert.match(job(workflow('check.yml'), 'deploy-timeweb'), /if: \$\{\{ false \}\}/);
});

test('each deployment is immediately preceded by a fail-closed freshness check', () => {
  for (const entry of workflows.filter(item => item.deploy)) {
    const list = steps(job(workflow(entry.file), entry.job));
    const target = list.findIndex(step => entry.deploy === 'pages'
      ? step.includes('command: pages deploy ') : step.includes('node scripts/deploy-timeweb.mjs'));
    assert.ok(target > 0, entry.file);
    const check = list[target - 1];
    assert.match(check, /run: node scripts\/verify-main-revision\.mjs/, entry.file);
    assert.match(check, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/, entry.file);
    assert.doesNotMatch(check, /continue-on-error:|always\(\)|failure\(\)/, entry.file);
    assert.doesNotMatch(list[target], /continue-on-error:|always\(\)|failure\(\)/, entry.file);
    if (entry.deploy === 'pages') {
      assert.match(list[target], /uses: cloudflare\/wrangler-action@953926a2e2182532811c01a25e53647d93bf07c0 # v4/, entry.file);
      assert.match(list[target], /preCommands: node scripts\/verify-main-revision\.mjs/, entry.file);
      assert.match(list[target], /GITHUB_TOKEN: \$\{\{ github\.token \}\}/, entry.file);
      assert.match(list[target], /npm_config_save: 'false'/, entry.file);
    }
    if (entry.generated) {
      assert.match(check, /EXPECTED_DEPLOY_SHA: \$\{\{ steps\.commit\.outputs\.sha \}\}/, entry.file);
      assert.match(list[target], /EXPECTED_DEPLOY_SHA: \$\{\{ steps\.commit\.outputs\.sha \}\}/, entry.file);
      assert.match(list[target], /--commit-hash=\$\{\{ steps\.commit\.outputs\.sha \}\}/, entry.file);
      const commit = list.find(step => step.includes('git push origin HEAD:main'));
      assert.match(commit, /id: commit/, entry.file);
      assert.match(commit, /git push origin HEAD:main[\s\S]*echo "sha=\$\(git rev-parse HEAD\)" >> "\$GITHUB_OUTPUT"/, entry.file);
    } else {
      assert.match(check, /EXPECTED_DEPLOY_SHA: \$\{\{ github\.sha \}\}/, entry.file);
      if (entry.deploy === 'pages') {
        assert.match(list[target], /EXPECTED_DEPLOY_SHA: \$\{\{ github\.sha \}\}/, entry.file);
        assert.match(list[target], /--commit-hash=\$\{\{ github\.sha \}\}/, entry.file);
      }
    }
    if (entry.conditional) {
      assert.match(check, /if: steps\.commit\.outputs\.changed == 'true'/, entry.file);
      assert.match(list[target], /if: steps\.commit\.outputs\.changed == 'true'/, entry.file);
    }
  }
});

test('an offline npm install for Wrangler leaves the tracked manifests unchanged', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'hunmeng-wrangler-install-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = path.join(root, 'app'), fixture = path.join(root, 'wrangler');
  mkdirSync(app);
  mkdirSync(fixture);
  const manifest = JSON.stringify({ name: 'fixture-app', version: '1.0.0', private: true }, null, 2) + '\n';
  const lock = JSON.stringify({ name: 'fixture-app', version: '1.0.0', lockfileVersion: 3,
    requires: true, packages: { '': { name: 'fixture-app', version: '1.0.0' } } }, null, 2) + '\n';
  writeFileSync(path.join(app, 'package.json'), manifest);
  writeFileSync(path.join(app, 'package-lock.json'), lock);
  writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: 'fixture-wrangler', version: '4.0.0' }));
  const install = spawnSync('npm', ['install', fixture, '--offline', '--no-audit', '--no-fund'], {
    cwd: app, env: { ...process.env, npm_config_save: 'false', npm_config_cache: path.join(root, 'cache') },
    encoding: 'utf8',
  });
  assert.equal(install.status, 0, install.stderr);
  assert.equal(readFileSync(path.join(app, 'package.json'), 'utf8'), manifest);
  assert.equal(readFileSync(path.join(app, 'package-lock.json'), 'utf8'), lock);
  assert.equal(JSON.parse(readFileSync(path.join(app, 'node_modules/fixture-wrangler/package.json'), 'utf8')).version, '4.0.0');
});

test('release triggers, access controls and editorial checks stay in place', () => {
  const pages = workflow('pages-manual-draft.yml');
  const imports = workflow('import-public-domain.yml');
  const translations = workflow('publish-approved.yml');
  const covers = workflow('publish-historical-covers.yml');
  const alice = workflow('publish-alice-historical-cover.yml');
  assert.match(pages, /permissions:\s*\n  contents: read/);
  assert.match(pages, /github\.ref == 'refs\/heads\/main'/);
  assert.match(pages, /github\.event_name == 'workflow_dispatch'/);
  assert.match(pages, /startsWith\(github\.event\.head_commit\.message/);
  assert.match(pages, /environment: pages-production/);
  assert.match(pages, /APPROVED_SHA.*GITHUB_SHA/);
  for (const text of [imports, covers, alice]) {
    assert.match(text, /permissions:\s*\n  contents: write/);
    assert.match(text, /github\.ref == 'refs\/heads\/main'/);
    assert.match(text, /startsWith\(github\.event\.head_commit\.message/);
    assert.match(text, /environment: pages-production/);
    assert.match(text, /ref: \$\{\{ github\.sha \}\}/);
  }
  assert.match(imports, /github\.event_name == 'workflow_dispatch'/);
  assert.match(imports, /node scripts\/import-public-domain\.mjs/);
  assert.match(imports, /node scripts\/validate-serials\.mjs/);
  assert.match(translations, /permissions:\s*\n  contents: write/);
  assert.match(translations, /vars\.HUNMENG_PUBLISH_ENABLED == 'true'/);
  assert.match(translations, /publish-approved\.mjs stage[\s\S]*publish-approved\.mjs verify[\s\S]*git push origin HEAD:main[\s\S]*publish-approved\.mjs finalize/);
  assert.match(job(workflow('check.yml'), 'deploy-timeweb'), /if: \$\{\{ false \}\}/);
  assert.match(covers, /sync-historical-covers\.mjs/);
  assert.match(alice, /sync-alice-historical-cover\.mjs/);
  for (const text of [pages, imports, translations, covers, alice]) {
    assert.doesNotMatch(text, /continue-on-error:\s*true/);
  }
});

test('the complete existing release allowlists and admission expressions are unchanged', () => {
  const pages = admission(workflow('pages-manual-draft.yml'), 'deploy');
  const pagesSubjects = [
    'fix(ui): publish mobile polish 2026-10-29 [deploy cloudflare]',
    'content(news): publish mobile polish note 2026-10-29 [deploy cloudflare]',
    'design(ui): publish Hunmeng editorial redesign 2026-10-29 [deploy cloudflare]',
    'chore(release): publish reader panorama 2026-10-30 [deploy cloudflare]',
    'chore(release): publish official news notes 2026-10-30 [deploy cloudflare]',
    'chore(release): publish interface motion polish 2026-11-01 [deploy cloudflare]',
    'content(news): publish interface motion announcement 2026-11-01 [deploy cloudflare]',
    'chore(content): withdraw original Hunmeng novels 2026-11-01 [deploy cloudflare]',
    'fix(release): clean demo content before production build 2026-11-01 [deploy cloudflare]',
    'fix(release): clear persistent Astro cache 2026-11-01 [deploy cloudflare]',
    'content(external): publish highway survival reference 2026-11-01 [deploy cloudflare]',
    'fix(catalog): publish external reading position 2026-11-01 [deploy cloudflare]',
    'fix(catalog): publish searchable external novels 2026-11-01 [deploy cloudflare]',
    'feat(editorial): publish authorized chapter import workflow 2026-11-01 [deploy cloudflare]',
    'fix(release): publish rights-gated chapter import 2026-11-01 [deploy cloudflare]',
    'feat(research): publish DaoSearch editorial lookup 2026-11-01 [deploy cloudflare]',
  ];
  assert.deepEqual(pages.subjects, pagesSubjects);
  assert.equal(pages.shape, "github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && (" + pagesSubjects.map(() => 'MATCH').join(' || ') + ')))');
  const imports = admission(workflow('import-public-domain.yml'), 'ingest');
  assert.deepEqual(imports.subjects, ['feat(import): launch verified public domain reading 2026-11-01 [deploy cloudflare]']);
  assert.equal(imports.shape, "github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && MATCH))");
  const covers = admission(workflow('publish-historical-covers.yml'), 'covers');
  assert.deepEqual(covers.subjects, ['feat(covers): publish nine historical editions 2026-11-01 [deploy cloudflare]']);
  assert.equal(covers.shape, "github.ref == 'refs/heads/main' && github.event_name == 'push' && MATCH");
  const alice = admission(workflow('publish-alice-historical-cover.yml'), 'publish-cover');
  assert.deepEqual(alice.subjects, [
    'feat(cover): publish original Alice 1865 cover 2026-11-01 [deploy cloudflare]',
    'fix(cover): publish original Alice first edition 2026-11-01 [deploy cloudflare]',
  ]);
  assert.equal(alice.shape, "github.ref == 'refs/heads/main' && github.event_name == 'push' && (MATCH || MATCH)");
  assert.match(job(workflow('publish-approved.yml'), 'publish'), /^    if: \$\{\{ vars\.HUNMENG_PUBLISH_ENABLED == 'true' \}\}$/m);
});

test('the exact checked-out revision may deploy only when main still matches it', async () => {
  let calls = 0;
  const { verifyMainRevision } = await loadGuard();
  await verifyMainRevision(options({ fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, `https://api.github.com/repos/${repository}/git/ref/heads/main`);
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    return response();
  } }));
  assert.equal(calls, 1);
});

test('a changed main after the build blocks deployment and is rechecked on each attempt', async () => {
  let mainSha = expected;
  let deployments = 0;
  const opts = options({ fetchImpl: async () => response(mainSha) });
  await guardedDeploy(opts, () => deployments++);
  mainSha = other;
  await assert.rejects(() => guardedDeploy(opts, () => deployments++), /main.*changed|stale/i);
  assert.equal(deployments, 1);
});

test('real Git status accepts ignored build outputs but rejects changed and untracked source', async t => {
  const root = mkdtempSync(path.join(tmpdir(), 'hunmeng-build-status-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  writeFileSync(path.join(root, '.gitignore'), readFileSync('.gitignore'));
  mkdirSync(path.join(root, 'src'));
  writeFileSync(path.join(root, 'src/content.txt'), 'committed content\n');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  const head = git('rev-parse', 'HEAD').trim();
  for (const file of ['dist/index.html', '.astro/content.json', 'node_modules/.astro/cache',
    'test-results/result.txt', 'playwright-report/index.html']) {
    const full = path.join(root, file);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, 'normal generated output');
  }
  const { verifyMainRevision } = await loadGuard();
  const opts = options({ expectedSha: head, readHead: () => git('rev-parse', 'HEAD'),
    readStatus: () => git('status', '--porcelain', '--untracked-files=all'),
    fetchImpl: async () => response(head) });
  await verifyMainRevision(opts);
  writeFileSync(path.join(root, 'src/content.txt'), 'modified content\n');
  await assert.rejects(() => verifyMainRevision(opts), /uncommitted files/);
  git('checkout', '--', 'src/content.txt');
  writeFileSync(path.join(root, 'src/untracked.txt'), 'uncommitted content\n');
  await assert.rejects(() => verifyMainRevision(opts), /uncommitted files/);
});

test('generated deployments build the staged content before committing and checking that commit', () => {
  for (const entry of workflows.filter(item => item.generated)) {
    const list = steps(job(workflow(entry.file), entry.job));
    const checkout = list.find(step => step.includes('actions/checkout@v4'));
    const build = list.findIndex(step => step.includes('npm run build') && !step.includes('npm run build:demo'));
    const commit = list.findIndex(step => step.includes('git push origin HEAD:main'));
    const check = list.findIndex(step => step.includes('run: node scripts/verify-main-revision.mjs'));
    assert.match(checkout, /ref: \$\{\{ github\.sha \}\}/, entry.file);
    assert.ok(build >= 0 && build < commit && commit < check, entry.file);
  }
});

test('a generated publication is checked against its new commit, not the triggering commit', async () => {
  const { verifyMainRevision } = await loadGuard();
  const published = 'c'.repeat(40);
  await verifyMainRevision(options({ expectedSha: published, readHead: () => published,
    fetchImpl: async () => response(published) }));
  await assert.rejects(() => verifyMainRevision(options({ readHead: () => published,
    fetchImpl: async () => response(published) })), /checkout.*revision/i);
});

test('invalid expected SHA, repository, token or checkout fails before any network or deployment', async () => {
  let calls = 0, deployments = 0;
  const fetchImpl = async () => { calls++; return response(); };
  for (const changes of [
    { expectedSha: '' }, { expectedSha: '1234' }, { repository: '../invalid' },
    { token: '' }, { readHead: () => other }, { readHead: () => { throw Error('git unavailable'); } },
    { readStatus: () => '?? src/content/uncommitted.md\n' },
    { readStatus: () => { throw Error('git unavailable'); } },
  ]) {
    await assert.rejects(() => guardedDeploy(options({ fetchImpl, ...changes }), () => deployments++));
  }
  assert.equal(calls, 0);
  assert.equal(deployments, 0);
});

test('network errors, rejected requests and malformed responses never permit deployment or expose credentials', async () => {
  let deployments = 0;
  const cases = [
    async () => { throw Error(`network failure ${token}`); },
    async () => new Response('private response', { status: 403 }),
    async () => new Response('not-json', { status: 200 }),
    async () => new Response(JSON.stringify({ ref: 'refs/heads/other', object: { type: 'commit', sha: expected } })),
    async () => new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'tag', sha: expected } })),
    async () => new Response(JSON.stringify({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'broken' } })),
  ];
  for (const fetchImpl of cases) {
    await assert.rejects(() => guardedDeploy(options({ fetchImpl }), () => deployments++), error => {
      assert.doesNotMatch(error.message, /fixture-token-never-log|private response/);
      return true;
    });
  }
  assert.equal(deployments, 0);
});

test('the real CLI exits nonzero on missing configuration without contacting any service', () => {
  const result = spawnSync(process.execPath, ['scripts/verify-main-revision.mjs'], {
    env: { ...process.env, EXPECTED_DEPLOY_SHA: '', GITHUB_TOKEN: '', GITHUB_REPOSITORY: '' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /fixture-token-never-log/);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|Cannot find module/);
  assert.match(result.stderr, /verification configuration is invalid/i);
});

test('the actual CLI accepts a current revision and rejects a stale revision using offline fixtures', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'hunmeng-release-check-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  const git = path.join(bin, 'git');
  writeFileSync(git, `#!${process.execPath}\n` + String.raw`
const args = process.argv.slice(2);
if (args[0] === 'rev-parse' && args[1] === 'HEAD') process.stdout.write(process.env.FIXTURE_HEAD + '\n');
else if (args[0] === 'status') process.stdout.write(process.env.FIXTURE_STATUS || '');
else process.exit(2);
`);
  chmodSync(git, 0o755);
  const mock = path.join(root, 'fetch.mjs');
  writeFileSync(mock, String.raw`
globalThis.fetch = async () => new Response(JSON.stringify({
  ref: 'refs/heads/main', object: { type: 'commit', sha: process.env.FIXTURE_MAIN }
}), { status: 200 });
`);
  const run = main => spawnSync(process.execPath, ['--import', mock, 'scripts/verify-main-revision.mjs'], {
    env: { ...process.env, PATH: bin, EXPECTED_DEPLOY_SHA: expected,
      GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token,
      FIXTURE_HEAD: expected, FIXTURE_STATUS: '', FIXTURE_MAIN: main },
    encoding: 'utf8',
  });
  const current = run(expected);
  assert.equal(current.status, 0);
  assert.match(current.stdout, /still current/);
  const stale = run(other);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /main has changed/);
  assert.doesNotMatch(stale.stderr + stale.stdout, /fixture-token-never-log/);
});
