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
  const safeMargin=$("direct-safe-margin"),safeShow=$("direct-safe-show");
  const safeBadge=$("direct-safe-badge"),safeSummary=$("direct-safe-summary");
  const safeList=$("direct-safe-list"),safeFit=$("direct-safe-fit");
  const safeNote=$("direct-safe-note");
  const multiList=$("direct-multi-list"),multiCount=$("direct-multi-count");
  const multiAll=$("direct-multi-all"),multiClear=$("direct-multi-clear");
  const multiGroup=$("direct-multi-group"),multiStatus=$("direct-multi-status");
  const alignButtons=[...document.querySelectorAll("[data-direct-align]")];
  const actionNames=["smaller","larger","rotate-left","rotate-right"];
  const actionButtons=Object.fromEntries(actionNames.map(name=>[name,$("direct-"+name)]));
  if(!editor?.getDirectTargets||!editor?.transformDirect||!editor?.toggleDirectLock
    ||!canvas||!holder||!enable||!snap||!target||!lock
    ||!guidesToggle||!smartSnap||!zoom||!guideStatus
    ||!multiList||!multiCount||!multiAll||!multiClear||!multiGroup||!multiStatus
    ||!editor.transformDirectSelection||!editor.alignDirectSelection||!editor.fitDirectSelection
    ||!safeMargin||!safeShow||!safeBadge||!safeSummary||!safeList||!safeFit||!safeNote
    ||alignButtons.length!==8
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
  const safeFrame=document.createElement("div");
  safeFrame.className="direct-safe-frame";
  safeFrame.setAttribute("aria-hidden","true");
  safeFrame.hidden=true;
  holder.appendChild(safeFrame);
  let safeFeedback="";
  function safeMarginValue(){
    const value=Number(safeMargin.value);
    return [5,10,15].includes(value)?value:5;
  }
  function renderSafeArea(data,active){
    const margin=safeMarginValue(),x=data.width*margin/100,y=data.height*margin/100;
    safeFrame.hidden=!safeShow.checked;
    safeFrame.style.inset=margin+"%";
    const checkable=data.items.filter(item=>item.type!=="photo");
    const unsafe=checkable.filter(item=>
      item.rect.x<x-.5||item.rect.y<y-.5||
      item.rect.x+item.rect.w>data.width-x+.5||
      item.rect.y+item.rect.h>data.height-y+.5);
    const warningCount=unsafe.length;
    safeBadge.dataset.state=warningCount?"warning":"ok";
    safeBadge.textContent=warningCount?"Проверить · "+warningCount:"В границах";
    safeSummary.textContent=warningCount
      ?"Рядом с краем: "+warningCount+" из "+checkable.length+
        " объектов. При публикации важные части могут перекрываться."
      :"Основные видимые элементы находятся внутри поля "+margin+"%.";
    safeList.replaceChildren();
    for(const item of unsafe.slice(0,5)){
      const li=document.createElement("li");
      li.textContent=item.label;
      safeList.appendChild(li);
    }
    if(unsafe.length>5){
      const li=document.createElement("li");
      li.textContent="И ещё "+(unsafe.length-5)+" объектов";
      safeList.appendChild(li);
    }
    const chosen=data.items.filter(item=>selectedSet.has(item.key));
    const valid=active&&chosen.length>0&&chosen.length===selectedSet.size
      &&chosen.every(item=>!item.locked&&item.type!=="photo");
    const left=chosen.length?Math.min(...chosen.map(item=>item.rect.x)):0;
    const top=chosen.length?Math.min(...chosen.map(item=>item.rect.y)):0;
    const right=chosen.length?Math.max(...chosen.map(item=>item.rect.x+item.rect.w)):0;
    const bottom=chosen.length?Math.max(...chosen.map(item=>item.rect.y+item.rect.h)):0;
    const tooWide=right-left>data.width-2*x||bottom-top>data.height-2*y;
    const outside=chosen.some(item=>item.rect.x<x-.5||item.rect.y<y-.5
      ||item.rect.x+item.rect.w>data.width-x+.5
      ||item.rect.y+item.rect.h>data.height-y+.5);
    const card=editor.getSnapshot().cards[editor.getSnapshot().activeCard];
    const keys=new Set(chosen.map(item=>item.key));
    const partialGroup=chosen.some(item=>item.type==="graphic"&&
      card.graphicElements.some(g=>"graphic:"+g.id===item.key&&g.groupId
        &&card.graphicElements.some(peer=>peer.groupId===g.groupId&&!keys.has("graphic:"+peer.id))));
    safeFit.disabled=!valid||tooWide||partialGroup||!outside;
    safeNote.textContent=safeFeedback||
      (tooWide&&chosen.length
        ?"Выделение шире выбранной безопасной зоны. Уменьши объекты или выбери более узкое поле."
        :partialGroup?"Для переноса группы выдели все связанные фигуры."
        :"Поля — визуальная подсказка, а не гарантия для каждой площадки. Фото может намеренно выходить за поля.");
  }
  let selected="",drag=null,resizeDrag=null,refreshQueued=false;
  const selectedSet=new Set(),extraOutlines=new Map();
  let lastCard=-1,multiSignature="",multiMessage="",gestureId=0;
  function updateMulti(items,active){
    const map=new Map(items.map(item=>[item.key,item]));
    for(const key of selectedSet){
      if(!map.has(key)||map.get(key).locked)selectedSet.delete(key);
    }
    const activeItems=items.filter(item=>selectedSet.has(item.key)&&!item.locked);
    const signatures=items.map(item=>[item.key,item.label,item.locked].join("~")).join("|");
    if(signatures!==multiSignature){
      multiSignature=signatures;
      multiList.replaceChildren();
      for(const item of items){
        const label=document.createElement("label");
        label.className="direct-multi-option";
        const input=document.createElement("input");
        input.type="checkbox";input.value=item.key;
        input.checked=selectedSet.has(item.key);
        input.disabled=item.locked;
        input.setAttribute("aria-label","Выбрать объект: "+item.label);
        input.addEventListener("change",()=>{
          multiMessage="";
          if(input.checked){selectedSet.add(item.key);choose(item.key,false,true);}
          else{
            selectedSet.delete(item.key);
            if(selected===item.key)choose([...selectedSet][0]||"",false,true);
            else refresh();
          }
        });
        const caption=document.createElement("span");
        caption.textContent=item.label+(item.locked?" · заблокирован":"");
        label.append(input,caption);
        multiList.append(label);
      }
    }else{
      for(const input of multiList.querySelectorAll("input")){
        input.checked=selectedSet.has(input.value);
        input.disabled=Boolean(map.get(input.value)?.locked);
      }
    }
    multiCount.textContent=activeItems.length+" выделено";
    multiAll.disabled=!active||items.every(item=>item.locked);
    multiClear.disabled=!active||!selectedSet.size;
    const card=editor.getSnapshot().cards[editor.getSnapshot().activeCard];
    const hasLinked=activeItems.some(item=>item.type==="graphic"&&
      card.graphicElements.some(g=>"graphic:"+g.id===item.key&&g.groupId));
    for(const button of alignButtons){
      const required=button.dataset.directAlign.startsWith("space-")?3:2;
      button.disabled=!active||activeItems.length<required||hasLinked;
    }
    multiGroup.disabled=!active||activeItems.length<2||
      activeItems.some(item=>item.type!=="graphic")||hasLinked;
    multiStatus.textContent=multiMessage||
      (hasLinked?"Для отдельного выравнивания сначала разгруппируй выбранные фигуры.":
        activeItems.length>1?"Выбрано "+activeItems.length+" объекта. Перетаскивай их вместе или используй выравнивание.":
        "Выдели минимум два видимых незаблокированных объекта. Можно одновременно передвигать их по холсту.");
    for(const [key,node] of extraOutlines){
      if(!active||!selectedSet.has(key)||key===selected||!map.has(key)){
        node.remove();extraOutlines.delete(key);
      }
    }
    if(!active)return;
    const data=current();
    for(const item of activeItems){
      if(item.key===selected)continue;
      let node=extraOutlines.get(item.key);
      if(!node){
        node=document.createElement("div");
        node.className="direct-selection-outline direct-selection-extra";
        node.setAttribute("aria-hidden","true");
        holder.appendChild(node);
        extraOutlines.set(item.key,node);
      }
      const x=item.rect.x/data.width*100,y=item.rect.y/data.height*100;
      node.style.left=x+"%";node.style.top=y+"%";
      node.style.width=item.rect.w/data.width*100+"%";
      node.style.height=item.rect.h/data.height*100+"%";
    }
  }
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
    const activeCard=editor.getSnapshot().activeCard;
    if(activeCard!==lastCard){
      lastCard=activeCard;selected="";selectedSet.clear();multiMessage="";
    }
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
    updateMulti(items,active);
    renderSafeArea(snapshot,active);
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
  function choose(key,focusCanvas=false,preserve=false){
    safeFeedback="";
    selected=key;
    if(!preserve)selectedSet.clear();
    if(key)selectedSet.add(key);
    multiMessage="";
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
  safeMargin.addEventListener("change",()=>{
    safeFeedback="";refresh();
  });
  safeShow.addEventListener("change",()=>refresh());
  safeFit.addEventListener("click",()=>{
    if(!enable.checked||safeFit.disabled)return;
    const keys=[...selectedSet];
    const success=editor.fitDirectSelection(keys,safeMarginValue());
    safeFeedback=success
      ?"Выделение перемещено внутрь выбранных полей. Действие можно отменить."
      :"Не удалось переместить выделение. Проверь размер объектов, блокировки и группировку.";
    // Update button state immediately; the editor-change render frame is
    // asynchronous and should not leave a stale "Fit" action clickable.
    refresh();
  });

  enable.addEventListener("change",()=>{
    drag=null;
    resizeDrag=null;
    reportSnap(null,null);
    refresh();
  });
  target.addEventListener("change",()=>choose(target.value));
  multiAll.addEventListener("click",()=>{
    if(!enable.checked)return;
    selectedSet.clear();
    for(const item of current().items){
      if(!item.locked)selectedSet.add(item.key);
    }
    choose([...selectedSet][0]||"",false,true);
  });
  multiClear.addEventListener("click",()=>choose(""));
  for(const button of alignButtons){
    button.addEventListener("click",()=>{
      const keys=[...selectedSet];
      const success=enable.checked&&editor.alignDirectSelection(keys,button.dataset.directAlign);
      multiMessage=success?"Объекты выровнены. Одно действие можно отменить.":"Не удалось выровнять объекты: проверь блокировки и границы холста.";
      scheduleRefresh();
    });
  }
  multiGroup.addEventListener("click",()=>{
    const keys=[...selectedSet];
    const id=enable.checked?editor.groupGraphicLayers(keys):"";
    multiMessage=id?"Фигуры объединены: дальнейшее перемещение одной сдвигает всю группу.":
      "Группировка доступна для двух и более незаблокированных фигур.";
    scheduleRefresh();
  });
  lock.addEventListener("click",()=>{
    if(!selected)return;
    editor.toggleDirectLock(selected);
    refresh();
  });
  canvas.addEventListener("pointerdown",event=>{
    if(!enable.checked || (event.pointerType==="mouse"&&event.button!==0))return;
    const found=chooseUnderPointer(event);
    if(event.shiftKey||event.ctrlKey||event.metaKey){
      if(!found||found.locked)return;
      if(selectedSet.has(found.key))selectedSet.delete(found.key);
      else selectedSet.add(found.key);
      choose(selectedSet.has(found.key)?found.key:([ ...selectedSet ][0]||""),false,true);
      event.preventDefault();
      return;
    }
    if(!found){choose("");return;}
    const preserve=selectedSet.size>1&&selectedSet.has(found.key);
    choose(found.key,true,preserve);
    if(found.locked)return;
    const initial=coordinateOrigin(found.key);
    if(!initial)return;
    const data=current();
    const originals=[...selectedSet].map(key=>({key,origin:coordinateOrigin(key)}))
      .filter(entry=>entry.origin);
    drag={pointerId:event.pointerId,key:found.key,
      startX:event.clientX,startY:event.clientY,originals,
      initial,item:found,sceneWidth:data.width,sceneHeight:data.height,
      rect:canvas.getBoundingClientRect(),group:"pointer-"+(++gestureId)};
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
    if(drag.originals.length>1){
      const ddx=x.value-drag.initial.x,ddy=y.value-drag.initial.y;
      const changes=drag.originals.map(({key,origin})=>({
        key,x:Math.round((origin.x+ddx)*10)/10,
        y:Math.round((origin.y+ddy)*10)/10
      }));
      if(editor.transformDirectSelection(changes,drag.group))scheduleRefresh();
    }else{
      adjust({x:x.value,y:y.value},"pointer");
    }
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
    if(selectedSet.size>1){
      const changes=[...selectedSet].map(key=>{
        const origin=coordinateOrigin(key);
        return origin&&{key,x:origin.x+delta[0]*step,y:origin.y+delta[1]*step};
      }).filter(Boolean);
      if(editor.transformDirectSelection(changes,"keyboard-"+(++gestureId)))scheduleRefresh();
    }else{
      adjust({x:initial.x+delta[0]*step,y:initial.y+delta[1]*step},"keyboard");
    }
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
  window.addEventListener("anons:editor-reset",()=>{
    selected="";selectedSet.clear();multiMessage="";scheduleRefresh();
  });
  window.addEventListener("resize",scheduleRefresh);
  if(typeof ResizeObserver!=="undefined")new ResizeObserver(scheduleRefresh).observe(canvas);
  applyZoom();
  refresh();
})();
