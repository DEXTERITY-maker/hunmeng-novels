import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chapterCount } from '../src/lib/format.ts';
import { contactChannels } from '../src/lib/contacts.ts';

test('English chapter counts use singular only for one chapter', () => {
  for (const count of [0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 100, 101, 111, 122])
    assert.equal(chapterCount(count), `${count} ${count === 1 ? 'chapter' : 'chapters'}`);
});
test('пустые и небезопасные контакты не создают ссылок', () => {
  assert.deepEqual(contactChannels({email:'',telegram:'',rightsEmail:''}), []);
  for (const telegram of ['javascript:alert(1)', 'https://evil.example/Contact', 'https://t.me/Contact?start=x', 'https://user:pass@t.me/Contact', 'https://t.me/Contact#token'])
    assert.deepEqual(contactChannels({email:'bad\r\n@example.test',telegram,rightsEmail:''}), []);
});
test('проверенные каналы и отдельный email правообладателей', () => {
  const settings = {email:'contact@example.test',telegram:'https://t.me/ExampleContact',rightsEmail:'rights@example.test'};
  assert.equal(contactChannels(settings)[0].href, 'mailto:contact@example.test');
  assert.equal(contactChannels(settings, true)[0].href, 'mailto:rights@example.test');
  assert.equal(contactChannels({...settings,rightsEmail:''}, true)[0].value, settings.email);
  assert.equal(contactChannels(settings)[1].value, '@ExampleContact');
});
test('сборочный скрипт только проверяет PNG и не изменяет сохранённые изображения', async () => {
  const names = ['og-default.png', 'khranitel-mayaka-og.png', 'sad-zimy-og.png'];
  const hashes = async () => Promise.all(names.map(async name => createHash('sha256').update(await readFile(`public/images/${name}`)).digest('hex')));
  const before = await hashes();
  execFileSync(process.execPath, ['scripts/prepare-social-images.mjs']);
  assert.deepEqual(await hashes(), before);
});
