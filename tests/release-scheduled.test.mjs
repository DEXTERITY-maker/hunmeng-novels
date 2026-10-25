import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const slug = 'test-novel';
const chapter = (n, published = '') =>
  `---\nnovelSlug: "${slug}"\nslug: "chapter-${n}"\nnumber: ${n}\ntitle: "Chapter ${n}"\n` +
  `${published}description: "Test chapter ${n} description."\n---\n\nText ${n}.\n`;

async function fixture({ live, queued, finalChapter = 20, perDay = 5, lastRelease = '2026-10-25' }) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'hunmeng-release-'));
  await mkdir(path.join(root, 'src/content/chapters', slug), { recursive: true });
  await mkdir(path.join(root, 'src/content/novels'), { recursive: true });
  await mkdir(path.join(root, 'scheduled', slug), { recursive: true });
  for (const n of live)
    await writeFile(path.join(root, 'src/content/chapters', slug, `chapter-${n}.md`), chapter(n, 'publishedAt: "2026-10-25"\n'));
  for (const n of queued) await writeFile(path.join(root, 'scheduled', slug, `chapter-${n}.md`), chapter(n));
  await writeFile(
    path.join(root, 'src/content/novels', `${slug}.json`),
    JSON.stringify({ slug, title: 'Test Novel', originalStatus: 'Продолжается', translationStatus: 'Переводится', updatedAt: '2026-10-25' }),
  );
  await writeFile(path.join(root, 'scheduled/schedule.json'), JSON.stringify({ novels: { [slug]: { perDay, finalChapter, lastRelease } } }));
  return root;
}
async function release(root, date) {
  execFileSync(process.execPath, ['scripts/release-scheduled.mjs', root], {
    env: { ...process.env, RELEASE_DATE: date, RELEASE_REPORT_DIR: root },
  });
  return {
    summary: await readFile(path.join(root, 'release-summary.txt'), 'utf8'),
    problems: await readFile(path.join(root, 'release-problems.txt'), 'utf8'),
  };
}
const numbers = async (dir) =>
  (await readdir(dir)).map((f) => Number(f.match(/^chapter-(\d+)\.md$/)?.[1])).filter(Boolean).sort((a, b) => a - b);

test('releases the next chapters in order once per day', async () => {
  const root = await fixture({ live: [1, 2, 3], queued: [4, 5, 6, 7, 8, 9, 10] });
  const first = await release(root, '2026-10-26');
  assert.equal(first.summary, 'Release Test Novel ch. 4–8');
  assert.equal(first.problems, '');
  assert.deepEqual(await numbers(path.join(root, 'src/content/chapters', slug)), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(await numbers(path.join(root, 'scheduled', slug)), [9, 10]);
  const moved = await readFile(path.join(root, 'src/content/chapters', slug, 'chapter-4.md'), 'utf8');
  assert.match(moved, /^publishedAt: "2026-10-26"$/m);
  assert.match(moved, /\nText 4\.\n$/);
  const novel = JSON.parse(await readFile(path.join(root, 'src/content/novels', `${slug}.json`), 'utf8'));
  assert.equal(novel.updatedAt, '2026-10-26');
  const again = await release(root, '2026-10-26');
  assert.equal(again.summary, '');
  assert.deepEqual(await numbers(path.join(root, 'scheduled', slug)), [9, 10]);
});

test('a missing chapter stops the batch and is reported', async () => {
  const root = await fixture({ live: [1, 2, 3], queued: [4, 5, 7] });
  const result = await release(root, '2026-10-26');
  assert.equal(result.summary, 'Release Test Novel ch. 4–5');
  assert.match(result.problems, /chapter 6 is not ready/);
  assert.deepEqual(await numbers(path.join(root, 'scheduled', slug)), [7]);
});

test('the final chapter marks the novel completed', async () => {
  const root = await fixture({ live: [1, 2, 3, 4, 5, 6, 7, 8], queued: [9, 10], finalChapter: 10 });
  const result = await release(root, '2026-10-27');
  assert.equal(result.summary, 'Release Test Novel ch. 9–10');
  assert.equal(result.problems, '');
  const novel = JSON.parse(await readFile(path.join(root, 'src/content/novels', `${slug}.json`), 'utf8'));
  assert.equal(novel.originalStatus, 'Завершён');
  const done = await release(root, '2026-10-28');
  assert.equal(done.summary, '');
  assert.equal(done.problems, '');
});

test('queued chapters in the repository are valid and continue the published ones', async () => {
  const schedule = JSON.parse(await readFile('scheduled/schedule.json', 'utf8'));
  for (const [novelSlug, plan] of Object.entries(schedule.novels)) {
    const live = await numbers(path.join('src/content/chapters', novelSlug));
    const queued = await numbers(path.join('scheduled', novelSlug)).catch(() => []);
    assert.ok(live.length > 0, `${novelSlug}: no published chapters`);
    live.forEach((n, i) => assert.equal(n, i + 1, `${novelSlug}: published chapters must be 1..N without gaps`));
    queued.forEach((n, i) => assert.equal(n, live.length + 1 + i, `${novelSlug}: queue must continue from chapter ${live.length + 1} without gaps`));
    assert.ok(live.length + queued.length <= plan.finalChapter);
    for (const n of queued) {
      const text = await readFile(path.join('scheduled', novelSlug, `chapter-${n}.md`), 'utf8');
      const fm = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
      assert.match(fm, new RegExp(`^novelSlug: "${novelSlug}"$`, 'm'), `chapter ${n}: novelSlug`);
      assert.match(fm, new RegExp(`^slug: "chapter-${n}"$`, 'm'), `chapter ${n}: slug`);
      assert.match(fm, new RegExp(`^number: ${n}$`, 'm'), `chapter ${n}: number`);
      assert.match(fm, /^title: ".+"$/m, `chapter ${n}: title`);
      const description = fm.match(/^description: "(.*)"$/m)?.[1] ?? '';
      assert.ok(description.length >= 10 && description.length <= 200, `chapter ${n}: description must be 10-200 characters`);
      assert.ok(text.slice(text.indexOf('\n---\n') + 5).trim().length > 2000, `chapter ${n}: text is too short`);
    }
  }
});
