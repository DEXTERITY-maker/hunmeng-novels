import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {chapterKey,chapterLink,announcement,decideChapters,applyChapterMarker,parseChapterMarkdown,validateReleasedChapters,deliverChapters} from './telegram-chapters-core.mjs';

// Ledger exists only on its own service branch. No database writes, no chapter bodies in logs.
const REF='refs/heads/telegram-notification-state';
const ORIGIN='https://hunmeng-novel.ru', CHANNEL='@hunmengnovels';
const SHA=/^[0-9a-f]{40}$/;
const git=(args,opts={})=>execFileSync('git',args,{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe'],...opts}).trim();
const info=s=>console.log('[telegram-chapters] '+s);
const fail=s=>{throw new Error(s);};
const dry=process.env.DRY_RUN==='true';
const eventName=process.env.GITHUB_EVENT_NAME||'';
const event=process.env.GITHUB_EVENT_PATH?JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')):{};
const mode=process.env.NOTIFICATION_MODE||'all';
const request=async(url,headers={})=>{
  let r;
  try{r=await fetch(url,{headers,signal:AbortSignal.timeout(15000),redirect:'error'});}
  catch{fail('Required external service unavailable');}
  if(!r.ok)fail('Required external service returned an error');
  try{return await r.json();}catch{fail('Invalid external response');}
};
async function reachable(url){
  try{
    const r=await fetch(url,{method:'HEAD',signal:AbortSignal.timeout(15000),redirect:'follow'});
    return r.ok&&new URL(r.url).origin===ORIGIN;
  }catch{return false;}
}
function publicCredentials(){
  const values={};
  try{
    for(const line of readFileSync('.env.production','utf8').split(/\r?\n/)){
      const m=/^(PUBLIC_SUPABASE_URL|PUBLIC_SUPABASE_PUBLISHABLE_KEY)=(.*)$/.exec(line.trim());
      if(m)values[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');
    }
  }catch{}
  const base=(process.env.PUBLIC_SUPABASE_URL||values.PUBLIC_SUPABASE_URL||'').replace(/\/+$/,'');
  const key=process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY||values.PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
  if(!/^https:\/\/[^/?#]+$/.test(base)||!key)fail('Missing public Supabase configuration');
  return {base,key};
}
async function releases(){
  const {base,key}=publicCredentials();
  const headers={apikey:key};
  const editions=await request(base+'/rest/v1/serial_editions?select=slug,initial_chapters,launch_at',headers);
  const rows=await request(base+'/rest/v1/serial_chapters?select=novel_slug,number,title&order=number.asc',headers);
  return {editions,rows};
}
function localChapters(sha){
  if(!SHA.test(sha))fail('Untrusted deployment revision');
  const paths=git(['ls-tree','-r','--name-only',sha,'src/content/chapters']).split('\n')
    .filter(p=>/^src\/content\/chapters\/[a-z0-9-]+\/[a-z0-9-]+\.md$/.test(p));
  if(!paths.length)fail('No published local chapters');
  const novels=new Map(), chapters=[];
  for(const path of paths){
    const slug=path.split('/')[3];
    if(!novels.has(slug)){
      const n=JSON.parse(git(['show',sha+':src/content/novels/'+slug+'.json']));
      if(n.slug!==slug||!n.title)fail('Invalid novel metadata');
      novels.set(slug,n.title);
    }
    chapters.push({...parseChapterMarkdown(git(['show',sha+':'+path]),slug),novelTitle:novels.get(slug)});
  }
  return {novels,chapters};
}
function readLedger(){
  const ref=git(['ls-remote','origin',REF]);
  if(!ref)return {sha:null,data:null};
  const sha=ref.split(/\s+/)[0];
  if(!SHA.test(sha))fail('Invalid ledger branch SHA');
  git(['fetch','--no-tags','origin',REF]);
  if(git(['rev-parse','FETCH_HEAD'])!==sha)fail('Ledger advanced; retry safely');
  const data=JSON.parse(git(['show',sha+':state.json']));
  if(data.version!==1||!data.chapters||typeof data.chapters!=='object'||Array.isArray(data.chapters))
    fail('Invalid ledger format');
  return {sha,data};
}
function writeLedger(ref,data){
  const blob=git(['hash-object','-w','--stdin'],{input:JSON.stringify(data,null,2)+'\n'});
  const tree=git(['mktree'],{input:'100644 blob '+blob+'\tstate.json\n'});
  const env={...process.env,GIT_AUTHOR_NAME:'Hunmeng Notifications',GIT_AUTHOR_EMAIL:'actions@users.noreply.github.com',GIT_COMMITTER_NAME:'Hunmeng Notifications',GIT_COMMITTER_EMAIL:'actions@users.noreply.github.com'};
  const args=['commit-tree',tree];
  if(ref.sha)args.push('-p',ref.sha);
  const commit=git(args,{input:'chore: Telegram notification ledger [skip ci]\n',env});
  // Non-fast-forward or duplicate create is rejected if an unexpected parallel run raced.
  git(['push','--quiet','origin',commit+':'+REF]);
  ref.sha=commit;ref.data=data;
}
async function publishedCommit(){
  const token=process.env.GITHUB_TOKEN,repo=process.env.GITHUB_REPOSITORY;
  if(!token||!/^[-\w.]+\/[-\w.]+$/.test(repo||''))fail('No GitHub authorization');
  const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json'};
  async function hasSuccessfulDeploy(run){
    const r=await request('https://api.github.com/repos/'+repo+'/actions/runs/'+run.id+'/jobs?per_page=50',headers);
    return r.jobs?.some(j=>j.name==='deploy'&&j.conclusion==='success');
  }
  if(eventName==='workflow_run'){
    const run=event.workflow_run;
    if(run?.head_branch!=='main'||run?.conclusion!=='success'||!SHA.test(run.head_sha||'')||!await hasSuccessfulDeploy(run))
      return null;
    return run.head_sha;
  }
  // Scheduled runs use the last ACTUALLY deployed SHA, not main (which may contain unpublished changes).
  const r=await request('https://api.github.com/repos/'+repo+'/actions/workflows/pages-manual-draft.yml/runs?status=completed&per_page=50',headers);
  if(!Array.isArray(r.workflow_runs))fail('Missing deployment history');
  for(const run of r.workflow_runs){
    if(run.head_branch==='main'&&run.conclusion==='success'&&SHA.test(run.head_sha||'')&&await hasSuccessfulDeploy(run))
      return run.head_sha;
  }
  fail('No successful published Cloudflare revision found');
}
async function telegram(method,body){
  const token=process.env.TELEGRAM_BOT_TOKEN;
  if(!token)fail('Missing Telegram bot secret');
  // Never print HTTP URLs containing the token or raw request errors.
  let res;
  try{
    res=await fetch('https://api.telegram.org/bot'+token+'/'+method,{
      method:body?'POST':'GET',
      headers:body?{'content-type':'application/json'}:undefined,
      body:body?JSON.stringify(body):undefined,
      signal:AbortSignal.timeout(15000),
    });
  }catch{fail('Telegram unavailable; inspect reserved notice if present');}
  if(!res.ok)fail('Telegram request failed; inspect reserved notice if present');
  let json;try{json=await res.json();}catch{fail('Invalid Telegram reply');}
  if(!json.ok)fail('Telegram did not confirm delivery');
  return json.result;
}
async function main(){
  if(!['all','scheduled','deployed'].includes(mode))fail('Invalid workflow mode');
  if(eventName==='workflow_run'&&(event.workflow_run?.conclusion!=='success'||event.workflow_run?.head_branch!=='main')){
    info('No successful main branch deployment; no changes');return;
  }
  const ledger=readLedger(),previous=ledger.data;
  const sha=await publishedCommit();
  if(!sha){info('Deployment did not publish; no changes');return;}
  if(previous?.deployedSha&&sha!==previous.deployedSha){
    try{git(['merge-base','--is-ancestor',previous.deployedSha,sha]);}
    catch{info('Older or divergent deployment; no changes');return;}
  }
  if(!await reachable(ORIGIN+'/')){info('Site unavailable; no messages or ledger changes');return;}
  let editions,rows;
  try{({editions,rows}=await releases());}
  catch{info('Supabase unavailable; no messages or ledger changes');return;}
  const local=localChapters(sha);
  const planned=JSON.parse(git(['show',sha+':src/data/serials.json']));
  if(planned.some(s=>!editions.some(e=>e.slug===s.slug))){
    info('Serial edition missing from Supabase; no changes');return;
  }
  let scheduled;
  try{scheduled=validateReleasedChapters(editions,rows);}
  catch{info('Supabase public release list incomplete; no changes');return;}
  const remote=scheduled.map(c=>({...c,novelTitle:local.novels.get(c.novelSlug)}));
  if(remote.some(c=>!c.novelTitle))fail('Missing public serial novel metadata');
  // Initial public release may include a chapter not committed locally yet.
  // Remember every already-open launch chapter, so a later Git addition cannot
  // incorrectly announce it as new. Its presence is proven by RLS, not a clock.
  const launchBaseline=[];
  for(const edition of editions) {
    for(const row of rows.filter(x=>x.novel_slug===edition.slug && x.number<=edition.initial_chapters)) {
      const novelTitle=local.novels.get(edition.slug);
      if(!novelTitle)fail('Missing public launch novel metadata');
      launchBaseline.push({novelSlug:edition.slug,novelTitle,number:row.number,slug:'chapter-'+row.number,title:row.title});
    }
  }
  const published=[...local.chapters,...remote];
  const plan=decideChapters(previous,published);
  // Compare normal chapters with the PREVIOUSLY DEPLOYED commit, never
  // with current main (which can include still-unpublished chapters).
  const beforeLocal=previous?.deployedSha?localChapters(previous.deployedSha).chapters:[];
  const beforeKeys=new Set(beforeLocal.map(chapterKey));
  const scheduledKeys=new Set(remote.map(chapterKey));
  const launchKeys=new Set(launchBaseline.map(chapterKey));
  const newCandidates=plan.pending.filter(ch=>!launchKeys.has(chapterKey(ch))&&(scheduledKeys.has(chapterKey(ch))||!beforeKeys.has(chapterKey(ch))));
  const candidates=plan.baseline?[]:newCandidates;
  // A chapter must exist on the live site; do not announce a commit that has not propagated.
  for(const ch of candidates){
    if(!await reachable(chapterLink(ch,ORIGIN))){
      info('Chapter '+chapterKey(ch)+' unavailable on live site; no messages or changes');return;
    }
  }
  if(dry){
    info('DRY RUN: no messages or state changes. Initial baseline: '+plan.baseline+'. Chapters: '+(plan.baseline?plan.mark.length:newCandidates.length));
    for(const ch of plan.baseline?plan.mark:newCandidates)info((plan.baseline?'Would baseline: ':'Would send: ')+announcement(ch,ORIGIN).replaceAll('\n',' | '));
    const unknownLaunch=launchBaseline.filter(ch=>!Object.hasOwn(previous?.chapters??{},chapterKey(ch)));
    if(unknownLaunch.length)info('Would also baseline '+unknownLaunch.length+' already-open launch chapters from public Supabase.');
    return;
  }
  if(plan.baseline){
    let next={version:1,initialized:true,deployedSha:sha,chapters:{}};
    for(const ch of [...plan.mark,...launchBaseline])next=applyChapterMarker(next,ch,'baseline');
    writeLedger(ledger,next);
    info('Initial baseline stored for '+(plan.mark.length+launchBaseline.length)+' already released chapters. No posts.');
    return;
  }
  // A launch can occur after the notification service's very first run.
  // In that case mark newly visible INITIAL chapters as baseline too, never
  // post them as newly added content merely because they later enter Git.
  let active=previous;
  for(const ch of launchBaseline) {
    if(!Object.hasOwn(active.chapters??{},chapterKey(ch))) active=applyChapterMarker(active,ch,'baseline');
  }
  if(active!==previous)writeLedger(ledger,active);
  if(newCandidates.length){
    try{await telegram('getMe');}
    catch{info('Telegram unavailable at preflight; no changes');return;}
  }
  let current=active;
  try{
    current=await deliverChapters(active,newCandidates,{
      persist:async next=>{writeLedger(ledger,next);current=next;},
      send:async chapter=>{
        const result=await telegram('sendMessage',{chat_id:CHANNEL,text:announcement(chapter,ORIGIN),link_preview_options:{is_disabled:true}});
        info('Telegram confirmed '+chapterKey(chapter));
        return result;
      },
    });
  }catch{
    info('Delivery stopped: reserved chapter requires manual checking; no automatic resend');
    process.exitCode=1;return;
  }
  if(current.deployedSha!==sha)writeLedger(ledger,{...current,deployedSha:sha});
  info('Completed; new notices: '+newCandidates.length);
}
main().catch(()=>{console.error('[telegram-chapters] Safe stop: a source, GitHub ledger or validation failed. No secret values logged.');process.exitCode=1;});
