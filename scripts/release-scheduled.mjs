#!/usr/bin/env node
// Daily chapter release.
// For every novel in scheduled/schedule.json, moves the next `perDay` chapters (strictly in order)
// from scheduled/<slug>/ into src/content/chapters/<slug>/, stamps publishedAt with the release date
// and updates the novel's updatedAt. When the final chapter goes out, the novel is marked completed.
//
// Usage: node scripts/release-scheduled.mjs [repoRoot]
// Env:   RELEASE_DATE=YYYY-MM-DD (default: today in UTC)
//        RELEASE_REPORT_DIR=dir   (where release-summary.txt and release-problems.txt are written)
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const root = path.resolve(process.argv[2] ?? '.');
const today = process.env.RELEASE_DATE ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error(`Invalid RELEASE_DATE: ${today}`);
const reportDir = process.env.RELEASE_REPORT_DIR ?? os.tmpdir();
const schedulePath = path.join(root, 'scheduled', 'schedule.json');
const schedule = JSON.parse(await readFile(schedulePath, 'utf8'));

const chapterFile = /^chapter-(\d+)\.md$/;
async function chapterNumbers(dir) {
  const files = await readdir(dir).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  return files
    .map((file) => file.match(chapterFile))
    .filter(Boolean)
    .map((match) => Number(match[1]))
    .sort((a, b) => a - b);
}
const frontmatter = (text) => text.match(/^---\n([\s\S]*?)\n---\n/);
const field = (fm, name) => fm.match(new RegExp(`^${name}:[ \\t]*["']?([^"'\\n]*?)["']?[ \\t]*$`, 'm'))?.[1];
function stamp(text, date) {
  const match = frontmatter(text);
  let fm = match[1];
  if (/^publishedAt:/m.test(fm)) fm = fm.replace(/^publishedAt:.*$/m, `publishedAt: "${date}"`);
  else fm += `\npublishedAt: "${date}"`;
  return `---\n${fm}\n---\n${text.slice(match[0].length)}`;
}

const released = [];
const problems = [];
for (const [slug, plan] of Object.entries(schedule.novels ?? {})) {
  const { perDay, finalChapter } = plan;
  if (!Number.isInteger(perDay) || perDay < 1 || !Number.isInteger(finalChapter) || finalChapter < 1) {
    problems.push(`${slug}: perDay and finalChapter must be positive integers`);
    continue;
  }
  if (plan.lastRelease && plan.lastRelease >= today) {
    console.log(`${slug}: already released on ${plan.lastRelease}`);
    continue;
  }
  const queueDir = path.join(root, 'scheduled', slug);
  const liveDir = path.join(root, 'src', 'content', 'chapters', slug);
  const queued = new Set(await chapterNumbers(queueDir));
  let next = ((await chapterNumbers(liveDir)).at(-1) ?? 0) + 1;
  if (next > finalChapter) {
    console.log(`${slug}: all ${finalChapter} chapters are published`);
    continue;
  }
  const batch = [];
  while (batch.length < perDay && next <= finalChapter && queued.has(next)) {
    const file = `chapter-${next}.md`;
    const text = await readFile(path.join(queueDir, file), 'utf8');
    const match = frontmatter(text);
    if (
      !match ||
      field(match[1], 'novelSlug') !== slug ||
      field(match[1], 'slug') !== `chapter-${next}` ||
      Number(field(match[1], 'number')) !== next
    ) {
      problems.push(`${slug}: scheduled/${slug}/${file} has invalid frontmatter`);
      break;
    }
    batch.push({ file, text, number: next });
    next++;
  }
  if (batch.length < perDay && next <= finalChapter)
    problems.push(`${slug}: chapter ${next} is not ready in scheduled/${slug}/ (released ${batch.length} of ${perDay})`);
  if (!batch.length) continue;

  await mkdir(liveDir, { recursive: true });
  for (const { file, text } of batch) {
    await writeFile(path.join(liveDir, file), stamp(text, today));
    await unlink(path.join(queueDir, file));
  }
  const novelPath = path.join(root, 'src', 'content', 'novels', `${slug}.json`);
  const novel = JSON.parse(await readFile(novelPath, 'utf8'));
  novel.updatedAt = today;
  const first = batch[0].number;
  const last = batch.at(-1).number;
  if (last >= finalChapter) {
    novel.originalStatus = 'Завершён';
    novel.translationStatus = 'Завершён';
  }
  await writeFile(novelPath, JSON.stringify(novel, null, 2) + '\n');
  plan.lastRelease = today;
  released.push(first === last ? `${novel.title} ch. ${first}` : `${novel.title} ch. ${first}–${last}`);
}

await writeFile(schedulePath, JSON.stringify(schedule, null, 2) + '\n');
const summary = released.length ? `Release ${released.join('; ')}` : '';
await mkdir(reportDir, { recursive: true });
await writeFile(path.join(reportDir, 'release-summary.txt'), summary);
await writeFile(path.join(reportDir, 'release-problems.txt'), problems.join('\n'));
console.log(summary || 'Nothing to release today.');
for (const problem of problems) console.log(`::error::${problem}`);
