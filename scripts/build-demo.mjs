import { spawnSync } from 'node:child_process';
// Builds dist with the demo stories from tests/demo for the browser tests (npm test).
// Never deploy this build: production uses `npm run build` with the real content in src/content.
const result = spawnSync('npm', ['run', 'build'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, HUNMENG_DEMO_CONTENT: '1' },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
