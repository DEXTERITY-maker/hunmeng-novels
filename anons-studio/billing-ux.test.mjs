import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

// Simulated browser and payment responses. No payment requests leave this test.
const source=await readFile(new URL('./billing-entry.js',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
function element(){return {disabled:false,textContent:'',children:[],listeners:{},
  addEventListener(event,fn){this.listeners[event]=fn;},
  replaceChildren(...children){this.children=children;},append(...children){this.children.push(...children);},
  click(){return this.listeners.click?.();}};}

async function harness(checkoutResponse){
  const elements=Object.fromEntries(['buy-basic','billing-availability','billing-history','billing-member-status','billing-check'].map(id=>[id,element()]));
  const redirects=[],calls=[];
  const document={getElementById:id=>elements[id]||null,createElement:()=>element()};
  const window={dispatchEvent(){},location:{assign:url=>redirects.push(url)}};
  const client={auth:{getSession:async()=>({data:{session:{access_token:'fake-token'}},error:null})}};
  const fetch=async url=>{
    const action=new URL(url).searchParams.get('action');calls.push(action);
    if(action==='config')return Response.json({enabled:true});
    if(action==='history')return Response.json({membership:null,orders:[]});
    if(action==='checkout')return await checkoutResponse();
    throw Error('Unexpected action');
  };
  const context={document,window,Event,URL,fetch,console};
  vm.runInNewContext(source.replace('export function initBilling','function initBilling')+'\nglobalThis.initBilling=initBilling;',context);
  const billing=context.initBilling(client);billing.setUser({id:'user-a'});await tick();
  return {elements,billing,redirects,calls};
}

test('ambiguous provider failure warns and prevents immediate repeat',async()=>{
  const h=await harness(async()=>Response.json({error:'PROVIDER_UNAVAILABLE'},{status:503}));
  await h.elements['buy-basic'].click();
  assert.match(h.elements['billing-availability'].textContent,/не удалось определить/i);
  assert.doesNotMatch(h.elements['billing-availability'].textContent,/оплата не началась/i);
  assert.equal(h.elements['buy-basic'].disabled,true);
  await h.elements['buy-basic'].click();
  assert.equal(h.calls.filter(action=>action==='checkout').length,1);
});

test('a connection failure cannot be described as a failed payment',async()=>{
  const h=await harness(async()=>{throw new TypeError('network failure');});
  await h.elements['buy-basic'].click();
  assert.match(h.elements['billing-availability'].textContent,/не удалось определить/i);
  assert.equal(h.elements['buy-basic'].disabled,true);
});

test('an untrusted confirmation address is not opened',async()=>{
  const h=await harness(async()=>Response.json({url:'https://yookassa.ru.example.test/checkout'}));
  await h.elements['buy-basic'].click();
  assert.equal(h.redirects.length,0);
  assert.equal(h.elements['buy-basic'].disabled,true);
});

test('changing account during checkout prevents a stale redirect',async()=>{
  const request=deferred();
  const h=await harness(()=>request.promise);
  const pending=h.elements['buy-basic'].click();await tick();
  h.billing.setUser(null);
  request.resolve(Response.json({url:'https://yookassa.ru/checkout'}));
  await pending;
  assert.equal(h.redirects.length,0);
});

test('an earlier session of the same account cannot redirect after signing in again',async()=>{
  const request=deferred();
  const h=await harness(()=>request.promise);
  const pending=h.elements['buy-basic'].click();await tick();
  h.billing.setUser(null);h.billing.setUser({id:'user-a'});
  request.resolve(Response.json({url:'https://yookassa.ru/checkout'}));
  await pending;
  assert.equal(h.redirects.length,0);
});

test('simultaneous clicks make only one checkout request',async()=>{
  const request=deferred();
  const h=await harness(()=>request.promise);
  const first=h.elements['buy-basic'].click();await tick();
  await h.elements['buy-basic'].click();
  assert.equal(h.calls.filter(action=>action==='checkout').length,1);
  request.resolve(Response.json({url:'https://secure.yookassa.ru/checkout'}));
  await first;
  assert.deepEqual(h.redirects,['https://secure.yookassa.ru/checkout']);
});

test('an uncertain result remains blocked after signing out and back in',async()=>{
  const h=await harness(async()=>Response.json({error:'PROVIDER_UNAVAILABLE'},{status:503}));
  await h.elements['buy-basic'].click();
  h.billing.setUser(null);h.billing.setUser({id:'user-a'});
  assert.equal(h.elements['buy-basic'].disabled,true);
  await h.elements['buy-basic'].click();
  assert.equal(h.calls.filter(action=>action==='checkout').length,1);
});

test('a verified disabled checkout stays disabled',async()=>{
  const h=await harness(async()=>Response.json({error:'PAYMENTS_DISABLED'},{status:503}));
  await h.elements['buy-basic'].click();
  assert.equal(h.elements['buy-basic'].disabled,true);
  assert.match(h.elements['billing-availability'].textContent,/отключ/i);
});

test('a verified pre-check failure allows a later attempt',async()=>{
  const h=await harness(async()=>Response.json({error:'RATE_LIMITED'},{status:429}));
  await h.elements['buy-basic'].click();
  assert.equal(h.elements['buy-basic'].disabled,false);
  assert.match(h.elements['billing-availability'].textContent,/слишком много попыток/i);
});
