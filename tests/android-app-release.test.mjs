import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const url = 'https://github.com/DEXTERITY-maker/hunmeng-novel-app/releases/latest/download/HunmengNovel.apk';
const source = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('the official APK link is present in both site download surfaces and the release note', () => {
  const layout = source('src/layouts/Layout.astro');
  const about = source('src/pages/about.astro');
  const news = source('src/content/news/hunmeng-android-app-release-2026-11-07.md');
  for (const [name, markup] of [['footer',layout], ['About',about], ['News',news]]) {
    assert.ok(markup.includes(url), name + ' points to the stable latest APK');
    assert.ok(markup.includes('Get the Android app'), name + ' has a clear label');
  }
  assert.ok(layout.includes('android-app-link-footer'));
  assert.ok(about.includes('android-app-promo'));
});

test('the release post includes approved icon art, installation guidance, and category metadata', () => {
  const news = source('src/content/news/hunmeng-android-app-release-2026-11-07.md');
  assert.match(news, /^category: changelog$/m);
  assert.match(news, /^cover: "\/images\/hunmeng-emblem.png"$/m);
  assert.match(news, /<img src="\/icon-512.png"/);
  assert.match(news, /Android 7\.0/);
  assert.match(news, /install apps from the browser or file manager/);
  assert.ok(existsSync(new URL('../public/icon-512.png', import.meta.url)));
  assert.ok(existsSync(new URL('../public/images/hunmeng-emblem.png', import.meta.url)));
});
