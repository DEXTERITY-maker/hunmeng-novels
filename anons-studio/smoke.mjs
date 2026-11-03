import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)),"dist");
const cloudflareHeaders=await readFile(join(root,"_headers"),"utf8");
assert.match(cloudflareHeaders,/Content-Security-Policy:.*script-src 'self'/);
assert.match(cloudflareHeaders,/X-Content-Type-Options: nosniff/);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".webp": "image/webp" };
const allow = new Set(["/","/index.html","/styles.css","/app.js","/graphic-elements.js","/scene-layout.js","/auth.bundle.js","/assets/anons-logo-approved.webp","/assets/anons-icon-approved.webp"]);
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
    await page.waitForFunction(()=>document.querySelector("#billing-availability")?.textContent?.toLowerCase().includes("покупки"));
    assert.ok(await page.locator("#buy-basic").isDisabled(),"Cannot charge without merchant configuration");
    assert.equal(await page.locator("#account-billing").count(),1,"Private billing history panel exists");
    assert.ok(await page.locator("#account-form").isVisible());
    assert.ok(await page.locator("#nav-account").isVisible());
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
    // v0.7: layers, per-card offsets, undo/redo and reusable local brand kit.
    assert.equal(await page.locator("[data-layer]").count(),6);
    const previousPng=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await page.locator('[data-layer="description"]').uncheck();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.notEqual(await page.locator("#poster").evaluate(c=>c.toDataURL("image/png")),previousPng,
      "Hiding a layer changes rendered poster pixels");
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].layers.description),false);
    await page.locator("#title-shift").evaluate(el=>{el.value="6";el.dispatchEvent(new Event("input",{bubbles:true}));});
    assert.equal(await page.locator("#title-shift-value").textContent(),"+6%");
    await page.locator("#card-list [role=tab]").first().click();
    assert.equal(await page.locator('[data-layer="description"]').isChecked(),true,
      "Layer visibility is independent across cards");
    assert.equal(await page.locator("#title-shift").inputValue(),"0");
    await page.locator("#card-list [role=tab]").last().click();
    assert.equal(await page.locator('[data-layer="description"]').isChecked(),false);
    await page.reload({waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("#title-shift").inputValue(),"6","Layer position persists after reload");
    assert.equal(await page.locator('[data-layer="description"]').isChecked(),false,
      "Layer visibility persists after reload");
    await page.locator("#title").fill("Новое действие для отмены");
    assert.equal(await page.locator("#editor-undo").isEnabled(),true);
    await page.locator("#editor-undo").click();
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка",
      "Undo restores the prior title");
    await page.locator("#editor-redo").click();
    assert.equal(await page.locator("#title").inputValue(),"Новое действие для отмены",
      "Redo repeats the change");
    await page.locator("#editor-undo").click();
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка");
    await page.locator("#brand-kit-save").click();
    assert.ok((await page.locator("#brand-kit-status").textContent()).includes("Сохранено"));
    await page.locator("[data-theme=ink]").click();
    await page.locator("#brand-kit-apply").click();
    assert.equal(await page.locator("#template-select").inputValue(),"editorial");
    assert.equal(await page.locator("#theme-label").textContent(),"Светлый — мягкий и редакционный",
      "Applying the saved brand kit restores its theme");
    assert.equal(await page.locator("#brand-kit-apply").isDisabled(),false);
    // v0.8: actual canvas dragging, 2% snapping, z-order and typography persist per card.
    assert.equal(await page.locator("#title-font").inputValue(),"auto");
    await page.locator("#title-font").selectOption("arial");
    await page.locator("#title-weight").selectOption("900");
    await page.locator("#title-tracking").evaluate(el=>{el.value="3";el.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#description-scale").evaluate(el=>{el.value="120";el.dispatchEvent(new Event("input",{bubbles:true}));});
    assert.equal(await page.locator("#title-tracking-value").textContent(),"3 px");
    assert.equal(await page.locator("#description-scale-value").textContent(),"120%");
    const zBefore=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].layerOrder);
    await page.locator('#layer-order-list button[title^="На передний план — Фото"]').click();
    const zAfter=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].layerOrder);
    assert.notDeepEqual(zBefore,zAfter,"Layer order updates after moving an item forward");
    await page.locator("#direct-edit").check();
    assert.equal(await page.locator("#drag-overlay").isVisible(),true);
    const dragHandle=page.locator('[data-drag-layer="title"]');
    await dragHandle.scrollIntoViewIfNeeded();
    const bounds=await dragHandle.boundingBox();
    assert.ok(bounds,"Title draggable label available in preview");
    const start={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2};
    await page.mouse.move(start.x,start.y);
    await page.mouse.down();
    await page.mouse.move(start.x+50,start.y+33,{steps:5});
    await page.mouse.up();
    const moved=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].layerOffsets.title);
    assert.ok(moved.x!==0||moved.y!==0,"Pointer drag moves a saved layer offset");
    assert.equal(moved.x%2,0,"Snap-to-grid rounds offset to 2% steps");
    await page.locator("#card-list [role=tab]").first().click();
    const first=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0]);
    assert.equal(first.titleFont,"auto","Typography remains independent per card");
    assert.deepEqual(first.layerOffsets.title,{x:0,y:0},"Other card placement is unchanged");
    await page.locator("#card-list [role=tab]").last().click();
    await page.reload({waitUntil:"domcontentloaded"});
    const savedV08=await page.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(savedV08.schemaVersion,7,"New draft snapshot format");
    assert.equal(savedV08.cards[1].titleFont,"arial");
    assert.equal(savedV08.cards[1].titleWeight,900);
    assert.equal(savedV08.cards[1].titleTracking,3);
    assert.equal(savedV08.cards[1].descriptionScale,120);
    assert.deepEqual(savedV08.cards[1].layerOffsets.title,moved,"Drag location survives reload");
    assert.deepEqual(savedV08.cards[1].layerOrder,zAfter,"Z-order survives reload");
    // v1.0 RC: same pure scene plan that the premium renderer imports.
    const sceneAudit=await page.evaluate(()=>{
      const raw=window.AnonsEditor.getSnapshot();
      const card=raw.cards[raw.activeCard];
      const plan=window.AnonsScene.layout(raw,card);
      const title=window.AnonsScene.titleLines(card.title,plan);
      const desc=window.AnonsScene.breakLines(card.description,
        plan.contentWidth-(plan.height<=1100?10:80),plan.descriptionSize,3);
      const canvas=document.querySelector("#poster");
      return {
        w:plan.width,h:plan.height,cw:canvas.width,ch:canvas.height,
        theme:plan.theme,template:plan.template,
        valid:plan.photo.width>0&&plan.detailsY>plan.titleY,
        lines:title.lines,descriptionLines:desc,
        order:plan.order,footer:plan.footerY
      };
    });
    assert.equal(sceneAudit.w,sceneAudit.cw,"Scene width and Canvas must agree");
    assert.equal(sceneAudit.h,sceneAudit.ch,"Scene height and Canvas must agree");
    assert.ok(sceneAudit.valid,"Shared scene geometry is valid");
    assert.ok(sceneAudit.lines.length>=1 && sceneAudit.lines.length<=4);
    assert.equal(new Set(sceneAudit.order).size,6);
    assert.equal(sceneAudit.footer,sceneAudit.h-74);
    // v0.9: one shared geometry contract, editor palette and real vector drawing.
    assert.equal(await page.locator("[data-add-graphic]").count(),12,"12 vector assets");
    const beforeGraphic=await page.locator("#poster").evaluate(canvas=>canvas.toDataURL());
    await page.locator('[data-add-graphic="star"]').click();
    assert.equal(await page.locator("#graphics-count").textContent(),"1 / 12");
    assert.equal(await page.locator("#graphic-editor").isVisible(),true);
    await page.locator("#graphic-color").fill("#ff7700");
    await page.locator("#graphic-size").evaluate(el=>{
      el.value="19";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    const afterGraphic=await page.locator("#poster").evaluate(canvas=>canvas.toDataURL());
    assert.notEqual(afterGraphic,beforeGraphic,"Vector graphic changes actual Canvas pixels");
    let icon=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].graphicElements[0]);
    assert.equal(icon.color,"#ff7700");
    assert.equal(icon.size,19);
    await page.locator("#direct-edit").check();
    const graphicHandle=page.locator('[data-drag-graphic]').first();
    await graphicHandle.scrollIntoViewIfNeeded();
    const p=await graphicHandle.boundingBox();
    assert.ok(p,"Custom vector element has a draggable handle");
    await page.mouse.move(p.x+p.width/2,p.y+p.height/2);
    await page.mouse.down();
    await page.mouse.move(p.x+p.width/2+43,p.y+p.height/2+32,{steps:5});
    await page.mouse.up();
    const movedGraphic=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].graphicElements[0]);
    assert.ok(movedGraphic.x!==icon.x||movedGraphic.y!==icon.y,"Vector object position changes after drag");
    await page.locator("#graphic-duplicate").click();
    assert.equal(await page.locator("#graphics-count").textContent(),"2 / 12");
    await page.locator("#card-list [role=tab]").first().click();
    assert.equal(await page.locator("#graphics-count").textContent(),"0 / 12","Elements are independent per card");
    await page.locator("#card-list [role=tab]").last().click();
    await page.reload({waitUntil:"domcontentloaded"});
    const savedGraphic=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].graphicElements);
    assert.equal(savedGraphic.length,2,"Graphic objects persist after reload");
    assert.equal(savedGraphic[0].color,"#ff7700");
    assert.equal(savedGraphic[0].x,movedGraphic.x);
    assert.equal(savedGraphic[0].y,movedGraphic.y);
    assert.ok(savedGraphic[0].id!==savedGraphic[1].id,"Duplicated graphic ids are distinct");
    const [zipDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#export-all").click()]);
    assert.match(zipDownload.suggestedFilename(),/\.zip$/);
    const zipBytes=await readFile(await zipDownload.path());
    assert.equal(zipBytes.readUInt32LE(0),0x04034b50,"ZIP signature");
    assert.ok(zipBytes.includes(Buffer.from("anons-card-01.png")));
    assert.ok(zipBytes.includes(Buffer.from("anons-card-02.png")));
    assert.ok(zipBytes.length>30000,"ZIP contains rendered PNG files");
    // Personal data portability: backup must be downloadable and reversible.
    const beforeBackup=await page.evaluate(()=>window.AnonsEditor.getSnapshot());
    const [backupFile]=await Promise.all([
      page.waitForEvent("download"),page.locator("#backup-download").click()
    ]);
    assert.match(backupFile.suggestedFilename(),/^anons-studio-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const bytes=await readFile(await backupFile.path());
    const backup=JSON.parse(bytes.toString("utf8"));
    assert.equal(backup.format,"anons-studio-backup");
    assert.equal(backup.version,1);
    assert.deepEqual(backup.snapshot,beforeBackup,"JSON backup contains every card and setting");
    await page.locator("#title").fill("Изменение перед восстановлением JSON");
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#backup-file").setInputFiles({
      name:"my-anons-backup.json",mimeType:"application/json",buffer:bytes
    });
    await page.waitForFunction(expected=>document.querySelector("#title").value===expected,
      beforeBackup.cards[beforeBackup.activeCard].title);
    assert.deepEqual(await page.evaluate(()=>window.AnonsEditor.getSnapshot()),beforeBackup,
      "Restore returns the complete saved project");
    await page.locator("#backup-file").setInputFiles({
      name:"bad.json",mimeType:"application/json",buffer:Buffer.from("{invalid","utf8")
    });
    await page.waitForFunction(()=>document.querySelector("#toast")?.textContent?.includes("не является корректной"));
    assert.deepEqual(await page.evaluate(()=>window.AnonsEditor.getSnapshot()),beforeBackup,
      "Corrupted backup cannot overwrite the draft");
    await page.locator("[data-account-mode=login]").click();
    assert.match(await page.locator("#account-submit").textContent(),/Войти/);
    assert.ok(await page.locator("#account-forgot").isVisible(),"Forgot-password entry point");
    await page.locator("#account-forgot").click();
    assert.equal(await page.locator("#account-password").isVisible(),false,"Password hidden during recovery request");
    assert.match(await page.locator("#account-submit").textContent(),/Отправить ссылку/);
    await page.route("**/auth/v1/recover**",route=>{
      route.fulfill({status:200,contentType:"application/json",headers:{
        "access-control-allow-origin":"*",
        "access-control-allow-methods":"POST,OPTIONS",
        "access-control-allow-headers":"*"
      },body:"{}"});
    });
    await page.locator("#account-email").fill("reset-test@example.invalid");
    await page.locator("#account-submit").click();
    await page.waitForFunction(()=>document.querySelector("#account-message")?.textContent?.includes("Если аккаунт существует"));
    assert.match(await page.locator("#account-submit").textContent(),/Войти/);
    await page.locator("[data-account-mode=signup]").click();
    assert.equal(await page.locator("#account-password").getAttribute("minlength"),"10");
    assert.ok(await page.locator("#account-security").count()===1,"Password change controls available for logged-in users");
    assert.ok(await page.locator("#account-logout-all").count()===1,"Global sign-out control exists");
    const [download] = await Promise.all([page.waitForEvent("download"),page.locator("#export").click()]);
    assert.match(download.suggestedFilename(),/\.png$/);
    assert.ok((await readFile(await download.path())).length>20000,"Downloaded PNG should contain image data");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),"No horizontal overflow");
    assert.deepEqual(errors,[],"No browser JS errors");
    assert.equal(await page.locator("button.plan-action[disabled]").count(),3,"No deceptive payment actions");
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
    const legacy=await page.evaluate(()=>{
      const current=window.AnonsEditor.getSnapshot();
      const old=JSON.parse(JSON.stringify(current));
      old.schemaVersion=4;
      old.cards.forEach(card=>{
        for(const key of ["layers","titleShift","descriptionShift","layerOffsets","layerOrder",
          "titleFont","titleWeight","titleTracking","descriptionScale","graphicElements"])delete card[key];
      });
      window.AnonsEditor.loadSnapshot(old);
      const migrated=window.AnonsEditor.getSnapshot().cards;
      const works=migrated.every(card=>card.titleShift===0&&card.descriptionShift===0&&Object.values(card.layers).every(Boolean));
      const validV08=migrated.every(card=>card.layerOrder.length===6 && card.titleFont==="auto"
        &&card.descriptionScale===100 && card.layerOffsets.title.x===0 && card.layerOffsets.title.y===0
        &&card.graphicElements.length===0);
      window.AnonsEditor.loadSnapshot(current);
      return {works,validV08,count:migrated.length};
    });
    assert.equal(legacy.works,true,"v0.4-v0.6 cloud projects receive default visible layers");
    assert.equal(legacy.validV08,true,"Old cloud drafts get safe v0.8 layout and typography defaults");
    assert.equal(legacy.count,2,"Migration keeps all pages");

    if(width===1440){
      const compositions=await page.evaluate(async()=>{
        const initial=window.AnonsEditor.getSnapshot();
        const cases=[];
        const frame=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
        try{
          for(const ratio of ["portrait","square","story"]){
            for(const template of ["aurora","editorial","spotlight","pulse","minimal","bulletin"]){
              const next=JSON.parse(JSON.stringify(initial));
              next.ratio=ratio;
              next.cards[next.activeCard].template=template;
              next.cards[next.activeCard].title="Большое обновление нового проекта и его возможностей";
              next.cards[next.activeCard].description="Тестируем русские заголовки, оформление и экспорт в разных форматах.";
              window.AnonsEditor.loadSnapshot(next);
              await frame();
              const canvas=document.getElementById("poster");
              const scene=window.AnonsScene.layout(next,next.cards[next.activeCard]);
              const png=canvas.toDataURL("image/png");
              const pixel=canvas.getContext("2d").getImageData(0,0,1,1).data;
              cases.push({ratio,template,width:canvas.width,height:canvas.height,
                sceneW:scene.width,sceneH:scene.height,png:png.startsWith("data:image/png;base64,"),
                opaque:pixel[3]===255,validTitle:window.AnonsScene.titleLines(next.cards[next.activeCard].title,scene).lines.length>0});
            }
          }
        }finally{window.AnonsEditor.loadSnapshot(initial);await frame();}
        return cases;
      });
      assert.equal(compositions.length,18,"Six templates at three canvas resolutions");
      assert.ok(compositions.every(c=>c.png&&c.opaque&&c.validTitle&&c.width===c.sceneW&&c.height===c.sceneH),
        "All 18 long-Cyrillic compositions render correctly with shared dimensions");
      console.log("PASS Shared scene preview across 18 template/format combinations");
    }


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
    // Imported JSON into a signed-in library must create a new project, not
    // overwrite a previously synchronized cloud record.
    const cloudOriginal=await page.evaluate(()=>JSON.parse(JSON.stringify(window.__mockLibraryDb.projects[0])));
    const imported=await page.evaluate(async()=>{
      const snapshot=JSON.parse(JSON.stringify(window.__mockLibraryDb.projects[0].snapshot));
      snapshot.cards[0].title="Восстановленная резервная копия";
      return await window.__testLibrary.importBackup(snapshot);
    });
    assert.equal(imported,true,"Cloud library can open a backup as new draft");
    assert.equal(await page.locator("#library-current").textContent(),"Новый черновик");
    assert.equal(await page.locator("#title").inputValue(),"Восстановленная резервная копия");
    assert.deepEqual(await page.evaluate(()=>window.__mockLibraryDb.projects[0]),cloudOriginal,
      "Import must not touch the existing cloud project");
    await page.locator("#library-save").click();
    await page.waitForFunction(()=>window.__mockLibraryDb.projects.length===3);
    assert.equal(await page.evaluate(()=>window.__mockLibraryDb.projects[0].snapshot.cards[0].title),
      cloudOriginal.snapshot.cards[0].title,"Old cloud project remains unchanged");
    console.log("PASS Cloud library mock: create/edit/checkpoint/load/restore/archive/delete/conflict-copy");
    await context.close();
  }
} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
