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

test("all twelve templates render finite geometry in every supported format",()=>{
  for(const ratio of ["portrait","square","story"]){
    for(const template of ["aurora","editorial","spotlight","pulse","minimal","bulletin", "business-brief","business-pitch","business-report", "pro-campaign","pro-magazine","pro-impact"]){
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

test("Aurora visual intensity is bounded and applied only through allowlisted modes",()=>{
  const low=Scene.layout({ratio:"portrait"},{template:"aurora",decorationLevel:"subtle"});
  const middle=Scene.layout({ratio:"portrait"},{template:"aurora",decorationLevel:"balanced"});
  const high=Scene.layout({ratio:"portrait"},{template:"aurora",decorationLevel:"expressive"});
  const invalid=Scene.layout({ratio:"portrait"},{template:"aurora",decorationLevel:"<svg onload=alert(1)>"});
  assert.equal(low.decorationLevel,"subtle");
  assert.equal(invalid.decorationLevel,"subtle");
  assert.ok(low.decorationTuning.grid<middle.decorationTuning.grid);
  assert.ok(middle.decorationTuning.grid<high.decorationTuning.grid);
  assert.ok(low.decorationTuning.rings<middle.decorationTuning.rings);
  assert.ok(low.decorationTuning.centerY<high.decorationTuning.centerY);
  assert.ok(low.decorationTuning.ringRadius<high.decorationTuning.ringRadius);
  assert.ok(Object.isFrozen(low.decorationTuning));
});

test("balanced description spacing reduces blank title gap for every canvas format",()=>{
  for(const ratio of ["portrait","square","story"]){
    const card={template:"aurora",title:"Большое обновление!",textSpacing:"balanced"};
    const scene=Scene.layout({ratio},card);
    const title=Scene.titleLines(card.title,scene);
    const lastBaseline=scene.titleY+title.size*.8+(title.lines.length-1)*title.size*1.14;
    const y=Scene.descriptionTop(scene,title);
    const compact=Scene.descriptionTop(Scene.layout({ratio},{...card,textSpacing:"compact"}),title);
    const airy=Scene.descriptionTop(Scene.layout({ratio},{...card,textSpacing:"airy"}),title);
    assert.ok(y>=compact && y<=airy);
    assert.ok(y<scene.detailsY-90,"Description must stay above highlight box");
    assert.ok(y>=lastBaseline+25 || y===scene.detailsY-(scene.height<=1100?140:155),
      "Description should keep a readable gap below the title");
  }
  const invalid=Scene.layout({ratio:"portrait"},{textSpacing:"unexpected"});
  assert.equal(invalid.textSpacing,"balanced");
});

test("free-watermark geometry is distributed, restrained and not removable by a plan flag",()=>{
  for(const ratio of ["portrait","square","story"]){
    const scene=Scene.layout({ratio},{});
    const marks=Scene.watermarkStamps(scene.width,scene.height,scene.palette.dark);
    assert.equal(marks.length,4);
    assert.ok(new Set(marks.map(m=>m.y)).size===4,"Stamps are distributed vertically");
    for(const mark of marks){
      assert.ok(mark.x>0 && mark.x<scene.width && mark.y>0 && mark.y<scene.height);
      assert.ok(mark.alpha>=.12 && mark.alpha<=.22);
      assert.ok(mark.size>=35 && mark.size<=60);
    }
    const positions=[...marks].map(mark=>mark.y);
    assert.deepEqual([...positions].sort((a,b)=>a-b),positions);
  }
});

test("Aurora composition modes remain inside the available poster geometry",()=>{
  for(const ratio of ["portrait","square","story"]){
    const variants=["classic","compact","headline"].map(composition=>
      Scene.layout({ratio},{template:"aurora",composition}));
    assert.equal(new Set(variants.map(v=>v.titleY)).size,3,
      "Each Aurora composition must visibly change the title position");
    for(const scene of variants){
      const h=Scene.highlightGeometry(scene,3);
      assert.equal(h.width,scene.contentWidth);
      assert.ok(h.top>scene.titleY,"Highlights must follow the heading");
      assert.ok(h.top+h.height<=scene.footerY-55,
        "Three highlights must not overlap the footer rule in "+ratio);
    }
  }
  assert.equal(Scene.layout({ratio:"portrait"},{template:"aurora",composition:"<script>"}).composition,"classic");
  assert.equal(Scene.layout({ratio:"portrait"},{template:"editorial",composition:"headline"}).composition,"classic");
});

test("highlight panel variants, icons and featured rows are validated",()=>{
  const scene=Scene.layout({ratio:"square"},{template:"aurora",highlightStyle:"separated",
    highlightIcons:["check","star","diamond","<svg onload=alert(1)>"],
    featuredHighlight:2});
  const h=Scene.highlightGeometry(scene,3);
  assert.equal(h.style,"separated");
  assert.equal(h.icons.length,3);
  assert.deepEqual([...h.icons],["check","star","diamond"]);
  assert.equal(h.featured,2);
  assert.equal(Scene.highlightGeometry(scene,99).height,
    Scene.highlightGeometry(scene,3).height,"Highlight counts cannot exceed 3 rows");
  const malformed=Scene.layout({ratio:"square"},{highlightStyle:"javascript:alert(1)",
    highlightIcons:["evil",{},null],featuredHighlight:900});
  const safe=Scene.highlightGeometry(malformed,3);
  assert.equal(safe.style,"soft");
  assert.deepEqual([...safe.icons],["dot","dot","dot"]);
  assert.equal(safe.featured,-1);
});

test("layer z-order and hidden states are safely normalized for the paid renderer",()=>{
  const info=Scene.layout({ratio:"portrait"},{
    layerOrder:["highlights","title","photo","description","brand",
      "title","<svg onload=alert(1)>","decoration"],
    layers:{brand:false,title:true,photo:false,highlights:true}});
  assert.equal(info.order[0],"highlights");
  assert.equal(info.order.filter(x=>x==="title").length,1);
  assert.ok(!info.order.includes("<svg onload=alert(1)>"));
  assert.equal(info.enabled.brand,false);
  assert.equal(info.enabled.photo,false);
  assert.equal(info.enabled.title,true);
  assert.equal(info.order.length,6);
  assert.equal(Scene.layout({ratio:"portrait"},{}).enabled.photo,true);
});

test("graphic labels, visibility and grouping metadata remain bounded",()=>{
  const item=Graphics.normalizeOne({id:"g-1",kind:"star",hidden:true,
    label:"<img src=x onerror=alert(1)>".repeat(20),
    groupId:"not valid! <script>",path:"M 0 0",x:50,y:50},0);
  assert.equal(item.hidden,true);
  assert.ok(item.label.length<=48);
  assert.equal(item.groupId,"");
  assert.equal(Graphics.frame(item,1080,1350).path,Graphics.paths.star);
  const grouped=Graphics.normalizeElements([{id:"a",groupId:"group-valid_12",label:"Логотип"},
    {id:"b",groupId:"group-valid_12",hidden:false}]);
  assert.equal(grouped[0].groupId,grouped[1].groupId);
  assert.equal(grouped[0].label,"Логотип");
  assert.equal(grouped[1].hidden,false);
  assert.match(handler,/if\(item\.hidden\)continue/);
});

test("Business compositions have independent palettes and share stable server geometry",()=>{
  const business=[
    ["business-brief","bulletin","#071f32"],
    ["business-pitch","spotlight","#271836"],
    ["business-report","editorial","#f5f8fc"]
  ];
  const backgrounds=new Set();
  for(const ratio of ["portrait","square","story"]){
    for(const [id,base,bg] of business){
      const scene=Scene.layout({ratio,project:"ПРОЕКТ"},{template:id,title:"Деловой отчёт",theme:"paper"});
      assert.equal(scene.businessTemplate,id);
      assert.equal(scene.template,base);
      assert.equal(scene.palette.bg1,bg);
      assert.ok(Number.isFinite(scene.titleY));
      assert.ok(scene.titleY<scene.detailsY);
      assert.ok(scene.detailsY<scene.footerY);
      assert.ok(Scene.titleLines("Итоги обновления и дальнейшие планы",scene).lines.length>0);
      backgrounds.add(scene.palette.bg1);
    }
  }
  assert.equal(backgrounds.size,3);
});

test("Pro template palettes are distinct and shared with the server-side renderer",()=>{
  const pro=[
    ["pro-campaign","pulse","#091a2d"],
    ["pro-magazine","editorial","#131b34"],
    ["pro-impact","spotlight","#301135"]
  ];
  const seen=new Set();
  for(const ratio of ["portrait","square","story"]){
    for(const [id,base,color] of pro){
      const scene=Scene.layout({ratio,project:"ПРОЕКТ"},{template:id,title:"Профессиональная серия"});
      assert.equal(scene.proTemplate,id);
      assert.equal(scene.businessTemplate,null);
      assert.equal(scene.template,base);
      assert.equal(scene.palette.bg1,color);
      assert.ok(scene.titleY<scene.detailsY&&scene.detailsY<scene.footerY);
      seen.add(scene.palette.bg1);
    }
  }
  assert.equal(seen.size,3);
  assert.match(handler,/PRO_SUBSCRIPTION_REQUIRED/);
  assert.match(handler,/PRO_TEMPLATES\.has\(requestedTemplate\)/);
  assert.match(handler,/\['pro','studio'\]\.includes\(member\.plan\)/);
});
