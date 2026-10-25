import test from 'node:test';
import assert from 'node:assert/strict';
import { chapterReportUrl } from '../src/lib/seo.ts';

const telegram = 'https://t.me/HunmengReportBot';

test('disabled by default when the reportUrl is empty', () => {
  assert.equal(chapterReportUrl('', 'khranitel-mayaka', 1), null);
  assert.equal(chapterReportUrl('   ', 'khranitel-mayaka', 1), null);
});

test('Telegram deep link uses chapter number, not chapter slug', () => {
  assert.equal(
    chapterReportUrl(telegram, 'khranitel-mayaka', 27),
    'https://t.me/HunmengReportBot?start=e_khranitel-mayaka_27',
  );
});

test('Telegram payload has strict 64-character limit', () => {
  const boundary = chapterReportUrl(telegram, 'a'.repeat(60), 1);
  assert.ok(boundary);
  assert.equal(new URL(boundary).searchParams.get('start').length, 64);
  assert.equal(chapterReportUrl(telegram, 'a'.repeat(61), 1), null);
  assert.equal(chapterReportUrl(telegram, 'a'.repeat(59), 123), null);
});

test('bad slugs and invalid chapter numbers never generate links', () => {
  for (const slug of ['русский', 'hello.world', 'bad/slash', 'UPPER', 'a--b', 'a_emoji'])
    assert.equal(chapterReportUrl(telegram, slug, 4), null);
  for (const number of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER+1])
    assert.equal(chapterReportUrl(telegram, 'valid-slug', number), null);
});

test('Telegram bot address is HTTPS on t.me with no injection or extra query', () => {
  for (const config of [
    'http://t.me/HunmengReportBot', 'https://evil.example/HunmengReportBot',
    'https://t.me.evil.example/HunmengReportBot',
    'https://t.me/HunmengReportBot?start=other',
    'https://t.me/HunmengReportBot#fragment', 'https://t.me/HunmengReportBot/subpath',
    'https://t.me/a', 'https://t.me/HunmengReportBot@evil.example/',
    'https://other.example/?to=t.me/HunmengReportBot',
  ]) assert.equal(chapterReportUrl(config, 'valid-slug', 2), null, config);
});
