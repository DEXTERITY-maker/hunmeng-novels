import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)),"dist");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".webp": "image/webp" };
const allow = new Set(["/","/index.html","/styles.css","/app.js","/auth.bundle.js","/assets/anons-logo-approved.webp","/assets/anons-icon-approved.webp"]);
const server = createServer(async (req,res)=>{
  const url = new URL(req.url, "http://localhost");
  const path = url.pathname === "/" ? "/index.html" : url.pathname;
  if (!allow.has(path)) { res.writeHead(404);res.end("Not found");return; }
  try {
    const file = join(root,path.slice(1));
    const body = await readFile(file);
    const ext = path.slice(path.lastIndexOf("."));
    res.writeHead(200, { "content-type": types[ext] || "text/plain" });
    res.end(body);
  } catch (error) { res.writeHead(500);res.end("Error"); }
});
const listen = () => new Promise((resolve,reject)=>{
  server.once("error",reject);
  server.listen(0,"127.0.0.1",()=>resolve(server.address().port));
});
let browser;
try {
  const port = await listen();
  browser = await chromium.launch({headless:true});
  for (const width of [390,1440]) {
    const context = await browser.newContext({viewport:{width,height:920},acceptDownloads:true});
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__watermarkDraws=0;
      const old=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(text,...args){
        if(text==="ANONS STUDIO")window.__watermarkDraws++;
        return old.call(this,text,...args);
      };
    });
    await page.route("https://fonts.googleapis.com/**",r=>r.abort());
    await page.route("https://fonts.gstatic.com/**",r=>r.abort());
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://127.0.0.1:"+port,{waitUntil:"domcontentloaded"});
    await page.locator("#poster").waitFor();
    assert.ok(await page.locator("#library-guest").isVisible(),"Guests see login invitation for cloud library");
    assert.equal(await page.locator("#library-auth").isVisible(),false,"Guests cannot see private project controls");
    assert.equal(await page.locator("#library-list").count(),1);
    assert.ok(await page.evaluate(()=>typeof window.AnonsEditor?.getSnapshot==="function"),"Editor exposes snapshot API");

    const brandImage=page.locator(".topbar .brand-image img");
    await brandImage.waitFor();
    await page.waitForFunction(()=>document.querySelector(".topbar .brand-image img")?.complete);
    assert.ok(await brandImage.evaluate(img=>img.naturalWidth>0),"Approved wordmark must load");
    assert.ok((await brandImage.getAttribute("src")).endsWith("/anons-logo-approved.webp"),"Approved logo source path");
    assert.equal(await page.locator(".footer-logo").count(),1);
    assert.ok((await page.evaluate(async()=> (await fetch("/assets/anons-icon-approved.webp")).status))===200,"Approved favicon must load");
    assert.equal(await page.evaluate(async()=> (await fetch("/auth.bundle.js")).status),200);
    await page.waitForFunction(()=>document.querySelector(".preview-caption")?.textContent?.includes("Free"));
    assert.equal(await page.locator("#pricing .plan").count(),4);
    assert.ok(await page.locator("#account-form").isVisible());
    assert.ok(await page.locator("#nav-account").isVisible());
    assert.ok(await page.evaluate(()=>window.__watermarkDraws>0),"Free watermark must appear in canvas");
    const initial = await page.locator("#poster").evaluate(c=>c.toDataURL("image/png").slice(0,1000));
    assert.equal(await page.locator("#poster").evaluate(c=>c.width),1080);
    assert.equal(await page.locator("#poster").evaluate(c=>c.height),1350);
    await page.locator("#title").fill("Новости моего проекта");
    await page.locator("[data-theme=emerald]").click();
    await page.locator("#ratio").selectOption("story");
    await page.waitForFunction(() => document.querySelector('#poster').height === 1920);
    const changed = await page.locator("#poster").evaluate(c=>({width:c.width,height:c.height,prefix:c.toDataURL("image/png").slice(0,1000)}));
    assert.equal(changed.width,1080);
    assert.equal(changed.height,1920);
    assert.notEqual(initial,changed.prefix,"Poster should respond to user input");
    await page.reload({waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("#title").inputValue(),"Новости моего проекта");
    assert.equal(await page.locator("#ratio").inputValue(),"story");
    assert.equal(await page.locator("[data-template]").count(),6,"Six distinct template choices");
    await page.locator("[data-template=editorial]").click();
    assert.equal(await page.locator("#template-select").inputValue(),"editorial");
    assert.equal(await page.locator("#theme-label").textContent(),"Светлый — мягкий и редакционный");
    await page.locator("#advanced-panel summary").click();
    await page.locator("#text-align").selectOption("center");
    await page.locator("#ornaments").uncheck();
    await page.locator("#heading-scale").evaluate(el=>{el.value="120";el.dispatchEvent(new Event("input",{bubbles:true}));});
    assert.equal(await page.locator("#heading-scale-value").textContent(),"120%");
    await page.locator("#add-card").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),2);
    assert.equal(await page.locator("#title").inputValue(),"Новая карточка");
    await page.locator("#title").fill("Вторая карточка");
    await page.locator("#card-list [role=tab]").first().click();
    assert.equal(await page.locator("#title").inputValue(),"Новости моего проекта","First card text stays separate");
    await page.locator("#card-list [role=tab]").last().click();
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка","Second card text persists");
    await page.reload({waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("#card-list [role=tab]").count(),2,"Cards persist after reload");
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка");
    assert.equal(await page.locator("#template-select").inputValue(),"editorial");
    assert.equal(await page.locator("#heading-scale").inputValue(),"120");
    assert.equal(await page.locator("#text-align").inputValue(),"center");
    const [zipDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#export-all").click()]);
    assert.match(zipDownload.suggestedFilename(),/\.zip$/);
    const zipBytes=await readFile(await zipDownload.path());
    assert.equal(zipBytes.readUInt32LE(0),0x04034b50,"ZIP signature");
    assert.ok(zipBytes.includes(Buffer.from("anons-card-01.png")));
    assert.ok(zipBytes.includes(Buffer.from("anons-card-02.png")));
    assert.ok(zipBytes.length>30000,"ZIP contains rendered PNG files");
    await page.locator("[data-account-mode=login]").click();
    assert.match(await page.locator("#account-submit").textContent(),/Войти/);
    const [download] = await Promise.all([page.waitForEvent("download"),page.locator("#export").click()]);
    assert.match(download.suggestedFilename(),/\.png$/);
    assert.ok((await readFile(await download.path())).length>20000,"Downloaded PNG should contain image data");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),"No horizontal overflow");
    assert.deepEqual(errors,[],"No browser JS errors");
    assert.equal(await page.locator("button.plan-action[disabled]").count(),3,"No deceptive payment actions");
    const restored=await page.evaluate(()=>{
      const old=window.AnonsEditor.getSnapshot();
      const oldTitle=old.cards[old.activeCard].title;
      window.AnonsEditor.newDraft();
      const clean=window.AnonsEditor.getSnapshot();
      window.AnonsEditor.loadSnapshot(old);
      const again=window.AnonsEditor.getSnapshot();
      return {oldTitle,cleanCount:clean.cards.length,restoredCount:again.cards.length,title:again.cards[again.activeCard].title,template:again.cards[again.activeCard].template};
    });
    assert.equal(restored.cleanCount,1,"New draft has one card");
    assert.equal(restored.restoredCount,2,"Restored draft keeps multiple cards");
    assert.equal(restored.title,restored.oldTitle,"Restored draft keeps editable text");
    assert.equal(restored.template,"editorial","Restored draft keeps template");

    await context.close();
    console.log("PASS Anons Studio browser preview, editor, storage, PNG and responsive width="+width);
  }
  // Full cloud library interaction test with an in-memory Supabase adapter.
  // It tests UI and concurrency without creating test users or writing production data.
  {
    const context=await browser.newContext({viewport:{width:1280,height:900}});
    const page=await context.newPage();
    await page.route("https://fonts.googleapis.com/**",r=>r.abort());
    await page.route("https://fonts.gstatic.com/**",r=>r.abort());
    await page.goto("http://127.0.0.1:"+port,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.AnonsEditor?.getSnapshot);
    const librarySource=await readFile(join(dirname(fileURLToPath(import.meta.url)),"library-entry.js"),"utf8");
    await page.addScriptTag({content:librarySource.replace("export function initLibrary","window.__testInitLibrary = function initLibrary")});
    await page.evaluate(()=>{
      const memory={projects:[],revisions:[]};
      window.__mockLibraryDb=memory;
      const clone=o=>JSON.parse(JSON.stringify(o));
      const adapter={
        from(table){
          let op="select",payload=null, filters=[],sorting=null;
          const rows=()=>memory[table==="anons_studio_projects"?"projects":"revisions"]
            .filter(row=>filters.every(([k,v])=>row[k]===v))
            .sort((a,b)=>sorting?(sorting.asc?1:-1)*(a[sorting.key]<b[sorting.key]?-1:a[sorting.key]>b[sorting.key]?1:0):0);
          const query={
            select(){return query;},
            eq(k,v){filters.push([k,v]);return query;},
            order(key,{ascending=false}={}){sorting={key,asc:ascending};return query;},
            async limit(n){return {data:clone(rows().slice(0,n)),error:null};},
            update(value){op="update";payload=value;return query;},
            delete(){op="delete";return query;},
            async maybeSingle(){
              const row=rows()[0];
              if(!row)return {data:null,error:null};
              if(op==="update")Object.assign(row,payload);
              if(op==="delete"){
                memory.projects=memory.projects.filter(p=>p.id!==row.id);
                memory.revisions=memory.revisions.filter(p=>p.project_id!==row.id);
              }
              return {data:clone(row),error:null};
            }
          };
          return query;
        },
        async rpc(name,opts){
          if(name!=="anons_studio_save_project")return {data:null,error:{message:"UNKNOWN_RPC"}};
          let row=memory.projects.find(x=>x.id===opts.p_id);
          if(opts.p_expected_version===0){
            if(row)return {data:null,error:{message:"VERSION_CONFLICT"}};
            row={id:opts.p_id,owner_id:"user-test",title:opts.p_title,snapshot:clone(opts.p_snapshot),version:1,archived:false,updated_at:new Date().toISOString(),created_at:new Date().toISOString()};
            memory.projects.push(row);
          } else {
            if(!row||row.version!==opts.p_expected_version)return {data:null,error:{message:"VERSION_CONFLICT"}};
            Object.assign(row,{title:opts.p_title,snapshot:clone(opts.p_snapshot),version:row.version+1,updated_at:new Date().toISOString()});
          }
          if(opts.p_checkpoint||opts.p_expected_version===0){
            memory.revisions.push({id:crypto.randomUUID(),project_id:row.id,owner_id:"user-test",version:row.version,title:row.title,snapshot:clone(row.snapshot),created_at:new Date().toISOString()});
          }
          return {data:clone(row),error:null};
        }
      };
      window.__testLibrary=window.__testInitLibrary(adapter);
      window.__testLibrary.setUser({id:"user-test",email:"tester@example.invalid"});
    });
    await page.waitForFunction(()=>!document.querySelector("#library-auth").hidden);
    await page.locator("#library-name").fill("Первый анонс");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects.length===1);
    assert.equal(await page.locator("#library-list .library-entry").count(),1);
    assert.equal(await page.locator("#library-history-list .library-revision").count(),1);
    await page.locator("#title").fill("Текст второй редакции");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects[0].version===2);
    assert.equal(await page.evaluate(()=>window.__mockLibraryDb.projects[0].snapshot.cards[0].title),"Текст второй редакции");
    await page.locator("#library-checkpoint").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.revisions.length===2);
    await page.locator("#library-new").click();
    await page.waitForFunction(()=>document.querySelector("#library-current").textContent==="Новый черновик");
    await page.locator("#title").fill("Новость второго проекта");
    await page.locator("#library-name").fill("Второй проект");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects.length===2);
    await page.locator("#library-list .library-entry").filter({hasText:"Первый анонс"}).click();
    await page.waitForFunction(()=>document.querySelector("#title").value==="Текст второй редакции");
    const beforeRestore=await page.evaluate(()=>window.__mockLibraryDb.revisions.length);
    page.on("dialog",d=>d.accept());
    await page.locator("#library-history-list .library-revision").last().locator("button").click();
    await page.waitForFunction(()=>document.querySelector("#title").value==="Большое обновление!");
    assert.equal(await page.evaluate(()=>window.__mockLibraryDb.revisions.length),beforeRestore+2,"Restore checkpoints current and restored content");
    await page.locator("#library-archive").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects.some(p=>p.title==="Первый анонс"&&p.archived));
    await page.locator("#library-filter").selectOption("archived");
    assert.equal(await page.locator("#library-list .library-entry").count(),1);
    await page.locator("#library-delete").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects.length===1);
    console.log("PASS Cloud library mock: create/edit/checkpoint/load/restore/archive/delete");
    await context.close();
  }
} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
