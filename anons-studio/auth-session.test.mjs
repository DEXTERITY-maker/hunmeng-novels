import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

// Simulates Auth events without touching real accounts or sending requests.
const source=await readFile(new URL("./auth-entry.js",import.meta.url),"utf8");
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
function deferred(){
  let resolve,reject;
  const promise=new Promise((ok,no)=>{resolve=ok;reject=no;});
  return {promise,resolve,reject};
}
function harness(){
  const elements=new Map(),stored=new Map(),events=[];
  const calls={users:[],billing:[],drafts:0};
  const makeElement=()=>({
    textContent:"",value:"",hidden:false,disabled:false,classList:{toggle(){},add(){},remove(){}},
    addEventListener(){},setAttribute(){},querySelector(){return null;}
  });
  const document={
    getElementById(id){if(!elements.has(id))elements.set(id,makeElement());return elements.get(id);},
    querySelectorAll(){return []}
  };
  const responses=[];
  let onAuthEvent;
  const client={
    auth:{
      onAuthStateChange(fn){onAuthEvent=fn;return {data:{subscription:{unsubscribe(){}}}};},
      getUser(){return responses.shift()??Promise.resolve({data:{user:null},error:null});},
      getSession(){return Promise.resolve({data:{session:null},error:null});},
      signOut(){return Promise.resolve({error:null});}
    },
    from(table){
      assert.equal(table,"anons_studio_memberships");
      return {select(){return this;},eq(){return this;},
        async maybeSingle(){return {data:null,error:null};}};
    }
  };
  const library={setUser(u){calls.users.push(u?.id??null);},async flushPending(){return true;}};
  const billing={setUser(u){calls.billing.push(u?.id??null);}};
  const window={
    AnonsEditor:{newDraft(){calls.drafts++;}},
    dispatchEvent(e){events.push(e);},
    addEventListener(){},
    location:{hash:""}
  };
  const localStorage={
    getItem(k){return stored.get(k)??null;},
    setItem(k,v){stored.set(k,String(v));},
    removeItem(k){stored.delete(k);}
  };
  class CustomEvent {constructor(type,detail){this.type=type;this.detail=detail.detail;}}
  const stripped=source.replace(/^import .*;\s*$/gm,"");
  vm.runInNewContext(stripped,{
    document,window,localStorage,CustomEvent,console,setTimeout,clearTimeout,
    createClient:()=>client,initLibrary:()=>library,initBilling:()=>billing,confirm:()=>true
  },{timeout:1000,filename:"auth-entry.js"});
  assert.equal(typeof onAuthEvent,"function");
  return {
    elements,stored,events,calls,responses,
    emit:(type,id)=>onAuthEvent(type,id?{user:{id,email:id+"@example.invalid"}}:null),
    resolved:id=>Promise.resolve({data:{user:{id,email:id+"@example.invalid"}},error:null}),
    element:id=>elements.get(id)
  };
}

test("changing accounts hides the old account before network validation",async()=>{
  const h=harness();
  h.responses.push(h.resolved("user-a"));
  h.emit("SIGNED_IN","user-a");
  await tick();await tick();
  assert.equal(h.element("account-email-signed").textContent,"user-a@example.invalid");
  assert.equal(h.element("account-signed").hidden,false);
  assert.equal(h.calls.users.at(-1),"user-a");
  const pending=deferred();
  h.responses.push(pending.promise);
  const draftsBefore=h.calls.drafts;
  h.emit("SIGNED_IN","user-b");
  assert.equal(h.element("account-signed").hidden,true,"Old account panel must hide synchronously");
  assert.equal(h.element("nav-account").textContent,"Войти");
  assert.equal(h.calls.users.at(-1),null,"Old library must disconnect immediately");
  assert.equal(h.calls.billing.at(-1),null,"Old billing must disconnect immediately");
  assert.equal(h.calls.drafts,draftsBefore+1,"Old canvas content must be cleared");
  await tick();
  pending.resolve({data:{user:{id:"user-b",email:"user-b@example.invalid"}},error:null});
  await tick();await tick();
  assert.equal(h.element("account-email-signed").textContent,"user-b@example.invalid");
  assert.equal(h.element("account-signed").hidden,false);
  assert.equal(h.calls.users.at(-1),"user-b");
});

test("stale authentication errors cannot sign out a newer validated session",async()=>{
  const h=harness();
  h.responses.push(h.resolved("user-a"));
  h.emit("SIGNED_IN","user-a");await tick();await tick();
  const old=deferred();
  h.responses.push(old.promise);
  h.emit("TOKEN_REFRESHED","user-a");
  await tick();
  h.responses.push(h.resolved("user-a"));
  h.emit("SIGNED_IN","user-a");
  await tick();await tick();
  assert.equal(h.element("account-signed").hidden,false);
  old.reject(Error("outdated auth network failure"));
  await tick();await tick();
  assert.equal(h.element("account-signed").hidden,false);
  assert.equal(h.calls.users.at(-1),"user-a");
  assert.equal(h.element("nav-account").textContent,"Мой аккаунт");
});

test("initial session discards canvas associated with a different owner",async()=>{
  const h=harness();
  const key="anons-studio:cloud-active-v05";
  h.stored.set(key,JSON.stringify({userId:"user-old",id:"11111111-1111-4111-8111-111111111111",version:1}));
  h.responses.push(h.resolved("user-new"));
  h.emit("INITIAL_SESSION","user-new");
  assert.equal(h.stored.has(key),false);
  assert.equal(h.calls.drafts,1);
  await tick();await tick();
  assert.equal(h.calls.users.at(-1),"user-new");
});

test("signed-out events revoke account UI and access without waiting for the network",async()=>{
  const h=harness();
  h.responses.push(h.resolved("user-a"));
  h.emit("SIGNED_IN","user-a");await tick();await tick();
  const draftsBefore=h.calls.drafts;
  h.emit("SIGNED_OUT",null);
  assert.equal(h.element("account-signed").hidden,true);
  assert.equal(h.calls.users.at(-1),null);
  assert.equal(h.calls.drafts,draftsBefore+1);
  assert.equal(h.events.at(-1).detail.plan,"free");
  assert.equal(h.events.at(-1).detail.premium,false);
});
