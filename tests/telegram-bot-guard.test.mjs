import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// Real isolated Postgres, never a network database. Skip where server tools are unavailable.
const bin = spawnSync('pg_config',['--bindir'],{encoding:'utf8'}).stdout?.trim();
const tool = name => bin ? join(bin,name) : name;
const available = bin && spawnSync(tool('initdb'),['--version'],{stdio:'ignore'}).status === 0 && spawnSync(tool('pg_ctl'),['--version'],{stdio:'ignore'}).status === 0;
test('Postgres guard: RLS, restricted role, atomic deduplication and rate limits', {skip:!available && process.env.TELEGRAM_GUARD_REQUIRE_POSTGRES !== '1',timeout:60000}, async () => {
  assert.ok(available, 'PostgreSQL server tools are required for this check');
  const dir=mkdtempSync(join(tmpdir(),'hunmeng-bot-guard-')),data=join(dir,'data'),port='55439';
  let running=false;
  const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const sql=query=>run('psql',['-h',dir,'-p',port,'-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',query]);
  try {
    run(tool('initdb'),['-D',data,'--auth=trust','--no-locale']);
    run(tool('pg_ctl'),['-D',data,'-o',`-k ${dir} -p ${port} -c listen_addresses=''`,'-l',join(dir,'log'),'start']);running=true;
    sql('create role anon; create role authenticated; create role service_role bypassrls; create role authenticator login noinherit; create table public.private_sample(id int);');
    run('psql',['-h',dir,'-p',port,'-d','postgres','-v','ON_ERROR_STOP=1','-f','backend/telegram-bot-guard.sql']);
    assert.throws(()=>run('psql',['-h',dir,'-p',port,'-d','postgres','-v','ON_ERROR_STOP=1','-f','backend/telegram-bot-guard.sql']));
    assert.equal(sql("select has_function_privilege('anon','public.telegram_bot_admit(bigint,text)','execute'),has_function_privilege('authenticated','public.telegram_bot_admit(bigint,text)','execute'),has_table_privilege('telegram_bot_guard','public.private_sample','select'),(select rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolcanlogin or rolreplication from pg_roles where rolname='telegram_bot_guard')").trim(),'f|f|f|f');
    assert.match(sql("set role authenticator; set role telegram_bot_guard; select public.telegram_bot_admit(1,repeat('a',64));"),/accepted/);
    assert.match(sql("set role telegram_bot_guard; select public.telegram_bot_admit(1,repeat('a',64));"),/duplicate/);
    const limits=sql("set role telegram_bot_guard; select public.telegram_bot_admit(n,repeat('b',64)) from generate_series(10,22) n;");
    assert.equal((limits.match(/accepted/g)||[]).length,12);assert.match(limits,/limited/);
    const call=()=>new Promise((resolve,reject)=>{let out='';const p=spawn('psql',['-h',dir,'-p',port,'-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',"set role telegram_bot_guard; select public.telegram_bot_admit(500,repeat('c',64))"]);p.stdout.on('data',x=>out+=x);p.on('error',reject);p.on('close',code=>code?reject(Error('psql failed')):resolve(out));});
    const results=await Promise.all(Array.from({length:5},call));assert.equal(results.filter(x=>x.includes('accepted')).length,1);assert.equal(results.filter(x=>x.includes('duplicate')).length,4);
    assert.throws(()=>sql("set role telegram_bot_guard; select public.telegram_bot_admit(501,'invalid' || chr(39) || ';drop table public.private_sample;--');"));
    assert.equal(sql("select to_regclass('public.private_sample') is not null").trim(),'t');
  } finally {if(running)run(tool('pg_ctl'),['-D',data,'stop','-m','fast']);rmSync(dir,{recursive:true,force:true});}
});
