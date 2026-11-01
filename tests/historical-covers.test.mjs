import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const list=JSON.parse(fs.readFileSync('src/data/historical-cover-sources.json','utf8'));
const importScript=fs.readFileSync('scripts/sync-historical-covers.mjs','utf8');

test('all nine cover candidates are distinct curated historical sources, not stock images',()=>{
  assert.equal(list.covers.length,9);
  assert.equal(new Set(list.covers.map(x=>x.slug)).size,9);
  const titles=new Set(list.covers.map(x=>x.file));
  assert.equal(titles.size,9);
  for (const book of list.covers) {
    assert.ok(book.year >= 1800 && book.year <= 1900);
    assert.ok(book.kind.length>20);
    assert.ok(['first-edition-binding','title-page','publisher-cover-page'].includes(book.sourceType));
    assert.match(book.file,/\.(jpg|JPG|webp)$/);
    const novel=JSON.parse(fs.readFileSync('src/content/novels/'+book.slug+'.json','utf8'));
    assert.equal(novel.author,book.expectedAuthor);
    const expectedCover = '/images/covers/'+book.slug+'-historical.webp';
    assert.ok(novel.cover === '/images/novel-placeholder.svg' || novel.cover === expectedCover);
    if (novel.cover === expectedCover) assert.ok(fs.statSync('public'+expectedCover).size > 8000);
    assert.ok(novel.tags.includes('Public Domain'));
  }
});
test('image synchronization checks Commons public-domain status and source checksum',()=>{
  execFileSync(process.execPath,['--check','scripts/sync-historical-covers.mjs']);
  assert.match(importScript,/pdMetadata\(info\.extmetadata\)/);
  assert.match(importScript,/createHash\('sha1'\)/);
  assert.match(importScript,/Unexpected Commons image format, URI or source digest/);
  assert.match(importScript,/\.webp\(\{quality:84/);
  assert.match(importScript,/Partial release blocked/);
  assert.match(importScript,/sourcePage:wiki/);
});
