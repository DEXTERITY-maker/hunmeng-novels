import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

class Element {
  constructor(){this._value="";this.children=[];this.dataset={};this.textContent="";this.disabled=false;this.events={};}
  get value(){return this._value;}
  set value(v){this._value=String(v);}
  addEventListener(type,fn){this.events[type]=fn;}
  fire(type="click"){this.events[type]?.({target:this});}
  replaceChildren(){this.children=[];this.value="";}
  append(el){this.children.push(el);}
  focus(){this.focused=true;}
}
const key="anons-studio:personal-styles:v1";
const style={template:"aurora",theme:"ultraviolet",accentColor:"#c2a1ff",headingScale:110,
  graphicElements:[],titleFont:"manrope"};
function boot(initial=null,{failWrites=false}={}){
  const ids=["personal-styles","personal-style-name","personal-style-select","personal-style-save",
    "personal-style-apply","personal-style-rename","personal-style-delete","personal-style-count",
    "personal-style-status"];
  const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
  const data=initial?{[key]:initial}:{};
  let applied=null;
  let confirmed=true;
  const context={
    document:{getElementById:id=>elements[id]||null,createElement:()=>new Element()},
    window:{AnonsEditor:{getStyleSnapshot:()=>structuredClone(style),
      applyStyleSnapshot:next=>{applied=next;return true;}},
      confirm:()=>confirmed,addEventListener(){}},
    localStorage:{getItem:k=>data[k]??null,setItem:(k,v)=>{if(failWrites)throw Error("quota");data[k]=v;}},
    crypto:{randomUUID:()=>"a1234567-aaaa-4aaa-aaaa-123456789abc"},
    Date,Math,Object
  };
  const source=readFileSync(new URL("./personal-styles.js",import.meta.url),"utf8");
  runInNewContext(source,context,{timeout:1000});
  return {elements,data,get applied(){return applied},set confirmed(v){confirmed=v}};
}
test("saving a named style uses a separate local storage namespace and enables reuse",()=>{
  const ui=boot();
  const e=ui.elements;
  assert.equal(e["personal-style-save"].disabled,false);
  e["personal-style-name"].value="Стиль запуска";
  e["personal-style-save"].fire();
  const parsed=JSON.parse(ui.data[key]);
  assert.equal(parsed.length,1);
  assert.equal(parsed[0].name,"Стиль запуска");
  assert.equal(parsed[0].style.headingScale,110);
  assert.equal(e["personal-style-apply"].disabled,false);
  e["personal-style-apply"].fire();
  assert.equal(ui.applied.template,"aurora");
  assert.equal(e["personal-style-count"].textContent,"1 из 20");
});
test("renaming preserves style identity and deletion requires confirmation",()=>{
  const ui=boot();
  const e=ui.elements;
  e["personal-style-name"].value="Мой стиль";e["personal-style-save"].fire();
  e["personal-style-name"].value="Переименованный стиль";e["personal-style-rename"].fire();
  assert.equal(JSON.parse(ui.data[key])[0].name,"Переименованный стиль");
  ui.confirmed=false;e["personal-style-delete"].fire();
  assert.equal(JSON.parse(ui.data[key]).length,1);
  ui.confirmed=true;e["personal-style-delete"].fire();
  assert.equal(JSON.parse(ui.data[key]).length,0);
});
test("invalid names, duplicates and storage failure are reported, never silently saved",()=>{
  const ui=boot();
  const e=ui.elements;
  e["personal-style-name"].value=" ";
  e["personal-style-save"].fire();
  assert.match(e["personal-style-status"].textContent,/Введите название/);
  e["personal-style-name"].value="Бренд";
  e["personal-style-save"].fire();
  e["personal-style-name"].value="бренд";
  e["personal-style-save"].fire();
  assert.equal(JSON.parse(ui.data[key]).length,1);
  assert.match(e["personal-style-status"].textContent,/уже есть/);
  const quota=boot(null,{failWrites:true});
  quota.elements["personal-style-name"].value="Свой стиль";
  quota.elements["personal-style-save"].fire();
  assert.equal(quota.data[key],undefined);
  assert.match(quota.elements["personal-style-status"].textContent,/Не удалось сохранить/);
});
test("invalid browser storage is ignored instead of breaking the editor",()=>{
  const ui=boot("broken-json");
  assert.equal(ui.elements["personal-style-count"].textContent,"0 из 20");
  const malformed=boot(JSON.stringify([{id:"bad",name:"x",style:{}}]));
  assert.equal(malformed.elements["personal-style-count"].textContent,"0 из 20");
});
