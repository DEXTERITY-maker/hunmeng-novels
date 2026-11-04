import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("app.js"),editor=read("editor.html"),gallery=read("templates.html"),
  catalog=read("templates-catalog.js"),prices=read("pricing.html"),
  server=read("functions/anons-premium-export/index.ts"),
  scene=read("functions/anons-premium-export/scene-layout.js"),
  migration=read("schema/anons-studio-pro-style-templates.sql"),
  manualOrders=read("schema/anons-studio-manual-order-plan-choice.sql");

test("Pro-exclusive templates are fully integrated in both renderers and catalogue",()=>{
  for(const id of ["pro-campaign","pro-magazine","pro-impact"]){
    assert.ok(app.includes('"'+id+'"'));
    assert.ok(editor.includes('value="'+id+'" disabled'));
    assert.ok(gallery.includes('data-template="'+id+'" data-tier="pro"'));
    assert.ok(catalog.includes('"'+id+'"'));
    assert.ok(scene.includes('"'+id+'"'));
    assert.ok(migration.includes("'"+id+"'"));
    assert.ok(server.includes("'"+id+"'"));
  }
  assert.match(app,/proTemplates\.has\(next\)/);
  assert.match(catalog,/proAccess=paidAccess&&\["pro","studio"\]\.includes/);
  assert.match(server,/if\(PRO_TEMPLATES\.has\(requestedTemplate\)&&!\['pro','studio'\]\.includes\(member\.plan\)\)/);
  assert.match(server,/auth\.auth\.getUser\(token\)/);
  assert.match(server,/SUBSCRIPTION_REQUIRED/);
});
test("Pro-only batch operations are non-destructive and reversible",()=>{
  assert.match(editor,/id="pro-series-generate" disabled/);
  assert.match(editor,/id="pro-series-apply" disabled/);
  assert.match(app,/function createProSeries\(\)/);
  assert.match(app,/function applyProTemplateToAll\(\)/);
  assert.match(app,/if\(!proAllowed\(\)\)/);
  assert.match(app,/if\(state\.cards\.length>MAX_CARDS-2\)/);
  assert.match(app,/state\.cards\.push\(details,next\)/);
  assert.match(app,/historyKind="";\s*syncCardAndSave\(\)/);
  assert.match(app,/state\.cards=state\.cards\.map\(card=>sanitizeCard\(\{\.\.\.card,template:next,theme,accentColor:""\}\)\)/);
  assert.doesNotMatch(app.slice(app.indexOf("function createProSeries()"),app.indexOf("function applyProTemplateToAll()")),/from\("anons_studio_memberships"\)|payment_reported/);
});
test("Pro price remains 499 rubles; original Business order is not affected",()=>{
  assert.match(prices,/<h3>Про<\/h3>/);
  assert.match(prices,/499 ₽/);
  assert.match(prices,/Три эксклюзивных шаблона «Про»/);
  assert.match(prices,/Пакетная серия/);
  assert.match(prices,/Автооплата по-прежнему выключена/);
  assert.match(manualOrders,/when 'pro' then 49900/);
  assert.match(manualOrders,/rec\.status<>'payment_reported'/);
  assert.doesNotMatch(app,/anons_studio_manual_review/);
});
