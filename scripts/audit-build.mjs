import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { publicSecretKinds } from './public-secrets.mjs';
const base = resolve('dist');
async function walk(dir) {
  return (
    await Promise.all(
      (await readdir(dir, { withFileTypes: true })).map((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : join(dir, e.name),
      ),
    )
  ).flat();
}
const files = await walk(base);
const failures = [];
for (const file of files) {
  if (!/\.(html|css|js)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  for (const kind of publicSecretKinds(text)) failures.push(`Запрещён ${kind} в ${file}`);
  if (file.endsWith('.html')) {
    for (const match of text.matchAll(/<(script|img|iframe|source|link)\b[^>]*>/gi)) {
      const tag = match[0];
      if (
        /^<link/i.test(tag) &&
        !/rel=["'](?:stylesheet|preload|modulepreload|icon|apple-touch-icon|manifest)["']/i.test(tag)
      )
        continue;
      const resource = tag.match(/(?:src|href)=["']([^"']+)["']/i)?.[1];
      if (resource && /^(?:https?:)?\/\//i.test(resource))
        failures.push(`Внешний ресурс: ${resource}`);
    }
    for (const m of text.matchAll(/(?:href|src)=["'](\/[^"'#?]*)[^"']*["']/gi)) {
      const url = decodeURIComponent(m[1]);
      let target = join(base, url);
      if (url.endsWith('/')) target = join(target, 'index.html');
      try {
        if (!(await stat(target)).isFile()) failures.push(`Не файл: ${url}`);
      } catch {
        failures.push(`Нет локального файла ${url} (${file})`);
      }
    }
  }
  if (
    file.endsWith('.css') &&
    /(?:@import\s+["']https?:|url\(\s*["']?(?:https?:)?\/\/)/i.test(text)
  )
    failures.push(`Внешняя CSS-зависимость: ${file}`);
}
// Иконки manifest не встречаются в HTML, поэтому проверяем их отдельно.
const manifest = JSON.parse(await readFile(join(base, 'site.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) {
  if (typeof icon.src !== 'string' || !/^\/(?!\/)/.test(icon.src)) {
    failures.push(`Нелокальная иконка manifest: ${icon.src}`);
    continue;
  }
  const target = resolve(base, `.${icon.src}`);
  if (!target.startsWith(`${base}/`)) {
    failures.push(`Недопустимый путь иконки manifest: ${icon.src}`);
    continue;
  }
  try {
    if (!(await stat(target)).isFile()) failures.push(`Не файл иконки manifest: ${icon.src}`);
  } catch {
    failures.push(`Нет локальной иконки manifest: ${icon.src}`);
  }
}
if (failures.length) throw new Error([...new Set(failures)].join('\n'));
console.log(
  `Проверено ${files.filter((f) => f.endsWith('.html')).length} HTML-страниц: внутренние ссылки и локальные ресурсы в порядке.`,
);
