import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {runInNewContext} from "node:vm";
import {transform} from "esbuild";
import {chromium} from "@playwright/test";
import React from "react";
import sharp from "sharp";
import {ImageResponse} from "@vercel/og";

const base=dirname(fileURLToPath(import.meta.url));
const dist=join(base,"dist");
const results=join(base,"visual-qa-report");
await mkdir(results,{recursive:true});

function sceneContext(){
  const ctx={React};ctx.globalThis=ctx;
  return ctx;
}
const context=sceneContext();
runInNewContext(await readFile(join(base,"scene-layout.js"),"utf8"),context);
runInNewContext(await readFile(join(base,"graphic-elements.js"),"utf8"),context);
const code=await readFile(join(base,"functions/anons-premium-export/index.ts"),"utf8");
const start=code.indexOf("function renderPoster("),end=code.indexOf("Deno.serve(",start);
assert.ok(start>=0&&end>start,"Pure premium renderer must be extractable without server secrets");
const extracted=await transform(code.slice(start,end),{loader:"ts",target:"es2022",format:"esm"});
context.el=(tag,style,...children)=>React.createElement(tag,{style},...children);
context.text=(v,max,fallback="")=>typeof v==="string"?v.replace(/[\u0000-\u001f]/g," ").slice(0,max):fallback;
context.Graphics=context.AnonsGraphics;
context.Scene=context.AnonsScene;
const renderPoster=runInNewContext(extracted.code+"\nrenderPoster;",context);

const fontPaths=[
"https://cdn.jsdelivr.net/npm/@fontsource/manrope@5.2.8/files/manrope-cyrillic-700-normal.woff",
"https://cdn.jsdelivr.net/npm/@fontsource/manrope@5.2.8/files/manrope-latin-700-normal.woff"];
async function fontBytes(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  assert.equal(response.ok,true,"Font CDN must respond "+url);
  const bytes=await response.arrayBuffer();
  assert.ok(bytes.byteLength>1000&&bytes.byteLength<1500000);
  return bytes;
}
const fontData=await Promise.all(fontPaths.map(fontBytes));
const fonts=fontData.map(data=>({name:"Manrope",data,weight:700,style:"normal"}));
const fontCSS=fontData.map((data,i)=>{
  const base64=Buffer.from(data).toString("base64");
  const unicode=i===0?"U+0400-052F":"U+0000-03FF";
  return '@font-face{font-family:"Manrope";src:url(data:font/woff;base64,'+base64+
    ') format("woff");font-style:normal;font-weight:700;unicode-range:'+unicode+';}';
}).join("\n");

const types={".html":"text/html",".js":"text/javascript",".css":"text/css",".webp":"image/webp"};
const allowed=new Set(["/index.html","/app.js","/styles.css","/auth.bundle.js",
  "/graphic-elements.js","/scene-layout.js","/assets/anons-logo-approved.webp","/assets/anons-icon-approved.webp"]);
