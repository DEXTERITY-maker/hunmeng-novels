import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)),"dist");
const cloudflareHeaders=await readFile(join(root,"_headers"),"utf8");
assert.match(cloudflareHeaders,/Content-Security-Policy:.*script-src 'self'/);
assert.match(cloudflareHeaders,/X-Content-Type-Options: nosniff/);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".webp": "image/webp" };
const allow = new Set(["/","/index.html","/account.html","/editor.html","/templates.html","/features.html","/pricing.html","/styles.css","/app.js","/navigation.js","/whats-new.js","/scene-layout.js","/auth.bundle.js","/assets/anons-logo-approved.webp","/assets/anons-icon-approved.webp"]);
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
    await page.route("**/functions/v1/anons-billing?action=config",r=>r.fulfill({
      status:200,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"},
      body:JSON.stringify({enabled:false,autoRenew:false,periodDays:30,prices:{basic:29900,pro:49900,studio:99900}})
    }));
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.goto("http://127.0.0.1:"+port,{waitUntil:"domcontentloaded"});
    assert.ok(await page.locator("#hero-title").isVisible(),"Home stays a presentation page");
    assert.equal(await page.locator("#poster").count(),0,"Editor moved to its own route");
    for(const path of ["editor.html","templates.html","features.html","pricing.html"]){
      assert.equal(await page.locator('#primary-navigation a[href="./'+path+'"]').count(),1,
        "Home navigation links to the standalone "+path+" page");
    }
    // Native dialog announces new features once per release and stays
    // available from the footer without disturbing ordinary page visits.
    const releaseDialog=page.locator("#whats-new-dialog");
    await page.waitForFunction(()=>document.getElementById("whats-new-dialog")?.open);
    assert.match(await page.locator("#whats-new-title").textContent(),/Обновление структуры сайта/);
    assert.equal(await page.locator(".whats-new-list li").count(),6);
    for(const destination of ["editor.html","templates.html","features.html","pricing.html","account.html"]){
      assert.equal(await page.locator('.whats-new-list a[href="./'+destination+'"]').count(),1,
        "Announcement links directly to "+destination);
    }
    assert.equal(await releaseDialog.getAttribute("data-release"),"2026-11-04-detailed-navigation-release",
      "Latest announcement version must be recognized");
    assert.equal(await page.locator("#whats-new-close").evaluate(el=>el===document.activeElement),true,
      "Announcement initially focuses its accessible close control");
    await page.locator("#whats-new-dismiss").click();
    assert.equal(await releaseDialog.evaluate(d=>d.open),false,"Dismiss closes the dialog");
    const firstRelease=await releaseDialog.getAttribute("data-release");
    await page.waitForFunction(release=>
      localStorage.getItem("anons-studio:whats-new:seen")===release,firstRelease);
    assert.equal(await page.evaluate(()=>localStorage.getItem("anons-studio:whats-new:seen")),firstRelease);
    await page.locator("#whats-new-open").click();
    assert.equal(await releaseDialog.evaluate(d=>d.open),true,"News can be reopened from footer");
    await page.keyboard.press("Escape");
    assert.equal(await releaseDialog.evaluate(d=>d.open),false,"Escape dismisses the native dialog");
    assert.ok(await page.locator("#whats-new-open").evaluate(el=>el===document.activeElement),
      "Keyboard focus returns to the news trigger");
    await page.locator("#whats-new-open").click();
    await page.mouse.click(4,4);
    assert.equal(await releaseDialog.evaluate(d=>d.open),false,"Clicking the backdrop closes the dialog");
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForTimeout(1050);
    assert.equal(await releaseDialog.evaluate(d=>d.open),false,
      "Dismissed release announcement must not reappear on reload");
    await page.evaluate(()=>localStorage.setItem("anons-studio:whats-new:seen","previous-release"));
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>document.getElementById("whats-new-dialog")?.open);
    assert.equal(await releaseDialog.evaluate(d=>d.open),true,
      "Publishing a new release identifier reopens the announcement");
    await page.locator("#whats-new-try").click();
    await page.waitForURL(/\/editor\.html$/);
    await page.locator("#poster").waitFor();
    assert.equal(await releaseDialog.count(),0,"Announcement was left on the home page");
    assert.equal(new URL(page.url()).pathname,"/editor.html","CTA opens the independent editor");
    assert.ok(await page.locator("#library-guest").isVisible(),"Guests see login invitation for cloud library");
    assert.equal(await page.locator("#library-auth").isVisible(),false,"Guests cannot see private project controls");
    assert.equal(await page.locator("#library-list").count(),1);
    assert.ok(await page.evaluate(()=>typeof window.AnonsEditor?.getSnapshot==="function"),"Editor exposes snapshot API");
    assert.ok(await page.evaluate(()=>typeof window.AnonsScene?.layout==="function"),"Canvas uses the same scene contract as the paid renderer");
    const contract=await page.evaluate(()=>{
      const poster=window.AnonsEditor.getSnapshot();
      const scene=window.AnonsScene.layout(poster,poster.cards[poster.activeCard]);
      return {ratio:scene.format,width:scene.width,height:scene.height,
        label:scene.label,title:window.AnonsScene.titleLines(poster.cards[poster.activeCard].title,scene)};
    });
    assert.equal(contract.width,1080);
    assert.equal(contract.height,1350);
    assert.ok(contract.title.lines.length>0,"Shared scene breaks default heading");
    assert.ok(await page.locator("#undo").isDisabled(),"Undo starts disabled");
    assert.ok(await page.locator("#redo").isDisabled(),"Redo starts disabled");
    const originalTitle=await page.locator("#title").inputValue();
    await page.locator("#title").fill("Черновик для отмены");
    assert.ok(await page.locator("#undo").isEnabled(),"Text edits create undo history");
    await page.locator("#undo").click();
    assert.equal(await page.locator("#title").inputValue(),originalTitle,"Undo restores the previous title");
    assert.ok(await page.locator("#redo").isEnabled(),"Redo is available after undo");
    await page.locator("#redo").click();
    assert.equal(await page.locator("#title").inputValue(),"Черновик для отмены","Redo reapplies the title");
    await page.locator("#undo").click();
    await page.locator("#title").fill("Новый независимый вариант");
    assert.ok(await page.locator("#redo").isDisabled(),"A new edit clears the redo branch");
    await page.locator("#undo").click();
    assert.equal(await page.locator("#title").inputValue(),originalTitle);

    const brandImage=page.locator(".topbar .brand-image img");
    await brandImage.waitFor();
    await page.waitForFunction(()=>document.querySelector(".topbar .brand-image img")?.complete);
    assert.ok(await brandImage.evaluate(img=>img.naturalWidth>0),"Approved wordmark must load");
    assert.ok((await brandImage.getAttribute("src")).endsWith("/anons-logo-approved.webp"),"Approved logo source path");
    assert.equal(await page.locator(".footer-logo").count(),1);
    assert.ok((await page.evaluate(async()=> (await fetch("/assets/anons-icon-approved.webp")).status))===200,"Approved favicon must load");
    assert.equal(await page.evaluate(async()=> (await fetch("/auth.bundle.js")).status),200);
    await page.waitForFunction(()=>document.querySelector(".preview-caption")?.textContent?.includes("Free"));
    const pricingPage=await context.newPage();
    await pricingPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await pricingPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await pricingPage.route("**/functions/v1/anons-billing?action=config",r=>r.fulfill({
      status:200,contentType:"application/json",
      headers:{"access-control-allow-origin":"*","access-control-allow-headers":"*"},
      body:JSON.stringify({enabled:false,autoRenew:false,periodDays:30,prices:{basic:29900,pro:49900,studio:99900}})
    }));
    await pricingPage.goto("http://127.0.0.1:"+port+"/pricing.html",{waitUntil:"domcontentloaded"});
    assert.ok(await pricingPage.locator(".inner-page-hero h1").isVisible());
    assert.equal(await pricingPage.locator("#pricing .plan").count(),4);
    await pricingPage.waitForFunction(()=>document.querySelector("#billing-availability")?.textContent?.toLowerCase().includes("покупки"));
    assert.ok(await pricingPage.locator("#buy-basic").isDisabled(),"Cannot charge without merchant configuration");
    assert.equal(await pricingPage.locator("button.plan-action[disabled]").count(),3,
      "Unavailable tariffs must not accept payment");
    await pricingPage.close();
    assert.equal(await page.locator("#account-form").count(),0,"Account form lives only on account.html");
    assert.equal(await page.locator("#account").count(),0,"Personal space is no longer embedded on home");
    assert.equal(await page.locator("#nav-account").getAttribute("href"),"./account.html");
    assert.ok(await page.locator("#nav-account").isVisible());
    const mobileMenu=page.locator("#mobile-menu-toggle");
    const primaryNav=page.locator("#primary-navigation");
    if(width<=760){
      assert.ok(await mobileMenu.isVisible(),"Mobile menu toggle must be accessible");
      assert.equal(await primaryNav.isVisible(),false,"Navigation starts collapsed on phones");
      assert.equal(await mobileMenu.getAttribute("aria-expanded"),"false");
      await mobileMenu.click();
      assert.ok(await primaryNav.isVisible(),"Menu opens on tap");
      assert.equal(await mobileMenu.getAttribute("aria-expanded"),"true");
      await page.keyboard.press("Escape");
      assert.equal(await primaryNav.isVisible(),false,"Escape dismisses mobile navigation");
      assert.equal(await mobileMenu.getAttribute("aria-expanded"),"false");
      assert.equal(await mobileMenu.evaluate(el=>document.activeElement===el),true,
        "Escape restores keyboard focus to toggle");
      await mobileMenu.click();
      await primaryNav.locator('a[href="./editor.html#library"]').click();
      assert.equal(await primaryNav.isVisible(),false,"Choosing a section closes menu");
      assert.equal(await mobileMenu.getAttribute("aria-expanded"),"false");
      await page.setViewportSize({width:320,height:920});
      assert.ok(await mobileMenu.isVisible(),"Menu remains usable at 320px");
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
        "No horizontal overflow at 320px");
      await page.setViewportSize({width,height:920});
    }else{
      assert.equal(await mobileMenu.isVisible(),false,"Desktop hides menu toggle");
      assert.ok(await primaryNav.isVisible(),"Desktop keeps direct navigation links");
    }
    assert.ok(await page.evaluate(()=>window.__watermarkDraws>0),"Free watermark must appear in canvas");
    const previewBeforeFakeAccess=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await page.evaluate(async()=>{
      window.dispatchEvent(new CustomEvent("anons:access",{detail:{plan:"basic",premium:true}}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
    assert.equal(await page.locator("#poster").evaluate(c=>c.toDataURL("image/png")),previewBeforeFakeAccess,
      "A forged browser access event must not remove the preview watermark");
    await page.evaluate(async()=>{
      window.dispatchEvent(new CustomEvent("anons:access",{detail:{plan:"free",premium:false}}));
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    });
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
    assert.equal(await page.locator("[data-template]").count(),0,"Gallery now has its own page");
    await page.goto("http://127.0.0.1:"+port+"/templates.html",{waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("[data-template]").count(),6,"Six working template choices");
    await page.locator("[data-template=editorial]").click();
    await page.waitForFunction(()=>window.AnonsEditor?.getSnapshot().cards[0].template==="editorial");
    assert.equal(new URL(page.url()).pathname,"/editor.html","A gallery choice opens the editor");
    assert.equal(new URL(page.url()).search,"","Selected template is applied only once");
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
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#remove-card").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),1,"Card removed");
    await page.locator("#undo").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),2,"Undo restores removed card");
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка","Undo restores removed card content");
    await page.locator("#redo").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),1,"Redo removes card again");
    await page.locator("#undo").click();
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
    if(width===1440){
      // High-entropy PNG makes sure adaptive photo compression does not keep
      // a local draft that the paid server would reject as too large.
      const png=await page.evaluate(()=>{
        const c=document.createElement("canvas");c.width=1200;c.height=1200;
        const cx=c.getContext("2d"),data=cx.createImageData(c.width,c.height);
        let seed=0x12345678;
        for(let i=0;i<data.data.length;i+=4){
          seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
          data.data[i]=seed&255;
          data.data[i+1]=(seed>>>8)&255;
          data.data[i+2]=(seed>>>16)&255;
          data.data[i+3]=255;
        }
        cx.putImageData(data,0,0);
        return c.toDataURL("image/png").split(",")[1];
      });
      await page.locator("#upload").setInputFiles({
        name:"noisy-upload.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")
      });
      await page.waitForFunction(()=>window.AnonsEditor.getSnapshot().imageData.startsWith("data:image/jpeg;base64,"));
      const compressed=await page.evaluate(()=>window.AnonsEditor.getSnapshot().imageData.length);
      assert.ok(compressed<600000,"Uploaded image must fit paid server export limit");
      await page.locator("#clear-image").click();
      assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().imageData),"","Removing uploaded photo must clear snapshot");
    }
    // Personal space is a real independent page. Open it in a fresh tab so
    // the editor remains intact and both routes share the same origin.
    const personal=await context.newPage();
    await personal.route("https://fonts.googleapis.com/**",r=>r.abort());
    await personal.route("https://fonts.gstatic.com/**",r=>r.abort());
    const personalErrors=[];
    personal.on("pageerror",error=>personalErrors.push(error.message));
    await personal.goto("http://127.0.0.1:"+port+"/account.html",{waitUntil:"domcontentloaded"});
    assert.equal(await personal.locator("h1, h2#account-title").count(),1);
    assert.ok(await personal.locator("#account-form").isVisible());
    assert.ok(await personal.locator("#account-billing").count()===1,"Subscription history belongs to profile page");
    assert.equal(await personal.locator("#poster").count(),0,"Account page does not load editor Canvas");
    assert.equal(await personal.locator("#library-auth").count(),0,"Cloud library remains in editor view");
    assert.equal(await personal.locator("#nav-account").getAttribute("href"),"./account.html");
    assert.equal(await personal.locator('.account-destinations a[href="./editor.html#library"]').count(),1);
    await personal.locator("[data-account-mode=login]").click();
    assert.match(await personal.locator("#account-submit").textContent(),/Войти/);
    assert.ok(await personal.locator("#account-forgot").isVisible(),"Forgot-password entry point");
    await personal.locator("#account-forgot").click();
    assert.equal(await personal.locator("#account-password").isVisible(),false,"Password hidden during recovery request");
    assert.match(await personal.locator("#account-submit").textContent(),/Отправить ссылку/);
    await personal.route("**/auth/v1/recover**",route=>{
      route.fulfill({status:200,contentType:"application/json",headers:{
        "access-control-allow-origin":"*",
        "access-control-allow-methods":"POST,OPTIONS",
        "access-control-allow-headers":"*"
      },body:"{}"});
    });
    await personal.locator("#account-email").fill("reset-test@example.invalid");
    await personal.locator("#account-submit").click();
    await personal.waitForFunction(()=>document.querySelector("#account-message")?.textContent?.includes("Если аккаунт существует"));
    assert.match(await personal.locator("#account-submit").textContent(),/Войти/);
    await personal.locator("[data-account-mode=signup]").click();
    assert.equal(await personal.locator("#account-password").getAttribute("minlength"),"10");
    assert.ok(await personal.locator("#account-security").count()===1,"Password change controls available");
    assert.ok(await personal.locator("#account-logout-all").count()===1,"Global sign-out available");
    if(width<=760){
      await personal.locator("#mobile-menu-toggle").click();
      assert.ok(await personal.locator("#primary-navigation").isVisible(),"Account mobile nav opens");
      await personal.keyboard.press("Escape");
      assert.equal(await personal.locator("#primary-navigation").isVisible(),false);
    }
    assert.ok(await personal.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
      "Personal page has no horizontal overflow");
    assert.deepEqual(personalErrors,[],"Account route has no JavaScript crashes");
    // Existing bookmarks should route to the new page, not an absent section.
    await personal.goto("http://127.0.0.1:"+port+"/#account",{waitUntil:"domcontentloaded"});
    await personal.waitForURL(/\/account\.html$/);
    await personal.close();
    const [download] = await Promise.all([page.waitForEvent("download"),page.locator("#export").click()]);
    assert.match(download.suggestedFilename(),/\.png$/);
    assert.ok((await readFile(await download.path())).length>20000,"Downloaded PNG should contain image data");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),"No horizontal overflow");
    assert.deepEqual(errors,[],"No browser JS errors");
    // A forged browser premium flag must not bypass the paid server endpoint.
    let unauthorizedDownloads=0;
    const observer=()=>unauthorizedDownloads++;
    page.on("download",observer);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("anons:access",{detail:{plan:"basic",premium:true}})));
    await page.locator("#export").click();
    await page.waitForFunction(()=>document.querySelector("#toast")?.textContent?.includes("Не удалось скачать PNG"));
    assert.equal(unauthorizedDownloads,0,"Forged premium access never yields a clean PNG download");
    page.off("download",observer);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("anons:access",{detail:{plan:"free",premium:false}})));
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

    // Synthetic, unauthenticated screenshots for reviewing text fidelity and
    // responsive composition after shared layout changes. Never screenshot
    // private libraries or signed-in account panels.
    const screenshotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(screenshotDir,{recursive:true});
    await page.locator(".preview-panel").screenshot({
      path:join(screenshotDir,"preview-"+width+".png"),animations:"disabled"
    });

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
    await page.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>window.AnonsEditor?.getSnapshot);
    const librarySource=await readFile(join(dirname(fileURLToPath(import.meta.url)),"library-entry.js"),"utf8");
    await page.addScriptTag({content:librarySource.replace("export function initLibrary","window.__testInitLibrary = function initLibrary")});
    await page.evaluate(()=>{
      const memory={projects:[],revisions:[],holdNextLoad:false,pendingLoads:[],
        holdNextRpc:false,pendingRpcs:[],currentAuthId:"user-test"};
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
              if(table==="anons_studio_projects" && op==="select"
                && filters.some(([key])=>key==="id") && memory.holdNextLoad){
                memory.holdNextLoad=false;
                await new Promise(resolve=>memory.pendingLoads.push(resolve));
              }
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
          const requestOwner=memory.currentAuthId;
          if(memory.holdNextRpc){
            memory.holdNextRpc=false;
            await new Promise(resolve=>memory.pendingRpcs.push(resolve));
          }
          let row=memory.projects.find(x=>x.id===opts.p_id);
          if(row && row.owner_id!==requestOwner)return {data:null,error:{code:"42501"}};

          if(opts.p_expected_version===0){
            if(row)return {data:null,error:{message:"VERSION_CONFLICT"}};
            row={id:opts.p_id,owner_id:requestOwner,title:opts.p_title,snapshot:clone(opts.p_snapshot),version:1,archived:false,updated_at:new Date().toISOString(),created_at:new Date().toISOString()};
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
    await page.waitForFunction(()=>document.querySelectorAll("#library-history-list .library-revision").length===1);
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
    await page.locator("#library-filter").selectOption("active");
    await page.locator("#library-list .library-entry").filter({hasText:"Второй проект"}).click();
    await page.waitForFunction(()=>document.querySelector("#title").value==="Новость второго проекта");
    await page.evaluate(()=>{
      const remote=window.__mockLibraryDb.projects.find(p=>p.title==="Второй проект");
      remote.version++;
      remote.snapshot.cards[0].title="Изменение с другого устройства";
      remote.updated_at=new Date().toISOString();
    });
    await page.locator("#title").fill("Мои локальные изменения");
    await page.locator("#library-refresh").click();
    await page.waitForFunction(()=>!document.querySelector("#library-conflict").hidden);
    assert.equal(await page.locator("#library-sync").textContent(),"Обновлено на другом устройстве");
    await page.locator("#library-conflict-copy").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects.length===2);
    assert.equal(await page.evaluate(()=>window.__mockLibraryDb.projects.find(p=>p.title==="Второй проект").snapshot.cards[0].title),
      "Изменение с другого устройства","Remote change must not be overwritten");
    assert.ok(await page.evaluate(()=>window.__mockLibraryDb.projects.some(p=>p.title==="Второй проект (копия)"&&p.snapshot.cards[0].title==="Мои локальные изменения")),
      "Conflict copy must retain unsaved local text");
    assert.equal(await page.locator("#library-conflict").isVisible(),false);

    // A loss of connectivity must not send a mutation or discard the local draft.
    await context.setOffline(true);
    await page.evaluate(()=>window.dispatchEvent(new Event("offline")));
    const savedBeforeOffline=await page.evaluate(()=>window.__mockLibraryDb.projects
      .find(p=>p.title==="Второй проект (копия)").version);
    await page.locator("#title").fill("Правки без интернета");
    assert.match(await page.locator("#library-sync").textContent(),/Офлайн/);
    await page.locator("#library-save").click();
    assert.match(await page.locator("#library-error").textContent(),/Нет соединения/);
    assert.equal(await page.locator("#title").inputValue(),"Правки без интернета");
    assert.equal(await page.evaluate(()=>window.__mockLibraryDb.projects
      .find(p=>p.title==="Второй проект (копия)").version),savedBeforeOffline,
      "An offline save must not call the cloud RPC");
    assert.match(await page.evaluate(()=>localStorage.getItem("anons-studio:mvp-v1")),/Правки без интернета/);
    await context.setOffline(false);
    await page.evaluate(()=>window.dispatchEvent(new Event("online")));
    await page.waitForFunction(()=>window.__mockLibraryDb.projects
      .some(p=>p.title==="Второй проект (копия)"&&p.snapshot.cards[0].title==="Правки без интернета"),
      {timeout:10000});
    assert.match(await page.locator("#library-sync").textContent(),/Сохранено в облаке|Есть новые изменения/);

    // A response from an old project selection must never overwrite edits
    // made while that response is awaiting the network.
    await page.evaluate(()=>{window.__mockLibraryDb.holdNextLoad=true;});
    await page.locator("#library-list .library-entry").filter({hasText:"Второй проект"}).last().click();
    await page.waitForFunction(()=>window.__mockLibraryDb.pendingLoads.length===1);
    await page.locator("#title").fill("Правка во время загрузки");
    await page.evaluate(()=>window.__mockLibraryDb.pendingLoads.shift()());
    await page.waitForFunction(()=>document.querySelector("#library-error").textContent
      .includes("Пока проект загружался"));
    assert.equal(await page.locator("#title").inputValue(),"Правка во время загрузки");
    assert.equal(await page.locator("#library-current").textContent(),"Второй проект (копия)",
      "Late project response must not change the selected project");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects
      .some(p=>p.title==="Второй проект (копия)"&&p.snapshot.cards[0].title==="Правка во время загрузки"));

    // A write started in account A must not block account B or make
    // account A's project visible after a switch.
    await page.evaluate(()=>{window.__mockLibraryDb.holdNextRpc=true;});
    await page.locator("#title").fill("Старый аккаунт: ожидание ответа");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.pendingRpcs.length===1);
    await page.evaluate(()=>{
      window.__testLibrary.setUser(null);
      window.__mockLibraryDb.currentAuthId="user-two";
      window.__testLibrary.setUser({id:"user-two",email:"other@example.invalid"});
    });
    await page.waitForFunction(()=>document.querySelector("#library-list .library-entry")===null);
    assert.equal(await page.locator("#title").inputValue(),"Большое обновление!",
      "Account switch clears previous user's canvas");
    assert.equal(await page.locator("#library-guest").isVisible(),false);
    await page.locator("#title").fill("Публикация второго аккаунта");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects
      .some(p=>p.owner_id==="user-two"&&p.snapshot.cards[0].title==="Публикация второго аккаунта"));
    assert.equal(await page.locator("#library-list .library-entry").count(),1,
      "New account sees only its own projects");
    await page.evaluate(()=>window.__mockLibraryDb.pendingRpcs.shift()());
    await page.waitForTimeout(50);
    assert.equal(await page.locator("#title").inputValue(),"Публикация второго аккаунта",
      "Old in-flight response never replaces the new user's canvas");
    assert.equal(await page.locator("#library-list .library-entry").count(),1,
      "Old in-flight response never appends another account's projects");
    assert.equal(await page.evaluate(()=>JSON.parse(
      localStorage.getItem("anons-studio:cloud-active-v05")).userId),"user-two");
    console.log("PASS Cloud library mock: create/edit/checkpoint/load/restore/archive/delete/conflict-copy/offline/stale-read/account-switch");
    await context.close();
  }
} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
