import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalized, makeCandidate, sourceKeyFromUrl, checkDuplicates } from '../src/lib/daosearch-discovery.mjs';
import { apiGet, run } from '../scripts/daosearch-lookup.mjs';
const ID='7673414027619339289';
const url='https://fanqienovel.com/page/'+ID;
const title='Highway Survival: Lathe Is Also a Car, I Handcraft Gatling Gun';
const book={
  source:'fanqie', source_book_id:ID,
  url:'https://daosearch.io/fanqie/book/'+ID+'/highway-survival',
  source_url:url,
  title:{en:title,zh:'公路求生车床也是车我手搓加特林'},
  author:{en:'Feng Yu',zh:'凨羽'},
  availability:{state:'available'},
  other_names:[{name_translated:'Highway Survival Lathe Is Also a Car'}],
};
const send = (body,status=200,headers={})=>new Response(JSON.stringify({data:body}),{
  status, headers:{'Content-Type':'application/json',...headers},
});
test('normalize Chinese and English titles without losing Unicode',()=>{
  assert.equal(normalized('公路求生：车床也是车'),normalized('公路求生车床也是车'));
  assert.equal(normalized('The Time Machine'),normalized('THE-TIME  MACHINE'));
  assert.equal(sourceKeyFromUrl(url),'fanqie:'+ID);
  assert.equal(sourceKeyFromUrl('https://www.qidian.com/book/1010868264/'),'qidian:1010868264');
  assert.equal(sourceKeyFromUrl('https://example.com/novel/1'),null);
});
test('fanqie IDs remain strings; existing local original source is a definite duplicate',()=>{
  const candidate=makeCandidate(book);
  assert.equal(candidate.source_book_id,ID);
  const result=checkDuplicates(candidate,[{
    slug:'highway-survival-lathe-gatling',title:'Different title',
    author:'凨羽',originalUrl:url,location:'external_reference',
  }]);
  assert.equal(result.status,'known');
  assert.equal(result.matches[0].reason,'source_id_or_url');
});
test('same title but a different author is a probable duplicate, not an automatic rejection',()=>{
  const candidate=makeCandidate(book);
  assert.equal(checkDuplicates(candidate,[{title,author:'Other author'}]).status,'review');
  assert.equal(checkDuplicates(candidate,[{title,author:'凨羽'}]).status,'known');
  assert.equal(checkDuplicates(candidate,[{title:'Unrelated work',author:'凨羽'}]).status,'new');
});
test('reject unsafe API book URLs and malformed identifiers',()=>{
  assert.throws(()=>makeCandidate({...book,source:'illegal'}));
  assert.throws(()=>makeCandidate({...book,source_book_id:'../secret'}));
  assert.throws(()=>makeCandidate({...book,url:'https://evil.example/book/123'}));
});
test('send key only to DaoSearch v1 and never follow a cross-origin redirect',async()=>{
  const key='valid-private-key-123';
  const calls=[];
  const result=await apiGet('/search?q=test',key,async(url,opts)=>{
    calls.push([String(url),opts.headers.Authorization]);
    return send([]);
  });
  assert.deepEqual(result,[]);
  assert.equal(calls[0][1],'Bearer '+key);
  assert.ok(calls[0][0].startsWith('https://daosearch.io/api/v1/'));
  await assert.rejects(apiGet('/search?q=test',key,async()=>new Response(null,{
    status:301,headers:{location:'https://evil.example/token-leak'},
  })),/Refusing to send a secret/);
  await assert.rejects(apiGet('/search?q=test',key,async()=>new Response(null,{status:429})),/quota/);
});
test('a live lookup stays read-only, detects the existing Highway Survival entry and cites DaoSearch',async()=>{
  const visited=[];
  const fetcher=async(url,opts)=>{
    const address=String(url);
    visited.push(address);
    if(address.includes('/search?'))return send([book]);
    if(address.includes('/books/fanqie/'))return send(book);
    if(address.includes('supabase.co/rest/v1/'))return new Response(JSON.stringify([]),{status:200,headers:{'content-range':'0-0/0','Content-Type':'application/json'}});
    throw Error('Unexpected request '+address);
  };
  const report=await run({
    DAOSEARCH_QUERY:'Highway Survival',
    DAOSEARCH_KEY:'private-key-for-test',
    DAOSEARCH_SOURCE:'fanqie',
    SUPABASE_URL:'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY:'private-db-key',
  },fetcher);
  assert.equal(report.examined,1);
  assert.equal(report.results[0].duplicate_status,'known');
  assert.equal(report.results[0].publication_rights,'not_verified');
  assert.equal(report.results[0].chapter_import_allowed,false);
  assert.equal(report.checked_editorial_database,true);
  assert.equal(visited.length,3);
  assert.doesNotMatch(JSON.stringify(report),/private-key-for-test|private-db-key|synopsis|cover_url/);
});
test('missing API key never causes anonymous search and no chapters are imported',async()=>{
  await assert.rejects(run({DAOSEARCH_QUERY:'Dracula'}),/DAOSEARCH_KEY missing/);
  const txt=fs.readFileSync('scripts/daosearch-lookup.mjs','utf8');
  assert.doesNotMatch(txt,/method:\s*'POST'|method:\s*'PUT'|method:\s*'PATCH'/);
  assert.doesNotMatch(txt,/insert\s+into|publish-approved/);
});
