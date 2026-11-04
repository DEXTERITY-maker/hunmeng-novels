// Anons Studio: accessible layer tree. Mutations go exclusively through the
// validated editor state API; labels are always rendered as plain text.
(() => {
  "use strict";
  const editor=window.AnonsEditor,$=id=>document.getElementById(id);
  const list=$("layer-stack-list"),count=$("layer-stack-count"),status=$("layer-stack-status");
  const input=$("layer-rename-input"),save=$("layer-rename-save"),copy=$("layer-copy");
  const group=$("layer-group"),ungroup=$("layer-ungroup");
  if(!editor?.getLayerPanel||!editor?.changeLayerVisibility||
    !editor?.toggleLayerLock||!editor?.moveLayer||!editor?.groupGraphicLayers||
    !list||!count||!status||!input||!save||!copy||!group||!ungroup)return;

  let selected="",checked=new Set(),activeCard=-1,queued=false;
  function note(message){status.textContent=message;}
  function makeButton(label,action,disabled=false,title=""){
    const b=document.createElement("button");
    b.type="button";
    b.textContent=label;
    b.className="layer-row-action";
    b.title=title||label;
    b.setAttribute("aria-label",title||label);
    b.disabled=disabled;
    b.addEventListener("click",action);
    return b;
  }
  function select(key){
    selected=key;
    window.dispatchEvent(new CustomEvent("anons:select-layer",{detail:{key}}));
    refresh();
  }
  function refresh(){
    queued=false;
    const data=editor.getLayerPanel();
    if(data.cardIndex!==activeCard){
      activeCard=data.cardIndex;selected="";checked.clear();
    }
    const rows=[...data.base,...data.figures];
    const keys=new Set(rows.map(row=>row.key));
    if(!keys.has(selected))selected="";
    checked=new Set([...checked].filter(key=>keys.has(key)));
    const selectedRow=rows.find(row=>row.key===selected);
    list.replaceChildren();
    count.textContent=rows.length+" объектов";
    const sections=[
      {name:"Основные слои",rows:data.base},
      {name:"Графические элементы",rows:[...data.figures].reverse()}
    ];
    for(const section of sections){
      const heading=document.createElement("p");
      heading.className="layer-stack-group-heading";
      heading.textContent=section.name;
      list.appendChild(heading);
      for(const row of section.rows){
        const holder=document.createElement("div");
        holder.className="layer-stack-row"+(selected===row.key?" is-selected":"")
          +(row.visible?"":" is-hidden");
        holder.dataset.layerKey=row.key;
        const isGraphic=row.type==="graphic";
        if(isGraphic){
          const check=document.createElement("input");
          check.type="checkbox";check.className="layer-row-check";
          check.checked=checked.has(row.key);
          check.setAttribute("aria-label","Выбрать для группировки: "+row.label);
          check.addEventListener("change",()=>{
            if(check.checked)checked.add(row.key);else checked.delete(row.key);
            updateCommands(data,selectedRow);
          });
          holder.appendChild(check);
        }else{
          const spacer=document.createElement("span");
          spacer.className="layer-row-spacer";
          spacer.setAttribute("aria-hidden","true");
          holder.appendChild(spacer);
        }
        const main=makeButton(row.label,()=>select(row.key),false,"Выбрать "+row.label);
        main.className="layer-row-name";
        if(row.key===selected)main.setAttribute("aria-current","true");
        const top=document.createElement("span");
        top.className="layer-row-labels";
        top.appendChild(main);
        if(row.groupId){
          const chip=document.createElement("small");
          chip.textContent="Группа "+row.groupId.slice(6);
          chip.className="layer-row-group";
          top.appendChild(chip);
        }
        holder.appendChild(top);
        const visibility=makeButton(row.visible?"Скрыть":"Показать",()=>{
          const changed=editor.changeLayerVisibility(row.key,!row.visible);
          if(changed)note(row.visible?"Слой скрыт.":"Слой показан.");
          refresh();
        },false,(row.visible?"Скрыть ":"Показать ")+row.label);
        visibility.classList.add("layer-row-visibility");
        holder.appendChild(visibility);
        holder.appendChild(makeButton(row.locked?"Открыть":"Закрыть",()=>{
          editor.toggleLayerLock(row.key);
          refresh();
        },row.key==="decoration",(row.locked?"Разблокировать ":"Заблокировать ")+row.label));
        const order=isGraphic?data.figures:data.base.filter(x=>x.movable);
        const index=order.findIndex(x=>x.key===row.key);
        holder.appendChild(makeButton("Выше",()=>{
          editor.moveLayer(row.key,+1);refresh();
        },!row.movable||index>=order.length-1,"Поднять слой "+row.label));
        holder.appendChild(makeButton("Ниже",()=>{
          editor.moveLayer(row.key,-1);refresh();
        },!row.movable||index<=0,"Опустить слой "+row.label));
        list.appendChild(holder);
      }
    }
    if(!data.figures.length){
      const empty=document.createElement("p");
      empty.className="layer-stack-empty";
      empty.textContent="Фигуры отсутствуют. Добавьте их в разделе оформления.";
      list.appendChild(empty);
    }
    updateCommands(data,selectedRow);
  }
  function updateCommands(data,selectedRow){
    const isGraphic=selectedRow?.type==="graphic";
    input.disabled=!isGraphic;
    save.disabled=!isGraphic;
    copy.disabled=!isGraphic||data.figures.length>=data.limit;
    ungroup.disabled=!isGraphic||!selectedRow.groupId;
    group.disabled=checked.size<2;
    if(document.activeElement!==input){
      input.value=isGraphic?selectedRow.label:"";
    }
  }
  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(refresh);
  }
  save.addEventListener("click",()=>{
    if(!selected)return;
    if(editor.renameGraphicLayer(selected,input.value))note("Название фигуры обновлено.");
    refresh();
  });
  input.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();save.click();}
  });
  copy.addEventListener("click",()=>{
    if(!selected)return;
    const newKey=editor.duplicateGraphicLayer(selected);
    if(newKey){note("Фигура дублирована.");select(newKey);}
    else note("Не удалось дублировать фигуру.");
  });
  group.addEventListener("click",()=>{
    const id=editor.groupGraphicLayers([...checked]);
    if(id){note("Фигуры объединены в группу. Перемещение одной из них перемещает всю группу.");checked.clear();}
    else note("Для группировки выберите не менее двух разных фигур.");
    refresh();
  });
  ungroup.addEventListener("click",()=>{
    if(editor.ungroupGraphicLayer(selected))note("Группа разделена.");
    refresh();
  });
  window.addEventListener("anons:direct-selected",event=>{
    selected=event.detail?.key||"";schedule();
  });
  window.addEventListener("anons:editor-change",schedule);
  window.addEventListener("anons:editor-reset",()=>{selected="";checked.clear();schedule();});
  refresh();
})();
