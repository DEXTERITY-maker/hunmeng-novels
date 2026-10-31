/** Presentation-only rearrangement: preserve the live advancement nodes and their IDs. */
export function initProfileOverview() {
  const advancement=document.getElementById('reader-advancement');
  if(!advancement)return;
  const overview=document.getElementById('profile-overview')!;
  const progress=document.getElementById('profile-progress')!;
  const titles=document.getElementById('profile-titles')!;
  const history=document.getElementById('profile-history')!;
  const hero=advancement.querySelector<HTMLElement>('.advancement-hero');
  const stats=advancement.querySelector<HTMLElement>('.advancement-stats');
  const mastery=advancement.querySelector<HTMLElement>('.reader-mastery-section');
  const sections=[...advancement.querySelectorAll<HTMLElement>(':scope > .advancement-section')];
  const move=(element:HTMLElement|null,target:HTMLElement)=>{if(element)target.append(element);};
  if(hero) {
    const rank=hero.querySelector('.advancement-emblem-wrap');
    const heading=hero.querySelector('.advancement-intro > h3');
    const xp=hero.querySelector('.advancement-xp-label');
    const bar=hero.querySelector('#reader-xp-progress');
    const title=hero.querySelector('.advancement-title-line:has(#reader-equipped-title)');
    const identity=document.getElementById('profile-hero-identity');
    const rankHolder=document.createElement('div');
    rankHolder.className='profile-hero-rank';
    for(const node of [rank,heading,xp,bar,title])if(node)rankHolder.append(node);
    identity?.append(rankHolder);
    move(hero,progress);
  }
  if(stats) {
    const desired=['reader-stat-chapters','reader-stat-novels','reader-stat-days','reader-stat-achievements'];
    for(const tile of [...stats.children])if(!desired.some(id=>tile.querySelector('#'+id)))tile.remove();
    stats.classList.add('profile-four-stats');
    const details=document.getElementById('profile-details');
    details?.insertBefore(stats,details.querySelector('.profile-subtabs'));
  }
  move(mastery,progress);
  for(const section of sections) {
    if(section.id==='halloween-profile-awards-section'){move(section,document.getElementById('profile-event-awards-slot')!);continue;}
    if(section.querySelector('#reader-next-achievement')) {
      const goal=section.querySelector('#reader-next-achievement');
      if(goal)document.getElementById('profile-goal-slot')?.append(goal);
    }
    if(section.querySelector('#reader-xp-history-list'))move(section,history);
    else if(section.querySelector('#rank-gallery-title')) {
      // Keep the rank nodes and data attributes available to existing scripts,
      // but don't render the nine-card gallery in the compact profile.
      move(section,progress);
      section.classList.add('profile-rank-gallery-hidden');
    }
    else move(section,titles);
  }
  const awards=document.getElementById('profile-event-awards-slot')!;
  const awardSection=document.getElementById('halloween-profile-awards-section');
  const updateAwards=()=>{
    const hasAwards=Boolean(awardSection && !awardSection.hidden && awardSection.querySelector('.halloween-profile-awards')?.children.length);
    const ongoing=Date.now()>=Date.parse('2026-10-31T21:00:00Z') && Date.now()<Date.parse('2026-11-07T21:00:00Z');
    awards.hidden=!hasAwards&&!ongoing;
    let invite=awards.querySelector<HTMLElement>('.profile-event-invite');
    if(!hasAwards&&ongoing&&!invite){invite=document.createElement('p');invite.className='profile-event-invite';invite.innerHTML='<a href="/events/halloween-2026/">Halloween Reading Week is on →</a>';awards.append(invite);}
    if(invite)invite.hidden=hasAwards||!ongoing;
  };
  if(awardSection)new MutationObserver(updateAwards).observe(awardSection,{attributes:true,childList:true,subtree:true});
  updateAwards();
  const tabs=[...document.querySelectorAll<HTMLButtonElement>('[data-profile-subtab]')];
  const panels=new Map([['overview',overview],['progress',progress],['titles',titles],['history',history]]);
  const selected=()=>location.hash.slice(1);
  const activate=(name:string,focus=false)=>{
    const key=panels.has(name)?name:'overview';
    tabs.forEach(tab=>{const active=tab.dataset.profileSubtab===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();});
    panels.forEach((panel,id)=>{panel.hidden=id!==key;});
  };
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>{history.replaceState(null,'','#'+tab.dataset.profileSubtab);activate(tab.dataset.profileSubtab!);});
    tab.addEventListener('keydown',event=>{
      const delta=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
      if(!delta&&event.key!=='Home'&&event.key!=='End')return;
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+delta+tabs.length)%tabs.length;
      tabs[next].click();tabs[next].focus();
    });
  });
  document.getElementById('profile-view-history')?.addEventListener('click',()=>tabs.find(tab=>tab.dataset.profileSubtab==='history')?.click());
  window.addEventListener('hashchange',()=>{if(panels.has(selected()))activate(selected());});
  activate(selected());
  const dialog=document.getElementById('profile-edit-dialog') as HTMLDialogElement;
  const opener=document.getElementById('profile-edit-open') as HTMLButtonElement;
  opener?.addEventListener('click',()=>dialog.showModal());
  document.getElementById('profile-edit-close')?.addEventListener('click',()=>dialog.close());
  dialog?.addEventListener('close',()=>opener.focus());
  const bio=document.getElementById('profile-hero-bio');
  const input=document.querySelector<HTMLTextAreaElement>('#profile-form textarea[name=bio]');
  const updateBio=()=>{if(bio&&input)bio.textContent=input.value.trim()||'My reading corner';};
  input?.addEventListener('input',updateBio);
  document.getElementById('profile-form')?.addEventListener('submit',()=>setTimeout(updateBio,500));
}
