import test from 'node:test';
import assert from 'node:assert/strict';

// Public canary: never creates orders, logs in, pays or modifies a real record.
// This intentionally probes the deployed Supabase Edge endpoints from CI.
const origin='https://anons-studio-preview.pages.dev';
const base='https://kvgnjsntumofwqhywiea.supabase.co/functions/v1';
const ready={};
async function call(path,options={}){
  const response=await fetch(base+path,{
    method:options.method||'GET',
    headers:{Origin:options.origin||origin, ...(options.headers||{})},
    body:options.body,
    redirect:'manual',
    signal:AbortSignal.timeout(18000),
    cache:'no-store'
  });
  let json;try{json=await response.json();}catch{json=null;}
  return {status:response.status,json,headers:response.headers};
}

test('live billing stays disabled, is not test-mode or auto-renewing',async()=>{
  const res=await call('/anons-billing?action=config');
  assert.equal(res.status,200,'public billing status reachable');
  assert.equal(res.json?.enabled,false,'purchases must remain disabled until explicit approval');
  assert.equal(res.json?.autoRenew,false);
  assert.equal(res.json?.periodDays,30);
  assert.deepEqual(res.json?.availablePlans,['basic'],'only Basic may be offered when ready');
  assert.equal(res.headers.get('access-control-allow-origin'),origin);
  assert.equal(res.headers.get('cache-control'),'no-store');
  ready.config=true;
});

test('live checkout refuses unauthenticated callers before any payment',async()=>{
  const res=await call('/anons-billing?action=checkout',{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({plan:'basic'})
  });
  assert.equal(res.status,503,'checkout is administratively disabled');
  assert.equal(res.json?.error,'PAYMENTS_DISABLED');
});

test('live premium PNG requires verified identity and does not expose image to guests',async()=>{
  const body=JSON.stringify({cardIndex:0,snapshot:{ratio:'square',cards:[{
    title:'Публичный тест не должен создавать PNG',template:'aurora'
  }]}});
  const anonymous=await call('/anons-premium-export',{
    method:'POST',headers:{'content-type':'application/json'},body
  });
  assert.equal(anonymous.status,401,'guest cannot render premium image');
  assert.equal(anonymous.json?.error,'LOGIN_REQUIRED');
  assert.ok(!(anonymous.headers.get('content-type')||'').startsWith('image/'));
  const forged=await call('/anons-premium-export',{
    method:'POST',headers:{authorization:'Bearer not-a-real-token','content-type':'application/json'},body
  });
  assert.equal(forged.status,401,'forged access token cannot render premium PNG');
  assert.equal(forged.json?.error,'LOGIN_REQUIRED');
});

test('live private billing endpoints require authentication',async()=>{
  for(const [path,method] of [
    ['/anons-billing?action=history','GET'],
    ['/anons-billing?action=sync','POST']
  ]){
    const res=await call(path,{method});
    assert.equal(res.status,401,path+' refuses guests');
    assert.equal(res.json?.error,'LOGIN_REQUIRED');
  }
});

test('live API refuses foreign browser origins',async()=>{
  const evil='https://invalid-origin.example';
  for(const [path,method] of [
    ['/anons-billing?action=config','GET'],
    ['/anons-premium-export','POST']
  ]){
    const res=await call(path,{method,origin:evil});
    assert.equal(res.status,403,path+' rejects untrusted browser origins');
    assert.equal(res.json?.error,'ORIGIN_FORBIDDEN');
    assert.notEqual(res.headers.get('access-control-allow-origin'),evil);
  }
});