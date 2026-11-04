import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';

// Exercise the actual Edge handlers with in-memory substitutes for Auth,
// PostgREST and YooKassa. No database rows, network calls or payments are made.
const billingSource=await readFile(new URL('./functions/anons-billing/index.ts',import.meta.url),'utf8');
const exportSource=await readFile(new URL('./functions/anons-premium-export/index.ts',import.meta.url),'utf8');
const paymentId='11111111-1111-4111-8111-111111111111';
const orderId='22222222-2222-4222-8222-222222222222';
const userId='33333333-3333-4333-8333-333333333333';
const refundId='77777777-7777-4777-8777-777777777777';
const env={SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'secret',
  YOOKASSA_SHOP_ID:'shop',YOOKASSA_SECRET_KEY:'merchant',YOOKASSA_VAT_CODE:'1',
  ANONS_BILLING_ENABLED:'true',ANONS_PREMIUM_EXPORT_READY:'true'};
const order={id:orderId,user_id:userId,plan:'basic',shop_id:'shop',provider_payment_id:paymentId,amount_kopecks:29900};
function validPayment(){return {id:paymentId,status:'succeeded',paid:true,test:false,
  recipient:{account_id:'shop'},amount:{value:'299.00',currency:'RUB'},
  refunded_amount:{value:'0.00',currency:'RUB'},metadata:{order_id:orderId,user_id:userId,plan:'basic'}};}
function validRefund(){return {id:refundId,status:'succeeded',payment_id:paymentId,amount:{value:'50.00',currency:'RUB'}};}

function harness(source,{payment=validPayment(),refund=validRefund(),member=null,providerStatus=200,refundStatus=200,rpcResult='activated',providerFailure=false,extraEnv={}}={}){
  let handler;const rpcCalls=[],networkCalls=[],networkSignals=[];
  const admin={
    from(table){
      return {
        select(){return this;},eq(){return this;},
        async maybeSingle(){return {data:table==='anons_studio_payment_orders'?order:member,error:null};}
      };
    },
    async rpc(name,args){rpcCalls.push({name,args});return {data:rpcResult,error:null};}
  };
  const auth={auth:{async getUser(token){return token==='valid'
    ?{data:{user:{id:userId,email:'user@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'}},error:null}
    :{data:{user:null},error:null};}}};
  const globals={
    Deno:{env:{get:name=>({...env,...extraEnv})[name]},serve:fn=>{handler=fn;}},
    createClient:(_url,key)=>key==='secret'?admin:auth,
    ImageResponse:class {},React:{createElement(){}},console,Response,Request,Headers,
    TextEncoder,TextDecoder,Uint8Array,crypto,URL,btoa,AbortSignal,
    fetch:async(url,options)=>{networkCalls.push(String(url));networkSignals.push(options?.signal);
      if(providerFailure)throw Error('provider timeout');return String(url).includes('/refunds/')
      ?Response.json(refund,{status:refundStatus}):Response.json(payment,{status:providerStatus});}
  };
  const withoutImports=source.replace(/^import .*;\s*$/gm,'');
  vm.runInNewContext(stripTypeScriptTypes(withoutImports,{mode:'strip'}),globals);
  return {handler,rpcCalls,networkCalls,networkSignals};
}
function req(action,body,token){
  return new Request('https://edge.example.test/?action='+action,{method:'POST',
    headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:typeof body==='string'?body:JSON.stringify(body)});
}
const notice={type:'notification',event:'payment.succeeded',object:{id:paymentId}};

test('production checkout remains disabled even when environment flags are set',async()=>{
  const h=harness(billingSource);
  const config=await h.handler(new Request('https://edge.example.test/?action=config'));
  assert.equal((await config.json()).enabled,false);
  const response=await h.handler(req('checkout',{plan:'basic'},'valid'));
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'PAYMENTS_DISABLED');
  assert.equal(h.networkCalls.length,0);
});

