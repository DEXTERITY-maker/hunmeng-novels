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
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".webp": "image/webp", ".svg":"image/svg+xml" };
const allow = new Set(["/","/index.html","/account.html","/editor.html","/templates.html","/features.html","/pricing.html","/styles.css","/app.js","/editor-workspace.js","/export-profiles.js","/editor-direct.js","/editor-layers.js","/navigation.js","/templates-catalog.js","/templates-assistant.js","/pricing-status.js","/personal-styles.js","/brand-kit.js","/whats-new.js","/scene-layout.js","/graphic-elements.js","/auth.bundle.js","/assets/anons-logo-approved.webp","/assets/anons-icon-approved.webp","/assets/ui-icons.svg"]);
assert.match(await readFile(join(root,"export-profiles.js"),"utf8"),
  /anons-studio:export-profiles:v1/,
  "Local export profile controller is bundled in the isolated site");
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
// Every icon reference in every published page must exist in the bundled
// vector sprite, so glyphs never silently disappear after a design update.
assert.equal(await readFile(join(root,"graphic-elements.js"),"utf8"),
  await readFile(join(dirname(fileURLToPath(import.meta.url)),"functions","anons-premium-export","graphic-elements.js"),"utf8"),
  "Browser and paid renderer use the same allowlisted graphic paths");
