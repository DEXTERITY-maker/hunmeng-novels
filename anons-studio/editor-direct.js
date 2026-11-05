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
  const guidesToggle=$("direct-guides"),smartSnap=$("direct-smart-snap");
  const zoom=$("direct-preview-zoom"),guideStatus=$("direct-guide-status");
  const lock=$("direct-lock");
  const actionNames=["smaller","larger","rotate-left","rotate-right"];
  const actionButtons=Object.fromEntries(actionNames.map(name=>[name,$("direct-"+name)]));
  if(!editor?.getDirectTargets||!editor?.transformDirect||!editor?.toggleDirectLock
    ||!canvas||!holder||!enable||!snap||!target||!lock
    ||!guidesToggle||!smartSnap||!zoom||!guideStatus
    ||Object.values(actionButtons).some(button=>!button))return;

  const outline=document.createElement("div");
  outline.className="direct-selection-outline";
  outline.setAttribute("aria-hidden","true");
  outline.hidden=true;
  holder.appendChild(outline);
  const guideLayer=document.createElement("div");
  guideLayer.className="direct-alignment-guides";
  guideLayer.setAttribute("aria-hidden","true");
  guideLayer.hidden=true;
  const guides=[];
  for(const axis of ["x","y"]){
    for(const pct of [100/3,50,200/3]){
      const line=document.createElement("span");
      line.className="direct-alignment-line direct-alignment-"+axis;
      line.dataset.axis=axis;
      line.dataset.position=String(Math.round(pct*100)/100);
      line.style[axis==="x"?"left":"top"]=pct+"%";
      guideLayer.appendChild(line);
      guides.push({axis,pct,line});
    }
  }
  holder.appendChild(guideLayer);
  const resizeHandle=document.createElement("button");
  resizeHandle.type="button";
  resizeHandle.className="direct-resize-handle";
  resizeHandle.setAttribute("aria-label","Изменить размер выбранной фигуры");
  resizeHandle.title="Потяни, чтобы изменить размер фигуры";
  resizeHandle.hidden=true;
  holder.appendChild(resizeHandle);
  let selected="",drag=null,resizeDrag=null,refreshQueued=false;
  function clearGuideSnap(){
    for(const g of guides)g.line.classList.remove("is-snapped");
  }
  function reportSnap(xGuide,yGuide){
    for(const g of guides){
      g.line.classList.toggle("is-snapped",
        g.axis==="x"?xGuide===g.pct:yGuide===g.pct);
    }
    if(xGuide||yGuide){
      const name=value=>value===50?"центру":"третям";
      guideStatus.textContent="Привязка по "+(xGuide&&yGuide?"двум осям":xGuide?"горизонтали":"вертикали")
        +" к "+name(xGuide||yGuide)+".";
    }else{
      guideStatus.textContent="Направляющие помогают выравнивать объекты по центру и третям.";
    }
  }

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
    guideLayer.hidden=!active||!guidesToggle.checked;
    if(guideLayer.hidden)clearGuideSnap();
    canvas.classList.toggle("direct-canvas-active",active);
    canvas.tabIndex=active?0:-1;
    lock.disabled=!chosen;
    lock.setAttribute("aria-pressed",String(Boolean(chosen?.locked)));
    lock.textContent=chosen?.locked?"Разблокировать":"Заблокировать";
    const canShape=Boolean(chosen&&chosen.type==="graphic"&&!chosen.locked);
    for(const button of Object.values(actionButtons))button.disabled=!active||!canShape;

    if(!active||!chosen){
      outline.hidden=true;
      resizeHandle.hidden=true;
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
    resizeHandle.hidden=chosen.type!=="graphic"||chosen.locked;
    resizeHandle.style.left=(x+width)+"%";
    resizeHandle.style.top=(y+height)+"%";
  }
  function scheduleRefresh(){
    if(refreshQueued)return;
    refreshQueued=true;
    requestAnimationFrame(refresh);
  }
  function choose(key,focusCanvas=false){
    selected=key;
    refresh();
    window.dispatchEvent(new CustomEvent("anons:direct-selected",{detail:{key:selected}}));
    if(focusCanvas&&enable.checked)canvas.focus({preventScroll:true});
  }
  window.addEventListener("anons:select-layer",event=>{
    if(typeof event.detail?.key==="string")choose(event.detail.key);
  });
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
  // Smart alignment uses the actual object's rendered centre, not the raw
  // offset. This keeps text layers and graphics aligned consistently.
  function snapCoordinate(value,axis,session){
    const gridded=snapTo(value);
    if(!smartSnap.checked||!guidesToggle.checked)return {value:gridded,guide:null};
    const frame=session.item.rect,extent=axis==="x"?session.sceneWidth:session.sceneHeight;
    const startCenter=((axis==="x"?frame.x+frame.w/2:frame.y+frame.h/2)/extent)*100;
    const projected=startCenter+(gridded-session.initial[axis]);
    let nearest=null,delta=Infinity;
    for(const candidate of [100/3,50,200/3]){
      const difference=Math.abs(projected-candidate);
      if(difference<delta){delta=difference;nearest=candidate;}
    }
    if(delta>2.25)return {value:gridded,guide:null};
    return {value:Math.round((gridded+nearest-projected)*10)/10,guide:nearest};
  }
  function applyZoom(){
    const value=Number(zoom.value);
    const scale=[75,100,125,150].includes(value)?value/100:1;
    holder.style.setProperty("--direct-zoom",String(scale));
    holder.classList.toggle("direct-zoom-enlarged",scale>1);
    scheduleRefresh();
  }
  zoom.addEventListener("change",applyZoom);
  guidesToggle.addEventListener("change",()=>{
    reportSnap(null,null);refresh();
  });
  smartSnap.addEventListener("change",()=>reportSnap(null,null));

  enable.addEventListener("change",()=>{
    drag=null;
    resizeDrag=null;
    reportSnap(null,null);
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
    const data=current();
    drag={pointerId:event.pointerId,key:found.key,
      startX:event.clientX,startY:event.clientY,
      initial,item:found,sceneWidth:data.width,sceneHeight:data.height,
      rect:canvas.getBoundingClientRect()};
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove",event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;
    event.preventDefault();
    const dx=(event.clientX-drag.startX)/drag.rect.width*100;
    const dy=(event.clientY-drag.startY)/drag.rect.height*100;
    const x=snapCoordinate(drag.initial.x+dx,"x",drag);
    const y=snapCoordinate(drag.initial.y+dy,"y",drag);
    reportSnap(x.guide,y.guide);
    adjust({x:x.value,y:y.value},"pointer");
  });
  function releasePointer(event){
    if(!drag||drag.pointerId!==event.pointerId)return;
    drag=null;
    reportSnap(null,null);
    if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
  }
  canvas.addEventListener("pointerup",releasePointer);
  canvas.addEventListener("pointercancel",releasePointer);
  canvas.addEventListener("lostpointercapture",()=>{
    drag=null;reportSnap(null,null);
  });

  // Resize handle is HTML over the Canvas: never a layer in saved PNGs.
  resizeHandle.addEventListener("pointerdown",event=>{
    if(!enable.checked||(event.pointerType==="mouse"&&event.button!==0))return;
    const chosen=current().items.find(item=>item.key===selected);
    if(!chosen||chosen.type!=="graphic"||chosen.locked)return;
    const rect=canvas.getBoundingClientRect(),dimensions=current();
    resizeDrag={id:event.pointerId,startX:event.clientX,startY:event.clientY,
      size:chosen.size,rect,dimensions};
    resizeHandle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  resizeHandle.addEventListener("pointermove",event=>{
    if(!resizeDrag||resizeDrag.id!==event.pointerId)return;
    const d=resizeDrag;
    const dx=(event.clientX-d.startX)/d.rect.width*d.dimensions.width;
    const dy=(event.clientY-d.startY)/d.rect.height*d.dimensions.height;
    const next=d.size+(dx+dy)*50/Math.min(d.dimensions.width,d.dimensions.height);
    const constrained=Math.max(4,Math.min(35,Math.round(next)));
    adjust({size:constrained},"resize-pointer");
    event.preventDefault();
  });
  function finishResize(event){
    if(!resizeDrag||resizeDrag.id!==event.pointerId)return;
    resizeDrag=null;
    if(resizeHandle.hasPointerCapture(event.pointerId))
      resizeHandle.releasePointerCapture(event.pointerId);
  }
  resizeHandle.addEventListener("pointerup",finishResize);
  resizeHandle.addEventListener("pointercancel",finishResize);
  resizeHandle.addEventListener("lostpointercapture",()=>{resizeDrag=null;});
  resizeHandle.addEventListener("keydown",event=>{
    if(!enable.checked||!selected||!["ArrowUp","ArrowDown"].includes(event.key))return;
    const chosen=current().items.find(item=>item.key===selected);
    if(!chosen||chosen.type!=="graphic"||chosen.locked)return;
    event.preventDefault();
    adjust({size:chosen.size+(event.key==="ArrowUp"?1:-1)},"resize-keyboard");
  });

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
  applyZoom();
  refresh();
})();
