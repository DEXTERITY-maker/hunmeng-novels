import test from 'node:test';
import assert from 'node:assert/strict';
import { affectedAreas, makeNote } from '../scripts/generate-update-news.mjs';

const sha = 'abcd1234'.repeat(5);
const when = '2026-10-25T14:03:00Z';

test('a genuine commit creates a dated update with its GitHub link', () => {
  const r = makeNote({sha,files:['src/pages/account.astro','src/lib/backend.ts'],
    subject:'Добавить вход через Google',timestamp:when});
  assert.equal(r?.name,'update-abcd1234abcd.md');
  assert.match(r.content,/publishedAt: "2026-10-25"/);
  assert.match(r.content,/аккаунты и авторизация читателей/);
  assert.match(r.content,/github.com\/DEXTERITY-maker\/hunmeng-novels\/commit\/abcd1234/);
  assert.match(r.content,/а не завершение развёртывания/);
});

test('news-only, docs and CI changes do not create duplicate announcements', () => {
  for (const files of [['src/content/news/manual.md'],['README.md'],['.github/workflows/check.yml']])
    assert.equal(makeNote({sha,files,subject:'Обновление документов',timestamp:when}),null);
});

test('unsafe subject markup is sanitized and content claims only known areas', () => {
  const r = makeNote({sha,files:['src/pages/catalog.astro','src/content/chapters/a/1.md'],
    subject:'<script>alert(1)</script> **update**',timestamp:when});
  assert.ok(r);
  assert.doesNotMatch(r.content,/<script>/);
  assert.match(r.content,/каталог произведений/);
  assert.match(r.content,/новые произведения и главы/);
});

test('invalid SHA is rejected and versions are not invented', () => {
  assert.throws(() => makeNote({sha:'bad',files:['src/pages/index.astro'],
    subject:'Обновление',timestamp:when}),/SHA/);
  const r=makeNote({sha,files:['src/pages/index.astro'],
    subject:'Изменения главной',timestamp:when});
  assert.doesNotMatch(r.content,/Версия \d/);
  assert.deepEqual(affectedAreas(['src/pages/account.astro']),['аккаунты и авторизация читателей']);
});
