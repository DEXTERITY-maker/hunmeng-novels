import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const script=fs.readFileSync('scripts/sync-alice-historical-cover.mjs','utf8');
const action=fs.readFileSync('.github/workflows/publish-alice-historical-cover.yml','utf8');
const novel=JSON.parse(fs.readFileSync('src/content/novels/alices-adventures-in-wonderland.json','utf8'));

test('cover synchronization uses verified public-domain historical media',()=>{
  execFileSync(process.execPath,['--check','scripts/sync-alice-historical-cover.mjs']);
  assert.match(script,/commons\.wikimedia\.org\/wiki\/File/);
  assert.match(script,/expectedSha1='4c2a61060930cc2810cafc25b6177a5162b4d473'/);
  assert.match(script,/expectedSize=1319776/);
  assert.match(script,/Downloaded file is not a complete JPEG/);
  assert.match(script,/src\/content\/novels/);
  assert.match(script,/originalJson\.slug!==slug/);
  assert.match(script,/Alice.*1865/);
});
test('source book remains Lewis Carroll and the cover release is scoped',()=>{
  assert.equal(novel.slug,'alices-adventures-in-wonderland');
  assert.equal(novel.author,'Lewis Carroll');
  assert.match(action,/github\.ref == 'refs\/heads\/main'/);
  assert.match(action,/feat\(cover\): publish original Alice 1865 cover/);
  assert.match(action,/npm run build/);
  assert.match(action,/pages deploy dist/);
  assert.match(action,/git add public\/images\/covers\/alices-adventures-in-wonderland-1865\.jpg/);
  assert.doesNotMatch(action, /schedule:|cron:/);
});
