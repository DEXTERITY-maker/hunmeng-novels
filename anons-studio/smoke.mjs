import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const root = join(dirname(fileURLToPath(import.meta.url)),"dist");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8" };
const allow = new Set(["/","/index.html","/styles.css","/app.js"]);
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
    await page.locator("[data-account-mode=login]").click();
    assert.match(await page.locator("#account-submit").textContent(),/Войти/);
    const [download] = await Promise.all([page.waitForEvent("download"),page.locator("#export").click()]);
    assert.match(download.suggestedFilename(),/\.png$/);
    assert.ok((await readFile(await download.path())).length>20000,"Downloaded PNG should contain image data");
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),"No horizontal overflow");
    assert.deepEqual(errors,[],"No browser JS errors");
    assert.equal(await page.locator("button.plan-action[disabled]").count(),3,"No deceptive payment actions");
    await context.close();
    console.log("PASS Anons Studio browser preview, editor, storage, PNG and responsive width="+width);
  }
} finally {
  if(browser) await browser.close();
  await new Promise(r=>server.close(r));
}
