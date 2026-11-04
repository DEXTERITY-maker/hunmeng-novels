// Anons Studio: accessible, non-destructive object manipulation.
// Visual selection outlines are DOM elements outside the Canvas bitmap.
// Saved snapshots and PNG exports contain only safe layout/figure values.
(() => {
  "use strict";
  const editor=window.AnonsEditor;
  const canvas=document.getElementById("poster");
  const holder=canvas?.parentElement;
  const $=id=>document.getElementById(id);
  const enable=$("direct-enable"),snap=$("direct-snap"),target=$("direct-target");
  const lock=$("direct-lock");
  const actionNames=["smaller","larger","rotate-left","rotate-right"];
  const actionButtons=Object.fromEntries(actionNames.map(name=>[name,$("direct-"+name)]));
  if(!editor?.getDirectTargets||!editor?.transformDirect||!editor?.toggleDirectLock
    ||!canvas||!holder||!enable||!snap||!target||!lock
    ||Object.values(actionButtons).some(button=>!button))return;

  const outline=document.createElement("div");
  outline.className="direct-selection-outline";
  outline.setAttribute("aria-hidden","true");
  outline.hidden=true;
  holder.appendChild(outline);
  let selected="",drag=null,refreshQueued=false;

  function current(){
    return editor.getDirectTargets();
  }
  function refresh(){
    refreshQueued=false;
    const snapshot=current();
    const items=snapshot.items;
    if(!items.some(item=>item.key===selected))selected="";
    const options=[{key:"",label:"Не выбран"},...items.map(item=>({
      key:item.key,label:item.label+(item.locked?" · заблокирован":"")
    }))];
    const changed=target.options.length!==options.length||
      options.some((item,i)=>target.options[i]?.value!==item.key||
        target.options[i]?.textContent!==item.label);
    if(changed){
      target.replaceChildren();
      for(const item of options){
        const option=document.createElement("option");
        option.value=item.key;
        option.textContent=item.label;
        target.appendChild(option);
      }
    }
    target.value=selected;
    const chosen=items.find(item=>item.key===selected);
    const active=enable.checked;
    canvas.classList.toggle("direct-canvas-active",active);
    canvas.tabIndex=active?0:-1;
    lock.disabled=!chosen;
    lock.setAttribute("aria-pressed",String(Boolean(chosen?.locked)));
    lock.textContent=chosen?.locked?"Разблокировать":"Заблокировать";
    const canShape=Boolean(chosen&&chosen.type==="graphic"&&!chosen.locked);
    for(const button of Object.values(actionButtons))button.disabled=!active||!canShape;

    if(!active||!chosen){
      outline.hidden=true;
      return;
    }
    const rect=chosen.rect,clip=(n,min,max)=>Math.max(min,Math.min(max,n));
    const x=clip(rect.x/snapshot.width*100,0,100);
    const y=clip(rect.y/snapshot.height*100,0,100);
    const width=clip((rect.w/snapshot.width)*100,0,100-x);
    const height=clip((rect.h/snapshot.height)*100,0,100-y);
    outline.style.left=x+"%";
    outline.style.top=y+"%";
    outline.style.width=width+"%";
    outline.style.height=height+"%";
    outline.classList.toggle("is-locked",Boolean(chosen.locked));
    outline.hidden=false;
  }
  function scheduleRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    requestAnimationFrame(refresh);
  }
  function choose(key,focusCanvas=false){
    selected=key;
    refresh();
    if(focusCanvas&&enable.checked)canvas.focus({preventScroll:true});
  }
  function adjust(updates,group){
    if(!selected||!enable.checked)return false;
    const success=editor.transformDirect(selected,updates,group);
    if(success)scheduleRefresh();
    return success;
  }
  function chooseUnderPointer(event){
    const data=current(),bounds=canvas.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return null;
    const x=(event.clientX-bounds.left)/bounds.width*data.width;
    const y=(event.clientY-bounds.top)/bounds.height*data.height;
    const ranked=[...data.items].reverse().sort((a,b)=>{
      const rank=item=>item.type==="graphic"?4:item.key==="title"?3:item.key==="description"?2:item.key==="highlights"?1:0;
      return rank(b)-rank(a);
    });
    const found=ranked.find(item=>x>=item.rect.x&&x<=item.rect.x+item.rect.w
      &&y>=item.rect.y&&y<=item.rect.y+item.rect.h);
    return found||null;
  }
  function coordinateOrigin(key){
    const data=current();
    if(key.startsWith("graphic:")){
      const item=data.items.find(v=>v.key===key);
      return item?{x:(item.rect.x+item.rect.w/2)/data.width*100,
        y:(item.rect.y+item.rect.h/2)/data.height*100}:null;
    }
    const snapshot=editor.getSnapshot(),card=snapshot.cards[snapshot.activeCard];
    return {x:card.layerOffsets?.[key]?.x||0,y:card.layerOffsets?.[key]?.y||0};
  }
  function snapTo(value){
    return snap.checked?Math.round(value/5)*5:Math.round(value*10)/10;
  }

  enable.addEventListener("change",()=>{
    drag=null;
    refresh();
  });
  target.addEventListener("change",()=>choose(target.value));
  lock.addEventListener("click",()=>{
    if(!selected)return;
    editor.toggleDirectLock(selected);
    refresh();
  });
  canvas.addEventListener("pointerdown",event=>{
    if(!enable.checked || (event.pointerType==="mouse"&&event.button!==0))return;
    const found=chooseUnderPointer(event);
    if(!found){
      choose("");
      return;
    }
    choose(found.key,true);
    if(found.locked)return;
    const initial=coordinateOrigin(found.key);
    if(!initial)return;
    drag={pointerId:event.pointerId,key:found.key,
      startX:event.clientX,startY:event.clientY,
      initial,rect:canvas.getBoundingClientRect()};
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove",event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    event.preventDefault();
    const dx=(event.clientX-drag.startX)/drag.rect.width*100;
    const dy=(event.clientY-drag.startY)/drag.rect.height*100;
    adjust({x:snapTo(drag.initial.x+dx),y:snapTo(drag.initial.y+dy)},"pointer");
  });
  function releasePointer(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    drag=null;
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener("pointerup",releasePointer);
  canvas.addEventListener("pointercancel",releasePointer);
  canvas.addEventListener("lostpointercapture",()=>{drag=null;});

  canvas.addEventListener("keydown",event=>{
    if(!enable.checked||!selected)return;
    if(event.key==="Escape"){choose("");event.preventDefault();return;}
    const map={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const delta=map[event.key];
    if(!delta)return;
    event.preventDefault();
    const initial=coordinateOrigin(selected);
    if(!initial)return;
    const step=snap.checked||event.shiftKey?5:1;
    adjust({x:initial.x+delta[0]*step,y:initial.y+delta[1]*step},"keyboard");
  });
  const actions={
    smaller:{size:-2},larger:{size:2},
    "rotate-left":{rotation:-15},"rotate-right":{rotation:15}
  };
  for(const [name,button] of Object.entries(actionButtons)){
    button.addEventListener("click",()=>{
      const chosen=current().items.find(item=>item.key===selected);
      if(!chosen||chosen.type!=="graphic"||chosen.locked)return;
      const parameter=Object.keys(actions[name])[0];
      adjust({[parameter]:chosen[parameter]+actions[name][parameter]},name);
    });
  }
  window.addEventListener("anons:editor-change",scheduleRefresh);
  window.addEventListener("anons:editor-reset",()=>{selected="";scheduleRefresh();});
  window.addEventListener("resize",scheduleRefresh);
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(scheduleRefresh).observe(canvas);
  refresh();
})();
