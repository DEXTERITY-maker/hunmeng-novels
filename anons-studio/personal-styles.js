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
  const refreshButton=document.getElementById("personal-style-cloud-refresh");
  const importButton=document.getElementById("personal-style-cloud-import");
  const scope=document.getElementById("personal-style-scope");
  let cloudUser=null,cloudClient=null,cloudEpoch=0,cloudBusy=false;
  const table="anons_studio_styles";
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
    save.disabled=items.length>=MAX||cloudBusy;
    const active=Boolean(saved.value);
    apply.disabled=!active||cloudBusy;
    rename.disabled=remove.disabled=!active||cloudBusy;
    if(refreshButton){refreshButton.hidden=!cloudUser;refreshButton.disabled=!cloudUser||cloudBusy;}
    if(importButton){importButton.hidden=!cloudUser||read().length===0;importButton.disabled=!cloudUser||cloudBusy||items.length>=MAX;}
    if(scope)scope.textContent=cloudUser?"Облако аккаунта · синхронизация вручную или при открытии страницы":"Только этот браузер · без аккаунта";
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
    if(cloudUser)return;
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
    if(cloudUser)return;
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
    if(cloudUser)return;
    const entry=items.find(item=>item.id===saved.value);
    if(!entry)return;
    if(!window.confirm("Удалить сохранённый стиль «"+entry.name+"»? Это не изменит проект."))return;
    if(write(items.filter(item=>item.id!==entry.id),""))report("Стиль «"+entry.name+"» удалён. Текущий проект не изменён.");
  });
  saved.addEventListener("change",()=>{render(saved.value);report("");});
  window.addEventListener("storage",event=>{
    if(cloudUser)return;
    if(event.key===storageKey||event.key===null){
      const selected=saved.value;
      items=read();
      render(selected);
      report("Список стилей обновлён из другой вкладки.");
    }
  });

  // Cloud mode is activated only after auth-entry validates a Supabase user.
  // Local guest styles remain private to the device until explicitly imported.
  function cloudRow(row){
    if(!row||!validId(row.id)||!validStyle(row.style))return null;
    const label=shortName(row.name);
    if(label.length<2)return null;
    return {id:row.id,name:label,style:row.style,createdAt:String(row.created_at||"")};
  }
  async function cloudTask(action){
    if(!cloudUser||!cloudClient||cloudBusy)return;
    const uid=cloudUser.id,client=cloudClient,serial=cloudEpoch;
    cloudBusy=true;render();
    try{
      await action({uid,client,isCurrent:()=>cloudEpoch===serial&&cloudUser?.id===uid});
    }catch(err){
      if(cloudEpoch===serial)report("Не удалось связаться с облаком. Изменения не отправлены. Проверьте сеть и попробуйте ещё раз.",true);
    }finally{
      if(cloudEpoch===serial){cloudBusy=false;render();}
    }
  }
  async function refreshCloud(){
    await cloudTask(async({uid,client,isCurrent})=>{
      const {data,error}=await client.from(table)
        .select("id,name,style,created_at,updated_at")
        .eq("owner_id",uid).order("updated_at",{ascending:false}).limit(40);
      if(!isCurrent())return;
      if(error)throw error;
      const selected=saved.value;
      items=(Array.isArray(data)?data:[]).map(cloudRow).filter(Boolean).slice(0,MAX);
      render(selected);
      report("Облачные стили обновлены. Видны только оформления текущего аккаунта.");
    });
  }
  function setUser(user,client){
    const uid=typeof user?.id==="string"?user.id:null;
    if(uid===(cloudUser?.id||null))return;
    ++cloudEpoch;cloudBusy=false;
    cloudUser=uid?{id:uid}:null;
    cloudClient=uid?client:null;
    items=uid?[]:read();
    render("");
    report(uid?"Загружаем стили из облака…":"Локальные стили остаются только в этом браузере.");
    if(uid)void refreshCloud();
  }
  save.addEventListener("click",()=>{
    if(!cloudUser)return;
    const label=shortName(name.value);
    if(label.length<2){report("Введите название от 2 до 48 символов.",true);name.focus();return;}
    if(!uniqueLabel(label)){report("Такое название уже есть в аккаунте.",true);return;}
    if(items.length>=MAX){report("Достигнут предел в 20 стилей.",true);return;}
    let style;
    try{style=api.getStyleSnapshot();}catch{report("Не удалось получить оформление.",true);return;}
    if(!validStyle(style)){report("Некорректное оформление.",true);return;}
    if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function"){
      report("Этот браузер не поддерживает безопасные идентификаторы для облачного хранения.",true);return;
    }
    const id=crypto.randomUUID();
    void cloudTask(async({uid,client,isCurrent})=>{
      const {data,error}=await client.from(table)
        .insert({id,owner_id:uid,name:label,style}).select("id,name,style,created_at,updated_at").single();
      if(!isCurrent())return;
      if(error||!data)throw error||new Error("NO_RESULT");
      const entry=cloudRow(data);
      if(!entry)throw new Error("INVALID_ROW");
      items=[entry,...items];render(id);name.value="";
      report("Стиль «"+entry.name+"» сохранён в облаке аккаунта.");
    });
  });
  rename.addEventListener("click",()=>{
    if(!cloudUser)return;
    const current=items.find(x=>x.id===saved.value);
    if(!current)return;
    const label=shortName(name.value);
    if(label.length<2){report("Введите новое название в поле выше.",true);return;}
    if(!uniqueLabel(label,current.id)){report("Стиль с таким названием уже есть.",true);return;}
    void cloudTask(async({uid,client,isCurrent})=>{
      const {data,error}=await client.from(table)
        .update({name:label,updated_at:new Date().toISOString()})
        .eq("owner_id",uid).eq("id",current.id).select("id,name,style,created_at,updated_at").maybeSingle();
      if(!isCurrent())return;
      if(error||!data)throw error||new Error("NOT_FOUND");
      items=items.map(x=>x.id===current.id?cloudRow(data):x);
      render(current.id);name.value="";report("Стиль переименован в облаке.");
    });
  });
  remove.addEventListener("click",()=>{
    if(!cloudUser)return;
    const current=items.find(x=>x.id===saved.value);
    if(!current)return;
    if(!window.confirm("Удалить облачный стиль «"+current.name+"» со всех устройств аккаунта?"))return;
    void cloudTask(async({uid,client,isCurrent})=>{
      const {data,error}=await client.from(table)
        .delete().eq("owner_id",uid).eq("id",current.id).select("id").maybeSingle();
      if(!isCurrent())return;
      if(error||!data)throw error||new Error("NOT_FOUND");
      items=items.filter(x=>x.id!==current.id);render("");
      report("Стиль удалён из облака. Текущий проект не изменён.");
    });
  });
  refreshButton?.addEventListener("click",()=>{void refreshCloud();});
  importButton?.addEventListener("click",()=>{
    if(!cloudUser)return;
    const available=read().filter(x=>uniqueLabel(x.name)).slice(0,Math.max(0,MAX-items.length));
    if(!available.length){report("Нет новых локальных стилей для импорта.",true);return;}
    if(typeof crypto==="undefined"||typeof crypto.randomUUID!=="function"){
      report("В этом браузере недоступен безопасный импорт.",true);return;
    }
    if(!window.confirm("Импортировать "+available.length+" локальных стилей в аккаунт? Они станут доступны на других ваших устройствах. Локальные копии сохранятся."))return;
    const rows=available.map(x=>({id:crypto.randomUUID(),name:x.name,style:x.style}));
    void cloudTask(async({uid,client,isCurrent})=>{
      const {data,error}=await client.from(table)
        .insert(rows.map(x=>({...x,owner_id:uid})))
        .select("id,name,style,created_at,updated_at");
      if(!isCurrent())return;
      if(error||!Array.isArray(data))throw error||new Error("NO_RESULT");
      items=[...data.map(cloudRow).filter(Boolean),...items].slice(0,MAX);
      render("");report("Импортировано стилей: "+data.length+". Локальные копии остались в браузере.");
    });
  });
  window.addEventListener("online",()=>{if(cloudUser)void refreshCloud();});
  document.addEventListener?.("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&cloudUser)void refreshCloud();
  });
  window.AnonsPersonalStyles=Object.freeze({setUser,refresh:refreshCloud});
  render("");
})();
