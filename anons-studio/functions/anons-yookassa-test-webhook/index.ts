// Test-shop notifications only. This function deliberately has no database
// client and cannot change subscriptions or create payments.
const api='https://api.yookassa.ru/v3';
// The verified identifier is separate from the earlier unverified input.
const shop=Deno.env.get('ANONS_YOOKASSA_TEST_VERIFIED_SHOP_ID')||'';
const secret=Deno.env.get('ANONS_YOOKASSA_TEST_SECRET_KEY')||'';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

async function readNotice(req:Request){
  const limit=20000;
  if(Number(req.headers.get('content-length')||0)>limit)throw Error('TOO_LARGE');
  if(!req.body)throw Error('BAD_JSON');
  const reader=req.body.getReader(),chunks:Uint8Array[]=[];
  let length=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>limit){await reader.cancel();throw Error('TOO_LARGE');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw Error('BAD_JSON');}
}

async function providerGet(resource:'payments'|'refunds',id:string){
  if(!uuid.test(id))throw Error('INVALID_ID');
  let response:Response;
  try{
    response=await fetch(`${api}/${resource}/${encodeURIComponent(id)}`,{
      headers:{Authorization:'Basic '+btoa(`${shop}:${secret}`)},
      signal:AbortSignal.timeout(8000)
    });
  }catch{
    // Never log request headers, URLs, credentials, or provider response bodies.
    console.warn('Test provider connection failed');
    throw Error('PROVIDER_UNAVAILABLE');
  }
  if(!response.ok){
    console.warn('Test provider HTTP status:',response.status);
    throw Error('PROVIDER_UNAVAILABLE');
  }
  const object=await response.json();
  if(object?.id!==id)throw Error('PROVIDER_MISMATCH');
  return object;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=='POST')return reply({error:'METHOD_NOT_ALLOWED'},405);
  if(!shop||!secret)return reply({error:'TEST_STORE_NOT_CONFIGURED'},503);
  let notice:any;
  try{notice=await readNotice(req);}
  catch(e){return e instanceof Error&&e.message==='TOO_LARGE'
    ?reply({error:'TOO_LARGE'},413):reply({error:'BAD_JSON'},400);}
  if(notice?.type!=='notification'||!['payment.succeeded','payment.canceled','refund.succeeded'].includes(notice.event))
    return reply({error:'INVALID_NOTICE'},400);
  const objectId=notice?.object?.id;
  if(typeof objectId!=='string'||!uuid.test(objectId))return reply({error:'INVALID_ID'},400);
  try{
    let paymentId=objectId;
    if(notice.event==='refund.succeeded'){
      const refund=await providerGet('refunds',objectId);
      if(refund.status!=='succeeded'||typeof refund.payment_id!=='string'||!uuid.test(refund.payment_id))
        return reply({error:'REFUND_MISMATCH'},400);
      paymentId=refund.payment_id;
    }
    const payment=await providerGet('payments',paymentId);
    if(payment.test!==true||payment.recipient?.account_id!==shop||payment.amount?.currency!=='RUB')
      return reply({error:'TEST_PAYMENT_MISMATCH'},400);
    if(notice.event==='payment.succeeded'&&payment.status!=='succeeded')
      return reply({error:'PAYMENT_STATE_MISMATCH'},400);
    if(notice.event==='payment.canceled'&&payment.status!=='canceled')
      return reply({error:'PAYMENT_STATE_MISMATCH'},400);
    // No customer data, IDs or credentials are written to logs.
    console.log('Verified YooKassa test notification:',notice.event);
    return reply({received:true});
  }catch{
    return reply({error:'TEST_VERIFICATION_UNAVAILABLE'},503);
  }
});
