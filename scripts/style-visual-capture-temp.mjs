import { chromium, devices } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const output = resolve(process.argv[3] || 'visual-before');
const cases = [
  ['home', '/'], ['catalog', '/catalog/'], ['novel', '/novel/khranitel-mayaka/'],
  ['reader', '/novel/khranitel-mayaka/glava-1/'], ['library', '/library/'],
  ['account', '/account/'], ['profile', '/account/'], ['ranks', '/ranks/'],
  ['news', '/news/'], ['genres', '/genres/'], ['tags', '/tags/'], ['contacts', '/contacts/'],
];
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.woff2':'font/woff2','.xml':'text/xml','.txt':'text/plain'};
const user = {id:'00000000-0000-4000-8000-000000000023',email:'reader@example.test',aud:'authenticated',role:'authenticated',user_metadata:{nickname:'Sample Reader'},app_metadata:{},identities:[],created_at:'2026-10-20T00:00:00Z'};
const token = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'), Buffer.from(JSON.stringify({sub:user.id,role:'authenticated',exp:2082758400})).toString('base64url'), 'fixture-signature'].join('.');
const session = {access_token:token,refresh_token:'test-reader-refresh',expires_at:2082758400,expires_in:3600,token_type:'bearer',user};
await mkdir(output,{recursive:true});
const browser = await chromium.launch();
let count=0;
try {
 for (const viewport of ['desktop','mobile']) for (const theme of ['light','dark','sepia']) for (const [name,path] of cases) {
  const config = viewport === 'mobile' ? {...devices['iPhone 13'], defaultBrowserType:'chromium'} : {...devices['Desktop Chrome'],viewport:{width:1440,height:900}};
  const context = await browser.newContext({...config, reducedMotion:'reduce', locale:'en-US', timezoneId:'UTC'});
  const state={version:1,settings:{font:'serif',size:20,lineHeight:1.85,paragraphSpacing:1.35,width:720,theme},library:{'khranitel-mayaka':'reading'},progress:{'khranitel-mayaka':{chapterSlug:'glava-1',chapterNumber:1,blockId:'',offset:0,ratio:0.35,updatedAt:1793268000000}}};
  await context.addInitScript(({state,session,login})=>{localStorage.setItem('hunmeng-novels:v1',JSON.stringify(state));if(login)localStorage.setItem('hunmeng-novels:reader-auth:v1',JSON.stringify(session));},{state,session,login:name==='profile'});
  await context.route('**/*', async route=>{
   const url=new URL(route.request().url());
   if(url.hostname.endsWith('.supabase.co')){
    const body=url.pathname.endsWith('/auth/v1/user')?user:url.pathname==='/rest/v1/rpc/reader_my_progress'?{total_xp:0,chapters:0,completedNovels:0,readingDays:0,selected_title:'novice'}:[];
    return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','x-supabase-api-version':'2024-01-01'},body:JSON.stringify(body)});
   }
   if(url.hostname!=='127.0.0.1') return route.abort();
   let file=resolve(root,'.'+decodeURIComponent(url.pathname));
   if(url.pathname.endsWith('/')) file=resolve(file,'index.html');
   if(!file.startsWith(root+sep))return route.fulfill({status:403,body:'Forbidden'});
   try{return await route.fulfill({status:200,body:await readFile(file),contentType:types[extname(file)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}
  });
  const page=await context.newPage();
  const response=await page.goto('http://127.0.0.1:4321'+path,{waitUntil:'load'});
  if(!response?.ok())throw Error(`Bad response ${path}: ${response?.status()}`);
  await page.locator('#main').waitFor({state:'visible'});
  if(name==='profile') await page.locator('#auth-logged-in').waitFor({state:'visible',timeout:15000});
  if(name==='account') await page.waitForFunction(()=>!document.querySelector('#account-status')?.textContent?.includes('Checking your session'),null,{timeout:15000});
  if(name==='library') await page.waitForFunction(()=>document.querySelector('#library-count')?.textContent?.trim(),null,{timeout:15000});
  await page.locator('img').evaluateAll(nodes=>nodes.forEach(el=>{el.loading='eager'}));
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images,img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});setTimeout(resolve,3000);})));});
  const actual=await page.locator('html').getAttribute('data-theme');
  if(actual!==theme)throw Error(`Wrong theme for ${name}: ${actual} vs ${theme}`);
  await page.screenshot({path:resolve(output,`${viewport}-${theme}-${name}.png`),fullPage:true,animations:'disabled',caret:'hide'});
  await context.close(); count++;
  console.log(`${count}/${cases.length*6} ${viewport} ${theme} ${name}`);
 }
} finally { await browser.close(); }
