import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

// These are the exact deterministic scene/geometry modules bundled in the
// deployed Anons Studio premium renderer. Tests are pure; no Supabase writes,
// subscription changes, user data, or live payment requests.
const root=new URL("./functions/anons-premium-export/",import.meta.url);
const graphics=await readFile(new URL("graphic-elements.js",root),"utf8");
const scene=await readFile(new URL("scene-layout.js",root),"utf8");
const handler=await readFile(new URL("index.ts",root),"utf8");
const sandbox={};
vm.runInNewContext(graphics,sandbox,{timeout:1000,filename:"graphic-elements.js"});
vm.runInNewContext(scene,sandbox,{timeout:1000,filename:"scene-layout.js"});
const Graphics=sandbox.AnonsGraphics,Scene=sandbox.AnonsScene;

test("premium handler imports both versioned rendering contracts",()=>{
  assert.match(handler,/import '\.\/graphic-elements\.js';/);
  assert.match(handler,/import '\.\/scene-layout\.js';/);
  assert.match(handler,/auth\.auth\.getUser\(token\)/);
  assert.match(handler,/SUBSCRIPTION_REQUIRED/);
  assert.match(handler,/IMAGE_TOO_LARGE/);
});

test("all six templates render finite geometry in every supported format",()=>{
  for(const ratio of ["portrait","square","story"]){
    for(const template of ["aurora","editorial","spotlight","pulse","minimal","bulletin"]){
      const info=Scene.layout({ratio,project:"Анонс"},{template,theme:"paper",titleShift:12});
      assert.ok(info.width===1080 && info.height>=1080);
      assert.ok(Number.isFinite(info.titleY)&&Number.isFinite(info.detailsY));
      assert.ok(info.titleY<info.detailsY && info.detailsY<info.footerY);
      assert.ok(info.order.includes("title")&&info.order.includes("highlights"));
      const title=Scene.titleLines("Большие новости проекта — запуск обновлённого редактора",info);
      assert.ok(title.lines.length>=1&&title.lines.length<=4);
      assert.ok(title.size>=42);
    }
  }
});

test("untrusted scene input is clamped and cannot inject layout layers",()=>{
  const info=Scene.layout({ratio:"not-a-format"},{
    template:"<script>",theme:"unknown",titleShift:999,titleTracking:999,
    layerOffsets:{title:{x:1e9,y:-1e9}},layerOrder:["fake","title","title"],
    layers:{title:false,inject:true},accentColor:"red"});
  assert.equal(info.format,"portrait");
  assert.equal(info.template,"aurora");
  assert.equal(info.offsets.title.x,30);
  assert.equal(info.offsets.title.y,-30);
  assert.equal(info.titleTracking,6);
  assert.ok(!info.order.includes("fake"));
  assert.equal(info.order.filter(x=>x==="title").length,1);
  assert.equal(info.enabled.title,false);
});

test("graphic elements are capped and normalized without arbitrary SVG path input",()=>{
  const raw=Array.from({length:20},(_,i)=>({
    id:"duplicate",kind:i===0?"<script>":"star",x:999,y:-40,size:900,opacity:500,
    rotation:999,color:"url(javascript:alert(1))",path:"M 0 0<script>"
  }));
  const result=Graphics.normalizeElements(raw);
  assert.equal(result.length,12);
  assert.equal(result[0].kind,"spark");
  assert.equal(result[0].x,100);
  assert.equal(result[0].y,0);
  assert.equal(result[0].size,35);
  assert.equal(result[0].rotation,180);
  assert.equal(result[0].opacity,100);
  assert.equal(result[0].color,"#c2a1ff");
  const frame=Graphics.frame(result[0],1080,1350);
  assert.equal(frame.path,Graphics.paths.spark);
  assert.ok(!frame.path.includes("script"));
});