const iconSprite=await readFile(join(root,"assets","ui-icons.svg"),"utf8");
const availableIcons=new Set([...iconSprite.matchAll(/<symbol id="([a-z-]+)"/g)].map(m=>m[1]));
assert.ok(availableIcons.size>=30,"Ship a comprehensive locally hosted icon set");
for(const page of ["index","editor","templates","features","pricing","account"]){
  const html=await readFile(join(root,page+".html"),"utf8");
  const refs=[...html.matchAll(/ui-icons\.svg#([a-z-]+)/g)].map(m=>m[1]);
  assert.ok(refs.length>0,page+" has no SVG icons");
  for(const name of refs)assert.ok(availableIcons.has(name),page+" uses unknown icon "+name);
  assert.doesNotMatch(html,/[✦✧✳◈◉▧☁🔒▤◇◎✎↗↘↓↶↷↻⇩⚙⧉☰◫↺＋⌘]/u,
    page+" contains an unconverted placeholder glyph");
}
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
    assert.equal(await page.locator(".quick-start-card").count(),4,
      "Homepage offers four ready-to-edit publication scenarios");
    for(const type of ["update","launch","event","notice"]){
      assert.equal(await page.locator('.quick-start-card[href="./editor.html?preset='+type+'"]').count(),1,
        "Every scenario links to a valid editor preset");
    }
    // Native dialog announces new features once per release and stays
    // available from the footer without disturbing ordinary page visits.
    const releaseDialog=page.locator("#whats-new-dialog");
    await page.waitForFunction(()=>document.getElementById("whats-new-dialog")?.open);
    assert.match(await page.locator("#whats-new-title").textContent(),/Связь по заявкам и точный платный экспорт/);
    assert.equal(await page.locator(".whats-new-list li").count(),33);
    assert.equal(await page.locator(".whats-new-item-icon .ui-icon").count(),33,
      "Announcement has coherent SVG icons instead of character placeholders");
    assert.equal(await page.locator("#whats-new-close").evaluate(el=>el===document.activeElement),true,
      "Announcement initially focuses its accessible close control");
    assert.equal(await page.locator(".whats-new-list:not(.whats-new-list-archive) li").count(),1,
      "Only the latest two changes are expanded by default");
    assert.equal(await page.locator(".whats-new-list-archive li").count(),32);
    assert.equal(await page.locator(".whats-new-history").evaluate(el=>el.open),false);
    await page.locator(".whats-new-history summary").click();
    assert.equal(await page.locator(".whats-new-history").evaluate(el=>el.open),true);
    await page.locator(".whats-new-history summary").click();
    await page.waitForFunction(()=>document.querySelector(".whats-new-item-icon svg")?.getBBox().width>0);
    assert.equal(await page.evaluate(async()=> (await fetch("/assets/ui-icons.svg")).status),200,
      "The self-hosted icon sprite is available in the built site");
    for(const destination of ["editor.html","templates.html","features.html","pricing.html","account.html"]){
      assert.ok((await page.locator('.whats-new-list a[href="./'+destination+'"]').count())>=1,
        "Announcement links directly to "+destination);
    }
    assert.equal(await releaseDialog.getAttribute("data-release"),"2026-11-06-order-contact-export",
      "Latest announcement version must be recognized");

    await page.locator("#whats-new-dismiss").click();
    assert.equal(await releaseDialog.evaluate(d=>d.open),false,"Dismiss closes the dialog");
    const firstRelease=await releaseDialog.getAttribute("data-release");
    await page.waitForFunction(release=>
      localStorage.getItem("anons-studio:whats-new:seen")===release,firstRelease);
    assert.equal(await page.evaluate(()=>localStorage.getItem("anons-studio:whats-new:seen")),firstRelease);
    // Save anonymous full-page references for reviewing the new responsive
    // homepage. No private projects or signed-in profile data are captured.
    const homeShotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(homeShotDir,{recursive:true});
    await page.screenshot({
      path:join(homeShotDir,"home-"+width+".png"),fullPage:true,animations:"disabled"
    });
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
    await page.locator("#poster").waitFor({state:"attached"});
    // Rendering must complete, not merely catch a Canvas error behind a visible panel.
    await page.waitForFunction(()=>window.__watermarkDraws>0,null,{timeout:7000});
    assert.doesNotMatch(await page.locator("#toast").textContent()||"",/Ошибка предпросмотра/,
      "Canvas preview should render its description and watermark without errors");
    const editorScreenshotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(editorScreenshotDir,{recursive:true});
    await page.locator("#editor-controls").screenshot({
      path:join(editorScreenshotDir,"editor-settings-"+width+".png"),animations:"disabled"
    });
    await page.screenshot({
      path:join(editorScreenshotDir,"editor-overview-"+width+".png"),
      fullPage:false,animations:"disabled"
    });
    await page.locator("#library").screenshot({
      path:join(editorScreenshotDir,"library-overview-"+width+".png"),
      animations:"disabled"
    });
    const accountDesignPage=await context.newPage();
    await accountDesignPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await accountDesignPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await accountDesignPage.goto("http://127.0.0.1:"+port+"/account.html",
      {waitUntil:"domcontentloaded"});
    assert.equal(await accountDesignPage.locator(".account-perks>div").count(),3,
      "Account explains three real user benefits");
    assert.equal(await accountDesignPage.locator(".account-card-head").count(),1,
      "Account form retains its contents inside the redesigned card");
    assert.equal(await accountDesignPage.locator("#account-form").count(),1,
      "Guest auth form remains available");
    assert.equal(await accountDesignPage.locator("#account-summary-placeholder").count(),0);
    await accountDesignPage.screenshot({
      path:join(editorScreenshotDir,"account-overview-"+width+".png"),
      fullPage:false,animations:"disabled"
    });
    await accountDesignPage.close();
    assert.equal(await page.locator(".editor-tool-group").count(),3,
      "Editor tools are grouped into card, content and design sections");
    // Quick visual gallery mirrors the actual select and does not grant plans.
    assert.equal(await page.locator("#template-visual-grid .template-mini-card").count(),21);
    assert.equal(await page.locator("#template-visual-grid .template-mini-card:visible").count(),6);
    assert.equal(await page.locator("#template-visual-grid .is-locked").count(),15);
    assert.equal(await page.locator("#template-visual-count").textContent(),"Доступно 6 из 21");
    await page.locator("#template-visual-more").click();
    assert.equal(await page.locator("#template-visual-grid .template-mini-card:visible").count(),21);
    assert.equal(await page.locator('[data-preview-template="business-brief"]').isDisabled(),true);
    await page.locator("#template-visual-more").click();
    assert.equal(await page.locator(".studio-progress a").count(),3,
      "Redesigned editor has three actionable creation steps");
    assert.equal(await page.locator(".studio-hero-details span").count(),3,
      "Editor shows grounded workflow facts");
    assert.equal(await page.locator(".studio-preview-grid").count(),1,
      "Preview retains its canvas and gains visual framing");
    assert.equal(await page.locator(".library-benefit-strip span").count(),3,
      "Library introduction explains working capabilities");
    assert.equal(await page.locator("#library-guest .library-guest-eyebrow").count(),1,
      "Anonymous library experience has its new design");
    for(const id of ["editor-group-layout","editor-group-content","editor-group-design"]){
      assert.equal(await page.locator("#"+id).count(),1,"Missing grouped editor section "+id);
    }
    if(width<=760){
      assert.equal(await page.locator(".editor-view-switch").isVisible(),true);
      assert.equal(await page.locator("#editor-controls").isVisible(),true,
        "Mobile editor initially displays settings");
      assert.equal(await page.locator("#editor-preview").isVisible(),false,
        "Mobile preview is initially hidden");
      assert.equal(await page.locator('[data-workspace-view="edit"]').getAttribute("aria-pressed"),"true");
    }else{
      assert.equal(await page.locator(".editor-view-switch").isVisible(),false);
      assert.equal(await page.locator("#editor-controls").isVisible(),true);
      assert.equal(await page.locator("#editor-preview").isVisible(),true);
    }
    assert.equal(await releaseDialog.count(),0,"Announcement was left on the home page");
    assert.equal(new URL(page.url()).pathname,"/editor.html","CTA opens the independent editor");
    assert.ok(await page.locator("#library-guest").isVisible(),"Guests see login invitation for cloud library");
    assert.equal(await page.locator("#library-auth").isVisible(),false,"Guests cannot see private project controls");
    assert.equal(await page.locator("#library-list").count(),1);
    assert.ok(await page.evaluate(()=>typeof window.AnonsEditor?.getSnapshot==="function"),
      "Editor exposes snapshot API; page errors: "+JSON.stringify(errors)+
      "; scripts: "+JSON.stringify(await page.locator("script[src]").evaluateAll(nodes=>
        nodes.map(n=>n.getAttribute("src"))))+
      "; shared graphic module: "+(await page.evaluate(()=>typeof window.AnonsGraphics)));
    assert.equal(await page.evaluate(()=>typeof window.AnonsEditor?.getLayerPanel),"function",
      "Layer panel API is part of the same state manager");
    const initialLayers=await page.evaluate(()=>window.AnonsEditor.getLayerPanel());
    assert.equal(initialLayers.base.length,6);
    assert.equal(initialLayers.figures.length,0);
    assert.equal(await page.locator("#layer-stack-list .layer-stack-row").count(),6);
    assert.ok(await page.locator("#layer-stack-panel").count()||await page.locator(".layer-stack-panel").count());
    const beforeFilter=JSON.stringify(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards));
    if(width<=760)await page.locator('[data-workspace-view="preview"]').click();
    await page.locator("#layer-filter-search").fill("такого слоя не существует");
    await page.waitForFunction(()=>document.querySelectorAll("#layer-stack-list .layer-stack-row").length===0);
    assert.match(await page.locator("#layer-filter-results").textContent(),/Показано 0 из 6/);
    await page.locator("#layer-filter-search").fill("");
    await page.locator("#layer-filter-mode").selectOption("hidden");
    await page.waitForFunction(()=>document.querySelector("#layer-filter-mode")?.value==="hidden");
    const hiddenRows=await page.locator("#layer-stack-list .layer-stack-row").count();
    assert.ok(hiddenRows<=6,"Layer filter only narrows the list");
    await page.locator("#layer-filter-mode").selectOption("all");
    await page.waitForFunction(()=>document.querySelectorAll("#layer-stack-list .layer-stack-row").length===6);
    assert.equal(JSON.stringify(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards)),beforeFilter,
      "Searching/filtering layers never edits the publication");
    if(width<=760)await page.locator('[data-workspace-view="edit"]').click();
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
    assert.equal(await page.locator("#composition").inputValue(),"classic");
    assert.equal(await page.locator("#highlight-style").inputValue(),"soft");
    assert.equal(await page.locator("#featured-highlight").inputValue(),"-1");
    assert.equal(await page.locator("[data-highlight-icon]").count(),3);
    assert.deepEqual(await page.locator("[data-highlight-icon]").evaluateAll(els=>els.map(el=>el.value)),
      ["dot","dot","dot"],"Existing cards preserve legacy dot markers");
    assert.equal(await page.locator("#decoration-level").inputValue(),"subtle",
      "Aurora starts with less distracting background decoration");
    assert.equal(await page.locator("#text-spacing").inputValue(),"balanced",
      "Text starts with a legible balanced gap");
    const artContract=await page.evaluate(()=>{
      const snapshot=window.AnonsEditor.getSnapshot(),card=snapshot.cards[snapshot.activeCard];
      const scene=window.AnonsScene.layout(snapshot,card);
      const title=window.AnonsScene.titleLines(card.title,scene);
      return {
        gap:window.AnonsScene.descriptionTop(scene,title),
        stamps:window.AnonsScene.watermarkStamps(scene.width,scene.height,scene.palette.dark),
        tone:scene.decorationLevel,grid:scene.decorationTuning.grid
      };
    });
    assert.equal(artContract.tone,"subtle");
    assert.equal(artContract.stamps.length,4,"Watermark stays across multiple parts of local poster");
    assert.ok(artContract.stamps.every(x=>x.size<65&&x.alpha>=.12));

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

    // Test changing the visual template only after initial undo/redo invariants.
    await page.locator('[data-preview-template="spotlight"]').click();
    assert.equal(await page.locator("#template-select").inputValue(),"spotlight",
      "Visual choice updates the canonical editor select");
    await page.locator('[data-preview-template="aurora"]').click();
    assert.equal(await page.locator("#template-select").inputValue(),"aurora");
    assert.equal(await page.locator("#template-visual-grid .template-mini-card:visible").count(),6);

    // Visual tuning is per card, changes Canvas, and is included in project saves.
    const originalCanvas=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await page.locator("#decoration-level").evaluate(el=>{
      el.value="expressive";el.dispatchEvent(new Event("change",{bubbles:true}));
    });
    await page.waitForFunction(original=>
      document.querySelector("#poster")?.toDataURL("image/png")!==original,originalCanvas);
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].decorationLevel),
      "expressive");
    await page.locator("#text-spacing").evaluate(el=>{
      el.value="compact";el.dispatchEvent(new Event("change",{bubbles:true}));
    });
    assert.equal(await page.evaluate(()=>{
      const card=window.AnonsEditor.getSnapshot().cards[0];
      const scene=window.AnonsScene.layout(window.AnonsEditor.getSnapshot(),card);
      return window.AnonsScene.descriptionTop(scene,window.AnonsScene.titleLines(card.title,scene));
    })<artContract.gap,true,"Compact spacing moves description toward title");
    await page.locator("#decoration-level").evaluate(el=>{
      el.value="subtle";el.dispatchEvent(new Event("change",{bubbles:true}));
    });
    await page.locator("#text-spacing").evaluate(el=>{
      el.value="balanced";el.dispatchEvent(new Event("change",{bubbles:true}));
    });
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].textSpacing),
      "balanced");

    // Aurora compositions, highlight styles and per-row SVG markers are saved
    // in the same snapshot used by browser downloads and the cloud library.
    const beforeStyle=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await page.locator("#composition").selectOption("headline");
    await page.locator("#highlight-style").selectOption("separated");
    await page.locator("#featured-highlight").selectOption("1");
    await page.locator("#highlight-icon-0").selectOption("check");
    await page.locator("#highlight-icon-1").selectOption("star");
    await page.locator("#highlight-icon-2").selectOption("diamond");
    await page.waitForFunction(previous=>document.querySelector("#poster").toDataURL("image/png")!==previous,beforeStyle);
    const styleSnapshot=await page.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(styleSnapshot.cards[0].composition,"headline");
    assert.equal(styleSnapshot.cards[0].highlightStyle,"separated");
    assert.equal(styleSnapshot.cards[0].featuredHighlight,1);
    assert.deepEqual(styleSnapshot.cards[0].highlightIcons,["check","star","diamond"]);
    const styleScene=await page.evaluate(()=>{
      const snapshot=window.AnonsEditor.getSnapshot();
      const scene=window.AnonsScene.layout(snapshot,snapshot.cards[0]);
      return {composition:scene.composition,style:scene.highlightStyle,
        withinFooter:window.AnonsScene.highlightGeometry(scene,3).top+
          window.AnonsScene.highlightGeometry(scene,3).height<=scene.footerY-55};
    });
    assert.equal(styleScene.composition,"headline");
    assert.equal(styleScene.style,"separated");
    assert.equal(styleScene.withinFooter,true);

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
    assert.equal(await pricingPage.locator("#pricing .plan").count(),6);
    assert.equal(await pricingPage.locator("#pricing .plan-ui-icon .ui-icon").count(),6,
      "Each subscription tier has a matching vector icon");
    await pricingPage.waitForFunction(()=>document.querySelector("#billing-availability")?.textContent?.toLowerCase().includes("ручная заявка"));
    assert.ok(await pricingPage.locator("#buy-basic").isDisabled(),"Cannot charge without merchant configuration");
    assert.equal(await pricingPage.locator("#manual-order-root").count(),1,
      "Standalone pricing page shows a manual Basic request flow");
    assert.ok(await pricingPage.locator("#manual-order-create").isDisabled(),
      "Guests cannot create an unbound order");
    assert.ok(await pricingPage.locator("#manual-order-login").isVisible(),
      "Guests are guided to verified email registration");
    assert.match(await pricingPage.locator("#manual-order-customer").textContent(),
      /После входа появится постоянный номер/);
    assert.equal(await pricingPage.locator("#manual-order-list").count(),1,
      "Manual order history belongs to the authenticated customer");

    assert.equal(await pricingPage.locator("button.plan-action[disabled]").count(),1,
      "Card checkout stays disabled while manual plan selection is available");
    assert.equal(await pricingPage.locator("#manual-order-plan").inputValue(),"basic");
    await pricingPage.locator("#manual-order-plan").selectOption("pro");
    assert.equal(await pricingPage.locator("#manual-order-price").textContent(),"499 ₽");
    assert.equal(await pricingPage.locator("#manual-order-create").isDisabled(),true,
      "Choosing Pro does not bypass guest authentication");
    await pricingPage.locator("#manual-order-plan").selectOption("studio");
    assert.equal(await pricingPage.locator("#manual-order-price").textContent(),"999 ₽");
    assert.equal(await pricingPage.locator(".manual-plan-link").count(),5,
      "Every paid plan links to the same manual-order form");
    await pricingPage.locator("#manual-order-plan").selectOption("agency");
    assert.match((await pricingPage.locator("#manual-order-price").textContent())?.replace(/\s/g,"")||"",/1499₽/);
    await pricingPage.locator("#manual-order-plan").selectOption("ultimate");
    assert.match((await pricingPage.locator("#manual-order-price").textContent())?.replace(/\s/g,"")||"",/2499₽/);
    assert.equal(await pricingPage.locator(".tariff-compare table th").count()>=7,true,
      "Six plans have an accessible feature comparison table");
    assert.equal(await pricingPage.locator("#pricing-personal-status").count(),1,
      "Pricing displays the user account membership separately from public prices");
    await pricingPage.evaluate(()=>{
      window.dispatchEvent(new CustomEvent("anons:access",{
        detail:{loggedIn:true,verified:true,plan:"free",premium:false}
      }));
      window.dispatchEvent(new CustomEvent("anons:manual-orders",{
        detail:{orders:[{order_no:100001,plan:"basic",status:"payment_reported"}]}
      }));
    });
    assert.equal(await pricingPage.locator("#pricing-current-title").textContent(),
      "Заказ AS-100001 · Бизнес","Reported transfer is not a verified membership");
    assert.equal(await pricingPage.locator('[data-plan="basic"].is-current-plan').count(),0);
    assert.equal(await pricingPage.locator('[data-plan="basic"].is-pending-plan').count(),1);
    assert.equal(await pricingPage.locator('[data-plan="basic"] .manual-plan-link').isHidden(),true,
      "Cannot accidentally order a second Business plan during review");
    await pricingPage.evaluate(()=>{
      window.dispatchEvent(new CustomEvent("anons:access",{
        detail:{loggedIn:true,verified:true,plan:"basic",premium:true,
          expiresAt:"2099-01-01T00:00:00Z"}
      }));
    });
    assert.equal(await pricingPage.locator("#pricing-current-title").textContent(),
      "Ваш тариф: Бизнес");
    assert.equal(await pricingPage.locator('[data-plan="basic"].is-current-plan').count(),1);
    assert.equal(await pricingPage.locator('[data-plan="basic"] .manual-plan-link').isHidden(),true);
    assert.ok(await pricingPage.locator("#manual-order-create").isDisabled(),
      "Active subscription must disable duplicate manual order");
    await pricingPage.evaluate(()=>{
      window.dispatchEvent(new CustomEvent("anons:access",{
        detail:{loggedIn:false,verified:true,plan:"free",premium:false}
      }));
      window.dispatchEvent(new CustomEvent("anons:manual-orders",{detail:{orders:[]}}));
    });
    assert.equal(await pricingPage.locator('[data-plan="basic"].is-current-plan').count(),0,
      "Signout must clear the former user's tier marker");
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
      assert.ok((await mobileMenu.locator("use").getAttribute("href")).endsWith("#x"),
        "Opening mobile navigation switches the SVG to a close icon");
      assert.equal(await mobileMenu.getAttribute("aria-expanded"),"true");
      await page.keyboard.press("Escape");
      assert.equal(await primaryNav.isVisible(),false,"Escape dismisses mobile navigation");
      assert.equal(await mobileMenu.getAttribute("aria-expanded"),"false");
      assert.ok((await mobileMenu.locator("use").getAttribute("href")).endsWith("#menu"),
        "Closing mobile navigation restores the SVG menu icon");
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
    assert.equal(await page.locator("[data-template]").count(),21,"Six Free and fifteen paid templates across five plans");
    await page.locator("#catalog-controls:not([hidden])").waitFor();
    assert.equal(await page.locator("#assistant-open").getAttribute("href"),"./editor.html?template=aurora&preset=update",
      "Quick-start defaults to a safe, editor-compatible suggestion");
    await page.locator("#assistant-purpose").selectOption("event");
    assert.equal(await page.locator("#assistant-open").getAttribute("href"),"./editor.html?template=pulse&preset=event",
      "Quick-start recommends an energetic event composition");
    await page.locator("#assistant-mood").selectOption("calm");
    assert.equal(await page.locator("#assistant-open").getAttribute("href"),"./editor.html?template=bulletin&preset=event",
      "Quick-start recomputes recommendation without navigation");
    assert.equal(await page.locator("#assistant-result-art .template-art").count(),1,
      "Recommended preview reuses a real gallery composition");
    assert.equal(await page.locator(".catalog-item:visible").count(),21,"All templates initially visible");
    await page.locator("#template-search").fill("Aurora");
    assert.equal(await page.locator(".catalog-item:visible").count(),1,"Catalogue search narrows the visible templates");
    await page.locator("#template-search").fill("");
    await page.locator('[data-catalog-category="news"]').click();
    assert.equal(await page.locator(".catalog-item:visible").count(),8,"News category includes Agency and Ultimate");
    await page.locator("#template-search").fill("нет такого шаблона");
    assert.equal(await page.locator("#template-empty").isVisible(),true,"No results shows reset action");
    await page.locator("#template-reset").click();
    await page.locator(".catalog-favorite").first().click();
    await page.locator("#template-favorites-toggle").click();
    assert.equal(await page.locator(".catalog-item:visible").count(),1,"Favorites filter finds the saved template");
    await page.locator("#template-favorites-toggle").click();
    assert.equal(await page.locator(".catalog-item:visible").count(),21,"Switching off favorites restores gallery");
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
    // Per-card typography and relative offsets share server scene geometry.
    await page.locator("#title-font").selectOption("georgia");
    await page.locator("#description-scale").evaluate(el=>{
      el.value="115";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    for(const [id,value] of [
      ["title-offset-x","6"],["title-offset-y","-4"],
      ["description-offset-y","8"],["highlights-offset-y","-3"]
    ]){
      await page.locator("#"+id).evaluate((el,value)=>{
        el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));
      },value);
    }
    let extended=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0]);
    assert.equal(extended.titleFont,"georgia");
    assert.equal(extended.descriptionScale,115);
    assert.equal(extended.layerOffsets.title.x,6);
    assert.equal(extended.layerOffsets.title.y,-4);
    assert.equal(extended.layerOffsets.description.y,8);
    assert.equal(extended.layerOffsets.highlights.y,-3);

    const canvasBeforeShape=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await page.locator("#graphic-add").click();
    assert.equal(await page.locator("#graphic-list button").count(),1);
    assert.equal(await page.locator("#graphic-count").textContent(),"1 из 12");
    await page.locator("#graphic-kind").selectOption("star");
    for(const [id,value] of [
      ["graphic-x","74"],["graphic-y","36"],["graphic-size","18"],
      ["graphic-rotation","45"],["graphic-opacity","70"]
    ]){
      await page.locator("#"+id).evaluate((el,value)=>{
        el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));
      },value);
    }
    await page.locator("#graphic-color").fill("#ffcc33");
    await page.waitForFunction(old=>
      document.getElementById("poster").toDataURL("image/png")!==old,canvasBeforeShape);
    extended=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0]);
    assert.equal(extended.graphicElements.length,1);
    assert.equal(extended.graphicElements[0].kind,"star");
    assert.equal(extended.graphicElements[0].x,74);
    assert.equal(extended.graphicElements[0].y,36);
    assert.equal(extended.graphicElements[0].size,18);
    assert.equal(extended.graphicElements[0].rotation,45);
    assert.equal(extended.graphicElements[0].opacity,70);
    assert.equal(extended.graphicElements[0].color,"#ffcc33");
    // Direct manipulation uses the exact Canvas geometry but its selection
    // frame is DOM-only, so exporting a PNG never includes editing handles.
    const directKey="graphic:"+extended.graphicElements[0].id;
    if(width<=760)await page.locator("#editor-show-preview").click();
    const directEnable=page.locator("#direct-enable");
    await directEnable.check();
    assert.equal(await page.locator("#direct-target option").count(),6,
      "Project title, heading, description, highlights and graphics are selectable");
    await page.locator("#direct-target").selectOption(directKey);
    assert.equal(await page.locator(".direct-selection-outline").isVisible(),true);
    assert.equal(await page.locator("#poster").evaluate(el=>el.classList.contains("direct-canvas-active")),true);
    const originalShape=await page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0]);
    const beforeSelection=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await page.locator("#direct-lock").click();
    assert.equal(await page.locator("#direct-lock").getAttribute("aria-pressed"),"true");
    assert.equal(await page.locator("#poster").evaluate(c=>c.toDataURL("image/png")),beforeSelection,
      "Selecting and locking an object cannot pollute the PNG");
    assert.ok((await page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].lockedLayers)).includes(directKey));
    await page.locator("#poster").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].x)),originalShape.x,"Locked figure cannot move");
    await page.locator("#direct-lock").click();
    assert.equal(await page.locator("#direct-lock").getAttribute("aria-pressed"),"false",
      "Second lock action unlocks the selected figure");
    await page.evaluate(()=>{
      window.__anonsPointerTrace=[];
      const c=document.querySelector("#poster");
      for(const type of ["pointerdown","pointermove","pointerup","lostpointercapture"]){
        c.addEventListener(type,event=>{
          window.__anonsPointerTrace.push({
            type,pointerId:event.pointerId,buttons:event.buttons,
            x:Math.round(event.clientX),y:Math.round(event.clientY),
            selected:document.querySelector("#direct-target").value,
            locked:window.AnonsEditor.getDirectTargets().items.find(i=>
              i.key===document.querySelector("#direct-target").value)?.locked,
            figureX:window.AnonsEditor.getSnapshot().cards[0].graphicElements[0].x
          });
        },true);
      }
    });
    await page.locator("#poster").scrollIntoViewIfNeeded();
    const bbox=await page.locator("#poster").boundingBox();
    const handle=await page.locator(".direct-selection-outline").boundingBox();
    assert.ok(bbox?.width>50&&handle?.width>10);
    const startX=handle.x+handle.width/2,startY=handle.y+handle.height/2;
    await page.mouse.move(startX,startY);
    await page.mouse.down();
    const selectedByPointer=await page.locator("#direct-target").inputValue();
    assert.equal(selectedByPointer,directKey,
      "Pointerdown at the visible selection frame should select the graphic");
    await page.mouse.move(startX+bbox.width*.10,startY+bbox.height*.05,{steps:5});
    await page.mouse.up();
    const dragged=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements[0]);
    assert.notEqual(dragged.x,originalShape.x,
      "Dragging figure should update x; pointer trace: "+
        JSON.stringify(await page.evaluate(()=>window.__anonsPointerTrace)));
    assert.ok(dragged.x%5===0,"Grid snapping applies during pointer movement");
    await page.locator("#direct-larger").click();
    await page.locator("#direct-rotate-right").click();
    const transformed=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements[0]);
    assert.equal(transformed.size,20,"Graphic resize button updates actual Canvas geometry");
    assert.equal(transformed.rotation,60,"Graphic rotate button saves the new angle");
    await page.locator("#direct-target").selectOption("title");
    const titleBefore=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layerOffsets.title.x);
    await page.locator("#poster").focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layerOffsets.title.x),
      titleBefore+5,"Arrow-key editing moves text layers");
    await page.keyboard.press("ArrowLeft");
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layerOffsets.title.x),
      titleBefore,"Text can be moved back precisely");
    // Layer tree actions share the editor snapshot, export, and undo model.
    assert.equal(await page.locator(".layer-stack-row").count(),7,
      "Five core editable layers plus decoration and the added figure");
    const titleRow=page.locator('[data-layer-key="title"]');
    await titleRow.locator('[aria-label="Скрыть Заголовок"]').click();
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layers.title),false);
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getDirectTargets().items))
      .some(item=>item.key==="title"),false,"Hidden text must not be selectable");
    await titleRow.locator('[aria-label="Показать Заголовок"]').click();
    assert.equal(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layers.title),true);
    const orderBefore=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layerOrder);
    await page.evaluate(()=>window.AnonsEditor.moveLayer("title",1));
    const orderAfter=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layerOrder);
    assert.notDeepEqual(orderAfter,orderBefore,"Layer reordering changes the saved scene order");
    await page.evaluate(()=>window.AnonsEditor.moveLayer("title",-1));
    assert.deepEqual(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].layerOrder),orderBefore);

    const originalLayerKey=directKey;
    await page.locator('[data-layer-key="'+originalLayerKey+'"] .layer-row-name').click();
    await page.locator("#layer-copy").click();
    assert.equal(await page.locator(".layer-stack-row").count(),8);
    const figuresAfterCopy=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements);
    const copyKey="graphic:"+figuresAfterCopy[1].id;
    await page.locator('[data-layer-key="'+copyKey+'"] .layer-row-name').click();
    await page.locator("#layer-rename-input").fill("Важный символ");
    await page.locator("#layer-rename-save").click();
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements[1].label)),
      "Важный символ");
    await page.locator('[data-layer-key="'+originalLayerKey+'"] .layer-row-check').check();
    await page.locator('[data-layer-key="'+copyKey+'"] .layer-row-check').check();
    await page.locator("#layer-group").click();
    const groups=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements.map(e=>e.groupId));
    assert.ok(groups[0]&&groups[0]===groups[1],"Grouped figures share one group ID");
    await page.locator('[data-layer-key="'+copyKey+'"] .layer-row-name').click();
    const beforeGroup=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements.map(g=>g.x));
    await page.evaluate(key=>{
      const current=window.AnonsEditor.getSnapshot().cards[0].graphicElements.find(g=>"graphic:"+g.id===key);
      window.AnonsEditor.transformDirect(key,{x:current.x-5},"group-test");
    },copyKey);
    const afterGroup=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements.map(g=>g.x));
    assert.notEqual(beforeGroup[0],afterGroup[0],"Moving grouped figures also moves sibling");
    assert.notEqual(beforeGroup[1],afterGroup[1]);
    await page.locator("#layer-ungroup").click();
    assert.ok((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements))
      .every(g=>!g.groupId),"Ungroup clears metadata without deleting shapes");
    await page.locator('[data-layer-key="'+copyKey+'"] [aria-label="Скрыть Важный символ"]').click();
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements[1].hidden)),true);
    await page.locator('[data-layer-key="'+copyKey+'"] [aria-label="Показать Важный символ"]').click();
    if(width<=760)await page.locator('[data-workspace-view="edit"]').click();
    await page.locator("#graphic-list button").last().click();
    await page.locator("#graphic-remove").click();
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements)).length,1,
      "Deleting duplicated figure preserves the original");
    if(width<=760)await page.locator('[data-workspace-view="preview"]').click();
    await page.locator(".preview-stage").screenshot({
      path:join(editorScreenshotDir,"direct-canvas-"+width+".png"),animations:"disabled"
    });
    const bitmapBeforeClose=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await directEnable.uncheck();
    assert.equal(await page.locator(".direct-selection-outline").isVisible(),false,
      "Object handles disappear when direct editing is disabled");
    assert.equal(await page.locator("#poster").evaluate(c=>c.toDataURL("image/png")),bitmapBeforeClose,
      "Disabling the interaction UI cannot change the downloaded bitmap");
    if(width<=760)await page.locator('[data-workspace-view="edit"]').click();
    await page.locator("#duplicate-card").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),2);
    // A copied card must own its own graphic array and geometry objects.
    await page.locator("#highlight-icon-0").selectOption("dot");
    assert.deepEqual((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].highlightIcons)),
      ["check","star","diamond"],"Changing a duplicated card cannot change original highlight icons");
    await page.locator("#graphic-list button").first().click();
    await page.locator("#graphic-remove").click();
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].graphicElements)).length,0);
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements)).length,1);
    await page.locator("#undo").click();
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[1].graphicElements)).length,1);
    await page.locator("#card-list [role=tab]").first().click();
    await page.locator("#card-list [role=tab]").last().click();
    // Return to a single card before existing card lifecycle checks.
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#remove-card").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),1);
    assert.equal((await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements)).length,1);
    await page.locator("#add-card").click();
    assert.equal(await page.locator("#card-list [role=tab]").count(),2);
    assert.equal(await page.locator("#title").inputValue(),"Новая карточка");
    await page.locator("#title").fill("Вторая карточка");
    await page.locator("#card-list [role=tab]").first().click();
    assert.equal(await page.locator("#title").inputValue(),"Новости моего проекта","First card text stays separate");
    await page.locator("#card-list [role=tab]").last().click();
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка","Second card text persists");
    // Reordering cards changes ZIP order but keeps the whole card intact and
    // participates in the same reversible history as other editor operations.
    assert.equal(await page.locator("#card-move-right").isDisabled(),true);
    await page.locator("#card-move-left").click();
    assert.deepEqual(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards.map(c=>c.title)),
      ["Вторая карточка","Новости моего проекта"]);
    assert.equal(await page.locator("#card-move-left").isDisabled(),true);
    await page.locator("#undo").click();
    assert.deepEqual(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards.map(c=>c.title)),
      ["Новости моего проекта","Вторая карточка"]);
    await page.locator("#redo").click();
    assert.deepEqual(await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards.map(c=>c.title)),
      ["Вторая карточка","Новости моего проекта"]);
    await page.locator("#undo").click();
    assert.equal(await page.locator("#title").inputValue(),"Вторая карточка");
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
    await page.locator("#card-list [role=tab]").first().click();
    assert.equal(await page.locator("#title-font").inputValue(),"georgia",
      "Per-card font style survives browser reload");
    assert.equal(await page.locator("#decoration-level").inputValue(),"subtle");
    assert.equal(await page.locator("#text-spacing").inputValue(),"balanced");
    assert.equal(await page.locator("#title-offset-x").inputValue(),"6");
    assert.equal(await page.locator("#composition").inputValue(),"headline");
    assert.equal(await page.locator("#highlight-style").inputValue(),"separated");
    assert.equal(await page.locator("#featured-highlight").inputValue(),"1");
    assert.deepEqual(await page.locator("[data-highlight-icon]").evaluateAll(els=>els.map(el=>el.value)),
      ["check","star","diamond"],"Highlight settings survive reload");
    assert.equal(await page.locator("#graphic-list button").count(),1,
      "Graphic overlays survive browser reload");
    await page.locator("#card-list [role=tab]").last().click();
    if(width<=760){
      await page.locator("#editor-show-preview").click();
      assert.equal(await page.locator("#editor-preview").isVisible(),true);
      assert.equal(await page.locator("#editor-controls").isVisible(),false);
      assert.equal(await page.locator('[data-workspace-view="preview"]').getAttribute("aria-pressed"),"true");
      assert.equal(await page.locator('[data-workspace-view="preview"]').evaluate(el=>el===document.activeElement),true,
        "Preview action restores focus to the visible toolbar");
      await page.locator('[data-workspace-view="edit"]').click();
      assert.equal(await page.locator("#title").inputValue(),"Вторая карточка",
        "Returning to settings preserves editor state");
      assert.equal(await page.locator("#editor-controls").isVisible(),true);
      await page.locator('[data-workspace-view="preview"]').click();
      // Mobile shortcut must invoke the same export handler as the desktop button.
      assert.equal(await page.locator("#editor-mobile-download").isVisible(),true);
      const [mobilePng]=await Promise.all([
        page.waitForEvent("download"),page.locator("#editor-mobile-download").click()
      ]);
      assert.match(mobilePng.suggestedFilename(),/\.png$/i);
      assert.ok((await readFile(await mobilePng.path())).length>10000);
      assert.equal(await page.locator("#editor-preview").isVisible(),true);
    }
    const [zipDownload]=await Promise.all([page.waitForEvent("download"),page.locator("#export-all").click()]);
    assert.match(zipDownload.suggestedFilename(),/\.zip$/);
    const zipBytes=await readFile(await zipDownload.path());
    assert.equal(zipBytes.readUInt32LE(0),0x04034b50,"ZIP signature");
    assert.ok(zipBytes.includes(Buffer.from("anons-card-01.png")));
    assert.ok(zipBytes.includes(Buffer.from("anons-card-02.png")));
    assert.ok(zipBytes.length>30000,"ZIP contains rendered PNG files");
    assert.equal(await page.locator("#export-all .ui-icon").count(),1,
      "Downloading ZIP preserves the restored SVG button icon");
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
      const photoHandle=await page.evaluate(()=>window.AnonsEditor.getDirectTargets().items.find(t=>t.key==="photo"));
      assert.equal(photoHandle?.type,"photo","Imported photo is available for direct positioning");
      const photoBitmap=await page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
      assert.equal(await page.evaluate(()=>window.AnonsEditor.transformDirect("photo",{x:12,y:-8},"photo-test")),true);
      await page.waitForFunction(previous=>document.querySelector("#poster").toDataURL("image/png")!==previous,photoBitmap);
      const movedPhoto=await page.evaluate(()=>window.AnonsEditor.getSnapshot().cards[
        window.AnonsEditor.getSnapshot().activeCard].layerOffsets.photo);
      assert.equal(movedPhoto.x,12);
      assert.equal(movedPhoto.y,-8);
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
    assert.equal(await personal.locator("#manual-customer-number").count(),1);
    assert.equal(await personal.locator("#manual-account-orders").count(),1);
    assert.equal(await personal.locator("#manual-admin-panel").count(),1);
    assert.equal(await personal.locator("#manual-admin-panel").isHidden(),true,
      "Owner approval dashboard is never visible to guests");

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
    // Capture the normal, unauthenticated preview before simulating paid
    // export failures so visual review never shows an artificial error toast.
    await page.locator(".preview-panel").screenshot({
      path:join(editorScreenshotDir,"preview-"+width+".png"),animations:"disabled"
    });
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

    await context.close();
    console.log("PASS Anons Studio browser preview, editor, storage, PNG and responsive width="+width);
  }
  // The latest mobile navigation and homepage examples must work at narrow
  // phone width and tablet/desktop-mode widths, without overwriting a draft.
  for(const width of [360,980]){
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage();
    await page.route("https://fonts.googleapis.com/**",route=>route.abort());
    await page.route("https://fonts.gstatic.com/**",route=>route.abort());
    await page.goto("http://127.0.0.1:"+port+"/",{waitUntil:"domcontentloaded"});
    assert.equal(await page.locator(".quick-start-card").count(),4);
    assert.ok(await page.locator("#mobile-menu-toggle").isVisible(),
      "Compact navigation is available at width "+width);
    assert.equal(await page.locator("#primary-navigation").isVisible(),false);
    await page.locator("#mobile-menu-toggle").click();
    assert.equal(await page.locator("#primary-navigation").isVisible(),true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#primary-navigation").isVisible(),false);
    await page.waitForFunction(()=>document.getElementById("whats-new-dialog")?.open);
    await page.locator("#whats-new-dismiss").click();
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),
      "Quick-start page has no horizontal overflow at "+width);
    await page.locator('.quick-start-card[href="./editor.html?preset=event"]').click();
    await page.waitForURL(/\/editor\.html$/);
    assert.equal(await page.locator("#title").inputValue(),"Не пропустите встречу",
      "First-time editor opens the selected example");
    assert.equal(await page.locator('[data-preset="event"]').getAttribute("aria-pressed"),"true");
    await page.locator("#title").fill("Мой сохранённый черновик");
    await page.goto("http://127.0.0.1:"+port+"/editor.html?preset=notice",
      {waitUntil:"domcontentloaded"});
    assert.equal(await page.locator("#title").inputValue(),"Мой сохранённый черновик",
      "Following a new example must never replace an existing draft");
    assert.equal(await page.locator('[data-preset="notice"].preset-suggested').count(),1,
      "The requested preset is visually indicated without modifying the draft");
    await context.close();
  }
  console.log("PASS homepage quick-start, protected drafts and tablet/mobile navigation");
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

  // Stage 5: personal styles are independent of project text, uploaded images,
  // account billing and the editor's multi-card state. Exercise both layouts.
  for(const width of [390,1440]){
    const personalContext=await browser.newContext({viewport:{width,height:920}});
    const personalPage=await personalContext.newPage();
    const personalErrors=[];
    personalPage.on("pageerror",error=>personalErrors.push(error.message));
    await personalPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await personalPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await personalPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await personalPage.locator("#personal-styles").count(),1);
    assert.equal(await personalPage.locator("#personal-style-cloud-refresh").isHidden(),true,
      "Guests never see authenticated cloud actions");
    assert.equal(await personalPage.locator("#personal-style-cloud-import").isHidden(),true,
      "Guest styles remain local until verified account and explicit import");
    assert.match(await personalPage.locator("#personal-style-scope").textContent(),/Только этот браузер/);

    assert.equal(await personalPage.evaluate(()=>typeof window.AnonsEditor?.getStyleSnapshot),"function");
    assert.equal(await personalPage.evaluate(()=>typeof window.AnonsEditor?.applyStyleSnapshot),"function");
    const visual=await personalPage.evaluate(()=>window.AnonsEditor.getStyleSnapshot());
    assert.equal(visual.template,"aurora");
    for(const key of ["title","description","points","project","imageData","preset","cards","ratio"]){
      assert.equal(Object.hasOwn(visual,key),false,"Personal style cannot store "+key);
    }
    await personalPage.locator("#personal-style-name").fill("Мой стиль проверки");
    await personalPage.locator("#personal-style-save").click();
    assert.match(await personalPage.locator("#personal-style-status").textContent(),/сохранён/);
    assert.equal(await personalPage.locator("#personal-style-count").textContent(),"1 из 20");
    const stored=await personalPage.evaluate(()=>JSON.parse(localStorage.getItem("anons-studio:personal-styles:v1")));
    assert.equal(stored.length,1);
    assert.equal(stored[0].style.template,"aurora");
    assert.equal(stored[0].style.title,undefined,"Stored style excludes user content");
    const selectedId=stored[0].id;
    await personalPage.reload({waitUntil:"domcontentloaded"});
    await personalPage.locator("#personal-style-select").selectOption(selectedId);
    await personalPage.locator("#template-select").selectOption("pulse");
    await personalPage.locator("#title").fill("Контент останется без изменений");
    await personalPage.locator("#personal-style-apply").click();
    const applied=await personalPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(applied.cards[applied.activeCard].template,"aurora","Saved style restores layout");
    assert.equal(applied.cards[applied.activeCard].title,"Контент останется без изменений","Style does not copy text");
    assert.ok(await personalPage.locator("#undo").isEnabled(),"Applying style adds an undo checkpoint");
    await personalPage.locator("#undo").click();
    assert.equal(await personalPage.locator("#template-select").inputValue(),"pulse",
      "Undo restores the previous visual style");
    assert.equal(await personalPage.locator("#title").inputValue(),"Контент останется без изменений");
    await personalPage.locator("#redo").click();
    assert.equal(await personalPage.locator("#template-select").inputValue(),"aurora");
    await personalPage.locator("#personal-style-name").fill("Обновлённое название");
    await personalPage.locator("#personal-style-rename").click();
    assert.equal(await personalPage.locator("#personal-style-select option").nth(1).textContent(),"Обновлённое название");
    personalPage.once("dialog",dialog=>dialog.accept());
    await personalPage.locator("#personal-style-delete").click();
    assert.equal(await personalPage.locator("#personal-style-count").textContent(),"0 из 20");
    assert.equal(await personalPage.locator("#title").inputValue(),"Контент останется без изменений",
      "Removing saved preset does not modify the canvas");
    assert.deepEqual(personalErrors,[],"Personal styles page errors: "+personalErrors.join("; "));
    await personalContext.close();
  }

  // Stage 7: brand kit saves current identity and applies it to all cards as
  // a single reversible edit. It does not copy any publication text.
  for(const width of [390,1440]){
    const brandContext=await browser.newContext({viewport:{width,height:920}});
    const brandPage=await brandContext.newPage();
    const errors=[];
    brandPage.on("pageerror",error=>errors.push(error.message));
    await brandPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await brandPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await brandPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await brandPage.locator("#brand-kit").count(),1,"Brand kit is mounted in editor");
    assert.equal(await brandPage.locator("#brand-kit-identity").textContent(),
      "Коллекция этого браузера · без облачной синхронизации");
    const original=await brandPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(typeof (await brandPage.evaluate(()=>window.AnonsEditor?.getBrandKitSnapshot())),"object");
    const before=original.cards[0].title;
    await brandPage.locator("#brand-kit-name").fill("Фирменный тестовый набор");
    await brandPage.locator("#brand-kit-save").click();
    assert.equal(await brandPage.locator("#brand-kit-count").textContent(),"1 из 12");
    const stored=await brandPage.evaluate(()=>JSON.parse(
      localStorage.getItem("anons-studio:brand-kits:v1:guest")));
    assert.equal(stored.length,1);
    assert.equal(stored[0].kit.project,original.project);
    assert.equal(stored[0].kit.title,undefined,"Brand kits do not capture post text");
    assert.equal(stored[0].kit.imageData,undefined,"Brand kits never capture uploaded photos");
    await brandPage.locator("#add-card").click();
    await brandPage.locator("#title").fill("Вторая карточка сохраняется");
    await brandPage.locator('[data-theme="sunset"]').click();
    await brandPage.locator("#project").fill("ДРУГОЙ БРЕНД");
    assert.equal(await brandPage.locator("#theme-label").textContent(),
      "Закат — тёплый и выразительный");
    await brandPage.locator("#brand-kit-list").selectOption(stored[0].id);
    await brandPage.locator('input[name="brand-kit-scope"][value="all"]').check();
    await brandPage.locator("#brand-kit-apply").click();
    let brand=await brandPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(brand.project,original.project,"Brand name is restored for the publication");
    assert.equal(brand.cards.length,2);
    assert.equal(brand.cards[0].theme,"ultraviolet");
    assert.equal(brand.cards[1].theme,"ultraviolet");
    assert.equal(brand.cards[0].title,before,"First card content remains intact");
    assert.equal(brand.cards[1].title,"Вторая карточка сохраняется","Second card content remains intact");
    assert.ok(await brandPage.locator("#undo").isEnabled());
    await brandPage.locator("#undo").click();
    brand=await brandPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(brand.project,"ДРУГОЙ БРЕНД","Undo restores prior brand identity");
    assert.equal(brand.cards[1].theme,"sunset","Undo restores individual card theme");
    await brandPage.locator("#redo").click();
    brand=await brandPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(brand.project,original.project,"Redo reapplies brand identity");
    assert.equal(brand.cards[1].theme,"ultraviolet");
    await brandPage.reload({waitUntil:"domcontentloaded"});
    assert.equal(await brandPage.locator("#brand-kit-count").textContent(),"1 из 12",
      "Saved brand kit survives reload");
    assert.deepEqual(errors,[],"Brand kit page errors: "+errors.join("; "));
    await brandContext.close();
  }

  // Business templates are real scene variants. Authentication gates their
  // selection, while the server independently protects watermark-free export.
  const businessContext=await browser.newContext({viewport:{width:390,height:820}});
  const businessPage=await businessContext.newPage();
  const businessErrors=[];
  businessPage.on("pageerror",e=>businessErrors.push(e.message));
  await businessPage.route("https://fonts.googleapis.com/**",r=>r.abort());
  await businessPage.route("https://fonts.gstatic.com/**",r=>r.abort());
  await businessPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
  for(const id of ["business-brief","business-pitch","business-report"]){
    assert.equal(await businessPage.locator('#template-select option[value="'+id+'"]').count(),1);
    assert.equal(await businessPage.locator('#template-select option[value="'+id+'"]').isDisabled(),true);
  }
  const free=await businessPage.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].template);
  await businessPage.evaluate(()=>{
    const select=document.getElementById("template-select");
    select.value="business-brief";
    select.dispatchEvent(new Event("change",{bubbles:true}));
  });
  assert.equal(await businessPage.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].template),free,
    "Free accounts cannot activate Business templates through normal controls");
  await businessPage.evaluate(()=>{
    window.dispatchEvent(new CustomEvent("anons:access",{detail:{premium:true,plan:"basic"}}));
  });
  await businessPage.waitForFunction(()=>document.querySelector("#template-visual-count")?.textContent==="Доступно 9 из 21");
  assert.equal(await businessPage.locator('[data-preview-template="business-brief"]').isDisabled(),false);
  assert.equal(await businessPage.locator('[data-preview-template="pro-campaign"]').isDisabled(),true);
  for(const [id,background] of [
    ["business-brief","#071f32"],["business-pitch","#271836"],["business-report","#f5f8fc"]
  ]){
    await businessPage.locator("#template-select").selectOption(id);
    assert.equal(await businessPage.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].template),id);
    const bg=await businessPage.evaluate(()=>{
      const snapshot=window.AnonsEditor.getSnapshot();
      return window.AnonsScene.layout(snapshot,snapshot.cards[0]).palette.bg1;
    });
    assert.equal(bg,background,"Each Business design receives its own palette");
  }
  await businessPage.evaluate(()=>{
    window.dispatchEvent(new CustomEvent("anons:access",{detail:{premium:false,plan:"free"}}));
  });
  assert.equal(await businessPage.locator('#template-select option[value="business-report"]').isDisabled(),true);
  assert.deepEqual(businessErrors,[],"Business template page errors");
  await businessContext.close();


  // Stage 9: Pro templates and batch publication workflows stay locked
  // on Free/Business and only open on Pro/Studio. Edits are reversible.
  for(const width of [390,1440]){
    const proContext=await browser.newContext({viewport:{width,height:960}});
    const proPage=await proContext.newPage();
    const proErrors=[];
    proPage.on("pageerror",error=>proErrors.push(error.message));
    await proPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await proPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await proPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    const original=await proPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    for(const id of ["pro-campaign","pro-magazine","pro-impact"]){
      assert.equal(await proPage.locator('#template-select option[value="'+id+'"]').isDisabled(),true);
    }
    assert.ok(await proPage.locator("#pro-series-generate").isDisabled());
    await proPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{premium:true,plan:"basic"}})));
    assert.ok(await proPage.locator("#pro-series-generate").isDisabled(),
      "Business subscription cannot use Pro batch tools");
    assert.equal(await proPage.locator('#template-select option[value="pro-campaign"]').isDisabled(),true);
    await proPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{premium:true,plan:"pro"}})));
    assert.ok(await proPage.locator("#pro-series-generate").isEnabled());
    assert.equal(await proPage.locator('#template-select option[value="pro-campaign"]').isDisabled(),false);
    const beforeTitle=original.cards[0].title;
    proPage.once("dialog",dialog=>dialog.accept());
    await proPage.locator("#pro-series-generate").click();
    let snapshot=await proPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(snapshot.cards.length,3,"Pro batch wizard creates two additional cards");
    assert.equal(snapshot.cards[0].title,beforeTitle,"Wizard retains original card content");
    assert.equal(snapshot.cards[1].template,"pro-campaign");
    assert.equal(snapshot.cards[2].template,"pro-magazine");
    await proPage.locator("#pro-series-template").selectOption("pro-impact");
    proPage.once("dialog",dialog=>dialog.accept());
    await proPage.locator("#pro-series-apply").click();
    snapshot=await proPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(snapshot.cards.length,3);
    assert.ok(snapshot.cards.every(card=>card.template==="pro-impact"),
      "Pro bulk style applies to every card");
    assert.equal(snapshot.cards[0].title,beforeTitle,"Pro bulk design does not replace text");
    await proPage.locator("#undo").click();
    snapshot=await proPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(snapshot.cards[1].template,"pro-campaign",
      "One undo restores the pre-bulk individual templates");
    await proPage.locator("#undo").click();
    snapshot=await proPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(snapshot.cards.length,1,"Second undo restores original card count");
    assert.equal(snapshot.cards[0].title,beforeTitle);
    await proPage.locator("#redo").click();
    snapshot=await proPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(snapshot.cards.length,3,"Redo restores Pro batch");
    await proPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{premium:false,plan:"free"}})));
    assert.ok(await proPage.locator("#pro-series-generate").isDisabled());
    assert.deepEqual(proErrors,[],"Pro workflow page errors: "+proErrors.join("; "));
    await proContext.close();
  }


  // Stage 10: Studio has three unique palettes and an isolated workspace.
  // A fabricated client access event must never enable real server-side writes.
  for(const width of [390,1440]){
    const studioContext=await browser.newContext({viewport:{width,height:960}});
    const studioPage=await studioContext.newPage();
    const errors=[];
    studioPage.on("pageerror",err=>errors.push(err.message));
    await studioPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await studioPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await studioPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await studioPage.locator("#studio-workspace").count(),1);
    assert.ok(await studioPage.locator("#studio-apply-brand").isDisabled());
    for(const id of ["studio-identity","studio-launch","studio-portfolio"]){
      assert.ok(await studioPage.locator('#template-select option[value="'+id+'"]').isDisabled());
    }
    await studioPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{plan:"pro",premium:true}})));
    assert.ok(await studioPage.locator('#template-select option[value="studio-launch"]').isDisabled());
    await studioPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{plan:"studio",premium:true}})));
    for(const [id,bg] of [
      ["studio-identity","#11182d"],
      ["studio-launch","#2b1545"],
      ["studio-portfolio","#ecf4f5"]
    ]){
      await studioPage.locator("#template-select").selectOption(id);
      const snapshot=await studioPage.evaluate(()=>window.AnonsEditor.getSnapshot());
      assert.equal(snapshot.cards[snapshot.activeCard].template,id);
      const palette=await studioPage.evaluate(()=>{
        const snap=window.AnonsEditor.getSnapshot();
        return window.AnonsScene.layout(snap,snap.cards[snap.activeCard]).palette.bg1;
      });
      assert.equal(palette,bg);
    }
    assert.ok(await studioPage.locator("#studio-apply-brand").isDisabled(),
      "Fake client plan with no authenticated user must never enable Studio cloud writes");

    await studioPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{plan:"agency",premium:true}})));
    assert.equal(await studioPage.locator('#template-select option[value="agency-social"]').isDisabled(),false);
    assert.equal(await studioPage.locator('#template-select option[value="ultimate-cinema"]').isDisabled(),true);
    for(const [id,bg] of [
      ["agency-brand","#092a39"],["agency-social","#171c38"],["agency-showcase","#f5eee8"]
    ]){
      await studioPage.locator("#template-select").selectOption(id);
      const palette=await studioPage.evaluate(()=>{
        const snap=window.AnonsEditor.getSnapshot();
        return window.AnonsScene.layout(snap,snap.cards[snap.activeCard]).palette.bg1;
      });
      assert.equal(palette,bg);
    }
    await studioPage.evaluate(()=>window.dispatchEvent(
      new CustomEvent("anons:access",{detail:{plan:"ultimate",premium:true}})));
    for(const [id,bg] of [
      ["ultimate-signature","#12151c"],["ultimate-cinema","#0f133e"],["ultimate-vision","#f0f8f8"]
    ]){
      await studioPage.locator("#template-select").selectOption(id);
      const palette=await studioPage.evaluate(()=>{
        const snap=window.AnonsEditor.getSnapshot();
        return window.AnonsScene.layout(snap,snap.cards[snap.activeCard]).palette.bg1;
      });
      assert.equal(palette,bg);
    }
    assert.ok(await studioPage.locator("#studio-apply-brand").isDisabled(),
      "Fake plan event without Auth cannot grant bulk project writes");
    assert.deepEqual(errors,[],"Studio browser errors: "+errors.join("; "));
    await studioContext.close();

  }

  // Stage 4: confirm poster-quality presets, bounded typography, and vector
  // frames really modify the Canvas while retaining publication content.
  for(const width of [390,1440]){
    const qualityContext=await browser.newContext({
      viewport:{width,height:960},acceptDownloads:true
    });
    const qualityPage=await qualityContext.newPage();
    const stage4Errors=[];
    qualityPage.on("pageerror",e=>stage4Errors.push(e.message));
    await qualityPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await qualityPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await qualityPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await qualityPage.locator(".type-preset-grid button").count(),3);
    assert.equal(await qualityPage.locator("#design-audit-badge").count(),1);
    assert.equal(await qualityPage.locator("#frame-style option").count(),3);
    const source=await qualityPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    const originalImage=await qualityPage.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await qualityPage.locator('[data-type-style="editorial"]').click();
    const afterStyle=await qualityPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(afterStyle.cards[0].titleFont,"georgia");
    assert.equal(afterStyle.cards[0].titleWeight,700);
    assert.equal(afterStyle.cards[0].titleTracking,1);
    assert.equal(afterStyle.cards[0].frameStyle,"hairline");
    assert.equal(afterStyle.cards[0].title,source.cards[0].title);
    assert.equal(afterStyle.cards[0].description,source.cards[0].description);
    assert.equal(afterStyle.cards[0].points,source.cards[0].points);
    assert.equal(afterStyle.imageData,source.imageData);
    await qualityPage.waitForFunction(previous=>
      document.querySelector("#poster").toDataURL("image/png")!==previous,originalImage);
    assert.equal(await qualityPage.locator('[data-type-style="editorial"]').getAttribute("aria-pressed"),"true");
    await qualityPage.locator("#advanced-panel").evaluate(el=>el.open=true);
    await qualityPage.locator("#title-weight").selectOption("900");
    await qualityPage.locator("#title-tracking").evaluate(el=>{
      el.value="3";el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await qualityPage.locator("#frame-style").selectOption("corners");
    let styled=await qualityPage.evaluate(()=>{
      const snapshot=window.AnonsEditor.getSnapshot();
      const card=snapshot.cards[snapshot.activeCard];
      const scene=window.AnonsScene.layout(snapshot,card);
      return {card,plan:{titleWeight:scene.titleWeight,titleTracking:scene.titleTracking,
        frameStyle:scene.frameStyle},frame:window.AnonsScene.frameGeometry(scene)};
    });
    assert.equal(styled.plan.titleWeight,900);
    assert.equal(styled.plan.titleTracking,3);
    assert.equal(styled.plan.frameStyle,"corners");
    assert.equal(styled.frame.segments.length,8);
    await qualityPage.locator("#undo").click();
    assert.equal((await qualityPage.evaluate(()=>window.AnonsEditor.getSnapshot())).cards[0].frameStyle,"hairline",
      "Decorative effect is undoable");
    await qualityPage.locator("#redo").click();
    await qualityPage.reload({waitUntil:"domcontentloaded"});
    styled=await qualityPage.evaluate(()=>{
      const snapshot=window.AnonsEditor.getSnapshot();
      const card=snapshot.cards[snapshot.activeCard];
      return {title:card.title,weight:card.titleWeight,tracking:card.titleTracking,frame:card.frameStyle};
    });
    assert.equal(styled.weight,900);
    assert.equal(styled.tracking,3);
    assert.equal(styled.frame,"corners");
    assert.equal(styled.title,source.cards[0].title);
    // Explicitly exceed the three-row limit to trigger a useful warning
    // without deleting or silently replacing any of the user's text.
    await qualityPage.locator("#points").fill("Первое изменение\\nВторое изменение\\nТретье изменение\\nЧетвёртое изменение".replaceAll("\\n","\n"));
    assert.equal(await qualityPage.locator("#design-audit-badge").getAttribute("data-state"),"warning");
    assert.match(await qualityPage.locator("#design-audit-list").textContent(),/только первые три пункта/);
    const newAudit=await qualityPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(newAudit.cards[0].points.split("\n").length,4,"Audit warns without deleting fourth point");
    await qualityPage.locator("#points").fill("Первое изменение\\nВторое изменение".replaceAll("\\n","\n"));
    assert.equal(await qualityPage.locator("#design-audit-badge").getAttribute("data-state"),"ok");
    const shotsDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(shotsDir,{recursive:true});
    if(width<=760)await qualityPage.locator('[data-workspace-view="preview"]').click();
    await qualityPage.locator("#editor-preview").screenshot({
      path:join(shotsDir,"stage4-poster-"+width+".png"),animations:"disabled"
    });
    if(width<=760)await qualityPage.locator('[data-workspace-view="edit"]').click();
    await qualityPage.locator(".type-studio-panel").screenshot({
      path:join(shotsDir,"stage4-typography-"+width+".png"),animations:"disabled"
    });
    assert.deepEqual(stage4Errors,[],"Stage 4 browser errors "+stage4Errors.join("; "));
    await qualityContext.close();
  }


  // Stage 5: actual photo pixels, crop, filters, undo, persistence and mobile UI.
  // Synthetic image only; no user photos are sent to the test runner.
  for(const width of [390,1440]){
    const photoContext=await browser.newContext({viewport:{width,height:960},acceptDownloads:true});
    const photoPage=await photoContext.newPage();
    const photoErrors=[];
    photoPage.on("pageerror",e=>photoErrors.push(e.message));
    await photoPage.route("https://fonts.googleapis.com/**",r=>r.abort());
    await photoPage.route("https://fonts.gstatic.com/**",r=>r.abort());
    await photoPage.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await photoPage.locator("#photo-zoom").count(),1);
    assert.equal(await photoPage.locator("[data-photo-preset]").count(),3);
    const data=await photoPage.evaluate(()=>{
      const canvas=document.createElement("canvas");
      canvas.width=360;canvas.height=260;
      const ctx=canvas.getContext("2d");
      ctx.fillStyle="#fc662f";ctx.fillRect(0,0,180,260);
      ctx.fillStyle="#176dd9";ctx.fillRect(180,0,180,260);
      ctx.fillStyle="#f7d13b";ctx.fillRect(75,50,90,160);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await photoPage.locator("#upload").setInputFiles({
      name:"synthetic-photo.png",mimeType:"image/png",buffer:Buffer.from(data,"base64")
    });
    await photoPage.waitForFunction(()=>window.AnonsEditor.getSnapshot().imageData.startsWith("data:image/"));
    const source=await photoPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    const baseImage=await photoPage.locator("#poster").evaluate(el=>el.toDataURL("image/png"));
    await photoPage.locator("#photo-zoom").evaluate(input=>{
      input.value="180";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await photoPage.locator("#photo-focus-x").evaluate(input=>{
      input.value="15";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await photoPage.locator("#photo-focus-y").evaluate(input=>{
      input.value="85";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await photoPage.locator("[data-photo-preset='vivid']").click();
    assert.equal(await photoPage.locator("[data-photo-preset='vivid']").getAttribute("aria-pressed"),"true");
    await photoPage.locator("#photo-zoom").evaluate(input=>{
      input.value="180";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await photoPage.locator("#photo-focus-x").evaluate(input=>{
      input.value="15";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await photoPage.locator("#photo-focus-y").evaluate(input=>{
      input.value="85";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    await photoPage.waitForFunction(previous=>document.querySelector("#poster").toDataURL("image/png")!==previous,baseImage);
    const changed=await photoPage.evaluate(()=>{
      const snap=window.AnonsEditor.getSnapshot();
      const card=snap.cards[snap.activeCard];
      const scene=window.AnonsScene.layout(snap,card);
      return {card,photo:scene.photo};
    });
    assert.equal(changed.card.photoZoom,180);
    assert.equal(changed.card.photoFocusX,15);
    assert.equal(changed.card.photoFocusY,85);
    assert.equal(changed.photo.overlay.color,"#ffb16a");
    assert.equal(changed.photo.saturation,145);
    assert.equal(changed.card.title,source.cards[0].title);
    assert.equal(changed.card.description,source.cards[0].description);
    assert.equal(await photoPage.locator("#photo-zoom-value").textContent(),"180%");
    await photoPage.reload({waitUntil:"domcontentloaded"});
    const saved=await photoPage.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(saved.cards[0].photoZoom,180);
    assert.equal(saved.cards[0].photoFocusX,15);
    assert.equal(saved.cards[0].photoFocusY,85);
    assert.equal(saved.cards[0].photoOverlay,"warm");
    await photoPage.locator("#photo-reset").click();
    assert.equal((await photoPage.evaluate(()=>window.AnonsEditor.getSnapshot())).cards[0].photoZoom,100);
    await photoPage.locator("#undo").click();
    assert.equal((await photoPage.evaluate(()=>window.AnonsEditor.getSnapshot())).cards[0].photoZoom,180);
    await photoPage.locator("#redo").click();
    assert.equal((await photoPage.evaluate(()=>window.AnonsEditor.getSnapshot())).cards[0].photoZoom,100);
    await photoPage.locator("[data-photo-preset='cinema']").click();
    assert.equal(await photoPage.locator("#photo-overlay").inputValue(),"blue");
    await photoPage.locator("#photo-contrast").evaluate(input=>{
      input.value="135";input.dispatchEvent(new Event("input",{bubbles:true}));
    });
    assert.equal((await photoPage.evaluate(()=>window.AnonsEditor.getSnapshot())).cards[0].photoContrast,135);
    const shotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(shotDir,{recursive:true});
    await photoPage.locator(".photo-studio-panel").screenshot({
      path:join(shotDir,"stage5-photo-tools-"+width+".png"),animations:"disabled"
    });
    if(width<=760)await photoPage.locator('[data-workspace-view="preview"]').click();
    await photoPage.locator("#editor-preview").screenshot({
      path:join(shotDir,"stage5-photo-poster-"+width+".png"),animations:"disabled"
    });
    assert.deepEqual(photoErrors,[],"Stage 5 photo editor should not throw");
    await photoContext.close();
  }


  // Stage 6: on-canvas object resizing, alignment guides and zoom do not
  // mutate export pixels. Browser-test both touch-sized and desktop layouts.
  for(const width of [390,1440]){
    const stage6Context=await browser.newContext({
      viewport:{width,height:1000},acceptDownloads:true
    });
    const stage6Page=await stage6Context.newPage();
    const directErrors=[];
    stage6Page.on("pageerror",error=>directErrors.push(error.message));
    await stage6Page.route("https://fonts.googleapis.com/**",route=>route.abort());
    await stage6Page.route("https://fonts.gstatic.com/**",route=>route.abort());
    await stage6Page.goto("http://127.0.0.1:"+port+"/editor.html",
      {waitUntil:"domcontentloaded"});
    assert.equal(await stage6Page.locator("#direct-guides").count(),1);
    assert.equal(await stage6Page.locator("#direct-smart-snap").count(),1);
    assert.equal(await stage6Page.locator("#direct-preview-zoom").count(),1);
    await stage6Page.locator("#graphic-add").click();
    for(const [name,value] of [["graphic-x","46"],["graphic-y","43"],["graphic-size","12"]]){
      await stage6Page.locator("#"+name).evaluate((el,v)=>{
        el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));
      },value);
    }
    if(width<=760)await stage6Page.locator("#editor-show-preview").click();
    await stage6Page.locator("#direct-enable").check();
    assert.equal(await stage6Page.locator(".direct-alignment-line").count(),6);
    assert.equal(await stage6Page.locator(".direct-alignment-guides").isVisible(),true);
    const graphicKey=await stage6Page.evaluate(()=>{
      const s=window.AnonsEditor.getSnapshot();
      return "graphic:"+s.cards[s.activeCard].graphicElements[0].id;
    });
    await stage6Page.locator("#direct-target").selectOption(graphicKey);
    assert.equal(await stage6Page.locator(".direct-resize-handle").isVisible(),true);
    const before=await stage6Page.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await stage6Page.locator("#direct-preview-zoom").selectOption("125");
    assert.equal(await stage6Page.locator(".canvas-holder").evaluate(
      e=>e.classList.contains("direct-zoom-enlarged")),true);
    assert.equal(await stage6Page.locator("#poster").evaluate(c=>c.toDataURL("image/png")),
      before,"Changing preview zoom cannot alter the exported Canvas");
    await stage6Page.locator("#direct-preview-zoom").selectOption("100");
    await stage6Page.locator(".direct-resize-handle").scrollIntoViewIfNeeded();
    const sizeBefore=await stage6Page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].size);
    const resizeBounds=await stage6Page.locator(".direct-resize-handle").boundingBox();
    assert.ok(resizeBounds?.width>=20);
    await stage6Page.mouse.move(resizeBounds.x+resizeBounds.width/2,
      resizeBounds.y+resizeBounds.height/2);
    await stage6Page.mouse.down();
    await stage6Page.mouse.move(resizeBounds.x+resizeBounds.width/2+36,
      resizeBounds.y+resizeBounds.height/2+36,{steps:5});
    await stage6Page.mouse.up();
    const sizeAfter=await stage6Page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].size);
    assert.ok(sizeAfter>sizeBefore,
      "Dragging on-Canvas resize handle increases the figure size");
    await stage6Page.locator("#undo").evaluate(el=>el.click());
    assert.equal(await stage6Page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].size),sizeBefore);
    await stage6Page.locator("#redo").evaluate(el=>el.click());
    assert.equal(await stage6Page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].size),sizeAfter);
    await stage6Page.locator("#poster").scrollIntoViewIfNeeded();
    const actual=await stage6Page.locator("#poster").boundingBox();
    const shape=await stage6Page.locator(".direct-selection-outline").boundingBox();
    assert.ok(actual?.width>60&&shape?.width>5);
    const shapeStartX=shape.x+shape.width/2,shapeStartY=shape.y+shape.height/2;
    await stage6Page.mouse.move(shapeStartX,shapeStartY);
    await stage6Page.mouse.down();
    await stage6Page.mouse.move(shapeStartX+actual.width*.04,
      shapeStartY+actual.height*.07,{steps:6});
    assert.ok(await stage6Page.locator(".direct-alignment-line.is-snapped").count()>0,
      "Alignment guides highlight when the selection reaches the center");
    await stage6Page.mouse.up();
    const aligned=await stage6Page.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0]);
    assert.equal(aligned.x,50);
    assert.equal(aligned.y,50);
    await stage6Page.locator("#direct-guides").uncheck();
    assert.equal(await stage6Page.locator(".direct-alignment-guides").isVisible(),false);
    await stage6Page.locator("#direct-enable").uncheck();
    assert.equal(await stage6Page.locator(".direct-resize-handle").isVisible(),false);
    const shotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(shotDir,{recursive:true});
    await stage6Page.locator(".direct-editor-toolbar").screenshot({
      path:join(shotDir,"stage6-direct-controls-"+width+".png"),animations:"disabled"
    });
    await stage6Page.locator("#editor-preview").screenshot({
      path:join(shotDir,"stage6-composition-"+width+".png"),animations:"disabled"
    });
    assert.deepEqual(directErrors,[],
      "Direct manipulation should not throw: "+directErrors.join("; "));
    await stage6Context.close();
  }


  // Stage 7: atomic multi-select, alignment and distribution via actual UI.
  for(const width of [390,1440]){
    const context7=await browser.newContext({viewport:{width,height:1050},acceptDownloads:true});
    const p7=await context7.newPage();
    const errors7=[];
    p7.on("pageerror",error=>errors7.push(error.message));
    await p7.route("https://fonts.googleapis.com/**",route=>route.abort());
    await p7.route("https://fonts.gstatic.com/**",route=>route.abort());
    await p7.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await p7.locator("[data-direct-align]").count(),8);
    const figures=[
      {x:20,y:24,size:12},
      {x:48,y:42,size:12},
      {x:78,y:78,size:12}
    ];
    for(const figure of figures){
      await p7.locator("#graphic-add").click();
      for(const [id,value] of [["graphic-x",figure.x],["graphic-y",figure.y],
        ["graphic-size",figure.size]]){
        await p7.locator("#"+id).evaluate((node,value)=>{
          node.value=String(value);node.dispatchEvent(new Event("input",{bubbles:true}));
        },value);
      }
    }
    if(width<=760)await p7.locator("#editor-show-preview").click();
    await p7.locator("#direct-enable").check();
    await p7.locator(".direct-multi-list-wrap").evaluate(node=>node.open=true);
    const keys=await p7.evaluate(()=>{
      const snapshot=window.AnonsEditor.getSnapshot();
      return snapshot.cards[snapshot.activeCard].graphicElements.map(g=>"graphic:"+g.id);
    });
    assert.equal(keys.length,3);
    const pixelsBeforeSelection=await p7.locator("#poster").evaluate(el=>el.toDataURL("image/png"));
    for(const key of keys){
      await p7.locator('#direct-multi-list input[value="'+key+'"]').check();
    }
    assert.equal(await p7.locator("#direct-multi-count").textContent(),"3 выделено");
    assert.equal(await p7.locator(".direct-selection-extra").count(),2);
    assert.equal(await p7.locator('[data-direct-align="left"]').isEnabled(),true);
    assert.equal(await p7.locator("#poster").evaluate(el=>el.toDataURL("image/png")),
      pixelsBeforeSelection,"Multi selection overlays must never contaminate saved PNG");
    const positions=async()=>p7.evaluate(()=>{
      return window.AnonsEditor.getSnapshot().cards[0].graphicElements.map(g=>({
        x:g.x,y:g.y,group:g.groupId
      }));
    });
    const originalPositions=await positions();
    await p7.locator('[data-direct-align="left"]').click();
    let aligned=await positions();
    assert.deepEqual(aligned.map(g=>g.x),[20,20,20],
      "Left alignment moves three different figures as one transaction");
    await p7.locator("#undo").evaluate(node=>node.click());
    assert.deepEqual((await positions()).map(g=>g.x),originalPositions.map(g=>g.x),
      "One undo restores all previously independent positions");
    await p7.locator("#redo").evaluate(node=>node.click());
    assert.deepEqual((await positions()).map(g=>g.x),[20,20,20]);
    await p7.locator('[data-direct-align="space-y"]').click();
    aligned=await positions();
    assert.deepEqual(aligned.map(g=>g.y),[24,51,78],
      "Distribute Y spaces three object centers evenly");
    await p7.locator("#poster").focus();
    await p7.keyboard.press("ArrowRight");
    assert.deepEqual((await positions()).map(g=>g.x),[25,25,25],
      "Keyboard adjustment moves selected objects together");
    await p7.locator("#undo").evaluate(node=>node.click());
    assert.deepEqual((await positions()).map(g=>g.x),[20,20,20],
      "Group nudge is one undo step");
    await p7.locator("#direct-multi-group").click();
    const groupIds=(await positions()).map(g=>g.group);
    assert.ok(groupIds[0]&&groupIds.every(id=>id===groupIds[0]),
      "Grouping chosen graphics creates shared group IDs");
    await p7.waitForFunction(()=>
      document.querySelector('[data-direct-align="left"]')?.disabled===true);
    assert.equal(await p7.locator('[data-direct-align="left"]').isDisabled(),true,
      "Linked group geometry cannot be silently distorted");
    await p7.locator("#direct-multi-clear").click();
    assert.equal(await p7.locator("#direct-multi-count").textContent(),"0 выделено");
    await p7.locator("#direct-multi-all").click();
    const allCount=Number((await p7.locator("#direct-multi-count").textContent()).split(" ")[0]);
    assert.ok(allCount>=7,"Selectable list also includes title, description and other base objects");
    await p7.locator("#direct-multi-clear").click();
    assert.equal(await p7.locator(".direct-selection-extra").count(),0);
    const artifactsDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(artifactsDir,{recursive:true});
    await p7.locator(".direct-multi-panel").screenshot({
      path:join(artifactsDir,"stage7-multiselect-"+width+".png"),animations:"disabled"
    });
    await p7.locator(".preview-stage").screenshot({
      path:join(artifactsDir,"stage7-composition-"+width+".png"),animations:"disabled"
    });
    assert.deepEqual(errors7,[],"Multi-object composition emitted no browser errors");
    await context7.close();
  }


  // Stage 8: visual-only safe margins and atomic inset correction.
  for(const width of [390,1440]){
    const context8=await browser.newContext({viewport:{width,height:1050},acceptDownloads:true});
    const p8=await context8.newPage();
    const errors8=[];
    p8.on("pageerror",error=>errors8.push(error.message));
    await p8.route("https://fonts.googleapis.com/**",route=>route.abort());
    await p8.route("https://fonts.gstatic.com/**",route=>route.abort());
    await p8.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.deepEqual(await p8.locator("#direct-safe-margin option").evaluateAll(
      nodes=>nodes.map(n=>n.value)),["5","10","15"]);
    assert.equal(await p8.locator(".direct-safe-frame").count(),1);
    await p8.locator("#graphic-add").click();
    for(const [id,value] of [["graphic-x","6"],["graphic-y","9"],["graphic-size","12"]]){
      await p8.locator("#"+id).evaluate((node,value)=>{
        node.value=value;node.dispatchEvent(new Event("input",{bubbles:true}));
      },value);
    }
    if(width<=760)await p8.locator("#editor-show-preview").click();
    await p8.locator("#direct-safe-margin").selectOption("15");
    const posterBefore=await p8.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await p8.locator("#direct-safe-show").check();
    assert.equal(await p8.locator(".direct-safe-frame").isVisible(),true);
    assert.equal(await p8.locator(".direct-safe-frame").evaluate(el=>el.style.inset),"15%");
    assert.equal(await p8.locator("#poster").evaluate(c=>c.toDataURL("image/png")),
      posterBefore,"Safe guides are DOM overlays only and never appear in PNG");
    assert.match(await p8.locator("#direct-safe-badge").textContent(),/Проверить/);
    await p8.locator("#direct-enable").check();
    const key=await p8.evaluate(()=>{
      const s=window.AnonsEditor.getSnapshot();
      return "graphic:"+s.cards[s.activeCard].graphicElements[0].id;
    });
    await p8.locator("#direct-target").selectOption(key);
    assert.equal(await p8.locator("#direct-safe-fit").isEnabled(),true);
    const original=await p8.evaluate(()=>window.AnonsEditor.getSnapshot().cards[0].graphicElements[0]);
    const oldPosition={x:original.x,y:original.y};
    await p8.locator("#direct-safe-fit").click();
    await p8.waitForFunction(old=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].x>old,oldPosition.x);
    const fitted=await p8.evaluate(key=>{
      const scene=window.AnonsEditor.getDirectTargets();
      const item=scene.items.find(i=>i.key===key);
      const state=window.AnonsEditor.getSnapshot().cards[0].graphicElements[0];
      return {state,scene,item};
    },key);
    assert.ok(fitted.item.rect.x>=fitted.scene.width*.15-2);
    assert.ok(fitted.item.rect.y>=fitted.scene.height*.15-2);
    assert.ok(fitted.state.x>oldPosition.x&&fitted.state.y>oldPosition.y);
    assert.equal(await p8.locator("#direct-safe-fit").isDisabled(),true,
      "Fit action is disabled for a selection already inside the inset");
    await p8.locator("#undo").evaluate(el=>el.click());
    assert.deepEqual(await p8.evaluate(()=>({
      x:window.AnonsEditor.getSnapshot().cards[0].graphicElements[0].x,
      y:window.AnonsEditor.getSnapshot().cards[0].graphicElements[0].y
    })),oldPosition,"One undo restores both axes");
    await p8.locator("#redo").evaluate(el=>el.click());
    assert.equal((await p8.evaluate(()=>window.AnonsEditor.getSnapshot()
      .cards[0].graphicElements[0].x)),fitted.state.x);
    const protectedState=JSON.stringify(await p8.evaluate(()=>window.AnonsEditor.getSnapshot().cards));
    assert.equal(await p8.evaluate(()=>window.AnonsEditor.fitDirectSelection(["does-not-exist"],15)),false);
    assert.equal(await p8.evaluate(()=>window.AnonsEditor.fitDirectSelection(["title"],2)),false);
    assert.equal(JSON.stringify(await p8.evaluate(()=>window.AnonsEditor.getSnapshot().cards)),
      protectedState,"Invalid safe-area requests cannot modify a project");
    await p8.locator("#direct-safe-show").uncheck();
    assert.equal(await p8.locator(".direct-safe-frame").isVisible(),false);
    await p8.locator("#direct-safe-show").check();
    const art=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(art,{recursive:true});
    await p8.locator(".direct-safe-panel").screenshot({
      path:join(art,"stage8-safe-panel-"+width+".png"),animations:"disabled"
    });
    await p8.locator(".preview-stage").screenshot({
      path:join(art,"stage8-safe-overlay-"+width+".png"),animations:"disabled"
    });
    assert.deepEqual(errors8,[],"Safe-area feature should not throw browser errors");
    await context8.close();
  }

  // Stage 9: test multi-format ZIP signature, real PNG dimensions,
  // watermarked Free parity and preservation of the active canvas.
  for(const width of [390,1440]){
    const context9=await browser.newContext({viewport:{width,height:1050},acceptDownloads:true});
    const p9=await context9.newPage(),errors=[];
    p9.on("pageerror",err=>errors.push(err.message));
    await p9.route("https://fonts.googleapis.com/**",r=>r.abort());
    await p9.route("https://fonts.gstatic.com/**",r=>r.abort());
    await p9.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    const title=await p9.locator("#title").inputValue();
    await p9.locator("#points").fill("Первый\\nВторой\\nТретий\\nЧетвёртый".replaceAll("\\n","\n"));
    assert.match(await p9.locator("#export-kit-report").textContent(),/проверить текст/i);
    assert.equal((await p9.locator("#points").inputValue()).split("\n").length,4);
    await p9.locator("#points").fill("Первый\\nВторой\\nТретий".replaceAll("\\n","\n"));
    if(width<=760)await p9.locator("#editor-show-preview").click();
    assert.equal(await p9.locator("#export-kit-count").textContent(),"1 изображение");
    await p9.locator("#export-kit-portrait").uncheck();
    assert.equal(await p9.locator("#export-kit-download").isDisabled(),true);
    for(const ratio of ["portrait","square","story"])await p9.locator("#export-kit-"+ratio).check();
    assert.equal(await p9.locator("#export-kit-count").textContent(),"3 изображения");
    const initial=await p9.locator("#poster").evaluate(c=>
      ({width:c.width,height:c.height,bitmap:c.toDataURL("image/png")}));
    const ratioBefore=await p9.evaluate(()=>window.AnonsEditor.getSnapshot().ratio);
    const [single]=await Promise.all([p9.waitForEvent("download"),p9.locator("#export").click()]);
    const singleBytes=await readFile(await single.path());
    const [download]=await Promise.all([p9.waitForEvent("download"),p9.locator("#export-kit-download").click()]);
    assert.match(download.suggestedFilename(),/export-kit-3-png\.zip$/);
    const zip=await readFile(await download.path());
    assert.equal(zip.readUInt32LE(0),0x04034b50);
    const files=new Map();
    let pos=0;
    while(pos+30<=zip.length&&zip.readUInt32LE(pos)===0x04034b50){
      const size=zip.readUInt32LE(pos+18),len=zip.readUInt16LE(pos+26);
      const extra=zip.readUInt16LE(pos+28);
      const name=zip.subarray(pos+30,pos+30+len).toString("utf8");
      const begin=pos+30+len+extra;
      assert.ok(begin+size<=zip.length);
      files.set(name,zip.subarray(begin,begin+size));pos=begin+size;
    }
    assert.equal(files.size,4,"3 images and one README");
    assert.match(files.get("README.txt").toString("utf8"),/Free.*водяной знак/);
    for(const [ratio,w,h] of [["portrait",1080,1350],["square",1080,1080],["story",1080,1920]]){
      const name="anons-card-01-"+ratio+"-"+w+"x"+h+".png";
      const png=files.get(name);
      assert.ok(png?.length>10000,name+" missing");
      assert.equal(png.subarray(1,4).toString(),"PNG");
      assert.equal(png.readUInt32BE(16),w);
      assert.equal(png.readUInt32BE(20),h);
    }
    assert.deepEqual(files.get("anons-card-01-portrait-1080x1350.png"),singleBytes,
      "Free kit uses the same watermarked PNG output as the existing single export");
    assert.equal(await p9.evaluate(()=>window.AnonsEditor.getSnapshot().ratio),ratioBefore);
    assert.deepEqual(await p9.locator("#poster").evaluate(c=>
      ({width:c.width,height:c.height,bitmap:c.toDataURL("image/png")})),initial);
    assert.equal(await p9.locator("#title").inputValue(),title);
    const dir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(dir,{recursive:true});
    await p9.locator(".export-kit-panel").screenshot({
      path:join(dir,"stage9-export-kit-"+width+".png"),animations:"disabled"
    });
    assert.deepEqual(errors,[],"Export pack should not cause browser errors");
    await context9.close();
  }


  // Stage 10: platform format presets and named export profiles persist only
  // format/scope in the local browser. Test creation, update, reload, deletion,
  // stored-string sanitization and a real ZIP from a multi-card saved profile.
  for(const width of [390,1440]){
    const c10=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
    const p10=await c10.newPage();
    const failures=[],dialogs=[];
    p10.on("pageerror",error=>failures.push(error.message));
    p10.on("dialog",dialog=>{dialogs.push(dialog.message());dialog.dismiss();});
    await p10.route("https://fonts.googleapis.com/**",r=>r.abort());
    await p10.route("https://fonts.gstatic.com/**",r=>r.abort());
    await p10.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    if(width<=760)await p10.locator("#editor-show-preview").click();
    assert.equal(await p10.locator("[data-export-profile-preset]").count(),4);
    const fitWithinGrid=await p10.locator(".export-profile-presets").evaluate(container=>{
      const bounds=container.getBoundingClientRect();
      return [...container.querySelectorAll("button")].every(button=>{
        const rect=button.getBoundingClientRect();
        return rect.left>=bounds.left-1&&rect.right<=bounds.right+1;
      });
    });
    assert.equal(fitWithinGrid,true,"Every platform preset fits the desktop/mobile side panel");
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"0 / 8");
    const projectBefore=JSON.stringify(await p10.evaluate(()=>window.AnonsEditor.getSnapshot()));
    await p10.locator('[data-export-profile-preset="instagram"]').click();
    assert.equal(await p10.locator("#export-kit-portrait").isChecked(),true);
    assert.equal(await p10.locator("#export-kit-square").isChecked(),false);
    assert.equal(await p10.locator("#export-kit-story").isChecked(),true);
    assert.equal(await p10.locator("#export-kit-scope").inputValue(),"all");
    assert.equal(await p10.locator("#export-kit-count").textContent(),"2 изображения");
    assert.equal(await p10.locator('[data-export-profile-preset="instagram"]')
      .getAttribute("aria-pressed"),"true");
    await p10.locator("#export-profile-name").fill("Новости игры");
    await p10.locator("#export-profile-save").click();
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"1 / 8");
    assert.equal(await p10.locator("#export-profile-select option").count(),2);
    assert.equal(JSON.stringify(await p10.evaluate(()=>window.AnonsEditor.getSnapshot())),
      projectBefore,"Saving a format profile must not modify publication data");
    const stored=await p10.evaluate(()=>JSON.parse(
      localStorage.getItem("anons-studio:export-profiles:v1")));
    assert.equal(stored.length,1);
    assert.deepEqual(stored[0].formats,["portrait","story"]);
    assert.equal(stored[0].scope,"all");
    assert.equal(stored[0].name,"Новости игры");
    assert.equal("cards" in stored[0],false,"Stored profiles must not include any project data");
    // A saved name is always textContent, never parsed as executable markup.
    await p10.locator('[data-export-profile-preset="vk"]').click();
    await p10.locator("#export-profile-name").fill("Анонс <img src=x onerror=alert(1)>");
    await p10.locator("#export-profile-save").click();
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"2 / 8");
    assert.equal(await p10.locator("#export-profile-select img").count(),0);
    assert.deepEqual(dialogs,[],"Saved profile names must never execute markup");
    const first=stored[0].id;
    await p10.locator("#export-profile-select").selectOption(String(first));
    await p10.locator("#export-profile-load").click();
    assert.equal(await p10.locator("#export-kit-square").isChecked(),false);
    assert.equal(await p10.locator("#export-kit-story").isChecked(),true);
    await p10.reload({waitUntil:"domcontentloaded"});
    if(width<=760)await p10.locator("#editor-show-preview").click();
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"2 / 8",
      "Stored export profiles must survive reloading the editor");
    await p10.locator("#export-profile-select").selectOption(String(first));
    await p10.locator("#export-profile-load").click();
    assert.equal(await p10.locator("#export-kit-count").textContent(),"2 изображения");
    assert.equal(await p10.locator("#export-kit-scope").inputValue(),"all");

    // Same-name save updates an existing entry instead of duplicating it.
    await p10.locator("#export-kit-square").check();
    await p10.locator("#export-kit-story").uncheck();
    await p10.locator("#export-profile-name").fill("НОВОСТИ ИГРЫ");
    await p10.locator("#export-profile-save").click();
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"2 / 8");
    const updated=await p10.evaluate(()=>JSON.parse(
      localStorage.getItem("anons-studio:export-profiles:v1")));
    assert.deepEqual(updated.find(p=>p.id===first).formats,["portrait","square"]);
    await p10.locator("#export-profile-select").selectOption(String(first));
    await p10.locator("#export-profile-delete").click();
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"1 / 8");
    assert.equal(await p10.locator("#export-kit-square").isChecked(),true,
      "Deleting a saved profile does not reset current export settings");
    await p10.locator("#export-profile-name").fill("");
    await p10.locator("#export-profile-save").click();
    assert.match(await p10.locator("#export-profile-status").textContent(),/Введи название/);
    await p10.locator("#export-kit-portrait").uncheck();
    await p10.locator("#export-kit-square").uncheck();
    await p10.locator("#export-profile-name").fill("Пустой");
    await p10.locator("#export-profile-save").click();
    assert.match(await p10.locator("#export-profile-status").textContent(),/хотя бы один формат/);
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"1 / 8");
    // Check the eight-profile storage cap and in-place updates.
    await p10.locator('[data-export-profile-preset="universal"]').click();
    for(let n=0;n<7;n++){
      await p10.locator("#export-profile-name").fill("Набор "+n);
      await p10.locator("#export-profile-save").click();
    }
    assert.equal(await p10.locator("#export-profile-limit").textContent(),"8 / 8");
    await p10.locator("#export-profile-name").fill("Девятый набор");
    assert.equal(await p10.locator("#export-profile-save").isDisabled(),true);
    await p10.locator("#export-profile-name").fill("Набор 0");
    assert.equal(await p10.locator("#export-profile-save").isEnabled(),true);
    const screenshotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(screenshotDir,{recursive:true});
    await p10.locator(".export-profile-panel").screenshot({
      path:join(screenshotDir,"stage10-export-profiles-"+width+".png"),
      animations:"disabled"
    });
    if(width===1440){
      // Saved brand profile + two cards => four real multi-format PNGs.
      await p10.locator("#export-profile-select").selectOption(String(first+1));
      await p10.locator("#export-profile-load").click();
      assert.equal(await p10.locator("#export-kit-portrait").isChecked(),true);
      assert.equal(await p10.locator("#export-kit-square").isChecked(),true);
      assert.equal(await p10.locator("#export-kit-story").isChecked(),false);
      assert.equal(await p10.locator("#export-kit-scope").inputValue(),"all");
      await p10.locator("#add-card").click();
      assert.equal(await p10.locator("#export-kit-count").textContent(),"4 изображения");
      const [download]=await Promise.all([
        p10.waitForEvent("download"),
        p10.locator("#export-kit-download").click()
      ]);
      const zip=await readFile(await download.path());
      assert.equal(zip.readUInt32LE(0),0x04034b50);
      const entries=[];
      let pos=0;
      while(pos+30<=zip.length&&zip.readUInt32LE(pos)===0x04034b50){
        const len=zip.readUInt16LE(pos+26),extra=zip.readUInt16LE(pos+28);
        const size=zip.readUInt32LE(pos+18);
        const name=zip.subarray(pos+30,pos+30+len).toString("utf8");
        const bytes=zip.subarray(pos+30+len+extra,pos+30+len+extra+size);
        entries.push({name,bytes});
        pos+=30+len+extra+size;
      }
      assert.equal(entries.length,5,"Two cards and two formats plus README");
      for(const entry of entries.filter(item=>item.name.endsWith(".png"))){
        assert.equal(entry.bytes.subarray(1,4).toString(),"PNG");
        assert.equal(entry.bytes.readUInt32BE(16),1080);
        assert.ok([1080,1350].includes(entry.bytes.readUInt32BE(20)));
      }
      assert.equal(entries.filter(item=>item.name.endsWith(".png")).length,4);
      assert.match(entries.find(item=>item.name==="README.txt").bytes.toString("utf8"),
        /Free.*водяной знак/);
    }
    assert.deepEqual(failures,[],"No Stage 10 browser exceptions expected");
    await c10.close();
  }


  // Stage 11: series metadata, one-click next-issue planning, per-row reorder,
  // persistence and ZIP manifest. Dates never schedule automatic publication.
  for(const width of [390,1440]){
    const c11=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
    const p11=await c11.newPage(),errors=[];
    p11.on("pageerror",e=>errors.push(e.message));
    await p11.route("https://fonts.googleapis.com/**",route=>route.abort());
    await p11.route("https://fonts.gstatic.com/**",route=>route.abort());
    await p11.goto("http://127.0.0.1:"+port+"/editor.html",{waitUntil:"domcontentloaded"});
    assert.equal(await p11.locator("#series-board-list .series-board-row").count(),1);
    const previewBefore=await p11.locator("#poster").evaluate(c=>c.toDataURL("image/png"));
    await p11.locator("#series-name").fill("Новости Gravity Dash");
    await p11.locator("#issue-name").fill("Выпуск 09");
    await p11.locator("#issue-date").fill("2026-11-07");
    await p11.locator("#issue-ready").check();
    let plan=await p11.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(plan.seriesName,"Новости Gravity Dash");
    assert.equal(plan.cards[0].issueName,"Выпуск 09");
    assert.equal(plan.cards[0].issueDate,"2026-11-07");
    assert.equal(plan.cards[0].issueReady,true);
    assert.equal(await p11.locator("#poster").evaluate(c=>c.toDataURL("image/png")),
      previewBefore,"Planning metadata cannot change artwork or watermarks");
    assert.match(await p11.locator("#series-board-summary").textContent(),/1 выпуск · 1 готово/);
    await p11.locator("#series-next-issue").click();
    plan=await p11.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(plan.cards.length,2);
    assert.equal(plan.activeCard,1);
    assert.equal(plan.cards[0].issueName,"Выпуск 09");
    assert.equal(plan.cards[0].issueReady,true);
    assert.equal(plan.cards[1].issueName,"Выпуск 10");
    assert.equal(plan.cards[1].issueDate,"2026-11-14");
    assert.equal(plan.cards[1].issueReady,false);
    assert.notEqual(plan.cards[1].title,plan.cards[0].title,
      "New issue has fresh placeholder copy, not previously published text");
    assert.equal(plan.cards[1].template,plan.cards[0].template);
    assert.equal(plan.cards[1].theme,plan.cards[0].theme);
    assert.equal(await p11.locator("#series-board-list .series-board-row").count(),2);
    assert.equal(await p11.locator("#series-next-issue").isEnabled(),true);
    await p11.locator(".series-board-row").nth(1).getByRole("button",
      {name:"Переместить выпуск 2 раньше"}).click();
    let ordered=await p11.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.deepEqual(ordered.cards.map(card=>card.issueName),["Выпуск 10","Выпуск 09"]);
    assert.equal(ordered.activeCard,0,"Active issue follows the moved card");
    await p11.locator("#undo").evaluate(node=>node.click());
    ordered=await p11.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.deepEqual(ordered.cards.map(card=>card.issueName),["Выпуск 09","Выпуск 10"],
      "Single undo restores whole issue order with metadata");
    await p11.locator("#redo").evaluate(node=>node.click());
    ordered=await p11.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.deepEqual(ordered.cards.map(card=>card.issueName),["Выпуск 10","Выпуск 09"]);
    await p11.reload({waitUntil:"domcontentloaded"});
    ordered=await p11.evaluate(()=>window.AnonsEditor.getSnapshot());
    assert.equal(ordered.seriesName,"Новости Gravity Dash");
    assert.deepEqual(ordered.cards.map(card=>card.issueName),["Выпуск 10","Выпуск 09"]);
    assert.deepEqual(ordered.cards.map(card=>card.issueDate),["2026-11-14","2026-11-07"]);
    assert.deepEqual(ordered.cards.map(card=>card.issueReady),[false,true]);
    assert.equal(await p11.locator("#issue-name").inputValue(),"Выпуск 10");
    await p11.locator("#issue-name").fill("<img src=x onerror=alert(1)>");
    assert.equal(await p11.locator(".series-board-list img").count(),0,
      "Series names must render as text, not injected HTML");
    await p11.locator("#issue-name").fill("Выпуск 10");
    const screenDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(screenDir,{recursive:true});
    await p11.locator(".series-planner").screenshot({
      path:join(screenDir,"stage11-series-planner-"+width+".png"),animations:"disabled"
    });
    if(width===1440){
      await p11.locator("#export-kit-square").check();
      await p11.locator("#export-kit-scope").selectOption("all");
      assert.equal(await p11.locator("#export-kit-count").textContent(),"4 изображения");
      const [download]=await Promise.all([
        p11.waitForEvent("download"),p11.locator("#export-kit-download").click()
      ]);
      const zip=await readFile(await download.path());
      const entries=new Map();let cursor=0;
      while(cursor+30<=zip.length&&zip.readUInt32LE(cursor)===0x04034b50){
        const size=zip.readUInt32LE(cursor+18),len=zip.readUInt16LE(cursor+26);
        const extra=zip.readUInt16LE(cursor+28);
        const name=zip.subarray(cursor+30,cursor+30+len).toString("utf8");
        const begin=cursor+30+len+extra;
        entries.set(name,zip.subarray(begin,begin+size));
        cursor=begin+size;
      }
      assert.equal(entries.size,5,"Four PNGs plus one issue manifest");
      const manifest=entries.get("README.txt").toString("utf8");
      assert.match(manifest,/Серия: Новости Gravity Dash/);
      assert.match(manifest,/Карточка 1: Выпуск 10 · 2026-11-14 · черновик/);
      assert.match(manifest,/Карточка 2: Выпуск 09 · 2026-11-07 · готов/);
      assert.ok(manifest.indexOf("Карточка 1: Выпуск 10")
        <manifest.indexOf("Карточка 2: Выпуск 09"),
        "README preserves chosen publication order");
      assert.match(manifest,/Free.*водяной знак/);
      assert.equal(entries.get("anons-card-01-portrait-1080x1350.png").readUInt32BE(20),1350);
    }
    assert.deepEqual(errors,[],"Stage 11 planning must not throw browser errors");
    await c11.close();
  }

} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
