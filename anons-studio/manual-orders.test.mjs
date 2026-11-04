import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("./manual-orders-entry.js",import.meta.url),"utf8")
  .replace("export function initManualOrders","function initManualOrders");
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
class E {
  constructor(){this.children=[];this.listeners={};this.dataset={};this.hidden=false;this.disabled=false;
    this.textContent="";this.type="";this.className="";this.value="";}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  click(){for(const fn of this.listeners.click||[])fn();}
  append(...values){this.children.push(...values);}
  replaceChildren(){this.children=[];}
  setAttribute(name,value){this[name]=value;}
}
function setup({admin=false,customerNo=2,delayed=false}={}){
  const names=["manual-order-root","manual-customer-number","manual-account-orders","manual-admin-panel",
    "manual-order-create","manual-order-customer","manual-order-status","manual-order-list","manual-account-order-list",
    "manual-admin-order-list","manual-admin-status","manual-order-login","manual-order-refresh",
    "manual-account-refresh","manual-admin-refresh"];
  const els=Object.fromEntries(names.map(n=>[n,new E()]));
  const calls=[],rows=[],events={},ordersForAdmin=[];
  let confirmed=true,paid=false,freeze=null;
  const document={getElementById:name=>els[name]||null,createElement:()=>new E()};
  const window={addEventListener:(name,fn)=>{events[name]=fn;},
    confirm:()=>confirmed,AnonsBilling:{refresh:()=>{paid=true;}}};
  const client={
    rpc:async(name,args={})=>{
      calls.push({name,args});
      if(name==="anons_studio_customer_number"){
        if(freeze)return await freeze;
        return {data:customerNo,error:null};
      }
      if(name==="anons_studio_manual_is_admin")return {data:admin,error:null};
      if(name==="anons_studio_manual_create_order"){
        if(!rows.some(x=>["awaiting_instructions","payment_reported"].includes(x.status))){
          rows.unshift({order_no:100001,plan:"basic",amount_kopecks:29900,
            status:"awaiting_instructions",created_at:"2026-11-04T13:00:00Z"});
        }
        return {data:100001,error:null};
      }
      if(name==="anons_studio_manual_report_transfer"){
        rows.find(x=>x.order_no===args.p_order_no).status="payment_reported";
        return {data:true,error:null};
      }
      if(name==="anons_studio_manual_cancel_order"){
        rows.find(x=>x.order_no===args.p_order_no).status="canceled";
        return {data:true,error:null};
      }
      if(name==="anons_studio_manual_admin_orders")return {data:ordersForAdmin,error:null};
      if(name==="anons_studio_manual_review"){
        return {data:args.p_approve?"approved":"rejected",error:null};
      }
      throw Error("Unexpected RPC "+name);
    },
    from(table){
      assert.equal(table,"anons_studio_manual_orders","Client cannot write entitlement or payment ledger");
      const q={select(){return this;},eq(){return this;},order(){return this;},
        limit:async()=>({data:rows,error:null})};
      return q;
    }
  };
  const context={document,window,console,Date,Promise,Number,String,Event};
  vm.runInNewContext(source+"\nglobalThis.initManualOrders=initManualOrders;",context);
  const instance=context.initManualOrders(client);
  return {instance,els,calls,rows,ordersForAdmin,events,window,
    set confirmed(v){confirmed=v},get paid(){return paid},
    hold(p){freeze=p}};
}
test("guest cannot submit, account receives server number not a browser-selected ID",async()=>{
  const h=setup();
  assert.equal(h.els["manual-order-create"].disabled,true);
  assert.match(h.els["manual-customer-number"].textContent,/Войдите/);
  h.els["manual-order-create"].click();
  assert.equal(h.calls.length,0);
  h.instance.setUser({id:"customer-uuid-2"});
  await tick();
  assert.equal(h.els["manual-order-customer"].textContent,"ID-2");
  assert.equal(h.els["manual-order-create"].disabled,false);
  assert.equal(h.els["manual-order-login"].hidden,true);
  assert.equal(h.calls.some(x=>x.name==="anons_studio_customer_number"),true);
  assert.equal(h.calls.some(x=>x.name==="anons_studio_manual_create_order"),false);
});
test("create order and user-declared transfer never activates subscription",async()=>{
  const h=setup();
  h.instance.setUser({id:"a"});await tick();
  h.els["manual-order-create"].click();await tick();
  assert.equal(h.rows.length,1);
  assert.equal(h.rows[0].amount_kopecks,29900);
  assert.match(h.els["manual-order-status"].textContent,/AS-100001/);
  const orderButtons=h.els["manual-order-list"].children[0].children
    .find(x=>x.className==="manual-order-item-actions").children;
  const report=orderButtons.find(x=>x.textContent==="Я перевёл");
  assert.ok(report);
  report.click();await tick();
  assert.equal(h.rows[0].status,"payment_reported");
  assert.equal(h.paid,false,"User-reported transfer is not payment verification");
  assert.equal(h.calls.filter(x=>x.name==="anons_studio_manual_review").length,0);
});
test("signing out clears identity, orders and private admin panel",async()=>{
  const h=setup({admin:true});
  h.instance.setUser({id:"a"});await tick();
  assert.equal(h.els["manual-admin-panel"].hidden,false);
  h.instance.setUser(null);
  assert.match(h.els["manual-customer-number"].textContent,/Войдите/);
  assert.equal(h.els["manual-admin-panel"].hidden,true);
  assert.equal(h.els["manual-order-create"].disabled,true);
  assert.equal(h.els["manual-account-order-list"].children[0].textContent,
    "Войдите в аккаунт, чтобы увидеть свои заказы.");
});
test("admin review requires explicit confirmation and never displays to guests",async()=>{
  const h=setup({admin:true,customerNo:1});
  h.ordersForAdmin.push({order_no:100009,customer_no:7,contact_email:"buyer@example.invalid",
    plan:"basic",amount_kopecks:29900,status:"payment_reported",transfer_note:"",
    created_at:"2026-11-04T13:00:00Z"});
  h.instance.setUser({id:"admin-id"});await tick();
  assert.equal(h.els["manual-customer-number"].textContent,"ID-1");
  assert.equal(h.els["manual-admin-panel"].hidden,false);
  const adminButtons=h.els["manual-admin-order-list"].children[0].children
    .find(x=>x.className==="manual-admin-actions").children;
  const approve=adminButtons.find(x=>x.textContent==="Подтвердить поступление");
  h.confirmed=false;approve.click();await tick();
  assert.equal(h.calls.filter(x=>x.name==="anons_studio_manual_review").length,0);
  h.confirmed=true;approve.click();await tick();
  assert.equal(h.calls.filter(x=>x.name==="anons_studio_manual_review").length,1);
  assert.equal(h.paid,true);
});
test("stale ID lookup after account switch cannot leak the former customer's number",async()=>{
  const h=setup();let resolve;
  h.hold(new Promise(ok=>{resolve=ok;}));
  h.instance.setUser({id:"old"});await tick();
  h.instance.setUser(null);
  resolve({data:7,error:null});await tick();
  assert.match(h.els["manual-customer-number"].textContent,/Войдите/);
  assert.equal(h.els["manual-admin-panel"].hidden,true);
});
test("checkout code contains no card number, card data or automatic payment request",()=>{
  assert.doesNotMatch(source,/service_role|CVV=|client\.from\(["']anons_studio_memberships["']\)\.upsert/);
  assert.match(source,/anons_studio_manual_create_order/);
  assert.match(source,/anons_studio_manual_review/);
  assert.doesNotMatch(source,/yookassa\.ru|confirmation_url/);
});
