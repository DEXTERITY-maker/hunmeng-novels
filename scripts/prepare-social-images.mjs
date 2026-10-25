#!/usr/bin/env node
// Social images are committed to Git; building the site must never rasterize
// Cyrillic text or depend on Timeweb's installed fonts.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const images = path.resolve('public', 'images');
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// The test-only demo build (HUNMENG_DEMO_CONTENT=1) keeps its stories and covers in tests/demo.
const demo = process.env.HUNMENG_DEMO_CONTENT === '1';
const novelImages = demo ? path.resolve('tests', 'demo', 'public', 'images') : images;

async function verifyPng(name, width, height, dir = images) {
  const file = path.join(dir, name);
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
const novels = demo ? path.resolve('tests', 'demo', 'content', 'novels') : path.resolve('src', 'content', 'novels');
const files = await readdir(novels).catch((error) => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
for (const filename of files) {
  if (!filename.endsWith('.json')) continue;
  const novel = JSON.parse(await readFile(path.join(novels, filename), 'utf8'));
  if (/^\/images\/[a-z0-9-]+\.svg$/.test(novel.cover)) {
    const target = path.basename(novel.cover, '.svg') + '-og.png';
    await verifyPng(target, 520, 760, novelImages);
  }
}
