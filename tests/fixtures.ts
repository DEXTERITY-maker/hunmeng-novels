import { test as base, expect, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
// Optional static fixture for restricted CI environments without TCP listeners.
// It serves the exact built files, with no mocked application data or scripts.
export async function serveStatic(context: BrowserContext) {
  if (!process.env.STATIC_TEST) return;
  const root = resolve('dist');
  await context.route('http://127.0.0.1:4321/**', async (route) => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    let path = resolve(root, '.' + pathname);
    if (pathname.endsWith('/')) path = resolve(path, 'index.html');
    const types: Record<string, string> = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
      '.webmanifest': 'application/manifest+json',
      '.woff2': 'font/woff2',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
    };
    if (!path.startsWith(root + sep)) return route.fulfill({ status: 403, body: 'Forbidden' });
    try {
      await route.fulfill({
        status: 200,
        body: await readFile(path),
        contentType: types[extname(path)] || 'application/octet-stream',
      });
    } catch {
      await route.fulfill({
        status: 404,
        body: await readFile(resolve(root, '404.html')),
        contentType: 'text/html; charset=utf-8',
      });
    }
  });
}
export const test = base.extend({
  page: async ({ context, page }, use) => {
    await serveStatic(context);
    await use(page);
  },
});
export { expect };
