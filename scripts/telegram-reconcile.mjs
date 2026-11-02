import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chapterKey,parseChapterMarkdown,decideChapters,validateReleasedChapters} from './telegram-chapters-core.mjs';
import {createReconciliation,ensureApplicable,pushWithLease,LEDGER_REF} from './telegram-reconcile-core.mjs';

// This command never sends Telegram messages. Default is a read-only preview.
const REPO='DEXTERITY-maker/hunmeng-novels', ORIGIN='https://hunmeng-novel.ru';
const MANIFEST='docs/telegram-backlog-classification-20261102.json';
const SHA=/^[0-9a-f]{40}$/;
const run=(cmd,args,opts={})=>execFileSync(cmd,args,{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],...opts}).trim();
const git=(args,opts={})=>run('git',args,opts);
const gh=path=>JSON.parse(run('gh',['api','repos/'+REPO+'/'+path]));
const requireSha=s=>{if(!SHA.test(s??''))throw Error('Invalid SHA');return s;};
async function lastPublished() {
  const data=gh('actions/workflows/pages-manual-draft.yml/runs?status=completed&per_page=50');
  if(!Array.isArray(data.workflow_runs))throw Error('Deployment history unavailable');
  for(const run of data.workflow_runs){
    if(run.head_branch!=='main'||run.conclusion!=='success'||!SHA.test(run.head_sha??''))continue;
    const jobs=gh('actions/runs/'+run.id+'/jobs?per_page=50');
    if(jobs.jobs?.some(j=>j.name==='deploy'&&j.conclusion==='success'))return run.head_sha;
  }
  throw Error('No verified deployment');
}
function verifyDeployments(manifest) {
  const deployments=gh('deployments?environment=pages-production&per_page=100');
  if(!Array.isArray(deployments))throw Error('Deployment history unavailable');
  let latest=null,firstConfirmed=false;
  for(const deployment of deployments) {
    if(latest && firstConfirmed)break;
    const statuses=gh('deployments/'+deployment.id+'/statuses');
    if(!Array.isArray(statuses)||statuses[0]?.state!=='success')continue;
    latest??=deployment.sha;
    if(deployment.sha===manifest.first_published_sha)firstConfirmed=true;
  }
  if(latest!==manifest.published_sha||!firstConfirmed)throw Error('Published deployment evidence changed');
}
function localChapters(sha) {
  requireSha(sha);
  const paths=git(['ls-tree','-r','--name-only',sha,'src/content/chapters']).split('\n').filter(p=>/^src\/content\/chapters\/[a-z0-9-]+\/[a-z0-9-]+\.md$/.test(p));
  if(!paths.length)throw Error('Published chapters unavailable');
  const novels=new Map(), chapters=[];
  for(const path of paths){
    const slug=path.split('/')[3];
    if(!novels.has(slug)){
      const n=JSON.parse(git(['show',sha+':src/content/novels/'+slug+'.json']));
      if(n.slug!==slug||!n.title)throw Error('Invalid novel');novels.set(slug,n.title);
    }
    chapters.push({...parseChapterMarkdown(git(['show',sha+':'+path]),slug),novelTitle:novels.get(slug)});
  }
  return {novels,chapters};
}
function publicCredentials() {
  const values={};
  try{for(const line of readFileSync('.env.production','utf8').split(/\r?\n/)){const m=/^(PUBLIC_SUPABASE_URL|PUBLIC_SUPABASE_PUBLISHABLE_KEY)=(.*)$/.exec(line.trim());if(m)values[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}}catch{}
  const base=(process.env.PUBLIC_SUPABASE_URL||values.PUBLIC_SUPABASE_URL||'').replace(/\/+$/,'');
  const key=process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY||values.PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw Error('Missing public Supabase configuration');
  return {base,key};
}
function getJson(url,headers=[]) {return JSON.parse(run('curl',['--fail','--silent','--show-error','--max-time','20',...headers.flatMap(x=>['-H',x]),url]));}
function publicReleases() {
  const {base,key}=publicCredentials(),headers=['apikey: '+key];
  return {editions:getJson(base+'/rest/v1/serial_editions?select=slug,initial_chapters,launch_at',headers),rows:getJson(base+'/rest/v1/serial_chapters?select=novel_slug,number,title&order=number.asc',headers)};
}
function buildCandidates(state, sha, local, editions, rows) {
  const scheduled=validateReleasedChapters(editions,rows),remote=scheduled.map(c=>({...c,novelTitle:local.novels.get(c.novelSlug)}));
  if(remote.some(c=>!c.novelTitle))throw Error('Missing serial metadata');
  const planned=JSON.parse(git(['show',sha+':src/data/serials.json']));
  if(planned.some(s=>!editions.some(e=>e.slug===s.slug)))throw Error('Serial edition missing');
  const launch=[];
  for(const e of editions)for(const row of rows.filter(x=>x.novel_slug===e.slug && x.number<=e.initial_chapters)){
    const novelTitle=local.novels.get(e.slug);if(!novelTitle)throw Error('Missing launch metadata');
    launch.push({novelSlug:e.slug,novelTitle,number:row.number,slug:'chapter-'+row.number,title:row.title});
  }
  const before=new Set(localChapters(state.deployedSha).chapters.map(chapterKey));
  const scheduledKeys=new Set(remote.map(chapterKey)), launchKeys=new Set(launch.map(chapterKey));
  const plan=decideChapters(state,[...local.chapters,...remote]);
  if(plan.baseline)throw Error('Ledger is not initialized');
  return plan.pending.filter(ch=>!launchKeys.has(chapterKey(ch))&&(scheduledKeys.has(chapterKey(ch))||!before.has(chapterKey(ch))));
}
function verifyEvidence(manifest,allKeys,published,site) {
  for(const field of ['published_sha','first_published_sha','import_sha'])requireSha(manifest[field]);
  git(['merge-base','--is-ancestor',manifest.import_sha,manifest.first_published_sha]);
  git(['merge-base','--is-ancestor',manifest.first_published_sha,manifest.published_sha]);
  const tree=sha=>new Map(git(['ls-tree','-r',sha,'src/content/chapters']).split('\n').filter(Boolean).map(line=>{const [meta,path]=line.split('\t');return [path,meta.split(' ')[2]];}));
  const a=tree(manifest.import_sha),b=tree(manifest.first_published_sha),c=tree(manifest.published_sha);
  if(!Array.isArray(site))throw Error('Live catalogue unavailable');
  for(const key of allKeys){
    const chapter=published.get(key);if(!chapter)throw Error('Candidate missing from deployed revision');
    const path=`src/content/chapters/${chapter.novelSlug}/${chapter.slug}.md`, blob=a.get(path);
    const novel=site.find(n=>n.slug===chapter.novelSlug), row=novel?.chapters?.find(x=>x.number===chapter.number);
    if(!blob||b.get(path)!==blob||c.get(path)!==blob||novel?.title!==chapter.novelTitle||row?.slug!==chapter.slug||row?.title!==chapter.title)
      throw Error('Historical or live publication evidence changed');
  }
}
async function main(){
  const args=process.argv.slice(2), apply=args[0]==='--apply';
  if(args.length && (!apply || args.length!==2 || !/^--confirm=[0-9a-f]{64}$/.test(args[1])))throw Error('Use no arguments for preview; apply requires --apply --confirm=<reviewed-plan-id>');
  const allowedRemotes=['https://github.com/'+REPO+'.git','https://github.com/'+REPO,'git@github.com:'+REPO+'.git','git@github.com:'+REPO];
  if(!allowedRemotes.includes(git(['remote','get-url','origin'])))throw Error('Unexpected origin');
  const manifest=JSON.parse(readFileSync(MANIFEST,'utf8'));requireSha(manifest.ledger_head);
  const remote=git(['ls-remote','origin',LEDGER_REF]).split(/\s+/)[0];
  if(remote!==manifest.ledger_head)throw Error('Ledger changed; create a new reviewed classification');
  git(['fetch','--no-tags','origin',LEDGER_REF]);
  if(git(['rev-parse','FETCH_HEAD'])!==remote)throw Error('Ledger changed during fetch');
  const before=execFileSync('git',['show',remote+':state.json'],{encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']}),state=JSON.parse(before);
  const publishedSha=await lastPublished();
  if(publishedSha!==manifest.published_sha)throw Error('Published revision changed; review again');
  verifyDeployments(manifest);
  git(['merge-base','--is-ancestor',state.deployedSha,publishedSha]);
  const local=localChapters(publishedSha), map=new Map(local.chapters.map(c=>[chapterKey(c),c]));
  const {editions,rows}=publicReleases(), candidates=buildCandidates(state,publishedSha,local,editions,rows);
  const all=[...manifest.baseline,...manifest.new,...manifest.ambiguous];
  verifyEvidence(manifest,all,map,getJson(ORIGIN+'/catalog.json'));
  const plan=createReconciliation({state,manifest,published:map,expectedKeys:candidates.map(chapterKey),originalText:before});
  const dir=mkdtempSync(join(tmpdir(),'hunmeng-reconcile-'));
  const oldPath=join(dir,'before.json'),newPath=join(dir,'after.json'),diffPath=join(dir,'changes.diff');
  writeFileSync(oldPath,before,{mode:0o600});writeFileSync(newPath,plan.after,{mode:0o600});
  const diff=spawnSync('git',['diff','--no-index','--',oldPath,newPath],{encoding:'utf8',maxBuffer:32*1024*1024});
  if(![0,1].includes(diff.status))throw Error('Could not generate exact diff');
  writeFileSync(diffPath,diff.stdout,{mode:0o600});
  console.log(JSON.stringify({ledger:remote,published:publishedSha,baseline:plan.baselineCount,new:manifest.new.length,ambiguous:manifest.ambiguous.length,unresolved:plan.blockers,planId:plan.planId,before:oldPath,after:newPath,diff:diffPath,applyAllowed:plan.blockers.length===0},null,2));
  if(!apply)return;
  ensureApplicable(plan,args[1].slice('--confirm='.length));
  // The ledger and publication must still be current immediately before pushing.
  if(await lastPublished()!==publishedSha)throw Error('Published revision changed; review again');
  verifyDeployments(manifest);
  const fresh=publicReleases(), freshKeys=buildCandidates(state,publishedSha,local,fresh.editions,fresh.rows).map(chapterKey).sort();
  if(JSON.stringify(freshKeys)!==JSON.stringify(candidates.map(chapterKey).sort()))throw Error('Pending chapter set changed or is incomplete');
  verifyEvidence(manifest,all,map,getJson(ORIGIN+'/catalog.json'));
  const treeEntries=git(['ls-tree','-r','--name-only',remote]).split('\n').filter(Boolean);
  if(treeEntries.length!==1 || treeEntries[0]!=='state.json' || !/^100644 blob [a-f0-9]{40}\tstate\.json$/.test(git(['ls-tree',remote,'state.json'])))throw Error('Unexpected ledger branch files');
  const blob=git(['hash-object','-w','--stdin'],{input:plan.after});
  const tree=git(['mktree'],{input:'100644 blob '+blob+'\tstate.json\n'});
  const env={...process.env,GIT_AUTHOR_NAME:'Hunmeng Notifications',GIT_AUTHOR_EMAIL:'actions@users.noreply.github.com',GIT_COMMITTER_NAME:'Hunmeng Notifications',GIT_COMMITTER_EMAIL:'actions@users.noreply.github.com'};
  const commit=git(['commit-tree',tree,'-p',remote],{input:'chore: reviewed Telegram historical baseline [skip ci]\n',env});
  pushWithLease(git,commit,remote);
  console.log('Ledger updated: '+commit);
}
main().catch(error=>{
  const safe=new Set(['Unresolved notices remain; application is forbidden','Plan confirmation does not match exact current state','Ledger changed; create a new reviewed classification','Published revision changed; review again','Pending chapter set changed or is incomplete','Unexpected ledger branch files']);
  console.error('Safe stop: '+(safe.has(error?.message)?error.message:'validation, source or ledger check failed')+'; no automatic retry.');process.exitCode=1;
});
