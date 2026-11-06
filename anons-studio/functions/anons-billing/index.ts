import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// YooKassa prepaid 30-day plans. No charges without explicit merchant secrets.
const url = Deno.env.get('SUPABASE_URL') || 'https://ejpgajehssfqynnzupfx.supabase.co';
const origin='https://anons-studio-preview.pages.dev';
const api='https://api.yookassa.ru/v3/payments';
const prices={basic:29900,pro:49900,studio:99900};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function key(named:string,old:string):string{
  const raw=Deno.env.get(named);
  if(raw){try{const x=JSON.parse(raw).default;if(typeof x==='string')return x;if(typeof x?.api_key==='string')return x.api_key;}catch{}}
  return Deno.env.get(old)||'';
}
const publicKey=key('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY')||Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||'';
const secretKey=key('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY')||Deno.env.get('SUPABASE_SECRET_KEY')||'';
const shop=Deno.env.get('YOOKASSA_SHOP_ID')||'';
const merchantKey=Deno.env.get('YOOKASSA_SECRET_KEY')||'';
const vat=Number(Deno.env.get('YOOKASSA_VAT_CODE'));
const tax=Deno.env.get('YOOKASSA_TAX_SYSTEM_CODE');
// Remove this release gate only after the launch checklist has passed and the
// owner has explicitly authorized real payments. Environment flags alone must
// not start sales while export parity and refund handling remain unverified.
const LIVE_CHECKOUT_REVIEWED=false;
const canVerify=!!publicKey&&!!secretKey&&!!shop&&!!merchantKey;
const enabled=LIVE_CHECKOUT_REVIEWED&&Deno.env.get('ANONS_BILLING_ENABLED')==='true'
  &&Deno.env.get('ANONS_PREMIUM_EXPORT_READY')==='true'
  &&canVerify
  &&Number.isInteger(vat)&&vat>=1&&vat<=12;
const admin=secretKey?createClient(url,secretKey,{auth:{persistSession:false}}):null;
const auth=publicKey?createClient(url,publicKey,{auth:{persistSession:false}}):null;
const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
const out=(data:unknown,status=200)=>Response.json(data,{status,headers:cors});
async function boundedJson(req:Request,limit:number){
  if(Number(req.headers.get('content-length')||0)>limit)throw Error('TOO_LARGE');
  if(!req.body)throw Error('BAD_JSON');
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];
  let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit){await reader.cancel();throw Error('TOO_LARGE');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(total);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('BAD_JSON');}
}
const bodyError=(e:unknown)=>e instanceof Error&&e.message==='TOO_LARGE'
  ?out({error:'TOO_LARGE'},413):out({error:'BAD_JSON'},400);
