import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { dirname,join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { transform } from "esbuild";

const dir=dirname(fileURLToPath(import.meta.url));
const code=await readFile(join(dir,"scene-layout.js"),"utf8");
const sandbox={};sandbox.globalThis=sandbox;
runInNewContext(code,sandbox);
const Scene=sandbox.AnonsScene;

test("all poster sizes and templates use consistent scene geometry",()=>{
  for(const [ratio,[width,height]] of Object.entries(Scene.formats)){
    for(const template of ["aurora","editorial","spotlight","pulse","minimal","bulletin"]){
      const s=Scene.layout({ratio,theme:"ultraviolet",project:"ANONS STUDIO"},
        {theme:"ink",template,preset:"update",layerOffsets:{title:{x:6,y:4}}});
      assert.equal(s.width,width);assert.equal(s.height,height);
      assert.equal(s.photo.x,width*.52);
      assert.equal(s.photo.y,height*.11);
      assert.equal(s.photo.width,width*.49);
      assert.equal(s.photo.height,Math.min(height*.36,570));
      assert.equal(s.photo.radius,140);
      assert.equal(s.footerY,height-74);
      assert.equal(s.palette.bg1,Scene.themes.ink.bg1);
      assert.equal(s.offsets.title.x,6);
      assert.equal(s.offsets.title.y,4);
      assert.equal(s.contentWidth,width-152);
      assert.equal(s.order.length,6);
      assert.equal(s.enabled.title,true);
      assert.ok(s.titleY<s.detailsY && s.detailsY<s.footerY);
    }
  }
});

test("title and description breaks are deterministic for long Cyrillic and punctuation",()=>{
  const s=Scene.layout({ratio:"portrait",project:"Лаборатория"},{
    theme:"ultraviolet",template:"editorial",headingScale:120,titleTracking:2
  });
  const title="Большое обновление нашего проекта: новые функции и возможности для всех пользователей";
  const result=Scene.titleLines(title,s),resultAgain=Scene.titleLines(title,s);
  assert.equal(JSON.stringify(result),JSON.stringify(resultAgain));
  assert.ok(result.size>=42&&result.lines.length<=4&&result.lines.length>0);
  assert.ok(result.lines.every(line=>Scene.textWidth(line,result.size,2)<=s.contentWidth*.98));
  const description=Scene.breakLines("Подробности первого выпуска новой версии проекта и начало работы в следующем году", s.contentWidth-80,32,3);
  assert.ok(description.length<=3&&description.length>0);
  assert.ok(description.every(line=>Scene.textWidth(line,32)<=s.contentWidth));
});

test("malicious scene inputs cannot change fixed palette or layer contract",()=>{
  const s=Scene.layout({ratio:"other",theme:"__proto__"},{theme:"__proto__",
    template:"<script>",accentColor:"url(javascript:1)",layerOrder:["<script>","brand","brand"],
    layerOffsets:{title:{x:100000,y:-100000}},layers:{title:false}});
  assert.equal(s.width,1080);
  assert.equal(s.palette.accent,Scene.themes.ultraviolet.accent);
  assert.equal(s.template,"aurora");
  assert.equal(s.enabled.title,false);
  assert.equal(s.offsets.title.x,30);
  assert.equal(s.offsets.title.y,-30);
  assert.equal(new Set(s.order).size,6);
  assert.ok(!s.order.includes("<script>"));
});

test("premium renderer compiles as TypeScript and imports shared scene contract",async()=>{
  const source=await readFile(join(dir,"functions","anons-premium-export","index.ts"),"utf8");
  assert.match(source,/import '\.\/scene-layout\.js'/);
  assert.match(source,/Scene\.layout\(snapshot,card\)/);
  assert.match(source,/Scene\.titleLines\(title,plan\)/);
  assert.match(source,/Scene\.breakLines\(/);
  const out=await transform(source,{loader:"ts",format:"esm",target:"es2022"});
  assert.ok(out.code.includes("function renderPoster"));
});