test('verified notifications are processed when new checkout is disabled',async()=>{
  const h=harness(billingSource);
  const response=await h.handler(req('webhook',notice));
  assert.equal(response.status,200);
  assert.equal(h.networkCalls.length,1);
  assert.equal(h.networkSignals[0] instanceof AbortSignal,true);
  assert.equal(h.rpcCalls.length,1);
  assert.equal(h.rpcCalls[0].name,'anons_studio_settle_verified_payment');
  assert.equal(h.rpcCalls[0].args.p_paid,true);
});

for(const [name,mutate] of [
  ['amount',p=>p.amount.value='1.00'],
  ['currency',p=>p.amount.currency='USD'],
  ['refund currency',p=>p.refunded_amount.currency='USD'],
  ['shop',p=>p.recipient.account_id='another'],
  ['account',p=>p.metadata.user_id='44444444-4444-4444-8444-444444444444'],
  ['test mode',p=>p.test=true]
]){
  test('provider mismatch: '+name+' never reaches settlement',async()=>{
    const payment=validPayment();mutate(payment);
    const h=harness(billingSource,{payment});
    const response=await h.handler(req('webhook',notice));
    assert.equal(response.status,400);
    assert.equal(h.rpcCalls.length,0);
  });
}

test('webhook cannot substitute a different provider payment ID',async()=>{
  const payment=validPayment();payment.id='55555555-5555-4555-8555-555555555555';
  const h=harness(billingSource,{payment});
  const response=await h.handler(req('webhook',notice));
  assert.equal(response.status,503);
  assert.equal(h.rpcCalls.length,0);
});

test('a verified partial refund is passed to settlement in kopecks',async()=>{
  const payment=validPayment();payment.refunded_amount.value='50.00';
  const h=harness(billingSource,{payment});
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId,payment_id:paymentId}}));
  assert.equal(response.status,200);
  assert.match(h.networkCalls[0],/\/refunds\//);assert.match(h.networkCalls[1],/\/payments\//);
  assert.equal(h.rpcCalls[0].args.p_refunded_kopecks,5000);
});
test('a full refund is passed to settlement in kopecks',async()=>{
  const payment=validPayment();payment.refunded_amount.value='299.00';
  const refund=validRefund();refund.amount.value='299.00';
  const h=harness(billingSource,{payment,refund});
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId,payment_id:paymentId}}));
  assert.equal(response.status,200);
  assert.equal(h.rpcCalls[0].args.p_refunded_kopecks,29900);
});
test('the original payment is taken from the verified refund, not the notice',async()=>{
  const payment=validPayment();payment.refunded_amount.value='50.00';
  const h=harness(billingSource,{payment});
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId,payment_id:'99999999-9999-4999-8999-999999999999'}}));
  assert.equal(response.status,200);assert.equal(h.rpcCalls.length,1);
  assert.ok(h.networkCalls[1].endsWith('/payments/'+paymentId));
});
for(const [name,change] of [
  ['incorrect refund identifier',r=>r.id='88888888-8888-4888-8888-888888888888'],
  ['not completed refund',r=>r.status='pending'],
  ['invalid linked payment identifier',r=>r.payment_id='not-a-payment'],
  ['invalid currency',r=>r.amount.currency='USD'],
  ['invalid amount',r=>r.amount.value='0.00']
])test('unverified '+name+' never reaches settlement',async()=>{
  const refund=validRefund();change(refund);const h=harness(billingSource,{refund});
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId,payment_id:paymentId}}));
  assert.equal(response.status,503);assert.equal(h.rpcCalls.length,0);
});
test('a refund notification without a valid refund identifier is rejected',async()=>{
  const h=harness(billingSource);
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{payment_id:paymentId}}));
  assert.equal(response.status,400);assert.equal(h.networkCalls.length,0);assert.equal(h.rpcCalls.length,0);
});
test('an unavailable refund API is retried without changing the order',async()=>{
  const h=harness(billingSource,{refundStatus:503});
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId,payment_id:paymentId}}));
  assert.equal(response.status,503);assert.equal(h.rpcCalls.length,0);
});
test('a refund is not acknowledged before the payment reflects its amount',async()=>{
  const h=harness(billingSource);
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId,payment_id:paymentId}}));
  assert.equal(response.status,503);assert.equal(h.rpcCalls.length,0);
});
test('a refund total above the original payment never reaches settlement',async()=>{
  const payment=validPayment();payment.refunded_amount.value='300.00';
  const h=harness(billingSource,{payment});
  const response=await h.handler(req('webhook',{type:'notification',event:'refund.succeeded',object:{id:refundId}}));
  assert.equal(response.status,503);assert.equal(h.rpcCalls.length,0);
});
test('a provider timeout is retryable without altering a payment',async()=>{
  const h=harness(billingSource,{providerFailure:true});
  const response=await h.handler(req('webhook',notice));
  assert.equal(response.status,503);assert.equal(h.rpcCalls.length,0);
});
test('an order missing during settlement produces a retryable response',async()=>{
  const h=harness(billingSource,{rpcResult:'not_found'});
  const response=await h.handler(req('webhook',notice));
  assert.equal(response.status,503);
});
for(const [event,status,paid] of [['payment.succeeded','pending',false],['payment.succeeded','succeeded',false],['payment.canceled','succeeded',true]])
  test('a mismatched provider status is retried for '+event,async()=>{
    const payment=validPayment();payment.status=status;payment.paid=paid;
    const h=harness(billingSource,{payment});
    const response=await h.handler(req('webhook',{...notice,event}));
    assert.equal(response.status,503);assert.equal(h.rpcCalls.length,0);
  });
