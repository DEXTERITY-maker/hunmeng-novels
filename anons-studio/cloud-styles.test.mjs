import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source=readFileSync(new URL("./personal-styles.js",import.meta.url),"utf8");
const key="anons-studio:personal-styles:v1";
const tick=()=>new Promise(ok=>setTimeout(ok,12));
class Elem {
  constructor(){this._value="";this.textContent="";this.dataset={};this.children=[];this.disabled=false;this.hidden=false;this.handlers={};}
  set value(v){this._value=String(v);}
  get value(){return this._value;}
  addEventListener(name,fn){this.handlers[name]=fn;}
  fire(name="click"){this.handlers[name]?.({target:this});}
  append(x){this.children.push(x);}
  replaceChildren(){this.children=[];this._value="";}
  focus(){this.focused=true;}
}
function make(){
  const names=["personal-styles","personal-style-name","personal-style-select","personal-style-save","personal-style-apply",
   "personal-style-rename","personal-style-delete","personal-style-count","personal-style-status",
   "personal-style-cloud-refresh","personal-style-cloud-import","personal-style-scope"];
  const dom=Object.fromEntries(names.map(id=>[id,new Elem()]));
  const browser=new Map(), rows=[];
  const pending=[], events={};
  let guid=0,applied=null;
  const cloud={
    from(table){
      assert.equal(table,"anons_studio_styles");
      let method="select",payload=null,filters={};
      const chain={
        select(){return this;},eq(k,v){filters[k]=v;return this;},order(){return this;},
        limit(){const selected=rows.filter(row=>Object.entries(filters).every(([k,v])=>row[k]===v));
          return Promise.resolve({data:selected,error:null});},
        insert(v){method="insert";payload=v;return this;},
        update(v){method="update";payload=v;return this;},
        delete(){method="delete";return this;},
        async single(){return run();},
        async maybeSingle(){return run();},
        then(resolve,reject){return run().then(resolve,reject);}
      };
      async function run(){
        if(method==="insert"){
          const input=Array.isArray(payload)?payload:[payload];
          const incoming=input.map(x=>({...x,created_at:"2026-11-04T19:00:00Z",updated_at:"2026-11-04T19:00:00Z"}));
          rows.push(...incoming);return {data:Array.isArray(payload)?incoming:incoming[0],error:null};
        }
        const found=rows.findIndex(row=>Object.entries(filters).every(([k,v])=>row[k]===v));
        if(found<0)return {data:null,error:null};
        if(method==="update"){
          Object.assign(rows[found],payload);return {data:{...rows[found]},error:null};
        }
        if(method==="delete")return {data:{id:rows.splice(found,1)[0].id},error:null};
        return {data:{...rows[found]},error:null};
      }
      return chain;
    }
  };
  const win={AnonsEditor:{
    getStyleSnapshot:()=>({template:"aurora",theme:"ultraviolet",titleFont:"manrope",headingScale:110}),
    applyStyleSnapshot:style=>{applied=style;return true;}
  },confirm:()=>true,addEventListener:(type,fn)=>{events[type]=fn;}};
  const doc={getElementById:id=>dom[id]||null,createElement:()=>new Elem(),addEventListener(){}};
  const storage={getItem:k=>browser.get(k)||null,setItem:(k,v)=>browser.set(k,v)};
  runInNewContext(source,{window:win,document:doc,localStorage:storage,
    crypto:{randomUUID:()=>`9c8b46da-d09a-4767-8f12-${String(++guid).padStart(12,"0")}`},
    Date,Math,Object,console},{timeout:1000});
  return {dom,browser,rows,cloud,win,events,get applied(){return applied}};
}

test("guest styles remain local and never auto-upload on login",async()=>{
  const x=make();
  x.dom["personal-style-name"].value="Гостевое оформление";
  x.dom["personal-style-save"].fire();
  assert.equal(JSON.parse(x.browser.get(key)).length,1);
  x.win.AnonsPersonalStyles.setUser({id:"user-a"},x.cloud);
  await tick();
  assert.equal(x.rows.length,0);
  assert.equal(x.dom["personal-style-count"].textContent,"0 из 20");
  assert.equal(x.dom["personal-style-cloud-import"].hidden,false);
  assert.match(x.dom["personal-style-scope"].textContent,/Облако аккаунта/);
  x.win.AnonsPersonalStyles.setUser(null,x.cloud);
  assert.equal(x.dom["personal-style-count"].textContent,"1 из 20");
});

test("authenticated styles are saved only for owner and isolated on account switch",async()=>{
  const x=make();
  x.win.AnonsPersonalStyles.setUser({id:"user-a"},x.cloud);await tick();
  x.dom["personal-style-name"].value="Брендовый стиль";
  x.dom["personal-style-save"].fire();await tick();
  assert.equal(x.rows.length,1);
  assert.equal(x.rows[0].owner_id,"user-a");
  assert.equal(x.rows[0].style.title,undefined);
  assert.equal(x.dom["personal-style-count"].textContent,"1 из 20");
  x.win.AnonsPersonalStyles.setUser({id:"user-b"},x.cloud);await tick();
  assert.equal(x.dom["personal-style-count"].textContent,"0 из 20");
  x.win.AnonsPersonalStyles.setUser({id:"user-a"},x.cloud);await tick();
  assert.equal(x.dom["personal-style-count"].textContent,"1 из 20");
  x.dom["personal-style-select"].value=x.rows[0].id;
  x.dom["personal-style-select"].fire("change");
  x.dom["personal-style-apply"].fire();
  assert.equal(x.applied.template,"aurora");
  x.dom["personal-style-name"].value="Новый бренд";
  x.dom["personal-style-rename"].fire();await tick();
  assert.equal(x.rows[0].name,"Новый бренд");
  x.dom["personal-style-delete"].fire();await tick();
  assert.equal(x.rows.length,0);
  assert.equal(x.dom["personal-style-count"].textContent,"0 из 20");
});

test("local-to-cloud import happens only after explicit interaction",async()=>{
  const x=make();
  x.dom["personal-style-name"].value="Важный стиль";
  x.dom["personal-style-save"].fire();
  x.win.AnonsPersonalStyles.setUser({id:"user-a"},x.cloud);await tick();
  x.dom["personal-style-cloud-import"].fire();await tick();
  assert.equal(x.rows.length,1);
  assert.equal(x.rows[0].owner_id,"user-a");
  assert.equal(JSON.parse(x.browser.get(key)).length,1,"Local copies remain untouched");
});
