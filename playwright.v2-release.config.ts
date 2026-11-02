import { defineConfig } from '@playwright/test';
import base from './playwright.config';

// Isolated release-variant tests. Normal V1 CI continues exercising the
// default build; these tests require HUNMENG_V2_PUBLIC=1 in the demo build.
export default defineConfig({
  ...base,
  testDir: './tests-release',
  testMatch: '**/*.spec.ts',
});
