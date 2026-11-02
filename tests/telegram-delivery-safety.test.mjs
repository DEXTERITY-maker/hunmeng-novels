import test from 'node:test';
import assert from 'node:assert/strict';
import {TelegramRequestError, safeTelegramFailure, reservedChapterKeys, createTelegramRequest, selectManualRecovery} from '../scripts/telegram-delivery-safety.mjs';

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


test('HTTP 200 without a valid message_id is ambiguous and never treated as sent',async()=>{
  let calls=0;
  const request=createTelegramRequest({token:'fake-secret',sleep:async()=>{},fetchImpl:async()=>{calls++;return makeReply(200,{ok:true,result:{}});}});
  const error=await request('sendMessage',{text:'test'}).then(()=>null,e=>e);
  assert.equal(safeTelegramFailure(error),'kind=unconfirmed_message; http=200; retry_after=none');
  assert.equal(calls,1);
});

test('HTTP 500 yields a safe error and no second attempt',async()=>{
  let calls=0;
  const request=createTelegramRequest({token:'fake-secret',sleep:async()=>{},fetchImpl:async()=>{calls++;return makeReply(500,{ok:false,description:'SECRET'});}});
  const error=await request('sendMessage',{}).then(()=>null,e=>e);
  assert.equal(safeTelegramFailure(error),'kind=api_rejection; http=500; retry_after=none');
  assert.equal(calls,1);
});

test('manual recovery selects exactly the approved reserved Dracula notice',()=>{
  const state={chapters:{'alices-adventures-in-wonderland:20':{status:'sent'},
    'dracula:1':{status:'reserved',slug:'chapter-1',title:'Part 1',novelTitle:'Dracula'}}};
  assert.deepEqual(selectManualRecovery(state,'dracula:1'),{novelSlug:'dracula',number:1,slug:'chapter-1',title:'Part 1',novelTitle:'Dracula'});
  assert.throws(()=>selectManualRecovery(state,'alices-adventures-in-wonderland:20'),/not allowed/);
});

test('manual recovery cannot resend once Dracula was marked sent',()=>{
  const state={chapters:{'dracula:1':{status:'sent',slug:'chapter-1',title:'Part 1',novelTitle:'Dracula',messageId:31}}};
  assert.throws(()=>selectManualRecovery(state,'dracula:1'),/Exactly one/);
});

test('manual recovery rejects additional reservations and changed metadata',()=>{
  const chapter={status:'reserved',slug:'chapter-1',title:'Part 1',novelTitle:'Dracula'};
  assert.throws(()=>selectManualRecovery({chapters:{'dracula:1':chapter,'other:2':{status:'reserved'}}},'dracula:1'),/Exactly one/);
  assert.throws(()=>selectManualRecovery({chapters:{'dracula:1':{...chapter,title:'Modified'}}},'dracula:1'),/metadata differs/);
});
