import {createReaderClient,readerAuthConfigured} from '../lib/reader-auth';
import {halloweenValidName,halloweenPrizes,halloweenBadge,halloweenPrizeWinners,HALLOWEEN_START,HALLOWEEN_END} from '../lib/halloween-event';
import type {SupabaseClient} from '@supabase/supabase-js';

type Entry={place:number;display_name:string;chapters:number;team?:boolean};
type Mine={place:number|null;chapters:number;participating:boolean;display_name:string|null};
const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const start=Date.parse(HALLOWEEN_START),end=Date.parse(HALLOWEEN_END);
const eventOpen=()=>Date.now()>=start&&Date.now()<end;
const isEnded=()=>Date.now()>=end;
const duration=(ms:number)=>{
  const total=Math.max(0,Math.floor(ms/1000)),days=Math.floor(total/86400);
  const hours=Math.floor((total%86400)/3600),minutes=Math.floor((total%3600)/60);
  return `${days}d ${hours}h ${minutes}m`;
};
function setupBadges(root:ParentNode=document){
  root.querySelectorAll<HTMLImageElement>('[data-halloween-path]').forEach(image=>{
    const path=image.dataset.halloweenPath;
    if(!path)return;
    image.onload=()=>{
      image.hidden=false;
      image.parentElement?.querySelector<HTMLElement>('[data-halloween-fallback]')?.setAttribute('hidden','');
    };
    image.onerror=()=>{image.hidden=true;};
    // Images will be supplied separately; absent files leave a legible place label.
    image.src=path;
  });
}
function clock(){
  const label=$('halloween-timer-label'),value=$('halloween-timer');
  if(Date.now()<start){label.textContent='Starts in';value.textContent=duration(start-Date.now());}
  else if(Date.now()<end){label.textContent='Time remaining';value.textContent=duration(end-Date.now());}
  else{label.textContent='Event finished';value.textContent='7 November 2026 · 23:59 MSK';}
}
function paintRows(rows:Entry[],finalized:boolean){
  const body=$<HTMLTableSectionElement>('halloween-leaderboard-rows');
  body.replaceChildren();
  for(const item of rows){
    const tr=document.createElement('tr');
    const place=document.createElement('th');place.scope='row';place.textContent='#'+item.place;
    const name=document.createElement('td');name.textContent=item.display_name;
    if(item.team){
      const tag=document.createElement('span');tag.className='halloween-team-tag';
      tag.textContent='Team · no prize';name.append(' ',tag);
    }
    const chapters=document.createElement('td');chapters.textContent=String(item.chapters);
    tr.append(place,name,chapters);
    body.append(tr);
  }
  $('halloween-leaderboard-empty').hidden=rows.length>0;
  $('halloween-leaderboard-wrap').hidden=false;
  $('halloween-results').hidden=!finalized;
  const winners=$('halloween-winners');
  winners.replaceChildren();
  if(!finalized)return;
  const eligible=halloweenPrizeWinners(rows);
  for(const prize of halloweenPrizes){
    const person=eligible[prize.place-1];
    if(!person)continue;
    const li=document.createElement('li');
    const art=document.createElement('span');art.className='halloween-winner-art';
    const placeholder=document.createElement('span');placeholder.className='halloween-badge-placeholder';
    placeholder.dataset.halloweenFallback=prize.key;placeholder.textContent='✦';
    const image=document.createElement('img');image.dataset.halloweenPath=halloweenBadge(prize.key,true);
    image.alt='Place '+prize.place+' '+prize.key+' emblem';image.width=64;image.height=64;image.hidden=true;
    art.append(placeholder,image);
    const summary=document.createElement('span');summary.className='halloween-winner-label';
    const rank=document.createElement('strong');rank.textContent='Place '+prize.place+' · '+person.display_name;
    const details=document.createElement('small');details.textContent=prize.title+' · +'+prize.xp+' XP';
    summary.append(rank,details);li.append(art,summary);winners.append(li);
  }
  setupBadges(winners);
  if(!winners.children.length){
    const li=document.createElement('li');li.textContent='No eligible winners (a completed chapter was required).';
    winners.append(li);
  }
}
function notice(message:string){$('halloween-member-notice').textContent=message;}
function showForm(mode:'join'|'rename',name=''){
  const form=$<HTMLFormElement>('halloween-join-form');
  form.hidden=false;
  const input=$<HTMLInputElement>('halloween-display-name');input.value=name;
  $('halloween-join-button').textContent=mode==='join'?'Join the event':'Save new name';
  form.dataset.mode=mode;
}
function showMine(mine:Mine|null){
  const memberActions=$('halloween-member-actions');
  const form=$('halloween-join-form');
  if(!mine?.participating){
    $('halloween-my-place').textContent='You have not joined the event.';
    memberActions.hidden=true;
    if(eventOpen())showForm('join');
    else form.hidden=true;
    return;
  }
  $('halloween-my-place').textContent=`Your place: #${mine.place} · ${mine.chapters} verified chapter${mine.chapters===1?'':'s'} · ${mine.display_name}`;
  form.hidden=true;
  memberActions.hidden=!eventOpen();
}
export async function initHalloweenPage(){
  setupBadges();clock();
  let phase=isEnded()?'ended':eventOpen()?'open':'upcoming';
  window.setInterval(()=>{
    clock();
    const next=isEnded()?'ended':eventOpen()?'open':'upcoming';
    if(next!==phase){phase=next;void refresh();}
  },60000);
  const guest=$('halloween-guest'),member=$('halloween-member');
  const soon=$('halloween-leaderboard-soon'),finalizing=$('halloween-finalizing');
  const closed=$('halloween-closed-notice');
  let client:SupabaseClient|null=null;
  let userId:string|null=null;
  let ready=false;
  let current:Mine|null=null;
  const unavailable=()=>{
    ready=false;soon.hidden=false;soon.textContent='Leaderboard opens soon.';
    finalizing.hidden=true;$('halloween-leaderboard-wrap').hidden=true;$('halloween-results').hidden=true;
    member.hidden=true;guest.hidden=false;
  };
  if(!readerAuthConfigured){unavailable();return;}
  try{client=createReaderClient();}catch{unavailable();return;}
  const refresh=async()=>{
    if(!client)return;
    let response;
    try{response=await Promise.all([
      client.rpc('reader_halloween_leaderboard'),
      client.rpc('reader_halloween_event_finalized'),
    ]);}catch{unavailable();return;}
    const [board,final]=response;
    if(board.error||final.error||!Array.isArray(board.data)||typeof final.data!=='boolean'){
      unavailable();return;
    }
    ready=true;
    const rows=board.data as Entry[];
    const finalized=final.data as boolean;
    soon.hidden=true;
    finalizing.hidden=!(isEnded()&&!finalized);
    $('halloween-leaderboard-wrap').hidden=isEnded()&&!finalized;
    $('halloween-results').hidden=!finalized;
    if(!(isEnded()&&!finalized))paintRows(rows,finalized);
    closed.hidden=eventOpen();
    try{
      const {data:session}=await client.auth.getSession();
      if(!session.session){userId=null;guest.hidden=false;member.hidden=true;return;}
      const {data:auth,error}=await client.auth.getUser();
      if(error||!auth.user){userId=null;guest.hidden=false;member.hidden=true;return;}
      userId=auth.user.id;
      guest.hidden=true;member.hidden=false;
      const result=await client.rpc('reader_halloween_my_place');
      if(result.error||!Array.isArray(result.data)){
        notice('Your place is temporarily unavailable.');return;
      }
      current=(result.data[0]??null) as Mine|null;
      showMine(current);
    }catch{notice('Your place is temporarily unavailable.');}
  };
  const form=$<HTMLFormElement>('halloween-join-form');
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!client||!ready||!userId||!eventOpen())return;
    const input=$<HTMLInputElement>('halloween-display-name');
    if(!halloweenValidName(input.value)){
      notice('Use 3–24 letters, numbers, spaces, _ or -. Names that look like the site or its staff are reserved.');
      input.focus();return;
    }
    const mode=form.dataset.mode==='rename'?'reader_halloween_rename':'reader_halloween_join';
    const button=$<HTMLButtonElement>('halloween-join-button');
    button.disabled=true;notice('Saving your public name…');
    try{
      const {data,error}=await client.rpc(mode,{p_name:input.value});
      if(error||data!==true){
        notice(error?.code==='23505'?'That name is already taken. Choose another.':'Could not save the name. Please check it and try again.');
        return;
      }
      notice('Your leaderboard name is saved.');
      await refresh();
    }catch{notice('Unable to connect. Please try again.');}
    finally{button.disabled=false;}
  });
  $('halloween-rename-button').addEventListener('click',()=>{
    if(!eventOpen()||!current?.participating)return;
    showForm('rename',current.display_name??'');
    $<HTMLInputElement>('halloween-display-name').focus();
  });
  $('halloween-leave-button').addEventListener('click',async()=>{
    if(!client||!userId||!eventOpen()||!current?.participating)return;
    if(!window.confirm('Leave Halloween Reading Week? Your leaderboard entry will be removed.'))return;
    const button=$<HTMLButtonElement>('halloween-leave-button');
    button.disabled=true;
    try{
      const {data,error}=await client.rpc('reader_halloween_leave');
      if(error||data!==true){notice('Unable to leave the event. Try again.');return;}
      notice('You have left the event.');
      await refresh();
    }catch{notice('Unable to connect. Please try again.');}
    finally{button.disabled=false;}
  });
  await refresh();
}
