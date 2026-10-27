import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
export function parseChapter(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source);
  if (!match) throw new Error('Missing chapter metadata');
  const field = name => {
    const raw = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(match[1])?.[1]?.trim();
    if (!raw) throw new Error(`Missing ${name}`);
    return raw.startsWith('"') ? JSON.parse(raw) : raw;
  };
  return { number: Number(field('number')), title: field('title'), body: match[2].replace(/\r\n/g, '\n').trim() };
}
export function validateBody(body) {
  const count = Array.from(body).length;
  if (count < 4000 || count > 8500) throw new Error(`Chapter body has ${count} characters; expected 4000–8500`);
  return count;
}
export async function validateSerials(root = process.cwd()) {
  const serials = JSON.parse(await readFile(join(root, 'src/data/serials.json'), 'utf8'));
  const report = [];
  for (const serial of serials) {
    if (serial.chapters.length !== serial.totalChapters || serial.chapters.some((c, i) => c.number !== i + 1))
      throw new Error(`Invalid planned chapter sequence: ${serial.slug}`);
    const dir = join(root, 'src/content/chapters', serial.slug);
    const chapters = [];
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.md')) continue;
      const chapter = parseChapter(await readFile(join(dir, name), 'utf8'));
      if (chapter.number > serial.initialChapters)
        throw new Error(`Do not commit scheduled manuscript bodies to the public repository: ${name}`);
      if (name !== `chapter-${chapter.number}.md` || serial.chapters[chapter.number - 1]?.title !== chapter.title)
        throw new Error(`Chapter identity disagrees with the plan: ${name}`);
      chapters.push({ number: chapter.number, characters: validateBody(chapter.body) });
    }
    chapters.sort((a, b) => a.number - b.number);
    if (!chapters.length || chapters.some((c, i) => c.number !== i + 1))
      throw new Error(`Published opening chapters must be contiguous: ${serial.slug}`);
    report.push({ slug: serial.slug, written: chapters.length, planned: serial.totalChapters, chapters });
  }
  // The chapter length range applies to every published novel, not just planned serials.
  const planned = new Set(serials.map(s => s.slug));
  const chaptersRoot = join(root, 'src/content/chapters');
  for (const entry of await readdir(chaptersRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || planned.has(entry.name)) continue;
    const chapters = [];
    for (const name of await readdir(join(chaptersRoot, entry.name))) {
      if (!name.endsWith('.md')) continue;
      const chapter = parseChapter(await readFile(join(chaptersRoot, entry.name, name), 'utf8'));
      chapters.push({ number: chapter.number, characters: validateBody(chapter.body) });
    }
    if (chapters.length) report.push({ slug: entry.name, written: chapters.length, planned: null, chapters: chapters.sort((a,b) => a.number-b.number) });
  }
  return report;
}
