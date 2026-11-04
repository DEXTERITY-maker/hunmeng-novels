import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("./pricing-status.js",import.meta.url),"utf8");
const html=readFileSync(new URL("./pricing.html",import.meta.url),"utf8");
const auth=readFileSync(new URL("./auth-entry.js",import.meta.url),"utf8");
const manual=readFileSync(new URL("./manual-orders-entry.js",import.meta.url),"utf8");
class Element{
  constructor(){
    this.textContent="";this.hidden=false;this.dataset={};this.classes=new Set();
    this.classList={toggle:(key,value)=>{if(value)this.classes.add(key);else this.classes.delete(key);}};
  }
  querySelector(selector){
    if(selector===".manual-plan-link")return this.link;
    if(selector===".plan-current-state")return this.note;
    return null;
  }
}
function setup(){
  const cards=["free","basic","pro","studio","agency","ultimate"].map(name=>{
    const card=new Element();card.dataset.plan=name;card.link=new Element();card.note=new Element();
    card.note.hidden=true;return card;
  });
  const nodes=Object.fromEntries(["pricing-current-title","pricing-current-description",
    "pricing-current-indicator"].map(key=>[key,new Element()]));
  const root=new Element();root.querySelectorAll=selector=>{
    assert.equal(selector,".pricing-grid .plan[data-plan]");return cards;
  };
  nodes.pricing=root;
  const events={};
  const window={addEventListener:(name,fn)=>{events[name]=fn;}};
  const document={getElementById:id=>nodes[id]||null};
  vm.runInNewContext(source,{window,document,Date,Number,Set,Object},{timeout:1000});
  const emit=(type,detail)=>events[type]({detail});
  const get=plan=>cards.find(c=>c.dataset.plan===plan);
  return{emit,get,nodes};
}
const login=(plan,premium,expiresAt=null)=>({loggedIn:true,verified:true,plan,premium,expiresAt});
test("membership is never marked paid before server authorization",()=>{
  const h=setup();
  assert.match(h.nodes["pricing-current-title"].textContent,/Проверяем/);
  h.emit("anons:access",login("free",false));
  assert.match(h.nodes["pricing-current-title"].textContent,/Free/);
  assert.equal(h.get("basic").classes.has("is-current-plan"),false);
  assert.equal(h.get("basic").link.hidden,false);
  assert.equal(h.get("free").note.hidden,false);
});
test("Business active plan and expiry are visible and duplicate order link is hidden",()=>{
  const h=setup();
  h.emit("anons:access",login("basic",true,"2026-12-04T12:00:00Z"));
  assert.equal(h.nodes["pricing-current-title"].textContent,"Ваш тариф: Бизнес");
  assert.match(h.nodes["pricing-current-description"].textContent,/Подписка активна до/);
  assert.equal(h.get("basic").classes.has("is-current-plan"),true);
  assert.equal(h.get("basic").note.textContent,"Ваш текущий тариф");
  assert.equal(h.get("basic").link.hidden,true);
  assert.equal(h.get("pro").link.hidden,true,"Cannot prematurely order another plan");
  assert.equal(h.get("studio").link.hidden,true);
});
test("Pro, Studio, Agency and Ultimate subscriptions mark only their own card",()=>{
  for(const plan of ["pro","studio","agency","ultimate"]){
    const h=setup();
    h.emit("anons:access",login(plan,true,"2027-01-01T00:00:00Z"));
    assert.equal(h.get(plan).classes.has("is-current-plan"),true);
    for(const other of ["basic","pro","studio","agency","ultimate"].filter(p=>p!==plan))
      assert.equal(h.get(other).classes.has("is-current-plan"),false);
  }
});
test("a reported bank transfer displays pending, never a confirmed membership",()=>{
  const h=setup();
  h.emit("anons:access",login("free",false));
  h.emit("anons:manual-orders",{userId:"owner",orders:[
    {order_no:100001,plan:"basic",status:"payment_reported"}
  ]});
  assert.equal(h.nodes["pricing-current-title"].textContent,"Заказ AS-100001 · Бизнес");
  assert.match(h.nodes["pricing-current-description"].textContent,/только после подтверждения/);
  assert.equal(h.nodes["pricing-current-indicator"].textContent,"На проверке");
  assert.equal(h.get("basic").link.hidden,true);
  assert.equal(h.get("basic").classes.has("is-current-plan"),false);
  assert.equal(h.get("basic").classes.has("is-pending-plan"),true);
});
test("pending new order cannot be mistaken for completed paid plan",()=>{
  const h=setup();
  h.emit("anons:access",login("free",false));
  h.emit("anons:manual-orders",{orders:[{order_no:100123,plan:"pro",status:"awaiting_instructions"}]});
  assert.equal(h.nodes["pricing-current-indicator"].textContent,"Заявка создана");
  assert.equal(h.get("pro").note.textContent,"Заявка уже оформлена");
  assert.equal(h.get("pro").link.hidden,true);
});
test("when the membership is approved, paid state supersedes any stale pending event",()=>{
  const h=setup();
  h.emit("anons:access",login("free",false));
  h.emit("anons:manual-orders",{orders:[{order_no:100001,plan:"basic",status:"payment_reported"}]});
  h.emit("anons:access",login("basic",true,"2026-12-05T00:00:00Z"));
  assert.equal(h.nodes["pricing-current-title"].textContent,"Ваш тариф: Бизнес");
  assert.equal(h.get("basic").classes.has("is-pending-plan"),false);
});
test("failed membership verification cannot falsely call free or paid account verified",()=>{
  const h=setup();
  h.emit("anons:access",{loggedIn:true,verified:false,plan:"free",premium:false});
  assert.match(h.nodes["pricing-current-title"].textContent,/Не удалось проверить/);
  assert.equal(h.get("basic").link.hidden,true);
  assert.equal(h.get("free").note.hidden,true);
});
test("signout erases previous account's membership and pending order",()=>{
  const h=setup();
  h.emit("anons:access",login("basic",true));
  h.emit("anons:access",{loggedIn:false,verified:true,plan:"free",premium:false});
  assert.match(h.nodes["pricing-current-title"].textContent,/Войдите/);
  assert.equal(h.get("basic").classes.has("is-current-plan"),false);
  h.emit("anons:manual-orders",{orders:[]});
  assert.equal(h.get("basic").link.hidden,false);
});
test("pricing uses verified Supabase session and never upgrades on client order state",()=>{
  for(const plan of ["free","basic","pro","studio","agency","ultimate"])assert.match(html,new RegExp('data-plan="'+plan+'"'));
  assert.match(html,/id="pricing-current-title"/);
  assert.match(html,/src="\.\/pricing-status\.js"/);
  assert.match(auth,/loggedIn:true,verified:!lookupFailed,expiresAt/);
  assert.match(manual,/anons:manual-orders/);
  assert.doesNotMatch(source,/update\(\{\s*plan|insert\(\{\s*plan|client\.rpc/);
});
