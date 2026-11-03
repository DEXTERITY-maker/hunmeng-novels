import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

// These tests use in-memory provider responses, never an actual shop or database.
const source=await readFile(new URL('./functions/anons-yookassa-test-webhook/index.ts',import.meta.url),'utf8');
const paymentId='11111111-1111-4111-8111-111111111111';
const refundId='22222222-2222-4222-8222-222222222222';
const storeId='test-shop';
const payment=()=>({id:paymentId,test:true,status:'succeeded',recipient:{account_id:storeId},amount:{value:'299.00',currency:'RUB'}});
const refund=()=>({id:refundId,status:'succeeded',payment_id:paymentId});
function harness({p=payment(),r=refund(),credentials=true,verifiedShop=true,verifiedSecret=true,fail=false,providerStatus=200}={}){
  let handler;const requests=[],warnings=[];
  const env=credentials?{ANONS_YOOKASSA_TEST_SHOP_ID:'old-unverified',ANONS_YOOKASSA_TEST_SECRET_KEY:'old-unverified',
    ...(verifiedShop?{ANONS_YOOKASSA_TEST_VERIFIED_SHOP_ID:storeId}:{}),
    ...(verifiedSecret?{ANONS_YOOKASSA_TEST_SECRET_KEY_V2:'dummy-secret'}:{})}:{};
  const globals={Deno:{env:{get:name=>env[name]},serve:fn=>{handler=fn;}},
    console:{log(){},warn(...args){warnings.push(args);}},Response,Request,TextDecoder,Uint8Array,AbortSignal,btoa,
    fetch:async url=>{
      requests.push(String(url));
      if(fail)throw Error('provider offline');
      return Response.json(String(url).includes('/refunds/')?r:p,{status:providerStatus});
    }};
  vm.runInNewContext(stripTypeScriptTypes(source,{mode:'strip'}),globals);
  return {handler,requests,warnings};
}
const message=(event,id)=>({type:'notification',event,object:{id}});
const request=body=>new Request('https://example.test',{method:'POST',body:typeof body==='string'?body:JSON.stringify(body)});

test('unconfigured test shop cannot accept events',async()=>{
  const h=harness({credentials:false});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,503);
  assert.equal(h.requests.length,0);
});
test('an old unverified shop identifier alone does not enable the test webhook',async()=>{
  const h=harness({verifiedShop:false});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,503);
  assert.equal(h.requests.length,0);
});
test('an old unverified secret alone does not enable the test webhook',async()=>{
  const h=harness({verifiedSecret:false});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,503);
  assert.equal(h.requests.length,0);
});
test('valid test payment is verified with the provider',async()=>{
  const h=harness();
  const res=await h.handler(request(message('payment.succeeded',paymentId)));
  assert.equal(res.status,200);assert.equal((await res.json()).received,true);
  assert.equal(h.requests.length,1);
  assert.match(h.requests[0],/\/payments\//);
});
for(const [name,change] of [
  ['real payment',p=>p.test=false],
  ['different shop',p=>p.recipient.account_id='another'],
  ['different currency',p=>p.amount.currency='USD'],
  ['wrong state',p=>p.status='pending']
])test('rejects '+name,async()=>{
  const p=payment();change(p);const h=harness({p});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,400);
});
test('a canceled test payment is verified',async()=>{
  const p=payment();p.status='canceled';const h=harness({p});
  assert.equal((await h.handler(request(message('payment.canceled',paymentId)))).status,200);
});
test('refund is verified separately and then linked to a test payment',async()=>{
  const h=harness();
  assert.equal((await h.handler(request(message('refund.succeeded',refundId)))).status,200);
  assert.equal(h.requests.length,2);
  assert.match(h.requests[0],/\/refunds\//);assert.match(h.requests[1],/\/payments\//);
});
test('refund for a real payment is rejected',async()=>{
  const p=payment();p.test=false;const h=harness({p});
  assert.equal((await h.handler(request(message('refund.succeeded',refundId)))).status,400);
});
test('invalid provider identifier cannot be substituted',async()=>{
  const p=payment();p.id=refundId;const h=harness({p});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,503);
});
test('provider failure produces a retryable error',async()=>{
  const h=harness({fail:true});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,503);
  assert.deepEqual(h.warnings,[['Test provider connection failed']]);
});
test('provider HTTP errors log only a safe status, not credentials or response bodies',async()=>{
  const h=harness({providerStatus:401});
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,503);
  assert.deepEqual(h.warnings,[['Test provider HTTP status:',401]]);
});
test('invalid and oversized payloads do not call the provider',async()=>{
  const h=harness();
  assert.equal((await h.handler(request('{'))).status,400);
  assert.equal((await h.handler(request(JSON.stringify({...message('payment.succeeded',paymentId),padding:'x'.repeat(21000)})))).status,413);
  assert.equal(h.requests.length,0);
});
test('repeated events do not create state',async()=>{
  const h=harness();
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,200);
  assert.equal((await h.handler(request(message('payment.succeeded',paymentId)))).status,200);
  assert.equal(h.requests.length,2);
});
