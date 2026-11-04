import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const source=readFileSync(new URL("./studio-workspace-entry.js",import.meta.url),"utf8");
const sql=readFileSync(new URL("./schema/anons-studio-studio-brand-batch.sql",import.meta.url),"utf8");
const h=readFileSync(new URL("./editor.html",import.meta.url),"utf8");
const edge=readFileSync(new URL("./functions/anons-premium-export/index.ts",import.meta.url),"utf8");
const uid="11111111-1111-4111-8111-111111111111";
const target="22222222-2222-4222-8222-222222222222";
const current="33333333-3333-4333-8333-333333333333";
class Element{
  constructor(tag="div"){
    this.tag=tag;this.children=[];this.events={};this.value="";
    this.style={};this.dataset={};this.textContent="";this.checked=false;this.disabled=false;
  }
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=children;}
  addEventListener(key,callback){this.events[key]=callback;}
  setAttribute(){}
  fire(key){this.events[key]?.({target:this});}
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function setup(){
  const ids=["studio-workspace","studio-project-list","studio-workspace-status",
    "studio-selected-count","studio-projects-refresh","studio-refresh-style",
    "studio-apply-brand","studio-style-description","studio-style-swatch"];
  const dom=Object.fromEntries(ids.map(x=>[x,new Element()]));
  const handlers={};
  const calls=[];
  const projects=[
    {id:target,title:"Проект А",version:4,archived:false},
    {id:current,title:"Открытый проект",version:2,archived:false}
  ];
  const client={
    from(name){
      assert.equal(name,"anons_studio_projects");
      return{select(){return this;},eq(){return this;},order(){return this;},
        limit(){return Promise.resolve({data:projects,error:null});}};
    },
    rpc(name,args){
      calls.push({name,args});
      return Promise.resolve({data:args?.p_targets.length,error:null});
    }
  };
  const context={
    document:{getElementById:id=>dom[id],createElement:tag=>new Element(tag)},
    window:{
      AnonsEditor:{getBrandKitSnapshot:()=>({
        project:"BRAND",theme:"emerald",accentColor:"#12ab34",titleFont:"manrope"
      })},
      addEventListener:(name,callback)=>{handlers[name]=callback;},
      dispatchEvent(event){handlers[event.type]?.(event);},
      confirm(){return true;}
    },
    localStorage:{getItem(key){return key.endsWith("cloud-active-v05")
      ?JSON.stringify({userId:uid,id:current}):null;}},
    Event:class{constructor(type){this.type=type;}},
    Object,Set,Array,Promise,Number,String
  };
  const entry=vm.runInNewContext(source.replace("export function initStudioWorkspace","function initStudioWorkspace")+";initStudioWorkspace",context);
  const widget=entry(client);
  return{widget,dom,handlers,calls,projects};
}
test("Studio module never opens cloud project batch tools for guests or Business/Pro",async()=>{
  const x=setup();
  assert.equal(x.dom["studio-apply-brand"].disabled,true);
  x.widget.setUser({id:uid});
  for(const plan of ["basic","pro"]){
    x.handlers["anons:access"]({detail:{premium:true,plan}});
    await tick();
    assert.equal(x.dom["studio-apply-brand"].disabled,true);
    assert.equal(x.dom["studio-projects-refresh"].disabled,true);
  }
  assert.equal(x.calls.length,0);
});
test("Studio selects only other projects, sends colour/font not text, and preserves IDs",async()=>{
  const x=setup();
  x.widget.setUser({id:uid});
  x.handlers["anons:access"]({detail:{premium:true,plan:"studio"}});
  await tick();
  const choices=x.dom["studio-project-list"].children;
  assert.equal(choices.length,1,"Active cloud project must be excluded");
  assert.equal(choices[0].children[1].children[0].textContent,"Проект А");
  const checkbox=choices[0].children[0];
  checkbox.checked=true;checkbox.fire("change");
  assert.equal(x.dom["studio-selected-count"].textContent,"Выбрано: 1 из 8");
  assert.equal(x.dom["studio-apply-brand"].disabled,false);
  x.dom["studio-apply-brand"].fire("click");
  await tick();await tick();
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].name,"anons_studio_studio_apply_brand");
  assert.equal(x.calls[0].args.p_targets[0].id,target);
  assert.equal(x.calls[0].args.p_targets[0].version,4);
  assert.equal(x.calls[0].args.p_style.project,undefined);
  assert.deepEqual(Object.keys(x.calls[0].args.p_style).sort(),
    ["accentColor","theme","titleFont"]);
  assert.equal(x.calls[0].args.p_style.accentColor,"#12ab34");
});
test("Server denies forged tier, foreign rows and stale snapshots, preserving rollback",()=>{
  assert.match(sql,/m.plan='studio'/);
  assert.match(sql,/m.status in \('active','trialing'\)/);
  assert.match(sql,/p.owner_id=uid/);
  assert.match(sql,/for update/);
  assert.match(sql,/target.version<>expected_version/);
  assert.match(sql,/on conflict \(project_id,version\) do nothing/);
  assert.match(sql,/anons_studio_project_revisions/);
  assert.match(sql,/jsonb_build_object/);
  assert.match(sql,/revoke all on function/);
  assert.match(sql,/grant execute on function/);
  assert.match(edge,/STUDIO_SUBSCRIPTION_REQUIRED/);
  assert.match(edge,/STUDIO_TEMPLATES/);
  assert.match(h,/id="studio-project-list"/);
  assert.match(h,/id="studio-apply-brand" type="button" disabled/);
});