test('a canceled payment is forwarded as unpaid',async()=>{
  const payment=validPayment();payment.status='canceled';payment.paid=false;
  const h=harness(billingSource,{payment});
  const response=await h.handler(req('webhook',{...notice,event:'payment.canceled'}));
  assert.equal(response.status,200);
  assert.equal(h.rpcCalls[0].args.p_state,'canceled');
  assert.equal(h.rpcCalls[0].args.p_paid,false);
});
test('missing merchant credentials prevent webhook settlement',async()=>{
  const h=harness(billingSource,{extraEnv:{YOOKASSA_SECRET_KEY:''}});
  const response=await h.handler(req('webhook',notice));
  assert.equal(response.status,503);
  assert.equal(h.networkCalls.length,0);
  assert.equal(h.rpcCalls.length,0);
});

test('webhook request size is enforced without a Content-Length header',async()=>{
  const h=harness(billingSource);
  const response=await h.handler(req('webhook',JSON.stringify({...notice,padding:'x'.repeat(21000)})));
  assert.equal(response.status,413);
  assert.equal(h.networkCalls.length,0);
  assert.equal(h.rpcCalls.length,0);
});

const activeMember={plan:'basic',status:'active',current_period_end:'2099-01-01T00:00:00Z'};
const poster={ratio:'square',cards:[{title:'Тест'}],imageData:''};
test('premium export requires a confirmed signed-in account',async()=>{
  const h=harness(exportSource,{member:activeMember});
  assert.equal((await h.handler(req('unused',{snapshot:poster,cardIndex:0}))).status,401);
});
for(const member of [null,{...activeMember,current_period_end:'2020-01-01T00:00:00Z'},
  {...activeMember,current_period_end:'invalid'}, {...activeMember,status:'canceled'}]){
  test('premium export rejects absent, expired or invalid entitlements',async()=>{
    const h=harness(exportSource,{member});
    assert.equal((await h.handler(req('unused',{snapshot:poster,cardIndex:0},'valid'))).status,403);
  });
}
test('oversized photo is rejected instead of silently omitted from paid PNG',async()=>{
  const h=harness(exportSource,{member:activeMember});
  const response=await h.handler(req('unused',{snapshot:{...poster,imageData:'data:image/jpeg;base64,'+'A'.repeat(600000)},cardIndex:0},'valid'));
  assert.equal(response.status,413);
  assert.equal((await response.json()).error,'IMAGE_TOO_LARGE');
});
test('premium export rejects an oversized body without Content-Length',async()=>{
  const h=harness(exportSource,{member:activeMember});
  const response=await h.handler(req('unused',JSON.stringify({snapshot:{...poster,padding:'x'.repeat(901000)},cardIndex:0}),'valid'));
  assert.equal(response.status,413);
});
