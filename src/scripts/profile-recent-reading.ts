import { repository, onStorageChange } from '../lib/storage';
import { getCatalog, catalogUpdatedEvent } from '../lib/client-data';
import { readingAction } from '../lib/reading-action';

/** Device-owned reading activity; never represents this as server-verified XP. */
export function initProfileRecentReading() {
  const section=document.getElementById('profile-recent-reading');
  const list=document.getElementById('profile-recent-list');
  const status=document.getElementById('profile-recent-status');
  if(!section||!list||!status)return ()=>{};
  let active=false;
  let serial=0;
  const render=async()=>{
    if(!active)return;
    const current=++serial;
    try{
      const [state,catalog]=await Promise.all([repository.getState(),getCatalog()]);
      if(!active||current!==serial)return;
      const bySlug=new Map(catalog.map(n=>[n.slug,n]));
      const recent=Object.entries(state.progress)
        .filter(([slug,p])=>bySlug.has(slug)&&p.updatedAt>0&&Number.isFinite(p.updatedAt))
        .sort((a,b)=>b[1].updatedAt-a[1].updatedAt).slice(0,3);
      list.replaceChildren();
      if(!recent.length){
        status.textContent='No reading activity saved on this device yet.';
        return;
      }
      status.textContent='Your most recently opened chapters on this device.';
      for(const [slug,p] of recent){
        const novel=bySlug.get(slug)!;
        const action=readingAction(novel,p);
        const item=document.createElement('li');
        const cover=document.createElement('img');
        cover.className='profile-recent-cover';
        cover.src=novel.cover;cover.alt='';cover.width=58;cover.height=87;cover.loading='lazy';
        const copy=document.createElement('div');copy.className='profile-recent-copy';
        const title=document.createElement('strong');
        title.textContent=novel.title;
        const detail=document.createElement('span');
        const chapter=novel.chapters.find(c=>c.slug===p.chapterSlug);
        const percent=Math.round(Math.min(1,Math.max(0,p.ratio))*100);
        detail.textContent=chapter?`Chapter ${chapter.number} · ${percent}%`:`Last saved position · ${percent}%`;
        const bar=document.createElement('progress');
        bar.max=100;bar.value=percent;
        bar.setAttribute('aria-label',`${novel.title}: current chapter progress`);
        const link=document.createElement('a');
        link.href=action.url;link.textContent=action.label+' →';
        copy.append(title,detail,bar);
        item.append(cover,copy,link);
        list.append(item);
      }
    }catch{
      if(active&&current===serial){
        list.replaceChildren();
        status.textContent='Recent reading is temporarily unavailable. Your saved progress has not changed.';
      }
    }
  };
  const off=onStorageChange(()=>void render());
  window.addEventListener(catalogUpdatedEvent,()=>void render());
  return (enabled:boolean)=>{
    active=enabled;
    if(!active){serial++;list.replaceChildren();status.textContent='';}
    else void render();
  };
}
