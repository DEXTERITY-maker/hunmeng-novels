import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { cp } from 'node:fs/promises';
import { site } from './src/config/site.ts';
// Никаких адаптеров SSR: результат — обычные HTML/CSS/JS и локальные ресурсы.
const siteUrl = process.env.SITE_URL || site.url;
// Test-only build (npm run build:demo): the demo stories' covers live in tests/demo/public
// and are copied into dist, so they never ship with the production site.
const demoContent = process.env.HUNMENG_DEMO_CONTENT === '1';
const demoAssets = {
  name: 'hunmeng-demo-assets',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      await cp(new URL('./tests/demo/public/', import.meta.url), dir, { recursive: true });
    },
  },
};
export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({ filter: (page) => !['/404/', '/library/', '/account/'].includes(new URL(page).pathname) && !new URL(page).pathname.startsWith('/admin/') }),
    ...(demoContent ? [demoAssets] : []),
  ],
  // Keep even small font subsets as local files: CSP deliberately disallows data: fonts.
  vite: { build: { sourcemap: false, assetsInlineLimit: 0 } },
});
