import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("./brand-kit.js",import.meta.url),"utf8");
const prefix="anons-studio:brand-kits:v1";
const expected={project:"ACME STUDIO",theme:"emerald",accentColor:"#7ef0cb",titleFont:"manrope"};
class Element {
  constructor(){this._value="";this.children=[];this.handlers={};this.dataset={};this.style={};
    this.textContent="";this.hidden=false;this.disabled=false;}
  get value(){return this._value;}
  set value(v){this._value=String(v);}
  addEventListener(type,fn){(this.handlers[type]??=[]).push(fn);}
  fire(type="click"){for(const fn of this.handlers[type]||[])fn({target:this});}
  append(child){this.children.push(child);}
  replaceChildren(){this.children=[];this.value="";}
  focus(){this.focused=true;}
}
function boot(shared=null,{denyWrites=false}={}){
  const ids=["brand-kit","brand-kit-name","brand-kit-list","brand-kit-save","brand-kit-apply",
    "brand-kit-rename","brand-kit-delete","brand-kit-count","brand-kit-status","brand-kit-identity",
    "brand-kit-preview","brand-kit-preview-brand","brand-kit-preview-details","brand-kit-preview-swatch"];
  const el=Object.fromEntries(ids.map(id=>[id,new Element()]));
  let apply=null,kit={...expected},scope="active",confirmed=true,n=0;
  const store=shared||new Map(),events={};
  const window={
    AnonsEditor:{getBrandKitSnapshot:()=>({...kit}),
      applyBrandKitSnapshot:(data,target)=>{apply={data,target};return true;}},
    addEventListener:(type,fn)=>{events[type]=fn;},
    confirm:()=>confirmed
  };
  const document={
    getElementById:id=>el[id]||null,
    createElement:()=>new Element(),
    querySelector:()=>({value:scope})
  };
  const localStorage={getItem:key=>store.get(key)??null,
    setItem:(key,value)=>{if(denyWrites)throw Error("QUOTA");store.set(key,String(value));}};
  runInNewContext(source,{document,window,localStorage,Date,Math,Object,console,
    crypto:{randomUUID:()=>`deadbeef-0000-4000-8000-${String(++n).padStart(12,"0")}`}},
    {timeout:1000});
  return {el,store,window,events,set kit(v){kit=v},set scope(s){scope=s},
    set confirmed(v){confirmed=v},get applied(){return apply}};
}

test("save brand kit, preview color, rename and delete without changing project",()=>{
  const h=boot(),e=h.el;
  assert.equal(e["brand-kit-count"].textContent,"0 из 12");
  e["brand-kit-name"].value="Фирменный набор";e["brand-kit-save"].fire();
  let records=JSON.parse(h.store.get(prefix+":guest"));
  assert.equal(records.length,1);assert.equal(records[0].kit.project,"ACME STUDIO");
  assert.equal(e["brand-kit-preview-swatch"].style.backgroundColor,"#7ef0cb");
  assert.equal(e["brand-kit-apply"].disabled,false);
  h.scope="all";e["brand-kit-apply"].fire();
  assert.equal(h.applied.target,"all");
  assert.equal(h.applied.data.title,undefined);
  e["brand-kit-name"].value="Другое имя";e["brand-kit-rename"].fire();
  records=JSON.parse(h.store.get(prefix+":guest"));
  assert.equal(records[0].name,"Другое имя");
  h.confirmed=false;e["brand-kit-delete"].fire();
  assert.equal(JSON.parse(h.store.get(prefix+":guest")).length,1);
  h.confirmed=true;e["brand-kit-delete"].fire();
  assert.equal(JSON.parse(h.store.get(prefix+":guest")).length,0);
});

test("separate guest and account libraries and restore correctly on switching",()=>{
  const h=boot(),e=h.el;
  e["brand-kit-name"].value="Гостевой набор";e["brand-kit-save"].fire();
  h.window.AnonsBrandKit.setUser({id:"user-aaaa"});
  assert.equal(e["brand-kit-count"].textContent,"0 из 12");
  e["brand-kit-name"].value="Фирменный стиль аккаунта";e["brand-kit-save"].fire();
  assert.equal(JSON.parse(h.store.get(prefix+":user-aaaa")).length,1);
  h.window.AnonsBrandKit.setUser({id:"user-bbbb"});
  assert.equal(e["brand-kit-count"].textContent,"0 из 12");
  h.window.AnonsBrandKit.setUser({id:"user-aaaa"});
  assert.equal(e["brand-kit-count"].textContent,"1 из 12");
  h.window.AnonsBrandKit.setUser(null);
  assert.equal(e["brand-kit-count"].textContent,"1 из 12");
  assert.equal(JSON.parse(h.store.get(prefix+":guest"))[0].name,"Гостевой набор");
});

test("invalid or duplicated brand data cannot corrupt local collection",()=>{
  const h=boot(),e=h.el;
  e["brand-kit-name"].value=" ";
  e["brand-kit-save"].fire();
  assert.match(e["brand-kit-status"].textContent,/Название набора/);
  h.kit={...expected,title:"copied content"};
  e["brand-kit-name"].value="Набор";
  e["brand-kit-save"].fire();
  assert.equal(e["brand-kit-status"].dataset.error,"false");
  e["brand-kit-name"].value="набор";
  e["brand-kit-save"].fire();
  assert.equal(JSON.parse(h.store.get(prefix+":guest")).length,1);
  const bad=boot(new Map([[prefix+":guest",'{"oops":1}']]));
  assert.equal(bad.el["brand-kit-count"].textContent,"0 из 12");
  const blocked=boot(null,{denyWrites:true});
  blocked.el["brand-kit-name"].value="Бренд";
  blocked.el["brand-kit-save"].fire();
  assert.match(blocked.el["brand-kit-status"].textContent,/Не удалось сохранить/);
});

test("stored kit is restored on new mount and applies to current card",()=>{
  const map=new Map();
  const a=boot(map);
  a.el["brand-kit-name"].value="Повторное использование";a.el["brand-kit-save"].fire();
  const b=boot(map);
  assert.equal(b.el["brand-kit-count"].textContent,"1 из 12");
  const id=JSON.parse(map.get(prefix+":guest"))[0].id;
  b.el["brand-kit-list"].value=id;
  b.el["brand-kit-list"].fire("change");
  b.el["brand-kit-apply"].fire();
  assert.equal(b.applied.target,"active");
  assert.equal(b.applied.data.titleFont,"manrope");
});
