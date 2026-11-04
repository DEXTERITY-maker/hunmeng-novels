import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const root=new URL("./",import.meta.url);
const load=path=>readFileSync(new URL(path,root),"utf8");
const page=load("templates.html");
const editor=load("editor.html");
const app=load("app.js");
const gallery=load("templates-catalog.js");
const pricing=load("pricing.html");
const entry=load("manual-orders-entry.js");
const businessMigration=load("schema/anons-studio-business-style-templates.sql");
const ordersMigration=load("schema/anons-studio-manual-order-plan-choice.sql");
const scene=load("functions/anons-premium-export/scene-layout.js");
const auth=load("auth-entry.js");
const billing=load("billing-entry.js");

test("Business templates exist in catalogue, editor and both rendering engines",()=>{
  const sandbox={};
  vm.runInNewContext(scene,sandbox,{timeout:1000});
  const presets={
    "business-brief":["bulletin","#071f32"],
    "business-pitch":["spotlight","#271836"],
    "business-report":["editorial","#f5f8fc"]
  };
  for(const [id,[base,bg]] of Object.entries(presets)){
    assert.match(page,new RegExp('data-template="'+id+'"'));
    assert.match(editor,new RegExp('value="'+id+'" disabled'));
    assert.match(app,new RegExp('"'+id+'"'));
    assert.match(gallery,new RegExp('"'+id+'"'));
    assert.match(businessMigration,new RegExp("'"+id+"'"));
    const result=sandbox.AnonsScene.layout({ratio:"portrait"},{template:id});
    assert.equal(result.template,base);
    assert.equal(result.businessTemplate,id);
    assert.equal(result.palette.bg1,bg);
  }
  assert.match(app,/canUseTemplate\(next\)/);
  assert.match(app,/patch\.template&&!canUseTemplate\(patch\.template\)/);
});

test("manual plan selection sends only a server-validated plan key and updates price",()=>{
  assert.match(pricing,/<select id="manual-order-plan">/);
  assert.match(pricing,/<option value="basic">Бизнес — 299 ₽/);
  assert.match(pricing,/<option value="pro">Про — 499 ₽/);
  assert.match(pricing,/<option value="studio">Студия — 999 ₽/);
  assert.match(entry,/client\.rpc\("anons_studio_manual_create_order",\{p_plan:selectedPlan\(\)\}\)/);
  assert.match(ordersMigration,/p_plan not in \('basic','pro','studio'\)/);
  for(const [plan,price] of [["basic","29900"],["pro","49900"],["studio","99900"]]){
    assert.match(ordersMigration,new RegExp("plan='"+plan+"' and amount_kopecks="+price));
  }
  assert.match(ordersMigration,/if not public\.anons_studio_manual_is_admin\(\) then/);
  assert.match(ordersMigration,/rec\.status<>'payment_reported'/);
  assert.match(ordersMigration,/current_period_end>now\(\)/);
  assert.match(ordersMigration,/revoke all on function public\.anons_studio_manual_create_order\(text\)/);
});

test("customer number is digits only and label is localized",()=>{
  const account=load("account.html");
  assert.match(account,/Ваш постоянный номер:/);
  assert.doesNotMatch(account,/Ваш постоянный ID:/);
  assert.match(entry,/String\(customerNo\)/);
  assert.doesNotMatch(entry,/"ID-".customerNo/);
  assert.match(auth,/basic:"Бизнес",pro:"Про",studio:"Студия"/);
  assert.match(billing,/basic:"Бизнес",pro:"Про",studio:"Студия"/);
});

test("YooKassa checkout stays disabled and Pro/Studio roadmap remains transparent",()=>{
  const provider=load("functions/anons-billing/index.ts");
  assert.match(provider,/const LIVE_CHECKOUT_REVIEWED=false/);
  assert.match(pricing,/Три эксклюзивных шаблона «Про»/);
  assert.match(pricing,/Массовое применение фирменного стиля доступно в «Студии»/);
  assert.match(pricing,/многопользовательская командная работа пока не реализована/);
  assert.match(pricing,/Автооплата по-прежнему выключена/);
});
