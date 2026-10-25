// Generate social preview images at build time. Existing images are never overwritten;
// replacing /public/images/og-default.png with an approved design is enough.
import sharp from 'sharp';
import { readFile, readdir, access, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const images = path.join(root, 'public', 'images');
async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}
await mkdir(images, { recursive: true });
const defaultPath = path.join(images, 'og-default.png');
if (!(await exists(defaultPath))) {
  const art = \`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#1c3455"/>
    <rect x="35" y="35" width="1130" height="560" fill="none" stroke="#d9c99c" stroke-width="3"/>
    <rect x="55" y="55" width="1090" height="520" fill="none" stroke="#7e8ca0" stroke-width="2"/>
    <circle cx="600" cy="190" r="91" fill="none" stroke="#e8d8ae" stroke-width="5"/>
    <path d="M540 220 Q600 150 660 220 M600 115 L600 275" fill="none" stroke="#e8d8ae" stroke-width="7"/>
    <text x="600" y="387" font-family="serif" font-size="76" font-weight="bold" text-anchor="middle" fill="#f6efde">ХУНМЭНГ</text>
    <text x="600" y="448" font-family="sans-serif" font-size="29" text-anchor="middle" letter-spacing="5" fill="#d9c99c">НОВЕЛЛЫ НА РУССКОМ</text>
  </svg>\`;
  await sharp(Buffer.from(art)).png().toFile(defaultPath);
  console.log('Created temporary 1200×630 /images/og-default.png');
}
for (const filename of await readdir(path.join(root, 'src', 'content', 'novels'))) {
  if (!filename.endsWith('.json')) continue;
  const novel = JSON.parse(await readFile(path.join(root,'src','content','novels',filename),'utf8'));
  if (!/^\/images\/[a-z0-9-]+\.svg$/.test(novel.cover)) continue;
  const original = path.join(images, path.basename(novel.cover));
  const target = path.join(images, path.basename(novel.cover, '.svg') + '-og.png');
  if (!(await exists(original))) throw new Error('Missing novel cover: ' + original);
  if (!(await exists(target))) {
    await sharp(original, { density: 192 }).resize(520, 760, { fit: 'fill' }).png().toFile(target);
    console.log('Created social PNG for ' + novel.slug);
  }
}
