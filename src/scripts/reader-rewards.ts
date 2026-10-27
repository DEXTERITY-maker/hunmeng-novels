import {createReaderClient,readerAuthConfigured} from '../lib/reader-auth';

/**
 * Award attempts happen only at the end of a published chapter, after real
 * pointer/keyboard scrolling and a server-issued 90s session. The database
 * verifies ownership, published chapter and uniqueness. Client progress
 * remains device-local; it is never accepted as XP.
 */
export async function initReaderRewards(novel:string,chapter:string,article:HTMLElement) {
  if(!readerAuthConfigured || !navigator.onLine)return;
  const client=createReaderClient();
  const {data:session,error:authError}=await client.auth.getSession();
  if(authError||!session.session)return;
  const {data:sessionId,error:startError}=await client.rpc('reader_begin_chapter',
    {p_novel:novel,p_chapter:chapter});
  if(startError||typeof sessionId!=='string')return; // Already rewarded, unpublished or unavailable.
  const started=Date.now();
  let physicallyScrolled=false;
  let busy=false;
  let rewarded=false;
  let pending:ReturnType<typeof setTimeout>|null=null;
  const output=document.getElementById('reader-reward-status');
  const notify=(message:string)=>{
    if(output){output.hidden=false;output.textContent=message;}
  };
  const nearEnd=()=>{
    const bottom=article.getBoundingClientRect().bottom;
    return bottom<innerHeight+65 && scrollY>Math.min(article.offsetHeight*.15,280);
  };
  const finish=async()=>{
    if(busy||rewarded||!physicallyScrolled||document.visibilityState==='hidden'||!nearEnd())return;
    if(Date.now()-started<90000) {
      if(pending)clearTimeout(pending);
      pending=setTimeout(()=>{pending=null;void finish();},90000-(Date.now()-started)+250);
      return;
    }
    busy=true;
    try{
      const {data,error}=await client.rpc('reader_finish_chapter',{p_session:sessionId});
      if(!error) {
        rewarded=true;
        notify(data===true?'Chapter completed · +80 XP earned for this chapter.':
          'This chapter has already been rewarded.');
      } else if(!navigator.onLine){
        notify('Offline: the chapter reward was not confirmed. Reconnect before leaving to retry.');
      }
    } catch {
      if(!navigator.onLine)notify('Offline: chapter XP has not been credited.');
    } finally {busy=false;}
  };
  const scrollIntent=()=>{physicallyScrolled=true;};
  window.addEventListener('wheel',scrollIntent,{passive:true});
  window.addEventListener('touchmove',scrollIntent,{passive:true});
  const keyIntent=(e:KeyboardEvent)=>{
    if(['ArrowDown','PageDown',' ','End'].includes(e.key) &&
      !(e.target as HTMLElement)?.closest('input,textarea,button,[contenteditable]'))scrollIntent();
  };
  window.addEventListener('keydown',keyIntent);
  let debounce:ReturnType<typeof setTimeout>|undefined;
  const onScroll=()=>{
    if(!physicallyScrolled||rewarded)return;
    clearTimeout(debounce);
    debounce=setTimeout(()=>void finish(),850);
  };
  window.addEventListener('scroll',onScroll,{passive:true});
  const onOnline=()=>{if(physicallyScrolled)void finish();};
  window.addEventListener('online',onOnline);
  window.addEventListener('pagehide',()=>{
    window.removeEventListener('wheel',scrollIntent);
    window.removeEventListener('touchmove',scrollIntent);
    window.removeEventListener('keydown',keyIntent);
    window.removeEventListener('scroll',onScroll);
    window.removeEventListener('online',onOnline);
    if(pending)clearTimeout(pending);
    clearTimeout(debounce);
  },{once:true});
}
