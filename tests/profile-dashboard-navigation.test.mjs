import test from 'node:test';
import assert from 'node:assert/strict';
import { profileHash, resolveProfileTab, profileOverviewTabs } from '../src/lib/profile-navigation.ts';

test('profile overview links retain their own deep links and map to account Profile', () => {
  assert.deepEqual(profileOverviewTabs, ['overview','progress','titles-achievements','xp-history']);
  for (const name of profileOverviewTabs) {
    assert.equal(profileHash('#'+name),'#'+name);
    assert.equal(resolveProfileTab('#'+name),'profile-details');
  }
});
test('existing Reading and Account deep links remain unchanged and arbitrary hashes are rejected', () => {
  assert.equal(profileHash('#profile-reading'),'#profile-reading');
  assert.equal(profileHash('#profile-account'),'#profile-account');
  assert.equal(profileHash('#reading'),'#profile-reading');
  assert.equal(resolveProfileTab('#profile-account'),'profile-account');
  assert.equal(profileHash('#https://example.test'),'');
  assert.equal(resolveProfileTab('#access_token=secret'),null);
});
