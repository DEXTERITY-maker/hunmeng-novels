/* Anons Studio · Export profiles. Local-only, small allowlisted settings.
   Does not copy publication content, alter the saved draft, or bypass export. */
(() => {
  "use strict";
  const key="anons-studio:export-profiles:v1";
  const maxProfiles=8;
  const formats=["portrait","square","story"];
  const $=id=>document.getElementById(id);
  const nameInput=$("export-profile-name"),save=$("export-profile-save");
  const select=$("export-profile-select"),load=$("export-profile-load");
  const remove=$("export-profile-delete"),status=$("export-profile-status");
  const limit=$("export-profile-limit"),scope=$("export-kit-scope");
  const platformButtons=[...document.querySelectorAll("[data-export-profile-preset]")];
  if(!nameInput||!save||!select||!load||!remove||!status||!limit||!scope
    ||formats.some(format=>!$("export-kit-"+format)))return;

  // These are starting points, not an assurance of a platform's final crop.
  const platformPresets=Object.freeze({
    instagram:Object.freeze({formats:["portrait","story"],scope:"all"}),
    vk:Object.freeze({formats:["square","portrait"],scope:"all"}),
    stories:Object.freeze({formats:["story"],scope:"all"}),
    universal:Object.freeze({formats:["portrait","square","story"],scope:"all"})
  });
  const cleanName=raw=>typeof raw==="string"
    ?raw.trim().replace(/\s+/g," ").slice(0,36):"";
  function cleanSettings(raw){
    if(!raw||typeof raw!=="object")return null;
    const chosen=formats.filter(f=>Array.isArray(raw.formats)&&raw.formats.includes(f));
    if(!chosen.length)return null;
    return {formats:chosen,scope:["all","ready"].includes(raw.scope)?raw.scope:"current"};
  }
  function cleanProfile(raw){
    const name=cleanName(raw?.name),settings=cleanSettings(raw);
    if(!name||!settings||!Number.isSafeInteger(raw?.id)||raw.id<1)return null;
    return {id:raw.id,name,...settings};
  }
  function readProfiles(){
    try{
      const raw=JSON.parse(localStorage.getItem(key)||"[]");
      if(!Array.isArray(raw))return [];
      const seen=new Set(),names=new Set();
      return raw.map(cleanProfile).filter(profile=>{
        if(!profile||seen.has(profile.id)||names.has(profile.name.toLocaleLowerCase("ru")))return false;
        seen.add(profile.id);names.add(profile.name.toLocaleLowerCase("ru"));
        return true;
      }).slice(0,maxProfiles);
    }catch{return [];}
  }
  let profiles=readProfiles();

  function writeProfiles(next){
    try{
      localStorage.setItem(key,JSON.stringify(next));
      profiles=next;
      return true;
    }catch{
      message("Не удалось сохранить настройки в браузере. Проверь доступность локального хранилища.",true);
      return false;
    }
  }
  function message(text,error=false){
    status.textContent=text;
    status.dataset.state=error?"error":"ok";
  }
  function current(){
    return {formats:formats.filter(f=>$("export-kit-"+f).checked),
      scope:["all","ready"].includes(scope.value)?scope.value:"current"};
  }
  function equals(a,b){
    return a.scope===b.scope
      &&formats.every(f=>a.formats.includes(f)===b.formats.includes(f));
  }
  function reflectPresets(){
    const settings=current();
    for(const button of platformButtons){
      const preset=platformPresets[button.dataset.exportProfilePreset];
      const active=Boolean(preset&&equals(settings,preset));
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-pressed",String(active));
    }
  }
  function apply(settings,label){
    const next=cleanSettings(settings);
    if(!next)return;
    for(const f of formats)$("export-kit-"+f).checked=next.formats.includes(f);
    scope.value=next.scope;
    // Reuse the Stage 9 count, quality report and download path unchanged.
    $("export-kit-"+next.formats[0]).dispatchEvent(new Event("change",{bubbles:true}));
    scope.dispatchEvent(new Event("change",{bubbles:true}));
    reflectPresets();
    message("Применён набор «"+label+"». Можно проверить форматы и скачать ZIP.");
  }
  function renderSelection(preferred){
    const chosen=preferred??select.value;
    select.replaceChildren();
    const placeholder=document.createElement("option");
    placeholder.value="";
    placeholder.textContent=profiles.length?"Выбери сохранённый набор":"Нет сохранённых наборов";
    select.appendChild(placeholder);
    for(const profile of profiles){
      const option=document.createElement("option");
      option.value=String(profile.id);
      option.textContent=profile.name+" · "+profile.formats.length+
        " форм. · "+(profile.scope==="all"?"все карточки":
          profile.scope==="ready"?"отмеченные готовыми":"одна карточка");
      select.appendChild(option);
    }
    select.value=profiles.some(p=>String(p.id)===String(chosen))?String(chosen):"";
    updateActions();
  }
  function updateActions(){
    const selected=profiles.find(p=>String(p.id)===select.value);
    load.disabled=!selected;
    remove.disabled=!selected;
    limit.textContent=profiles.length+" / "+maxProfiles;
    save.disabled=profiles.length>=maxProfiles
      &&!profiles.some(p=>p.name.toLocaleLowerCase("ru")===
        cleanName(nameInput.value).toLocaleLowerCase("ru"));
  }
  for(const button of platformButtons){
    button.addEventListener("click",()=>{
      const settings=platformPresets[button.dataset.exportProfilePreset];
      if(settings)apply(settings,button.querySelector("strong")?.textContent||"площадки");
    });
  }
  for(const format of formats)$("export-kit-"+format)
    .addEventListener("change",reflectPresets);
  scope.addEventListener("change",reflectPresets);
  nameInput.addEventListener("input",updateActions);
  select.addEventListener("change",updateActions);

  save.addEventListener("click",()=>{
    const name=cleanName(nameInput.value),settings=cleanSettings(current());
    if(!name){message("Введи название набора (до 36 символов).",true);nameInput.focus();return;}
    if(!settings){message("Выбери хотя бы один формат перед сохранением.",true);return;}
    const duplicate=profiles.find(p=>p.name.toLocaleLowerCase("ru")===
      name.toLocaleLowerCase("ru"));
    if(!duplicate&&profiles.length>=maxProfiles){
      message("Можно сохранить не более "+maxProfiles+" наборов. Удали ненужный или обнови существующий.",true);
      return;
    }
    const id=duplicate?.id||Math.max(0,...profiles.map(p=>p.id))+1;
    const next=duplicate
      ?profiles.map(p=>p.id===id?{id,name,...settings}:p)
      :[...profiles,{id,name,...settings}];
    if(!writeProfiles(next))return;
    renderSelection(String(id));
    message(duplicate?"Набор «"+name+"» обновлён.":"Набор «"+name+"» сохранён на этом устройстве.");
  });
  load.addEventListener("click",()=>{
    const selected=profiles.find(p=>String(p.id)===select.value);
    if(selected)apply(selected,selected.name);
  });
  remove.addEventListener("click",()=>{
    const selected=profiles.find(p=>String(p.id)===select.value);
    if(!selected)return;
    if(!writeProfiles(profiles.filter(p=>p.id!==selected.id)))return;
    renderSelection("");
    message("Набор «"+selected.name+"» удалён. Текущий проект и настройки экспорта не изменены.");
  });
  window.addEventListener("storage",event=>{
    if(event.key===key){profiles=readProfiles();renderSelection(); }
  });
  renderSelection("");
  reflectPresets();
})();
