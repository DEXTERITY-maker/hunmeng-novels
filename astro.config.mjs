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
    sitemap({ filter: (page) => !page.endsWith('/404/') && !page.endsWith('/library/') && !page.endsWith('/account/') && !page.endsWith('/admin/') }),
  ],
  vite: { build: { sourcemap: false } },
});
