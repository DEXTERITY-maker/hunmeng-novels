import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join,dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

// Two truly independent browser contexts (isolated cookies/storage) talking
// to one shared deterministic fake of the RPC and RLS-protected project API.
// Never creates users, writes to Supabase, or performs payments.
const dir=dirname(fileURLToPath(import.meta.url));
const dist=join(dir,"dist");
const allow=new Set(["/index.html","/styles.css","/app.js","/auth.bundle.js",
  "/graphic-elements.js","/scene-layout.js","/assets/anons-logo-approved.webp",
  "/assets/anons-icon-approved.webp"]);
const mime=path=>path.endsWith(".css")?"text/css":path.endsWith(".js")?"text/javascript":
  path.endsWith(".webp")?"image/webp":"text/html";
const server=createServer(async(req,res)=>{
  const path=new URL(req.url||"/","http://localhost").pathname==="/"?"/index.html":
    new URL(req.url||"/","http://localhost").pathname;
  if(!allow.has(path)){res.writeHead(404);res.end();return;}
  try{
    res.writeHead(200,{"content-type":mime(path)});
    res.end(await readFile(join(dist,path.slice(1))));
  }catch{res.writeHead(500);res.end("ERR");}
});
const port=await new Promise(resolve=>server.listen(0,"127.0.0.1",()=>resolve(server.address().port)));
const url="http://127.0.0.1:"+port;
const librarySource=await readFile(join(dir,"library-entry.js"),"utf8");
const memory={projects:[],revisions:[]};
const clone=x=>JSON.parse(JSON.stringify(x));
let browser;
async function request(viewer,op){
  const filtered=table=>memory[table==="anons_studio_projects"?"projects":"revisions"]
    .filter(row=>row.owner_id===viewer && op.filters.every(([key,value])=>row[key]===value));
  if(op.type==="rpc"){
    if(op.name!=="anons_studio_save_project")return {data:null,error:{message:"UNKNOWN_RPC"}};
    const a=op.args;let row=memory.projects.find(p=>p.id===a.p_id);
    if(a.p_expected_version===0){
      if(row)return {data:null,error:{message:"VERSION_CONFLICT"}};
      row={id:a.p_id,owner_id:viewer,title:a.p_title,snapshot:clone(a.p_snapshot),
        version:1,archived:false,created_at:new Date().toISOString(),
        updated_at:new Date().toISOString()};
      memory.projects.push(row);
    }else{
      if(!row||row.owner_id!==viewer||row.version!==a.p_expected_version)
        return {data:null,error:{message:"VERSION_CONFLICT"}};
      Object.assign(row,{title:a.p_title,snapshot:clone(a.p_snapshot),
        version:row.version+1,updated_at:new Date().toISOString()});
    }
    if(a.p_checkpoint||a.p_expected_version===0){
      memory.revisions.push({id:crypto.randomUUID(),project_id:row.id,
        owner_id:viewer,title:row.title,snapshot:clone(row.snapshot),version:row.version,
        created_at:new Date().toISOString()});
    }
    return {data:clone(row),error:null};
  }
  if(op.type==="query"){
    let rows=filtered(op.table);
    if(op.sort)rows=rows.sort((a,b)=>{
      const comparison=a[op.sort.field]>b[op.sort.field]?1:a[op.sort.field]<b[op.sort.field]?-1:0;
      return comparison*(op.sort.ascending?1:-1);
    });
    if(op.limit!==null)rows=rows.slice(0,op.limit);
    return {data:op.single?(rows.length?clone(rows[0]):null):clone(rows),error:null};
  }
  return {data:null,error:{message:"UNSUPPORTED_OPERATION"}};
}
async function session(userId){
  const context=await browser.newContext({viewport:{width:980,height:850}});
  const page=await context.newPage();
  await page.route("https://fonts.googleapis.com/**",route=>route.abort());
  await page.route("https://fonts.gstatic.com/**",route=>route.abort());
  await page.route("**/functions/v1/anons-billing?action=config",route=>route.fulfill({
    status:200,contentType:"application/json",headers:{"access-control-allow-origin":"*"},
    body:JSON.stringify({enabled:false,autoRenew:false,periodDays:30})
  }));
  await page.exposeFunction("__qaBackend",op=>request(userId,op));
  await page.goto(url,{waitUntil:"domcontentloaded"});
  await page.waitForFunction(()=>typeof window.AnonsEditor?.getSnapshot==="function");
  await page.addScriptTag({content:librarySource.replace(
    "export function initLibrary","window.__qaInitLibrary=function initLibrary")});
  await page.evaluate(userId=>{
    const api={
      from(table){
        const filters=[],query={
          select(){return query;},
          eq(field,value){filters.push([field,value]);return query;},
          order(field,{ascending=false}={}){query._sort={field,ascending};return query;},
          limit(value){return window.__qaBackend({type:"query",table,filters,sort:query._sort||null,
            limit:value,single:false});},
          maybeSingle(){return window.__qaBackend({type:"query",table,filters,
            sort:query._sort||null,limit:1,single:true});}
        };
        return query;
      },
      rpc(name,args){return window.__qaBackend({type:"rpc",name,args});}
    };
    window.__qaLibrary=window.__qaInitLibrary(api);
    window.__qaLibrary.setUser({id:userId,email:"qa@example.invalid"});
  },userId);
  await page.waitForFunction(()=>!document.querySelector("#library-auth").hidden);
  return {context,page};
}
try{
  browser=await chromium.launch({headless:true});
  const A=await session("11111111-1111-4111-8111-111111111111");
  const B=await session("11111111-1111-4111-8111-111111111111");
  const C=await session("22222222-2222-4222-8222-222222222222");
  await A.page.locator("#title").fill("Первая версия с устройства A");
  await A.page.locator("#library-name").fill("Общий проект");
  await A.page.locator("#library-save").click();
  await A.page.waitForFunction(()=>document.querySelector("#library-sync")?.textContent==="Сохранено в облаке");
  assert.equal(memory.projects.length,1,"First session creates one shared project");
  assert.equal(memory.projects[0].version,1);
  await B.page.evaluate(()=>window.__qaLibrary.refresh());
  await B.page.waitForFunction(()=>document.querySelectorAll("#library-list .library-entry").length===1);
  await B.page.locator("#library-list .library-entry").first().click();
  await B.page.waitForFunction(()=>document.querySelector("#title").value==="Первая версия с устройства A");
  assert.equal(memory.projects.length,1,"Second session only reads the shared record");

  await B.page.locator("#title").fill("Вторая версия с устройства B");
  await B.page.locator("#library-save").click();
  await B.page.waitForFunction(()=>document.querySelector("#library-sync")?.textContent==="Сохранено в облаке");
  assert.equal(memory.projects[0].version,2);
  await A.page.evaluate(()=>window.__qaLibrary.refresh());
  await A.page.waitForFunction(()=>document.querySelector("#title").value==="Вторая версия с устройства B");
  assert.equal(await A.page.locator("#library-sync").textContent(),"Открыта новая версия из облака");
  assert.equal(await A.page.locator("#library-conflict").isVisible(),false,
    "A clean local draft is quietly updated rather than showing a false conflict");

  await A.page.locator("#title").fill("Мои ещё не сохранённые правки A");
  await B.page.locator("#title").fill("Третья версия с устройства B");
  await B.page.locator("#library-save").click();
  await B.page.waitForFunction(()=>document.querySelector("#library-sync")?.textContent==="Сохранено в облаке");
  assert.equal(memory.projects[0].version,3);
  await A.page.evaluate(()=>window.__qaLibrary.refresh());
  await A.page.waitForFunction(()=>!document.querySelector("#library-conflict").hidden);
  assert.equal(await A.page.locator("#title").inputValue(),"Мои ещё не сохранённые правки A",
    "Dirty local draft must not be overwritten by remote updates");
  await A.page.locator("#library-conflict-copy").click();
  await A.page.waitForFunction(()=>document.querySelector("#library-sync")?.textContent==="Версия сохранена");
  assert.equal(memory.projects.length,2,"Conflict copy saved as an additional project");
  assert.equal(memory.projects.find(p=>p.title==="Общий проект").snapshot.cards[0].title,
    "Третья версия с устройства B","Remote author's version remains unchanged");
  assert.equal(memory.projects.find(p=>p.title.includes("(копия)")).snapshot.cards[0].title,
    "Мои ещё не сохранённые правки A","Local author's changes are preserved");

  await C.page.evaluate(()=>window.__qaLibrary.refresh());
  assert.equal(await C.page.locator("#library-list .library-entry").count(),0,
    "A different account cannot discover another user's projects");
  await C.page.evaluate(id=>window.__qaLibrary.openProject?.(id),memory.projects[0].id);
  assert.equal(await C.page.locator("#library-list .library-entry").count(),0);

  console.log("PASS Two independent browser sessions: cloud save/load/auto-pull, protected conflict-copy and owner isolation");
  await A.context.close();await B.context.close();await C.context.close();
}finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
}