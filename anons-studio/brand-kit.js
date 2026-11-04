// Anons Studio brand kit: a small account-scoped browser library of brand settings.
// No user content, uploads, premium flags or network calls belong here.
(() => {
  "use strict";
  const editor=window.AnonsEditor;
  const root=document.getElementById("brand-kit");
  if(!root||!editor?.getBrandKitSnapshot||!editor?.applyBrandKitSnapshot)return;

  const $=id=>document.getElementById(id);
  const control={
    name:$("brand-kit-name"),list:$("brand-kit-list"),save:$("brand-kit-save"),
    apply:$("brand-kit-apply"),rename:$("brand-kit-rename"),remove:$("brand-kit-delete"),
    count:$("brand-kit-count"),status:$("brand-kit-status"),identity:$("brand-kit-identity"),
    preview:$("brand-kit-preview"),brand:$("brand-kit-preview-brand"),
    details:$("brand-kit-preview-details"),swatch:$("brand-kit-preview-swatch")
  };
  if(Object.values(control).some(value=>!value))return;
  const MAX=12, prefix="anons-studio:brand-kits:v1";
  const allowedThemes=new Set(["ultraviolet","emerald","sunset","ink","paper"]);
  const allowedFonts=new Set(["auto","manrope","georgia","arial"]);
  const themes={ultraviolet:"Ультрафиолет",emerald:"Изумрудный",sunset:"Закат",ink:"Графит",paper:"Светлый"};
  const fonts={auto:"По шаблону",manrope:"Manrope",georgia:"Noto Serif",arial:"Arial"};
  const sanitizeName=value=>typeof value==="string"
    ?value.replace(/[\u0000-\u001f\u007f]/g," ").trim().replace(/\s+/g," ").slice(0,48):"";
  const kitValid=value=>value&&typeof value==="object"&&!Array.isArray(value)
    &&typeof value.project==="string"&&value.project.trim().length>0
    &&value.project.length<=45&&!/[\u0000-\u001f\u007f]/.test(value.project)
    &&allowedThemes.has(value.theme)
    &&typeof value.accentColor==="string"&&/^#[a-fA-F0-9]{6}$/.test(value.accentColor)
    &&allowedFonts.has(value.titleFont);
  const validId=value=>typeof value==="string"&&/^[a-z0-9-]{8,64}$/i.test(value);
  let userId=null;
  const key=()=>prefix+":"+(userId||"guest");
  function read(){
    try{
      const data=localStorage.getItem(key());
      if(!data||data.length>100000)return [];
      const parsed=JSON.parse(data);
      if(!Array.isArray(parsed))return [];
      const seen=new Set();
      return parsed.filter(item=>{
        const valid=item&&validId(item.id)&&kitValid(item.kit)
          &&sanitizeName(item.name).length>=2&&!seen.has(item.id);
        if(valid)seen.add(item.id);
        return valid;
      }).slice(0,MAX).map(item=>({
        id:item.id,name:sanitizeName(item.name),kit:{
          project:item.kit.project,theme:item.kit.theme,
          accentColor:item.kit.accentColor,titleFont:item.kit.titleFont
        }
      }));
    }catch{return [];}
  }
  let entries=read();
  function notice(message,error=false){
    control.status.textContent=message;
    control.status.dataset.error=String(error);
  }
  function render(selected=control.list.value){
    control.list.replaceChildren();
    const placeholder=document.createElement("option");
    placeholder.value="";
    placeholder.textContent=entries.length?"Выберите фирменный набор":"Бренд-китов пока нет";
    control.list.append(placeholder);
    for(const item of entries){
      const option=document.createElement("option");
      option.value=item.id;option.textContent=item.name;
      control.list.append(option);
    }
    const chosen=entries.find(item=>item.id===selected);
    control.list.value=chosen?chosen.id:"";
    control.count.textContent=entries.length+" из "+MAX;
    control.save.disabled=entries.length>=MAX;
    control.apply.disabled=control.rename.disabled=control.remove.disabled=!chosen;
    control.preview.hidden=!chosen;
    if(chosen){
      control.brand.textContent=chosen.kit.project;
      control.details.textContent=themes[chosen.kit.theme]+" · "+fonts[chosen.kit.titleFont]+" · "+chosen.kit.accentColor.toUpperCase();
      control.swatch.style.backgroundColor=chosen.kit.accentColor;
    }
    control.identity.textContent=userId
      ?"Личная коллекция аккаунта на этом устройстве · без облачной синхронизации"
      :"Коллекция этого браузера · без облачной синхронизации";
  }
  function write(next,selected){
    try{
      const json=JSON.stringify(next);
      if(json.length>100000)throw new Error("QUOTA");
      localStorage.setItem(key(),json);
      entries=next;render(selected);
      return true;
    }catch{
      notice("Не удалось сохранить бренд-кит в браузере. Возможно, закончилось место в хранилище.",true);
      return false;
    }
  }
  function isUnique(label,except=""){
    const lower=label.toLocaleLowerCase("ru-RU");
    return !entries.some(item=>item.id!==except&&item.name.toLocaleLowerCase("ru-RU")===lower);
  }
  function createId(){
    if(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function")return crypto.randomUUID();
    return "kit-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,15);
  }
  control.save.addEventListener("click",()=>{
    const label=sanitizeName(control.name.value);
    if(label.length<2){notice("Название набора должно содержать от 2 до 48 символов.",true);control.name.focus();return;}
    if(!isUnique(label)){notice("Бренд-кит с таким названием уже существует.",true);return;}
    if(entries.length>=MAX){notice("Достигнут лимит 12 бренд-китов.",true);return;}
    let kit;
    try{kit=editor.getBrandKitSnapshot();}catch{notice("Не удалось получить фирменное оформление.",true);return;}
    if(!kitValid(kit)){notice("В редакторе недопустимые настройки бренда.",true);return;}
    const entry={id:createId(),name:label,kit:{
      project:kit.project,theme:kit.theme,accentColor:kit.accentColor,titleFont:kit.titleFont
    }};
    if(write([entry,...entries],entry.id)){
      control.name.value="";
      notice("Набор «"+entry.name+"» сохранён в браузере.");
    }
  });
  control.apply.addEventListener("click",()=>{
    const selected=entries.find(item=>item.id===control.list.value);
    if(!selected)return;
    const target=document.querySelector('input[name="brand-kit-scope"]:checked')?.value==="all"
      ?"all":"active";
    let ok=false;
    try{ok=editor.applyBrandKitSnapshot(selected.kit,target)===true;}catch{ok=false;}
    notice(ok
      ?"Бренд-кит применён "+(target==="all"?"ко всем карточкам.":"к текущей карточке.")
        +" Текст, фотографии и композиции сохранены."
      :"Не удалось применить бренд-кит. Проверьте сохранённые настройки.",!ok);
  });
  control.rename.addEventListener("click",()=>{
    const selected=entries.find(item=>item.id===control.list.value);
    if(!selected)return;
    const label=sanitizeName(control.name.value);
    if(label.length<2){notice("Введите новое название в поле выше.",true);control.name.focus();return;}
    if(!isUnique(label,selected.id)){notice("Такое название уже занято.",true);return;}
    if(write(entries.map(item=>item.id===selected.id?{...item,name:label}:item),selected.id)){
      control.name.value="";
      notice("Бренд-кит переименован.");
    }
  });
  control.remove.addEventListener("click",()=>{
    const selected=entries.find(item=>item.id===control.list.value);
    if(!selected)return;
    if(!window.confirm("Удалить бренд-кит «"+selected.name+"»? Текущий проект не изменится."))return;
    if(write(entries.filter(item=>item.id!==selected.id),"")){
      notice("Бренд-кит удалён. Настройки проекта не изменились.");
    }
  });
  control.list.addEventListener("change",()=>{render(control.list.value);notice("");});
  window.addEventListener("storage",event=>{
    if(event.key!==key()&&event.key!==null)return;
    const selected=control.list.value;
    entries=read();render(selected);
    notice("Коллекция обновлена из другой вкладки.");
  });
  function setUser(user){
    const id=typeof user?.id==="string"&&/^[a-z0-9-]{8,64}$/i.test(user.id)?user.id:null;
    if(id===userId)return;
    userId=id;entries=read();render("");
    notice(id?"Локальные бренд-киты этого аккаунта загружены.":"Гостевые бренд-киты доступны только в этом браузере.");
  }
  window.AnonsBrandKit=Object.freeze({setUser});
  render("");
})();
