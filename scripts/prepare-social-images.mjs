#!/usr/bin/env node
// Social images are committed to Git; building the site must never rasterize
// Cyrillic text or depend on Timeweb's installed fonts.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const images = path.resolve('public', 'images');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

async function verifyPng(name, width, height) {
  const file = path.join(images, name);
  let bytes;
  try {
    bytes = await readFile(file);
  } catch {
    throw new Error(`Missing committed social image ${file}: add the PNG to the repository before building.`);
  }
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(signature) ||
      bytes.toString('ascii', 12, 16) !== 'IHDR' ||
      bytes.readUInt32BE(16) !== width || bytes.readUInt32BE(20) !== height)
    throw new Error(`Invalid ${name}: expected PNG ${width}x${height}.`);
  console.log(`Verified ${name} (${width}x${height})`);
}

await verifyPng('og-default.png', 1200, 630);
const novels = path.resolve('src', 'content', 'novels');
for (const filename of await readdir(novels)) {
  if (!filename.endsWith('.json')) continue;
  const novel = JSON.parse(await readFile(path.join(novels, filename), 'utf8'));
  if (/^\/images\/[a-z0-9-]+\.svg$/.test(novel.cover)) {
    const target = path.basename(novel.cover, '.svg') + '-og.png';
    await verifyPng(target, 520, 760);
  }
}
