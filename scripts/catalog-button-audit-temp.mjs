import {chromium,devices} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.argv[2]),label=process.argv[3],out=resolve(process.argv[4]);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
await mkdir(out,{recursive:true});const browser=await chromium.launch();const entries=[],others=[];
function luminance(rgb){const p=rgb.map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4});return 0.2126*p[0]+0.7152*p[1]+0.0722*p[2]}
function parse(s){let x=s.match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);return x?{rgb:x.slice(1,4).map(Number),alpha:x[4]===undefined?1:Number(x[4])}:null}
function ratio(fg,bg,filter='none'){const a=parse(fg),b=parse(bg);if(!a||!b||a.alpha!==1||b.alpha!==1)return null;let factor=1;if(filter!=='none'){const m=filter.match(/^brightness\(([0-9.]+)\)$/);if(!m)return null;factor=Number(m[1]);}const f=luminance(a.rgb.map(v=>Math.min(255,v*factor))),g=luminance(b.rgb.map(v=>Math.min(255,v*factor)));return (Math.max(f,g)+.05)/(Math.min(f,g)+.05)}
try{
 for(const viewport of ['desktop','mobile'])for(const theme of ['light','dark','sepia']){
  const config=viewport==='mobile'?{...devices['iPhone 13'],defaultBrowserType:'chromium'}:{...devices['Desktop Chrome'],viewport:{width:1440,height:900}};
  const context=await browser.newContext({...config,locale:'en-US',timezoneId:'UTC',reducedMotion:'reduce'});
  await context.addInitScript(theme=>localStorage.setItem('hunmeng-novels:v1',JSON.stringify({version:1,settings:{font:'serif',size:20,lineHeight:1.85,paragraphSpacing:1.35,width:720,theme},library:{},progress:{}})),theme);
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();let p=resolve(root,'.'+decodeURIComponent(url.pathname));if(url.pathname.endsWith('/'))p=resolve(p,'index.html');if(!p.startsWith(root+sep))return route.fulfill({status:403});try{return await route.fulfill({status:200,body:await readFile(p),contentType:types[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'Not found'});}});
  const page=await context.newPage();await page.goto('http://127.0.0.1:4321/catalog/',{waitUntil:'load'});await page.locator('#catalog-results .catalog-read-action').first().waitFor({state:'visible'});await page.evaluate(()=>document.fonts.ready);
  if(await page.locator('html').getAttribute('data-theme')!==theme)throw Error('wrong theme');
  const button=page.locator('#catalog-results .catalog-read-action').first();
  for(const state of ['normal','hover']){
   if(state==='hover'){await button.hover();await page.waitForTimeout(400);}
   const style=await button.evaluate(el=>{const s=getComputedStyle(el);return {text:el.textContent.trim(),fg:s.color,bg:s.backgroundColor,filter:s.filter,hover:el.matches(':hover'),opacity:s.opacity};});
   if(!/Read novel/.test(style.text)||style.opacity!=='1'||(state==='hover'&&!style.hover))throw Error(`Invalid button state ${viewport} ${theme} ${state} ${JSON.stringify(style)}`);
   const contrast=ratio(style.fg,style.bg,style.filter);if(contrast===null)throw Error(`Unsupported color/filter ${JSON.stringify(style)}`);
   entries.push({label,viewport,theme,state,...style,contrast:Number(contrast.toFixed(3))});
   await button.screenshot({path:resolve(out,`${label}-${viewport}-${theme}-${state}.png`),animations:'disabled'});
   if(label==='after'&&contrast<4.5)throw Error(`Contrast below 4.5: ${JSON.stringify(entries.at(-1))}`);
  }
  if(label==='after'){
   for(const route of ['/','/catalog/','/novel/comprehension-against-the-heavens/','/novel/comprehension-against-the-heavens/chapter-1/','/library/']){
    await page.goto('http://127.0.0.1:4321'+route,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
    const items=await page.locator('button, a.button, a.home-book-read, a.catalog-read-action').evaluateAll(nodes=>nodes.flatMap(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect(),text=e.innerText?.trim().replace(/\s+/g,' ');if(!text||r.width<1||r.height<1||s.display==='none'||s.visibility==='hidden'||s.opacity!=='1'||e.matches(':disabled,[aria-disabled="true"]'))return [];return [{text:text.slice(0,80),fg:s.color,bg:s.backgroundColor,filter:s.filter}]}));
    for(const item of items){const score=ratio(item.fg,item.bg,item.filter);if(score!==null&&score<4.5)others.push({viewport,theme,route,...item,contrast:Number(score.toFixed(3))});}
   }
  }
  await context.close();
 }
}finally{await browser.close();await writeFile(resolve(out,`${label}-results.json`),JSON.stringify({entries,otherPotentialIssues:others},null,2));}
console.log(JSON.stringify({label,entries,otherPotentialIssues:others},null,2));
