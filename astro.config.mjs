import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './src/config/site.ts';
// Никаких адаптеров SSR: результат — обычные HTML/CSS/JS и локальные ресурсы.
const siteUrl = process.env.SITE_URL || site.url;
export default defineConfig({
  site: siteUrl,
  output: 'static',
  trailingSlash: 'always',
  integrations: [
    sitemap({ filter: (page) => !['/404/', '/library/', '/account/'].includes(new URL(page).pathname) && !new URL(page).pathname.startsWith('/admin/') }),
  ],
  // Keep even small font subsets as local files: CSP deliberately disallows data: fonts.
  vite: { build: { sourcemap: false, assetsInlineLimit: 0 } },
});
