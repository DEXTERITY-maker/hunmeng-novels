/** URL-backed, keyboard-accessible tabs for the signed-in Profile section. */
export function initProfileOverviewTabs() {
  const root=document.querySelector<HTMLElement>('#reader-advancement');
  const tablist=root?.querySelector<HTMLElement>('[role="tablist"]');
  if(!root||!tablist)return;
  const order=['overview','progress','titles-achievements','xp-history'] as const;
  type View=typeof order[number];
  const tabs=order.map(id=>tablist.querySelector<HTMLButtonElement>('[data-overview-tab="'+id+'"]')!);
  const panels=order.map(id=>document.getElementById(id)!);
  const activeFromHash=():View=>{
    const value=location.hash.slice(1);
    return order.find(id=>id===value)??'overview';
  };
  const select=(id:View)=>{
    const active=order.indexOf(id);
    for(let i=0;i<order.length;i++){
      const selected=i===active;
      tabs[i].setAttribute('aria-selected',String(selected));
      tabs[i].tabIndex=selected?0:-1;
      panels[i].hidden=!selected;
    }
  };
  const navigate=(id:View,focus=false)=>{
    if(location.hash!=='#'+id)history.pushState(null,'','#'+id);
    select(id);
    // The surrounding Profile / Reading / Account navigation observes popstate.
    window.dispatchEvent(new PopStateEvent('popstate'));
    if(focus)tabs[order.indexOf(id)].focus();
  };
  tabs.forEach((tab,i)=>{
    tab.addEventListener('click',()=>navigate(order[i]));
    tab.addEventListener('keydown',event=>{
      let index=i;
      if(event.key==='ArrowRight')index=(i+1)%tabs.length;
      else if(event.key==='ArrowLeft')index=(i-1+tabs.length)%tabs.length;
      else if(event.key==='Home')index=0;
      else if(event.key==='End')index=tabs.length-1;
      else return;
      event.preventDefault();
      navigate(order[index],true);
    });
  });
  document.getElementById('profile-view-xp-history')?.addEventListener('click',event=>{
    event.preventDefault();
    navigate('xp-history',true);
  });
  const fromUrl=()=>select(activeFromHash());
  window.addEventListener('hashchange',fromUrl);
  window.addEventListener('popstate',fromUrl);
  window.addEventListener('reader:auth-change',fromUrl);
  fromUrl();
}
