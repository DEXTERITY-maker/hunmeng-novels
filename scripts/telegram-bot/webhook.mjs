import {makeReply,commandAction,unknownReply} from './menu.mjs';
const empty = (status=200) => new Response('',{status,headers:{'cache-control':'no-store'}});
const tokenPattern = /^[0-9]+:[A-Za-z0-9_-]+$/;
const secureEqual = (a,b) => {
  if(typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const aa=new TextEncoder().encode(a), bb=new TextEncoder().encode(b); let d=aa.length ^ bb.length;
  for(let i=0;i<Math.max(aa.length,bb.length);i++)d|=(aa[i]??0)^(bb[i]??0);
  return d===0;
};
async function readBody(request) {
  const length=request.headers.get('content-length'); if(length && (!/^\d+$/.test(length) || Number(length)>32768))throw new Error('too large');
  if(!request.body)throw new Error('empty');
  const reader=request.body.getReader();let chunks=[],size=0;
  try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new Error('too large');}chunks.push(value);}}
  finally {reader.releaseLock();}
  const all=new Uint8Array(size);let offset=0;for(const c of chunks){all.set(c,offset);offset+=c.length;}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));
}
// A constrained PostgREST role, never a service_role credential. Supabase verifies the signature.
function isGuardJwt(token) {
  try {
    if(typeof token !== 'string' || token.length>4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))return false;
    const payload=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const claims=JSON.parse(atob(payload));
    return claims.role === 'telegram_bot_guard' && Number.isSafeInteger(claims.exp) && claims.exp > Math.floor(Date.now()/1000);
  } catch {return false;}
}
async function actorHash(secret,id) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(String(id))));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function telegram(fetcher, token, method, body) {
  const res=await fetcher('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  if(!res.ok)throw new Error('Telegram request failed');
  const data=await res.json(); if(data?.ok!==true)throw new Error('Telegram request failed');
}
function identify(update) {
  const callback=update?.callback_query, msg=callback?.message ?? update?.message, user=callback?.from ?? msg?.from;
  if(msg?.chat?.type!=='private' || !Number.isSafeInteger(msg.chat.id) || msg.chat.id<=0 || !Number.isSafeInteger(user?.id) || user.id!==msg.chat.id || user.is_bot) return null;
  if(callback) {
    if(typeof callback.id!=='string' || callback.id.length>256 || typeof callback.data!=='string' || callback.data.length>64)return null;
    return {id:user.id,callback:callback.id,action:callback.data};
  }
  if(typeof msg.text!=='string' || msg.text.length>4096)return null;
  return {id:user.id, action:commandAction(msg.text)};
}
export async function handleWebhook(request, env, fetcher=fetch) {
  if(request.method!=='POST')return empty(405);
  if(!/^[A-Za-z0-9_-]{32,256}$/.test(env.TELEGRAM_WEBHOOK_SECRET ?? '') || !secureEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return empty(403);
  const base=env.SUPABASE_URL?.replace(/\/+$/,'');
  if(!tokenPattern.test(env.TELEGRAM_BOT_TOKEN ?? '') || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base ?? '') || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(env.PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '') || !isGuardJwt(env.TELEGRAM_GUARD_JWT) || (env.TELEGRAM_HASH_SECRET?.length ?? 0)<32)return empty(503);
  let update;try{update=await readBody(request);}catch{return empty(400);}
  if(!Number.isSafeInteger(update?.update_id) || update.update_id<0)return empty(400);
  const person=identify(update);if(!person)return empty();
  let decision;
  try {
    const hash=await actorHash(env.TELEGRAM_HASH_SECRET,person.id);
    const r=await fetcher(base+'/rest/v1/rpc/telegram_bot_admit',{method:'POST',headers:{apikey:env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+env.TELEGRAM_GUARD_JWT,'content-type':'application/json'},body:JSON.stringify({p_update_id:update.update_id,p_actor_hash:hash}),signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error('Admission unavailable');decision=await r.json();
    if(!['accepted','limited','duplicate'].includes(decision))throw new Error('Invalid admission');
  } catch {return empty(503);}
  if(decision==='duplicate')return empty();
  // From this point any response is acknowledged even on timeout: never automatically resend.
  try {
    if(person.callback)await telegram(fetcher,env.TELEGRAM_BOT_TOKEN,'answerCallbackQuery',{callback_query_id:person.callback,...(decision==='limited'?{text:'Слишком много запросов. Попробуйте позже.'}:{})});
    if(decision==='limited')return empty();
    let reply;
    try {reply=person.action==='unknown' ? unknownReply() : await makeReply(person.action,env,fetcher);}
    catch {reply={text:'Сервис временно недоступен. Попробуйте позже.'};}
    await telegram(fetcher,env.TELEGRAM_BOT_TOKEN,'sendMessage',{chat_id:person.id,...reply});
  } catch { /* Delivery may have succeeded. Do not log user data or automatically retry. */ }
  return empty();
}
