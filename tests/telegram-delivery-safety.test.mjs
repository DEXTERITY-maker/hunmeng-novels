import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramRequestError, safeTelegramFailure, reservedChapterKeys, createTelegramRequest} from '../scripts/telegram-delivery-safety.mjs';

const makeReply=(status,payload)=>({ok:status>=200&&status<300,status,async json(){return payload;}});

test('reserved notices require manual intervention',()=>{
  assert.deepEqual(reservedChapterKeys({chapters:{'a:1':{status:'sent'},'dracula:1':{status:'reserved'},'a:2':{status:'baseline'}}}),['dracula:1']);
  assert.deepEqual(reservedChapterKeys(null),[]);
});

test('confirmed send is paced and includes safe result',async()=>{
  const delays=[]; let calls=0;
  const request=createTelegramRequest({token:'fake-secret',sleep:async n=>delays.push(n),fetchImpl:async()=>{calls++;return makeReply(200,{ok:true,result:{message_id:31}});}});
  assert.deepEqual(await request('sendMessage',{chat_id:'@example',text:'sample'}),{message_id:31});
  assert.deepEqual(delays,[3000]);assert.equal(calls,1);
});

test('429 exposes status and retry_after, but does not auto-retry or leak description',async()=>{
  let calls=0;
  const request=createTelegramRequest({token:'fake-secret',sleep:async()=>{},fetchImpl:async()=>{calls++;return makeReply(429,{ok:false,description:'private-data',parameters:{retry_after:42}});}});
  const error=await request('sendMessage',{text:'secret'}).then(()=>null,e=>e);
  assert.ok(error instanceof TelegramRequestError);
  assert.equal(safeTelegramFailure(error),'kind=api_rejection; http=429; retry_after=42');
  assert.ok(!safeTelegramFailure(error).includes('private-data'));
  assert.equal(calls,1);
});

test('network ambiguity must never auto-retry',async()=>{
  let calls=0;
  const request=createTelegramRequest({token:'fake-secret',sleep:async()=>{},fetchImpl:async()=>{calls++;throw new Error('API URL includes token fake-secret');}});
  const error=await request('sendMessage',{}).then(()=>null,e=>e);
  assert.equal(safeTelegramFailure(error),'kind=transport_unconfirmed; http=unknown; retry_after=none');
  assert.equal(calls,1);
});

test('malformed response and missing token do not leak values',async()=>{
  const request=createTelegramRequest({token:'fake-secret',fetchImpl:async()=>({ok:true,status:200,async json(){throw new Error('sensitive');}})});
  await assert.rejects(()=>request('getMe'),e=>safeTelegramFailure(e)==='kind=invalid_response; http=200; retry_after=none');
  await assert.rejects(()=>createTelegramRequest({token:''})('getMe'),e=>e.kind==='missing_secret');
});
