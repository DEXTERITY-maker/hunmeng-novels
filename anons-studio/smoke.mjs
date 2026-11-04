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
const allow = new Set(["/","/index.html","/account.html","/editor.html","/templates.html","/features.html","/pricing.html","/styles.css","/app.js","/editor-workspace.js","/editor-direct.js","/editor-layers.js","/navigation.js","/templates-catalog.js","/templates-assistant.js","/pricing-status.js","/personal-styles.js","/brand-kit.js","/whats-new.js","/scene-layout.js","/graphic-elements.js","/auth.bundle.js","/assets/anons-logo-approved.webp","/assets/anons-icon-approved.webp","/assets/ui-icons.svg"]);
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
    assert.match(await page.locator("#whats-new-title").textContent(),/Мой тариф и статус заказа/);
    assert.equal(await page.locator(".whats-new-list li").count(),31);
    assert.equal(await page.locator(".whats-new-item-icon .ui-icon").count(),31,
      "Announcement has coherent SVG icons instead of character placeholders");
    assert.equal(await page.locator("#whats-new-close").evaluate(el=>el===document.activeElement),true,
      "Announcement initially focuses its accessible close control");
    assert.equal(await page.locator(".whats-new-list:not(.whats-new-list-archive) li").count(),1,
      "Only the latest two changes are expanded by default");
    assert.equal(await page.locator(".whats-new-list-archive li").count(),30);
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
    assert.equal(await releaseDialog.getAttribute("data-release"),"2026-11-05-pricing-current-plan",
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
    const editorScreenshotDir=join(dirname(fileURLToPath(import.meta.url)),"test-artifacts");
    await mkdir(editorScreenshotDir,{recursive:true});
    await page.locator("#editor-controls").screenshot({
      path:join(editorScreenshotDir,"editor-settings-"+width+".png"),animations:"disabled"
    });
    assert.equal(await page.locator(".editor-tool-group").count(),3,
      "Editor tools are grouped into card, content and design sections");
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
    assert.equal(await pricingPage.locator("#pricing .plan").count(),4);
    assert.equal(await pricingPage.locator("#pricing .plan-ui-icon .ui-icon").count(),4,
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
    assert.equal(await pricingPage.locator(".manual-plan-link").count(),3,
      "Every paid plan links to the same manual-order form");
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
    assert.equal(await page.locator("[data-template]").count(),15,"Six Free, three Business, three Pro, three Studio templates");
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
    assert.equal(await page.locator(".catalog-item:visible").count(),15,"All templates initially visible");
    await page.locator("#template-search").fill("Aurora");
    assert.equal(await page.locator(".catalog-item:visible").count(),1,"Catalogue search narrows the visible templates");
    await page.locator("#template-search").fill("");
    await page.locator('[data-catalog-category="news"]').click();
    assert.equal(await page.locator(".catalog-item:visible").count(),6,"News category includes Studio Portfolio");
    await page.locator("#template-search").fill("нет такого шаблона");
    assert.equal(await page.locator("#template-empty").isVisible(),true,"No results shows reset action");
    await page.locator("#template-reset").click();
    await page.locator(".catalog-favorite").first().click();
    await page.locator("#template-favorites-toggle").click();
    assert.equal(await page.locator(".catalog-item:visible").count(),1,"Favorites filter finds the saved template");
    await page.locator("#template-favorites-toggle").click();
    assert.equal(await page.locator(".catalog-item:visible").count(),15,"Switching off favorites restores gallery");
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
    assert.deepEqual(errors,[],"Studio browser errors: "+errors.join("; "));
    await studioContext.close();
  }

} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
