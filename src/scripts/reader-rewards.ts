import { createReaderClient, readerAuthConfigured } from '../lib/reader-auth';

export const PENDING_READER_REWARDS_KEY = 'hunmeng-novels:reader-reward-pending:v1';
const DURATION = 90000;
const SESSION_MAX = 4 * 60 * 60 * 1000;
type Pending = { userId: string; sessionId: string; novel: string; chapter: string; startedAt: number };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const valid = (v:unknown): v is Pending => {
  if (!v || typeof v!=='object') return false;
  const p=v as Pending;
  return typeof p.userId==='string' && uuid.test(p.userId) &&
    typeof p.sessionId==='string' && uuid.test(p.sessionId) &&
    typeof p.novel==='string' && slug.test(p.novel) &&
    typeof p.chapter==='string' && slug.test(p.chapter) &&
    Number.isFinite(p.startedAt) && p.startedAt>0 &&
    p.startedAt < Date.now() + 60000 && Date.now() - p.startedAt < SESSION_MAX;
};
function pending(): Pending[] {
  try {
    const parsed:unknown=JSON.parse(localStorage.getItem(PENDING_READER_REWARDS_KEY)??'[]');
    return Array.isArray(parsed) ? parsed.filter(valid).slice(-12) : [];
  } catch { return []; }
}
function writePending(entries:Pending[]) {
  try {
    if(entries.length)localStorage.setItem(PENDING_READER_REWARDS_KEY,JSON.stringify(entries.slice(-12)));
    else localStorage.removeItem(PENDING_READER_REWARDS_KEY);
  } catch { /* Progress and rewards are never destroyed by storage errors. */ }
}
function remember(p:Pending) {
  const entries=pending().filter(e=>!(e.userId===p.userId&&e.novel===p.novel&&e.chapter===p.chapter));
  entries.push(p);writePending(entries);
}
function forget(p:Pending) {
  writePending(pending().filter(e=>!(e.userId===p.userId&&e.sessionId===p.sessionId)));
}
const api = (import.meta.env.PUBLIC_SUPABASE_URL as string | undefined)?.replace(/\/+$/,'')??'';
const publishable = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY as string | undefined ?? '';
async function finishWithKeepalive(p:Pending, token:string) {
  const response=await fetch(api+'/rest/v1/rpc/reader_finish_chapter',{
    method:'POST',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
    keepalive:true,headers:{apikey:publishable,Authorization:'Bearer '+token,
      'Content-Type':'application/json'},
    body:JSON.stringify({p_session:p.sessionId}),
  });
  if (!response.ok) throw new Error('Reward service did not confirm this chapter.');
  return await response.json() as boolean;
}

/** Recover completed reading after closing a tab. Never invent XP locally. */
export async function recoverPendingReaderRewards() {
  if(!readerAuthConfigured||!navigator.onLine)return;
  const entries=pending();
  if(!entries.length)return;
  const client=createReaderClient();
  try {
    const {data}=await client.auth.getSession();
    const session=data.session;
    if(!session)return;
    const eligible=entries.filter(e=>e.userId===session.user.id && Date.now()-e.startedAt>=DURATION+2000);
    for(const entry of eligible) {
      try {
        const result=await finishWithKeepalive(entry,session.access_token);
        // A confirmed true or false means the server resolved the attempt.
        if(typeof result==='boolean')forget(entry);
      } catch { /* Remain queued until the next visit within the server's 4-hour window. */ }
    }
  } finally { client.auth.stopAutoRefresh(); }
}

