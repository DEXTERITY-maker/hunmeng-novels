import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { makePublicationNews } from '../scripts/publication-news.mjs';

const date = '2026-10-25';
const novel = {kind: 'novel', novelSlug: 'legenda-hunmeng',
  novelTitle: 'The Legend of Hunmeng', date};
const chapter = {...novel, kind: 'chapter', chapterSlug: 'glava-1',
  chapterNumber: 1, chapterTitle: 'The Journey Begins'};

test('authorized novel gets a single publication announcement without GitHub links', () => {
  const note = makePublicationNews(novel);
  assert.equal(note.name, 'publication-novel-legenda-hunmeng.md');
  assert.match(note.content, /title: "New novel: The Legend of Hunmeng"/);
  assert.match(note.content, /publishedAt: "2026-10-25"/);
  assert.match(note.content, /category: announcements/);
  assert.match(note.content, /\/novel\/legenda-hunmeng\//);
  assert.doesNotMatch(note.content, /GitHub|github\.com|коммит|OAuth/);
});

test('new authorized chapter generates a stable link and no technical release note', () => {
  const note = makePublicationNews(chapter);
  assert.equal(note.name, 'publication-chapter-legenda-hunmeng--glava-1.md');
  assert.match(note.content, /New chapter: The Legend of Hunmeng — 1/);
  assert.match(note.content, /\/novel\/legenda-hunmeng\/glava-1\//);
  assert.deepEqual(makePublicationNews(chapter), note);
});

test('malformed slugs, fake dates and invalid chapter numbers are rejected', () => {
  assert.throws(() => makePublicationNews({...novel,novelSlug:'../wrong'}));
  assert.throws(() => makePublicationNews({...novel,date:'2026-02-31'}));
  assert.throws(() => makePublicationNews({...chapter,chapterSlug:'../../bad'}));
  assert.throws(() => makePublicationNews({...chapter,chapterNumber:0}));
  assert.throws(() => makePublicationNews({...chapter,kind:'commit'}));
});

test('markup in the source title cannot inject HTML or new Markdown links', () => {
  const note = makePublicationNews({...chapter,
    novelTitle: '<script>bad</script> [visit](https://bad.test)',
    chapterTitle: '*Markdown* <img>'});
  assert.doesNotMatch(note.content, /<script>|<img>|(\[visit\])|(https:\/\/bad\.test)/);
});

test('one welcome announcement remains; old commit-based job is removed', async () => {
  const paths = await fs.readdir('src/content/news');
  assert.ok(paths.includes('hunmeng-opens.md'));
  assert.equal(paths.filter(p => /^(update-|release-)/.test(p)).length,0);
  await assert.rejects(fs.access('.github/workflows/auto-news.yml'),{code:'ENOENT'});
  await assert.rejects(fs.access('scripts/generate-update-news.mjs'),{code:'ENOENT'});
  const wf = await fs.readFile('.github/workflows/publish-approved.yml','utf8');
  assert.match(wf,/git add src\/content\/novels src\/content\/glossaries src\/content\/chapters src\/content\/news/);
  assert.doesNotMatch(wf,/gh workflow run auto-news/);
});
