// Import only hand-reviewed, pinned public-domain novels with CC0 editorial editions.
// Uses the reading-order XHTML sources from Standard Ebooks GitHub (not PG scraping).
// It runs only on the trusted GitHub Actions runner; never in a browser.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const root=process.cwd();
const data=JSON.parse(fs.readFileSync('src/data/public-domain-seed.json','utf8'));
const file=(p)=>fs.readFileSync(p,'utf8');
const save=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,v,'utf8');};
const slug=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const reposlug=/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const sha=/^[0-9a-f]{40}$/;
const date=new Date().toISOString().slice(0,10);
const git=(...args)=>execFileSync('git',args,{timeout:150000,stdio:'ignore'});
const attr=(tag,key)=>tag.match(new RegExp('(?:^|\\s)'+key+'="([^"]*)"'))?.[1]||'';
const deEnt=(t)=>t.replace(/&#(?:x([a-f0-9]+)|([0-9]+));/gi,(_,h,d)=>String.fromCodePoint(parseInt(h||d,h?16:10)))
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
const tags=(xml,tag)=>[...xml.matchAll(new RegExp('<'+tag+'\\b[^>]*\\/?>','g'))].map(m=>m[0]);
function verify(b) {
  if(!slug.test(b.slug)||!reposlug.test(b.repo)||!sha.test(b.sha)||!/^https:\/\/standardebooks\.org\/ebooks\/[a-z0-9/-]+$/.test(b.url)
   ||b.authorDeathYear>1950||b.originalPublicationYear>1930||b.authorDeathYear<1500
   ||!Array.isArray(b.genres)||!b.genres.length||!Array.isArray(b.tags)
   ||!b.description||b.description.length<40) throw Error('Unreviewed public domain record '+b.slug);
}
function sourceFiles(repo,b) {
  const lic=file(path.join(repo,'LICENSE.md'));
  if(!lic.toLowerCase().includes('public domain')||!lic.includes('CC0'))
    throw Error('No public-domain/CC0 statement: '+b.slug);
  const opf=file(path.join(repo,'src/epub/content.opf'));
  if(!/<dc:language>\s*en(?:-[A-Za-z]+)?\s*<\/dc:language>/.test(opf))
    throw Error('Only original English language sources: '+b.slug);
  const creators=[...opf.matchAll(/<dc:creator\b[^>]*>(.*?)<\/dc:creator>/gs)].map(x=>deEnt(x[1])).join(' ').toLowerCase();
  if(!b.author.toLowerCase().replace(/\./g,'').split(/\s+/).some(w=>w.length>3&&creators.includes(w)))
    throw Error('Author mismatch: '+b.slug);
  const ids=new Map(tags(opf,'item').map(t=>[attr(t,'id'),attr(t,'href')]));
  const spine=(opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/)||[])[1];
  if(!spine) throw Error('No ebook reading order');
  const names=tags(spine,'itemref').map(t=>ids.get(attr(t,'idref'))).filter(Boolean)
    .filter(f=>/^text\/(?:chapter-[\d-]+|letter-\d+|prologue|epilogue|preface|introduction)\.xhtml$/.test(f));
  if(names.length<3) throw Error('No chapter files for '+b.slug);
  return names.map(name=>{
    const xml=file(path.join(repo,'src/epub',name));
    const body=(xml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)||[])[1];
    if(!body) throw Error('No narrative body');
    const prose=[...body.matchAll(/<(h[1-4]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(([,tag,html])=>{
      const text=deEnt(html.replace(/<[^>]+>/g,'')).replace(/\s+/g,' ').trim();
      return (tag.toLowerCase()==='p'?'':'## ')+text;
    }).filter(t=>t.replace(/^## /,'').trim().length>1);
    return prose.join('\n\n').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  });
}
function segments(input) {
  const original=input.trim();
  if(original.length<40000)throw Error('Book text too short');
  let count=Math.ceil(original.length/7300);
  while(count>1&&original.length/count<4300)count--;
  const result=[]; let rest=original;
  for(let i=0;i<count;i++){
    const left=count-i;
    if(left===1){result.push(rest.trim());break;}
    const min=Math.max(4120,rest.length-8300*(left-1));
    const max=Math.min(8300,rest.length-4120*(left-1));
    const target=Math.round(rest.length/left);
    if(min>max)throw Error('Cannot balance reader pages');
    const spaces=[...rest.slice(min,max+1).matchAll(/\s+/g)]
      .map(m=>min+m.index+m[0].length).filter(n=>n>=min&&n<=max);
    const cut=spaces.length?spaces.reduce((best,n)=>Math.abs(n-target)<Math.abs(best-target)?n:best,spaces[0])
      :Math.max(min,Math.min(max,target));
    result.push(rest.slice(0,cut).trim());rest=rest.slice(cut).trimStart();
  }
  if(result.some(s=>s.length<4000||s.length>8500)) throw Error('Out of reader page size range');
  const compact=s=>s.replace(/\s+/g,'');
  if(compact(result.join(''))!==compact(original))throw Error('Source completeness mismatch');
  return result;
}
function importOne(b,tmp) {
  verify(b);
  const novel='src/content/novels/'+b.slug+'.json';
  if(fs.existsSync(novel)){console.log('Already published, skip: '+b.slug);return false;}
  if(fs.existsSync('src/content/chapters/'+b.slug))throw Error('Chapter slug conflict');
  const dest=path.join(tmp,b.repo);
  git('clone','--depth=1','--filter=blob:none','--sparse','--branch=master',
    'https://github.com/standardebooks/'+b.repo+'.git',dest);
  git('-C',dest,'sparse-checkout','set','--no-cone','/src/epub/text/','/src/epub/content.opf','/LICENSE.md');
  const head=execFileSync('git',['-C',dest,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if(head!==b.sha)throw Error('Pinned revision changed: '+b.repo);
  const chapters=sourceFiles(dest,b);
  if(chapters.some(x=>x.length<10))throw Error('An original chapter is empty');
  const parts=segments(chapters.join('\n\n'));
  for(let i=0;i<parts.length;i++){
    const n=i+1;
    const summary=('Reading part '+n+' of '+b.title+' from a public-domain English edition.').slice(0,195);
    const meta=['---','novelSlug: '+JSON.stringify(b.slug),'slug: '+JSON.stringify('chapter-'+n),
      'number: '+n,'title: '+JSON.stringify('Part '+n),'publishedAt: '+JSON.stringify(date),
      'description: '+JSON.stringify(summary),'---',''];
    save('src/content/chapters/'+b.slug+'/chapter-'+n+'.md',meta.join('\n')+'\n'+parts[i]+'\n');
  }
  save('src/content/glossaries/'+b.slug+'.json',JSON.stringify({novelSlug:b.slug,terms:[]},null,2)+'\n');
  const meta={slug:b.slug,title:b.title,originalTitle:b.title,author:b.author,original:false,
    originalUrl:b.url,cover:'/images/novel-placeholder.svg',description:b.description,
    genres:b.genres,tags:['Public Domain',...b.tags],categories:['Public Domain Classics'],
    originalStatus:'Завершён',translationStatus:'Завершён',updatedAt:date,addedAt:date,demo:false};
  save(novel,JSON.stringify(meta,null,2)+'\n');
  console.log('IMPORTED '+b.slug+': '+parts.length+' complete reader pages');
  return true;
}
if(data.maxBooksPerRun!==10||new Set(data.books.map(x=>x.slug)).size!==data.books.length)
  throw Error('Bad or duplicate public-domain manifest');
const limit=Number(process.env.HUNMENG_PUBLIC_DOMAIN_LIMIT||'10');
if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Daily cap invalid');
const fresh=[];const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hunmeng-public-domain-'));
try{
  for(const b of data.books){
    if(fresh.length>=limit)break;
    if(importOne(b,tmp))fresh.push(b);
  }
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
if(fresh.length){
  const title='Public-domain fantasy and adventure classics arrive on Hunmeng';
  const excerpt=fresh.length+' classic public-domain books now have full reading pages in the Hunmeng reader.';
  const lines=['---','title: '+JSON.stringify(title),'excerpt: '+JSON.stringify(excerpt),
    'category: announcements','publishedAt: '+JSON.stringify(date),'order: 1200',
    'cover: "/images/art/hunmeng-landscape-day-1536.webp"',
    'coverAlt: "Illustrated mountain landscape"','coverFit: art','---','',
    'The first collection of classic fantasy, horror, science-fiction and adventure novels can now be read directly on Hunmeng.',
    'The original English texts are public-domain works, with editorial editions whose contributors dedicate their work under CC0.',
    'No copyrighted contemporary web-novel chapters or translations were copied.','',
    '### Open the books','',...fresh.map(b=>'- ['+b.title+'](/novel/'+b.slug+'/) — '+b.author),'',
    '[Explore the catalog](/catalog/) · [Learn about rights](/rights/)',''];
  save('src/content/news/public-domain-collection-'+date+'.md',lines.join('\n'));
}
console.log('TOTAL_NEW_BOOKS='+fresh.length);