function conf(){return{provider:'ЮKassa',enabled,autoRenew:false,periodDays:30,prices,availablePlans:['basic']};}
const kopecks=(s:any)=>typeof s==='string'&&/^[0-9]{1,8}\.[0-9]{2}$/.test(s)?Number(s.split('.')[0])*100+Number(s.split('.')[1]):-1;
const paymentHeaders=(id='')=>({'Authorization':'Basic '+btoa(shop+':'+merchantKey),'Content-Type':'application/json',...(id?{'Idempotence-Key':id}:{})});
async function providerGet(id:string){
  if(!uuid.test(id))throw Error('INVALID_PAYMENT_ID');
  const res=await fetch(api+'/'+encodeURIComponent(id),{headers:paymentHeaders()});
  if(!res.ok)throw Error('PROVIDER_HTTP_'+res.status);
  const payment=await res.json();
  if(payment?.id!==id)throw Error('PROVIDER_ID_MISMATCH');
  return payment;
}
async function userFrom(req:Request){
  const token=/^Bearer (.+)$/i.exec(req.headers.get('authorization')||'')?.[1];
  if(!token||!auth)return null;
  const {data,error}=await auth.auth.getUser(token);
  return (!error&&data?.user?.email_confirmed_at)?data.user:null;
}
async function settle(provider:any,order:any){
  if(!admin||!provider||!order||provider.id!==order.provider_payment_id&&!!order.provider_payment_id)return 'mismatch';
  if(provider.metadata?.order_id!==order.id||provider.metadata?.user_id!==order.user_id
    ||provider.metadata?.plan!==order.plan||provider.recipient?.account_id!==shop
    ||provider.recipient?.account_id!==order.shop_id||provider.test!==false
    ||provider.amount?.currency!=='RUB'||kopecks(provider.amount?.value)!==order.amount_kopecks
    ||(provider.refunded_amount&&provider.refunded_amount.currency!=='RUB'))return 'mismatch';
  const {data,error}=await admin.rpc('anons_studio_settle_verified_payment',{
    p_order_id:order.id,p_payment_id:provider.id,p_state:provider.status,
    p_amount_kopecks:kopecks(provider.amount.value),p_currency:'RUB',
    p_shop_id:shop,p_is_test:provider.test,p_paid:provider.paid===true,
    p_refunded_kopecks:kopecks(provider.refunded_amount?.value??'0.00')
  });
  if(error)throw error;return data as string;
}
async function checkout(req:Request){
  if(!enabled||!admin)return out({error:'PAYMENTS_DISABLED'},503);
  const user=await userFrom(req);
  if(!user)return out({error:'LOGIN_REQUIRED'},401);
  let body:any;try{body=await boundedJson(req,2048);}catch(e){return bodyError(e);}
  const plan=body?.plan;
  if(!Object.hasOwn(prices,plan))return out({error:'INVALID_PLAN'},400);
  if(plan!=='basic')return out({error:'PLAN_NOT_YET_AVAILABLE'},403);
  const {count,error:countError}=await admin.from('anons_studio_payment_orders').select('id',{head:true,count:'exact'})
    .eq('user_id',user.id).gte('created_at',new Date(Date.now()-3600000).toISOString());
  if(countError)return out({error:'BILLING_UNAVAILABLE'},503);
  if((count||0)>=5)return out({error:'RATE_LIMITED'},429);
  const id=crypto.randomUUID(),nonce=crypto.randomUUID();
  const amount=(prices[plan as keyof typeof prices]/100).toFixed(2);
  const {error:insertError}=await admin.from('anons_studio_payment_orders').insert({
    id,user_id:user.id,shop_id:shop,plan,amount_kopecks:prices[plan as keyof typeof prices],
    idempotency_key:nonce,state:'created'
  });
  if(insertError)return out({error:'ORDER_CREATE_FAILED'},503);
  const receipt:any={customer:{email:user.email},items:[{
    description:'Anons Studio '+String(plan).toUpperCase()+' — доступ на 30 дней',
    quantity:'1.000',amount:{value:amount,currency:'RUB'},vat_code:vat,
    payment_mode:'full_payment',payment_subject:'service'
  }]};
  if(tax&&/^[1-6]$/.test(tax))receipt.tax_system_code=Number(tax);
  const payload={
    amount:{value:amount,currency:'RUB'},capture:true,
    confirmation:{type:'redirect',return_url:origin+'/#pricing'},
    description:'Anons Studio — '+plan+' (30 дней)',
    metadata:{order_id:id,user_id:user.id,plan},receipt,save_payment_method:false
  };
  let provider:any;
  try{
    const res=await fetch(api,{method:'POST',headers:paymentHeaders(nonce),body:JSON.stringify(payload)});
    if(!res.ok){console.error('checkout HTTP',res.status);return out({error:'PROVIDER_UNAVAILABLE'},503);}
    provider=await res.json();
  }catch(e){console.error('provider checkout',String(e));return out({error:'PROVIDER_UNAVAILABLE'},503);}
  if(!uuid.test(provider.id||'')||!['pending','succeeded'].includes(provider.status)
    ||provider.test!==false||provider.metadata?.order_id!==id
    ||provider.recipient?.account_id!==shop||provider.amount?.currency!=='RUB'
    ||kopecks(provider.amount?.value)!==prices[plan as keyof typeof prices])
    return out({error:'PROVIDER_MISMATCH'},503);
  const {error:associateError}=await admin.from('anons_studio_payment_orders').update({
    provider_payment_id:provider.id,state:'pending',updated_at:new Date().toISOString()
  }).eq('id',id).eq('user_id',user.id);
  if(associateError)return out({error:'ORDER_ASSOCIATION_FAILED'},503);
  if(provider.status==='succeeded')await settle(await providerGet(provider.id),{
    id,user_id:user.id,plan,shop_id:shop,provider_payment_id:provider.id,
    amount_kopecks:prices[plan as keyof typeof prices]
  });
  const paymentUrl=provider.confirmation?.confirmation_url;
  if(typeof paymentUrl!=='string'||!paymentUrl.startsWith('https://'))return out({error:'NO_CONFIRMATION_URL'},503);
  const hostname=new URL(paymentUrl).hostname;
  if(!['yookassa.ru','yoomoney.ru'].some(d=>hostname===d||hostname.endsWith('.'+d)))
    return out({error:'UNTRUSTED_CONFIRMATION_URL'},503);
  return out({orderId:id,url:paymentUrl});
}
async function webhook(req:Request){
  // Closing checkout must not stop verification of earlier payments/refunds.
  if(!canVerify||!admin)return out({error:'VERIFICATION_UNAVAILABLE'},503);
  let notice:any;try{notice=await boundedJson(req,20000);}catch(e){return bodyError(e);}
  if(notice?.type!=='notification'
    ||!['payment.succeeded','payment.canceled','refund.succeeded'].includes(notice.event))
    return out({error:'INVALID_NOTICE'},400);
  const id=notice.event==='refund.succeeded'?notice?.object?.payment_id:notice?.object?.id;
  if(typeof id!=='string'||!uuid.test(id))return out({error:'INVALID_PAYMENT_ID'},400);
  let provider:any;try{provider=await providerGet(id);}catch{return out({error:'VERIFY_FAILED'},503);}
  const orderId=provider?.metadata?.order_id;
  if(!uuid.test(orderId||''))return out({received:true});
  const {data:order,error}=await admin.from('anons_studio_payment_orders').select('*').eq('id',orderId).maybeSingle();
  if(error||!order)return out({error:'ORDER_NOT_READY'},503);
  try{
    const state=await settle(provider,order);
    if(state==='mismatch'||state.startsWith('rejected'))return out({error:'PAYMENT_MISMATCH'},400);
    return out({received:true});
  }catch(e){console.error('settle',String(e));return out({error:'SETTLEMENT_UNAVAILABLE'},503);}
}
async function overview(req:Request,reconcile:boolean){
  const user=await userFrom(req);if(!user)return out({error:'LOGIN_REQUIRED'},401);
  if(!admin)return out({error:'BILLING_UNAVAILABLE'},503);
  const {data:rows,error}=await admin.from('anons_studio_payment_orders')
    .select('id,user_id,shop_id,provider_payment_id,plan,amount_kopecks,state,created_at,paid_at')
    .eq('user_id',user.id).order('created_at',{ascending:false}).limit(10);
  if(error)return out({error:'BILLING_UNAVAILABLE'},503);
  const reconciliation={available:canVerify,attempted:0,failed:0};
  if(reconcile&&canVerify){
    for(const row of (rows||[]).filter(o=>o.provider_payment_id&&['pending','succeeded'].includes(o.state)).slice(0,3)){
      reconciliation.attempted++;
      try{
        const result=await settle(await providerGet(row.provider_payment_id),row);
        if(result==='mismatch'||result.startsWith('rejected'))reconciliation.failed++;
      }catch(e){reconciliation.failed++;console.warn('sync',String(e));}
    }
  }
  const {data:membership,error:memberError}=await admin.from('anons_studio_memberships')
    .select('plan,status,current_period_end').eq('user_id',user.id).maybeSingle();
  if(memberError)return out({error:'BILLING_UNAVAILABLE'},503);
  const {data:safeRows}=await admin.from('anons_studio_payment_orders')
    .select('id,plan,amount_kopecks,refunded_kopecks,state,created_at,paid_at')
    .eq('user_id',user.id).order('created_at',{ascending:false}).limit(10);
  return out({config:conf(),membership:membership||null,orders:safeRows||[],...(reconcile?{reconciliation}:{})});
}
Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const originHeader=req.headers.get('origin');
  if(originHeader&&originHeader!==origin)return out({error:'ORIGIN_FORBIDDEN'},403);
  const action=new URL(req.url).searchParams.get('action')||'config';
  try{
    if(req.method==='GET'&&action==='config')return out(conf());
    if(req.method==='GET'&&action==='history')return await overview(req,false);
    if(req.method==='POST'&&action==='checkout')return await checkout(req);
    if(req.method==='POST'&&action==='webhook')return await webhook(req);
    if(req.method==='POST'&&action==='sync')return await overview(req,true);
    return out({error:'NOT_FOUND'},404);
  }catch(e){console.error('billing',String(e));return out({error:'BILLING_SERVER_ERROR'},503);}
});
