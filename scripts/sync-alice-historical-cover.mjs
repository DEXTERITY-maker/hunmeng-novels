// Fetch and pin the public-domain cover from the 1865 Alice edition.
// This is the historical first-edition binding, not the modern Standard Ebooks jacket.
// No other novel metadata, covers or reader content is modified by this script.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const slug='alices-adventures-in-wonderland';
const original='https://commons.wikimedia.org/wiki/File:Alice%27s_Adventures_in_Wonderland_cover_%281865%29.jpg';
const imageUrl='https://upload.wikimedia.org/wikipedia/commons/a/a9/Alice%27s_Adventures_in_Wonderland_cover_%281865%29.jpg';
const expectedSha1='4c2a61060930cc2810cafc25b6177a5162b4d473';
const expectedSize=1319776;
const output='public/images/covers/alices-adventures-in-wonderland-1865.jpg';
const coverUrl='/images/covers/alices-adventures-in-wonderland-1865.jpg';
const metadata='src/content/novels/'+slug+'.json';

const originalJson=JSON.parse(fs.readFileSync(metadata,'utf8'));
if(originalJson.slug!==slug||originalJson.author!=='Lewis Carroll'||originalJson.cover!== '/images/novel-placeholder.svg')
  throw Error('Unexpected source metadata, refusing to overwrite it.');

const response=await fetch(imageUrl,{
  headers:{'User-Agent':'Hunmeng-CoverProvenance/1.0 (public-domain edition cover citation; https://hunmeng-novel.ru)'},
  signal:AbortSignal.timeout(45000),
});
if(!response.ok)throw Error('Could not fetch verified Wikimedia Commons historical cover: '+response.status);
const body=Buffer.from(await response.arrayBuffer());
if(body.length!==expectedSize)throw Error('Cover size mismatch, refusing update.');
if(createHash('sha1').update(body).digest('hex')!==expectedSha1)throw Error('Historical cover checksum mismatch.');
if(body[0]!==0xff||body[1]!==0xd8||body[body.length-2]!==0xff||body[body.length-1]!==0xd9)
  throw Error('Downloaded file is not a complete JPEG.');

if(fs.existsSync(output))throw Error('Cover target already exists; refusing to overwrite.');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,body);
originalJson.cover=coverUrl;
fs.writeFileSync(metadata,JSON.stringify(originalJson,null,2)+'\n');

const date='2026-11-01';
const news='src/content/news/alice-historical-cover-2026-11-01.md';
if(fs.existsSync(news))throw Error('Alice cover news slug already exists.');
const lines=[
  '---',
  'title: "Alice in Wonderland receives its original 1865 cover"',
  'excerpt: "The Hunmeng library now shows the historic red-and-gold binding of Alice’s Adventures in Wonderland, replacing its placeholder cover."',
  'category: changelog',
  'publishedAt: "'+date+'"',
  'order: 1250',
  'cover: "'+coverUrl+'"',
  'coverAlt: "Red-and-gold publisher’s binding from the 1865 edition of Alice’s Adventures in Wonderland"',
  'coverFit: art',
  '---','','The Hunmeng edition of **Alice’s Adventures in Wonderland**, by **Lewis Carroll**, now displays the historic red-and-gold cover of the 1865 first edition instead of a placeholder.',
  '',
  'The cover image is from [Wikimedia Commons]('+original+'), where it is marked as public domain. The reading text remains sourced from the [Standard Ebooks edition](https://standardebooks.org/ebooks/lewis-carroll/alices-adventures-in-wonderland/john-tenniel).',
  '',
  '[Open the novel in the Hunmeng reader](/novel/alices-adventures-in-wonderland/)',
  ''
];
fs.writeFileSync(news,lines.join('\n'));
console.log('ALICE_HISTORICAL_COVER_SYNC_OK sha1='+expectedSha1+' size='+body.length);