const server=createServer(async(req,res)=>{
  let path=new URL(req.url||"/","http://localhost").pathname;
  if(path==="/")path="/index.html";
  if(!allowed.has(path)){res.writeHead(404);res.end();return;}
  try{
    const buffer=await readFile(join(dist,path.slice(1)));
    res.writeHead(200,{"content-type":types[path.slice(path.lastIndexOf("."))]});
    res.end(buffer);
  }catch(e){res.writeHead(500);res.end(String(e.message));}
});
const port=await new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve(server.address().port)));
const url="http://127.0.0.1:"+port;
let browser;
const fixtures=[
  {template:"aurora",ratio:"portrait",theme:"ultraviolet",title:"Большое обновление Anons Studio",photo:false},
  {template:"editorial",ratio:"square",theme:"paper",title:"Представляем важные изменения нашего проекта",photo:false},
  {template:"spotlight",ratio:"story",theme:"sunset",title:"Запуск нового направления!",photo:true},
  {template:"pulse",ratio:"portrait",theme:"ink",title:"Большая премьера сегодня",photo:false},
  {template:"minimal",ratio:"square",theme:"paper",title:"Простой анонс для подписчиков",photo:false},
  {template:"bulletin",ratio:"story",theme:"emerald",title:"Срочная новость о новых возможностях",photo:false}
];
function compare(a,b){
  assert.equal(a.length,b.length);
  let absolute=0,large=0,channels=0;
  for(let i=0;i<a.length;i+=4){
    let pixel=0;
    for(let ch=0;ch<3;ch++){
      const d=Math.abs(a[i+ch]-b[i+ch]);
      absolute+=d;pixel=Math.max(d,pixel);
      channels++;
    }
    if(pixel>36)large++;
  }
  return {meanAbsoluteError:+(absolute/channels).toFixed(2),
    differingPixelsPercent:+(large/(a.length/4)*100).toFixed(2)};
}
async function downsample(png){
  const {data,info}=await sharp(png).resize({width:216,height:270,fit:"fill"})
    .removeAlpha().raw().toBuffer({resolveWithObject:true});
  // Convert RGB into 4-channel RGBA for consistent metrics.
  const result=new Uint8Array(info.width*info.height*4);
  for(let i=0;i<info.width*info.height;i++){
    result[i*4]=data[i*3];result[i*4+1]=data[i*3+1];
    result[i*4+2]=data[i*3+2];result[i*4+3]=255;
  }
  return result;
}
try{
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:940}});
  await page.route("https://fonts.googleapis.com/**",r=>r.abort());
  await page.route("https://fonts.gstatic.com/**",r=>r.abort());
  await page.route("**/functions/v1/anons-billing?action=config",r=>r.fulfill({
    status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},
    body:JSON.stringify({enabled:false,periodDays:30})
  }));
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.addStyleTag({content:fontCSS});
  await page.evaluate(async()=>{await document.fonts.load("700 32px 'Manrope'");});
  const original=await page.evaluate(()=>window.AnonsEditor.getSnapshot());
  const testPhoto=await sharp({create:{width:600,height:400,channels:4,background:"#207cbb"}})
    .png().toBuffer();
  const photoUri="data:image/png;base64,"+testPhoto.toString("base64");
  const report=[];
  for(let i=0;i<fixtures.length;i++){
    const fixture=fixtures[i];
    const snapshot=JSON.parse(JSON.stringify(original));
    snapshot.ratio=fixture.ratio;
    snapshot.project="ANONS STUDIO";
    snapshot.imageData=fixture.photo?photoUri:"";
    snapshot.activeCard=0;
    snapshot.cards=[{...snapshot.cards[0],template:fixture.template,theme:fixture.theme,
      title:fixture.title,description:"Новые возможности, улучшенные функции и удобный современный редактор.",
      points:"Новые возможности\nУдобное оформление\nПоддержка пользователей",
      graphicElements:[]}];
    await page.evaluate(snapshot=>{
      window.AnonsEditor.loadSnapshot(snapshot);
      window.dispatchEvent(new CustomEvent("anons:access",{detail:{plan:"pro",premium:true}}));
    },snapshot);
    await page.evaluate(async()=>{
      await document.fonts.ready;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    const canvasPng=Buffer.from((await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"))).split(",")[1],"base64");
    const scene=context.Scene.layout(snapshot,snapshot.cards[0]);
    const tree=renderPoster(snapshot,snapshot.cards[0],scene.width,scene.height,["Manrope"]);
    const image=new ImageResponse(tree,{width:scene.width,height:scene.height,fonts});
    const serverPng=Buffer.from(await image.arrayBuffer());
    const [clientData,serverData]=await Promise.all([downsample(canvasPng),downsample(serverPng)]);
    const metrics=compare(clientData,serverData);
    const name=String(i+1).padStart(2,"0")+"-"+fixture.template+"-"+fixture.ratio;
    await Promise.all([
      writeFile(join(results,name+"-canvas.png"),await sharp(canvasPng).resize({width:324}).png().toBuffer()),
      writeFile(join(results,name+"-premium.png"),await sharp(serverPng).resize({width:324}).png().toBuffer()),
      writeFile(join(results,name+"-difference.png"),await sharp(
        Buffer.from(clientData.map((v,index)=>index%4===3?255:Math.abs(v-serverData[index])*2)),
        {raw:{width:216,height:270,channels:4}}).png().toBuffer())
    ]);
    report.push({...fixture,...metrics,width:scene.width,height:scene.height});
    console.log("VISUAL QA",name,JSON.stringify(metrics));
    assert.ok(metrics.meanAbsoluteError<105,"Severe image mismatch: "+name);
  }
  await writeFile(join(results,"summary.json"),JSON.stringify({generatedAt:new Date().toISOString(),
    comparison:"Canvas premium preview (test entitlement only) vs actual local ImageResponse PNG; no payments or accounts",
    note:"This verifies local server-renderer output, not live authenticated Edge delivery. Metrics are diagnostic, not pixel-perfect proof.",
    cases:report},null,2));
  await page.close();
  console.log("PASS visual comparison:",report.length,"real PNG pairs; see visual-qa-report artifacts");
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}