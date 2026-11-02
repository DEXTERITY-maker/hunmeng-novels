import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createReconciliation,ensureApplicable,pushWithLease,LEDGER_REF} from '../scripts/telegram-reconcile-core.mjs';
const a='a'.repeat(40),b='b'.repeat(40);
const chapter=(number)=>({novelSlug:'book',novelTitle:'Book',number,slug:'chapter-'+number,title:'Part '+number});
const state=()=>({version:1,initialized:true,deployedSha:a,chapters:{'alice:1':{status:'sent',slug:'chapter-1',title:'A',novelTitle:'Alice',messageId:32}}});
const manifest=()=>({version:1,ledger_head:a,published_sha:b,baseline:['book:2','book:3'],new:[],ambiguous:['book:1']});
const source=()=>new Map([1,2,3].map(n=>['book:'+n,chapter(n)]));
function plan(s=state(),m=manifest(),keys=['book:1','book:2','book:3']) {return createReconciliation({state:s,manifest:m,published:source(),expectedKeys:keys,originalText:JSON.stringify(s,null,2)+'\n'});}
test('preview adds only reviewed baseline entries and preserves all existing records',()=>{const s=state(),original=structuredClone(s),p=plan(s);assert.deepEqual(s,original);assert.deepEqual(p.next.chapters['alice:1'],original.chapters['alice:1']);assert.equal(p.next.deployedSha,a);assert.equal(p.next.chapters['book:2'].status,'baseline');assert.equal(p.baselineCount,2);assert.deepEqual(p.blockers,['book:1']);assert.throws(()=>ensureApplicable(p,p.planId),/Unresolved/);});
test('changed input, stale selection, duplicate or reserved states fail closed',()=>{assert.throws(()=>plan(state(),manifest(),['book:1','book:2']),/changed/);const dup=manifest();dup.baseline.push('book:1');assert.throws(()=>plan(state(),dup),/duplicate/);const s=state();s.chapters['other:1']={status:'reserved'};assert.throws(()=>plan(s),/Reserved/);});
test('application needs all ambiguous entries resolved and exact plan digest',()=>{const s=state();s.chapters['book:1']={status:'sent',messageId:33};const p=plan(s,manifest(),['book:2','book:3']);assert.equal(p.blockers.length,0);assert.throws(()=>ensureApplicable(p,'0'.repeat(64)),/confirmation/);assert.doesNotThrow(()=>ensureApplicable(p,p.planId));const altered=state();altered.chapters['alice:1'].messageId=99;assert.notEqual(plan(altered).planId,plan().planId);});
test('atomic Git lease rejects a concurrent ledger update and never overwrites it',()=>{
  const root=mkdtempSync(join(tmpdir(),'hunmeng-reconcile-test-'));
  const run=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const ident=['-c','user.name=Test','-c','user.email=test@example.invalid'];
  try{
    const bare=join(root,'remote.git'),local=join(root,'local'),other=join(root,'other');
    run(root,'init','--bare',bare);run(root,'clone',bare,local);
    writeFileSync(join(local,'state.json'),'{}\n');run(local,'add','state.json');run(local,...ident,'commit','-m','base');run(local,'push','origin','HEAD:'+LEDGER_REF);
    const base=run(local,'rev-parse','HEAD');run(local,...ident,'commit','--allow-empty','-m','proposal');const proposal=run(local,'rev-parse','HEAD');
    run(root,'clone','--branch','telegram-notification-state',bare,other);run(other,...ident,'commit','--allow-empty','-m','concurrent');const concurrent=run(other,'rev-parse','HEAD');
    let raced=false;const git=args=>{if(args[0]==='push'&&!raced){raced=true;run(other,'push','origin','HEAD:'+LEDGER_REF);}return run(local,...args);};
    assert.throws(()=>pushWithLease(git,proposal,base));assert.equal(run(local,'ls-remote','origin',LEDGER_REF).split(/\s+/)[0],concurrent);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('atomic Git lease permits a direct child of the reviewed head',()=>{
  const root=mkdtempSync(join(tmpdir(),'hunmeng-reconcile-success-'));
  const run=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  try{
    const bare=join(root,'remote.git'),local=join(root,'local');
    run(root,'init','--bare',bare);run(root,'clone',bare,local);writeFileSync(join(local,'state.json'),'{}\n');run(local,'add','state.json');
    const config=['-c','user.name=Test','-c','user.email=test@example.invalid'];
    run(local,...config,'commit','-m','base');run(local,'push','origin','HEAD:'+LEDGER_REF);const before=run(local,'rev-parse','HEAD');
    run(local,...config,'commit','--allow-empty','-m','reviewed');const after=run(local,'rev-parse','HEAD');
    pushWithLease(args=>run(local,...args),after,before);
    assert.equal(run(local,'ls-remote','origin',LEDGER_REF).split(/\s+/)[0],after);
  }finally{rmSync(root,{recursive:true,force:true});}
});
