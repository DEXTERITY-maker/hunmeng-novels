import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const verifier = fileURLToPath(new URL('../scripts/verify-alice-cover-preview.mjs', import.meta.url));
const image = 'public/images/covers/alices-adventures-in-wonderland-1865.jpg';
const metadata = 'src/content/novels/alices-adventures-in-wonderland.json';
const news = 'src/content/news/alice-historical-cover-2026-11-01.md';

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'hunmeng-alice-preview-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of [image, metadata, news]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    copyFileSync(file, path.join(root, file));
  }
  const mock = path.join(root, 'forbid-network.mjs');
  writeFileSync(mock, "globalThis.fetch = () => { throw new Error('unexpected network request'); };\n");
  return { root, file: name => path.join(root, name),
    run: () => spawnSync(process.execPath, ['--import', mock, verifier], { cwd: root, encoding: 'utf8' }) };
}

test('the committed cover and provenance pass offline without modifying them', t => {
  const f = fixture(t);
  const before = [image, metadata, news].map(file => readFileSync(f.file(file)));
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Verified the committed Alice cover/);
  for (const [index, file] of [image, metadata, news].entries())
    assert.deepEqual(readFileSync(f.file(file)), before[index]);
});

test('missing, truncated, or corrupted cover fails closed', async t => {
  for (const scenario of ['missing', 'truncated', 'corrupted']) {
    await t.test(scenario, t => {
      const f = fixture(t);
      if (scenario === 'missing') unlinkSync(f.file(image));
      if (scenario === 'truncated') writeFileSync(f.file(image), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
      if (scenario === 'corrupted') {
        const bytes = readFileSync(f.file(image));
        bytes[100] ^= 1;
        writeFileSync(f.file(image), bytes);
      }
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, scenario === 'missing' ? /ENOENT/ : scenario === 'truncated' ? /size mismatch/ : /checksum mismatch/);
    });
  }
});

test('unexpected book metadata and source are rejected', async t => {
  for (const [field, value] of [['cover', '/images/novel-placeholder.svg'], ['slug', 'other'],
    ['author', 'Other Author'], ['originalUrl', 'https://example.invalid/book']]) {
    await t.test(field, t => {
      const f = fixture(t);
      const novel = JSON.parse(readFileSync(f.file(metadata), 'utf8'));
      novel[field] = value;
      writeFileSync(f.file(metadata), JSON.stringify(novel));
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /metadata or source/);
    });
  }
});

test('missing announcement or provenance is rejected', async t => {
  for (const scenario of ['missing', 'cover', 'commons', 'public-domain', 'text-source']) {
    await t.test(scenario, t => {
      const f = fixture(t);
      if (scenario === 'missing') unlinkSync(f.file(news));
      else {
        let content = readFileSync(f.file(news), 'utf8');
        if (scenario === 'cover') content = content.replace('cover: "/images/covers/', 'cover: "/incorrect/');
        if (scenario === 'commons') content = content.replace('https://commons.wikimedia.org/', 'https://example.invalid/');
        if (scenario === 'public-domain') content = content.replace('marked as public domain', 'unverified');
        if (scenario === 'text-source') content = content.replace('https://standardebooks.org/', 'https://example.invalid/');
        writeFileSync(f.file(news), content);
      }
      const result = f.run();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, scenario === 'missing' ? /ENOENT/ : /announcement or provenance/);
    });
  }
});

test('preview workflow runs the offline verifier, tests, and production build', () => {
  const workflow = readFileSync('.github/workflows/verify-alice-cover.yml', 'utf8');
  assert.match(workflow, /node --test tests\/alice-original-cover\.test\.mjs tests\/alice-cover-preview\.test\.mjs/);
  assert.match(workflow, /run: node scripts\/verify-alice-cover-preview\.mjs/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /dist\/novel\/alices-adventures-in-wonderland\/index\.html/);
  assert.match(workflow, /dist\/news\/alice-historical-cover-2026-11-01\/index\.html/);
  assert.doesNotMatch(workflow, /run: node scripts\/sync-alice-historical-cover\.mjs/);
  for (const file of [image, metadata, news, 'scripts/verify-alice-cover-preview.mjs', 'tests/alice-cover-preview.test.mjs'])
    assert.ok(workflow.includes(`'${file}'`), `workflow does not watch ${file}`);
});
