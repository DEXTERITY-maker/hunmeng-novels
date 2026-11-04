// Browser-local personal styles. Works independently of cloud accounts and billing.
(() => {
  "use strict";
  const api=window.AnonsEditor;
  const root=document.getElementById("personal-styles");
  if(!root||!api?.getStyleSnapshot||!api?.applyStyleSnapshot)return;
  const name=document.getElementById("personal-style-name");
  const saved=document.getElementById("personal-style-select");
  const save=document.getElementById("personal-style-save");
  const apply=document.getElementById("personal-style-apply");
  const rename=document.getElementById("personal-style-rename");
  const remove=document.getElementById("personal-style-delete");
  const count=document.getElementById("personal-style-count");
  const status=document.getElementById("personal-style-status");
  if(![name,saved,save,apply,rename,remove,count,status].every(Boolean))return;

  const storageKey="anons-studio:personal-styles:v1";
  const MAX=20;
  const shortName=value=>typeof value==="string"
    ?value.replace(/[\u0000-\u001f\u007f]/g," ").trim().replace(/\s+/g," ").slice(0,48):"";
  const validId=id=>typeof id==="string"&&/^[a-z0-9-]{8,64}$/i.test(id);
  const validStyle=style=>style&&typeof style==="object"&&!Array.isArray(style)
    &&typeof style.template==="string"&&typeof style.theme==="string";
  function read(){
    try{
      const raw=localStorage.getItem(storageKey);
      if(!raw||raw.length>800000)return [];
      const parsed=JSON.parse(raw);
      if(!Array.isArray(parsed))return [];
      const seen=new Set();
      return parsed.filter(entry=>{
        if(!entry||!validId(entry.id)||!validStyle(entry.style)
          ||shortName(entry.name).length<2||seen.has(entry.id))return false;
        seen.add(entry.id);
        return true;
      }).slice(0,MAX).map(entry=>({
        id:entry.id,name:shortName(entry.name),style:entry.style,
        createdAt:typeof entry.createdAt==="string"?entry.createdAt:""
      }));
    }catch{return [];}
  }
  let items=read();
  function report(message,isError=false){
    status.textContent=message;
    status.dataset.error=String(isError);
  }
  function render(selectedId=saved.value){
    saved.replaceChildren();
    const placeholder=document.createElement("option");
    placeholder.value="";
    placeholder.textContent=items.length?"Выберите сохранённый стиль":"Сохранённых стилей пока нет";
    saved.append(placeholder);
    for(const item of items){
      const option=document.createElement("option");
      option.value=item.id;
      option.textContent=item.name;
      saved.append(option);
    }
    saved.value=items.some(item=>item.id===selectedId)?selectedId:"";
    count.textContent=items.length+" из "+MAX;
    save.disabled=items.length>=MAX;
    const active=Boolean(saved.value);
    apply.disabled=rename.disabled=remove.disabled=!active;
  }
  function write(next,selectedId){
    try{
      const value=JSON.stringify(next);
      if(value.length>800000)throw new Error("LIMIT");
      localStorage.setItem(storageKey,value);
      items=next;
      render(selectedId);
      return true;
    }catch{
      report("Не удалось сохранить стили в браузере. Проверьте свободное место и доступ к хранилищу.",true);
      return false;
    }
  }
  function uniqueLabel(label,ignoreId=""){
    return !items.some(entry=>entry.id!==ignoreId&&entry.name.toLocaleLowerCase("ru-RU")===label.toLocaleLowerCase("ru-RU"));
  }
  function generateId(){
    if(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
    return "s-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,15);
  }

  save.addEventListener("click",()=>{
    const label=shortName(name.value);
    if(label.length<2){report("Введите название от 2 до 48 символов.",true);name.focus();return;}
    if(!uniqueLabel(label)){report("Такое название уже есть. Для замены выберите стиль и используйте переименование.",true);return;}
    if(items.length>=MAX){report("Достигнут предел в 20 стилей. Удалите ненужный стиль.",true);return;}
    let style;
    try{style=api.getStyleSnapshot();}catch{report("Не удалось получить текущее оформление.",true);return;}
    if(!validStyle(style)){report("Не удалось сохранить этот стиль.",true);return;}
    const id=generateId();
    if(write([{id,name:label,style,createdAt:new Date().toISOString()},...items],id)){
      name.value="";
      report("Стиль «"+label+"» сохранён в этом браузере.");
    }
  });

  apply.addEventListener("click",()=>{
    const entry=items.find(item=>item.id===saved.value);
    if(!entry)return;
    let success=false;
    try{success=api.applyStyleSnapshot(entry.style)===true;}catch{success=false;}
    report(success
      ?"Оформление «"+entry.name+"» применено к текущей карточке. Текст и фотография сохранены."
      :"Не удалось применить стиль: данные повреждены или несовместимы.",!success);
  });

  rename.addEventListener("click",()=>{
    const selected=items.find(item=>item.id===saved.value);
    if(!selected)return;
    const label=shortName(name.value);
    if(label.length<2){report("Введите новое название в поле выше.",true);name.focus();return;}
    if(!uniqueLabel(label,selected.id)){report("Стиль с таким названием уже существует.",true);return;}
    if(write(items.map(item=>item.id===selected.id?{...item,name:label}:item),selected.id)){
      name.value="";
      report("Стиль переименован в «"+label+"».");
    }
  });
  remove.addEventListener("click",()=>{
    const entry=items.find(item=>item.id===saved.value);
    if(!entry)return;
    if(!window.confirm("Удалить сохранённый стиль «"+entry.name+"»? Это не изменит проект."))return;
    if(write(items.filter(item=>item.id!==entry.id),""))report("Стиль «"+entry.name+"» удалён. Текущий проект не изменён.");
  });
  saved.addEventListener("change",()=>{render(saved.value);report("");});
  window.addEventListener("storage",event=>{
    if(event.key===storageKey||event.key===null){
      const selected=saved.value;
      items=read();
      render(selected);
      report("Список стилей обновлён из другой вкладки.");
    }
  });
  render("");
})();
