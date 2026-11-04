import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const pricing=read("pricing.html"),orders=read("manual-orders-entry.js");
const app=read("app.js"),editor=read("editor.html"),catalog=read("templates-catalog.js");
const gallery=read("templates.html"),auth=read("auth-entry.js");
const scene=read("functions/anons-premium-export/scene-layout.js");
const edge=read("functions/anons-premium-export/index.ts");
const plans=read("schema/anons-studio-agency-ultimate-tiers.sql");
const saved=read("schema/anons-studio-upper-tier-styles.sql");
const workspace=read("studio-workspace-entry.js");
const sandbox={};vm.runInNewContext(scene,sandbox,{timeout:1500});
const Scene=sandbox.AnonsScene;
const specs=[
  ["agency-brand","editorial","#092a39","agency"],
  ["agency-social","pulse","#171c38","agency"],
  ["agency-showcase","spotlight","#f5eee8","agency"],
  ["ultimate-signature","editorial","#12151c","ultimate"],
  ["ultimate-cinema","spotlight","#0f133e","ultimate"],
  ["ultimate-vision","bulletin","#f0f8f8","ultimate"]
];

test("two new paid tiers have unique real shared browser/Edge compositions",()=>{
  assert.ok(Scene);
  for(const ratio of ["portrait","square","story"]){
    for(const [name,base,color,tier] of specs){
      const layout=Scene.layout({ratio,project:"Agency"},{template:name,theme:"paper"});
      assert.equal(layout.template,base);
      assert.equal(layout.palette.bg1,color);
      assert.equal(layout[tier+"Template"],name);
      assert.ok(layout.titleY<layout.detailsY&&layout.detailsY<layout.footerY);
      assert.match(editor,new RegExp('value="'+name+'" disabled'));
      assert.match(gallery,new RegExp('data-template="'+name+'" data-tier="'+tier+'"'));
      assert.ok(saved.includes("'"+name+"'"));
    }
  }
});

test("new tariffs inherit earlier export and template rights but not higher-tier rights",()=>{
  for(const code of ["basic","pro","studio","agency","ultimate"]){
    assert.match(auth,new RegExp('"'+code+'"'));
  }
  assert.match(app,/agencyAllowed=\(\)=>\["agency","ultimate"\]\.includes/);
  assert.match(app,/ultimateAllowed=\(\)=>currentPlan==="ultimate"/);
  assert.match(catalog,/agencyAccess=paidAccess&&\["agency","ultimate"\]\.includes/);
  assert.match(catalog,/ultimateAccess=paidAccess&&event\.detail\?\.plan==="ultimate"/);
  assert.match(edge,/AGENCY_SUBSCRIPTION_REQUIRED/);
  assert.match(edge,/ULTIMATE_SUBSCRIPTION_REQUIRED/);
  assert.match(edge,/auth\.auth\.getUser\(token\)/);
  assert.match(edge,/SUBSCRIPTION_REQUIRED/);
  assert.match(edge,/if\(ULTIMATE_TEMPLATES\.has\(requestedTemplate\)&&member\.plan!=='ultimate'\)/);
});

test("manual Agency/Ultimate prices are locked and require a human banking approval",()=>{
  for(const [key,label,price,kopecks] of [
    ["agency","Агентство","1 499 ₽",149900],
    ["ultimate","Максимум","2 499 ₽",249900]
  ]){
    assert.match(pricing,new RegExp('data-plan="'+key+'"'));
    assert.match(pricing,new RegExp('<option value="'+key+'">'+label+' — '+price));
    assert.match(orders,new RegExp(key+':\\{name:"'+label+'",amount:'+kopecks+'\\}'));
    assert.match(plans,new RegExp("plan='"+key+"' and amount_kopecks="+kopecks));
  }
  assert.match(plans,/if not public\.anons_studio_manual_is_admin\(\) then/);
  assert.match(plans,/rec\.status<>'payment_reported'/);
  assert.match(plans,/grant execute on function public\.anons_studio_manual_create_order\(text\) to authenticated/);
  assert.match(pricing,/Автооплата по-прежнему выключена/);
  assert.match(read("functions/anons-billing/index.ts"),/const LIVE_CHECKOUT_REVIEWED=false/);
});

test("Studio/Agency/Ultimate branding has server verified limits 8/16/30",()=>{
  assert.match(plans,/m\.plan in \('studio','agency','ultimate'\)/);
  assert.match(plans,/case membership_plan when 'studio' then 8 when 'agency' then 16 else 30 end/);
  assert.match(plans,/p\.owner_id=uid/);
  assert.match(plans,/target\.version<>expected_version/);
  assert.match(plans,/insert into public\.anons_studio_project_revisions/);
  assert.match(plans,/for update/);
  assert.match(plans,/revoke all on function public\.anons_studio_studio_apply_brand/);
  assert.match(workspace,/agency:16,ultimate:30/);
  assert.match(workspace,/projectLimit\(\)/);
  assert.match(editor,/id="studio-project-limit"/);
  assert.match(pricing,/Сравнение тарифов/);
});