/** Only full, deliberate, signed-in reading can schedule a verified claim. */
export async function initReaderRewards(novel:string,chapter:string,article:HTMLElement) {
  const output=document.getElementById('reader-reward-status');
  const announce=(message:string)=>{
    if(output){output.hidden=false;output.textContent=message;}
  };
  if(!readerAuthConfigured){announce('Reading progress is saved on this device. Chapter XP is unavailable.');return;}
  if(!navigator.onLine){announce('You are offline. Reading progress is saved locally; XP requires a connection.');return;}
  const client=createReaderClient();
  const {data:stored,error:authError}=await client.auth.getSession();
  if(authError){announce('Unable to check your account. Progress still saves on this device.');return;}
  const session=stored.session;
  if(!session){
    announce('Reading progress saves on this device. Sign in before reading to earn chapter XP.');
    return;
  }
  // Recover any previously completed chapters independently of this one.
  void recoverPendingReaderRewards().catch(()=>{});
  const {data:sessionId,error:startError}=await client.rpc('reader_begin_chapter',
    {p_novel:novel,p_chapter:chapter});
  if(startError){
    announce('Chapter rewards are unavailable right now. Your reading position is still saved.');
    return;
  }
  if(sessionId===null){
    announce('This chapter was already rewarded · +80 XP previously credited.');
    return;
  }
  if(typeof sessionId!=='string' || !uuid.test(sessionId)){
    announce('Chapter reward could not be started. Your reading position is safe.');
    return;
  }
  const reward:Pending={userId:session.user.id,sessionId,novel,chapter,startedAt:Date.now()};
  let intent=false;
  let reachedEnd=false;
  let busy=false;
  let resolved=false;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let debounced:ReturnType<typeof setTimeout>|undefined;
  const nearEnd=()=>article.getBoundingClientRect().bottom<=innerHeight+70 &&
    scrollY>Math.min(article.offsetHeight*.15,280);
  const schedule=()=>{
    if(timer)clearTimeout(timer);
    timer=setTimeout(()=>{timer=undefined;void finish();},Math.max(100,DURATION-(Date.now()-reward.startedAt)+400));
  };
  const finish=async()=>{
    if(resolved||busy||!reachedEnd||!navigator.onLine)return;
    if(Date.now()-reward.startedAt < DURATION+100){
      announce('Chapter read · reward pending. Checking after 90 seconds of reading.');
      schedule();
      return;
    }
    busy=true;
    announce('Checking your chapter reward…');
    try {
      const {data,error}=await client.rpc('reader_finish_chapter',{p_session:sessionId});
      if(error)throw error;
      // 90 seconds is enforced using server clock; a premature false is retried later.
      if(data===false && Date.now()-reward.startedAt<DURATION+5000){
        announce('Reward verification is still processing…');
        timer=setTimeout(()=>{timer=undefined;void finish();},6000);
        return;
      }
      resolved=true;
      forget(reward);
      announce(data===true?'Chapter completed · +80 XP awarded. Check your profile.':
        'This chapter has already been rewarded.');
    } catch {
      announce('Could not confirm XP. This chapter is queued for a retry when you reconnect or return.');
    } finally{busy=false;}
  };
  const reached=()=>{
    if(!intent||resolved||!nearEnd())return;
    reachedEnd=true;
    remember(reward); // Recovery receipt is not XP or a trusted completion claim.
    void finish();
  };
  const onIntent=()=>{intent=true;};
  const onKey=(e:KeyboardEvent)=>{
    if(['ArrowDown','PageDown',' ','End'].includes(e.key) &&
      !(e.target as HTMLElement)?.closest('input,textarea,button,[contenteditable]'))intent=true;
  };
  const onScroll=()=>{
    if(!intent||resolved)return;
    clearTimeout(debounced);
    debounced=setTimeout(reached,320);
  };
  const onOnline=()=>{
    if(reachedEnd)void finish();
    void recoverPendingReaderRewards().catch(()=>{});
  };
  window.addEventListener('wheel',onIntent,{passive:true});
  window.addEventListener('touchmove',onIntent,{passive:true});
  window.addEventListener('keydown',onKey);
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('online',onOnline);
  const onLeave=()=>{
    // Keepalive sends a verified RPC when the reader closes immediately after finishing.
    // If the network fails, the 4-hour server session can still be retried later.
    if(reachedEnd&&!resolved&&Date.now()-reward.startedAt>=DURATION){
      void finishWithKeepalive(reward,session.access_token)
        .then(()=>forget(reward)).catch(()=>{});
    }
  };
  window.addEventListener('pagehide',onLeave,{once:true});
  window.addEventListener('pagehide',()=>{
    window.removeEventListener('wheel',onIntent);
    window.removeEventListener('touchmove',onIntent);
    window.removeEventListener('keydown',onKey);
    window.removeEventListener('scroll',onScroll);
    window.removeEventListener('online',onOnline);
    clearTimeout(timer);clearTimeout(debounced);
  },{once:true});
  announce('Chapter reward available after a complete read and 90 seconds. Progress saves locally.');
}
