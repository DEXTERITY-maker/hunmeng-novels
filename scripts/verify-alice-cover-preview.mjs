// Verify the already-published cover without downloading or changing content.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const coverPath = '/images/covers/alices-adventures-in-wonderland-1865.jpg';
const image = readFileSync(`public${coverPath}`);
if (image.length !== 1319776) throw new Error('Historical cover size mismatch.');
if (createHash('sha1').update(image).digest('hex') !== '4c2a61060930cc2810cafc25b6177a5162b4d473')
  throw new Error('Historical cover checksum mismatch.');
if (image[0] !== 0xff || image[1] !== 0xd8 || image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9)
  throw new Error('Historical cover is not a complete JPEG.');

const novel = JSON.parse(readFileSync('src/content/novels/alices-adventures-in-wonderland.json', 'utf8'));
if (novel.slug !== 'alices-adventures-in-wonderland' || novel.author !== 'Lewis Carroll' ||
    novel.cover !== coverPath ||
    novel.originalUrl !== 'https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel')
  throw new Error('Alice metadata or source does not match the verified edition.');

const news = readFileSync('src/content/news/alice-historical-cover-2026-11-01.md', 'utf8');
const commons = 'https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_%281865%29.jpg';
if (!/^cover: ["']?\/images\/covers\/alices-adventures-in-wonderland-1865\.jpg["']?\s*$/m.test(news) ||
    !news.includes(commons) || !/marked as public domain/i.test(news) ||
    !news.includes(novel.originalUrl))
  throw new Error('Alice cover announcement or provenance is missing or inconsistent.');

console.log('Verified the committed Alice cover, metadata, and public-domain provenance.');
