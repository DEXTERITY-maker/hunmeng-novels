// Cloud library for Anons Studio. Private rows are protected by Supabase RLS.
export function initLibrary(client) {
  const $ = id => document.getElementById(id);
  const elements = {
    guest: $("library-guest"), auth: $("library-auth"),
    list: $("library-list"), history: $("library-history-list"),
    name: $("library-name"), sync: $("library-sync"),
    current: $("library-current"), count: $("library-count"),
    search: $("library-search"), filter: $("library-filter"),
    error: $("library-error"), save: $("library-save"),
    checkpoint: $("library-checkpoint"), archive: $("library-archive"),
    remove: $("library-delete"), duplicate: $("library-duplicate")
  };
  const maximumSnapshotBytes = 900000;
  const encoder = new TextEncoder();
  const formatTime = value => {
    try { return new Date(value).toLocaleString("ru-RU",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}); }
    catch { return "Дата неизвестна"; }
  };
  const editor = () => window.AnonsEditor;
  let user = null;
  let sessionEpoch = 0;
  let projectId = null;
  let version = 0;
  let archived = false;
  let projects = [];
  let changed = 0;
  let dirty = false;
  let conflict = false;
  let saveTimer = null;
  let inFlight = null;
  let historyEpoch = 0;

  function notify(message, type = "") {
    elements.sync.textContent = message;
    elements.sync.classList.toggle("is-saved",type === "saved");
    elements.sync.classList.toggle("is-error",type === "error");
  }
  function error(message = "") {
    elements.error.hidden = !message;
    elements.error.textContent = message;
  }
  function friendlyError(err) {
    const source = String(err?.message || "");
    if (source.includes("VERSION_CONFLICT") || err?.code === "23505") return "Проект изменился в другом окне или на другом устройстве. Чтобы ничего не потерять, нажми «Сохранить копию» либо открой свежую версию из списка.";
    if (source.includes("PROJECT_LIMIT_30")) return "Лимит библиотеки — 30 проектов. Удали ненужный проект или сохрани изменения в существующий.";
    if (source.includes("INVALID_PROJECT") || err?.code === "23514") return "Проект слишком большой или содержит недопустимые данные. Уменьши размер загруженной фотографии.";
    if (err?.code === "42501") return "Нет доступа к проекту. Проверь, что вошёл в нужный аккаунт.";
    return "Не удалось связаться с облачной библиотекой. Локальный черновик остаётся в этом браузере.";
  }
  function clearPending() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
  }
  function markDirty() {
    if(!user)return;
    changed++;
    dirty = true;
    notify(projectId ? "Ожидает синхронизации" : "Не сохранён в облаке");
    if (projectId && !conflict) scheduleAutosave();
  }
  function scheduleAutosave() {
    clearPending();
    if(!user || !projectId || conflict)return;
    saveTimer=setTimeout(() => {save(false).catch(()=>{});},4200);
  }
  function updateControls() {
    const hasProject=Boolean(projectId);
    elements.archive.disabled=!user||!hasProject;
    elements.remove.disabled=!user||!hasProject;
    elements.checkpoint.disabled=!user;
    elements.save.disabled=!user;
    elements.duplicate.disabled=!user;
    elements.current.textContent=hasProject ? (elements.name.value.trim()||"Без названия") : "Новый черновик";
    elements.archive.textContent=archived?"Вернуть из архива":"В архив";
  }
  function clearCurrent(suggestedName) {
    clearPending();
    projectId=null;version=0;archived=false;conflict=false;dirty=false;
    elements.name.value=suggestedName||editor()?.getSuggestedName?.()||"Новый анонс";
    elements.history.replaceChildren();
    const p=document.createElement("p");p.className="library-placeholder";p.textContent="Первое сохранение создаст начальную версию проекта.";elements.history.append(p);
    updateControls();
    renderList();
    notify(user?"Черновик только в браузере":"Войди, чтобы сохранять");
  }
  function renderList() {
    elements.list.replaceChildren();
    const phrase=elements.search.value.toLocaleLowerCase("ru-RU").trim();
    const filter=elements.filter.value;
    const filtered=projects.filter(p=>{
      if(filter==="active"&&p.archived)return false;
      if(filter==="archived"&&!p.archived)return false;
      return p.title.toLocaleLowerCase("ru-RU").includes(phrase);
    });
    elements.count.textContent=String(projects.filter(p=>!p.archived).length);
    if(!filtered.length){
      const p=document.createElement("p");
      p.className="library-placeholder";
      p.textContent=projects.length?"Ничего не найдено в выбранном разделе.":"Проектов пока нет. Сохрани свой первый анонс.";
      elements.list.append(p);
      return;
    }
    for(const row of filtered){
      const btn=document.createElement("button");
      btn.type="button";btn.className="library-entry"+(row.id===projectId?" active":"");
      btn.setAttribute("aria-current",String(row.id===projectId));
      const title=document.createElement("strong");title.textContent=row.title;
      const meta=document.createElement("div");meta.className="library-entry-meta";
      const stamp=document.createElement("small");stamp.textContent=formatTime(row.updated_at);
      const badge=document.createElement("span");badge.textContent=row.archived?"Архив":"v"+row.version;
      meta.append(stamp,badge);btn.append(title,meta);
      btn.addEventListener("click",()=>openProject(row.id));
      elements.list.append(btn);
    }
  }
  async function refresh() {
    if(!user)return;
    const epoch=sessionEpoch, uid=user.id;
    const {data,error:failure}=await client.from("anons_studio_projects")
      .select("id,title,version,archived,updated_at,created_at")
      .eq("owner_id",uid).order("updated_at",{ascending:false}).limit(40);
    if(epoch!==sessionEpoch||!user||user.id!==uid)return;
    if(failure){error(friendlyError(failure));return;}
    projects=data||[];
    renderList();
  }
  async function refreshHistory() {
    const index=++historyEpoch;
    elements.history.replaceChildren();
    if(!user||!projectId)return;
    const id=projectId,uid=user.id;
    const {data,error:failure}=await client.from("anons_studio_project_revisions")
      .select("id,version,title,created_at")
      .eq("owner_id",uid).eq("project_id",id)
      .order("version",{ascending:false}).limit(15);
    if(index!==historyEpoch||projectId!==id)return;
    if(failure){error(friendlyError(failure));return;}
    if(!data?.length){
      const p=document.createElement("p");p.className="library-placeholder";p.textContent="Ещё нет сохранённых версий.";elements.history.append(p);return;
    }
    for(const row of data){
      const item=document.createElement("div");item.className="library-revision";
      const left=document.createElement("span");left.textContent="Версия "+row.version;
      const date=document.createElement("small");date.textContent=formatTime(row.created_at);left.append(date);
      const b=document.createElement("button");b.type="button";b.textContent="Восстановить";
      b.addEventListener("click",()=>restoreRevision(row.id));
      item.append(left,b);elements.history.append(item);
    }
  }
  async function save(checkpoint=false) {
    if(!user || !editor())throw new Error("AUTH_REQUIRED");
    clearPending();
    if(inFlight){
      await inFlight;
      if(checkpoint)return save(true);
      if(!dirty)return;
    }
    const ownerId=user.id, epoch=sessionEpoch;
    const serial=changed;
    const id=projectId||crypto.randomUUID();
    const expected=projectId?version:0;
    const name=(elements.name.value.trim()||editor().getSuggestedName()||"Новый анонс").slice(0,100);
    const snapshot=editor().getSnapshot();
    const bytes=encoder.encode(JSON.stringify(snapshot)).byteLength;
    if(bytes>maximumSnapshotBytes){
      const message="Проект занимает "+Math.round(bytes/1024)+" КБ. Для синхронизации необходимо уменьшить фотографию (лимит 879 КБ).";
      error(message);notify("Слишком большой проект","error");throw new Error("INVALID_PROJECT");
    }
    error("");
    notify(checkpoint?"Сохраняем версию…":"Синхронизация…");
    const action=(async()=>{
      const {data, error:failure}=await client.rpc("anons_studio_save_project",{
        p_id:id,p_title:name,p_snapshot:snapshot,p_expected_version:expected,p_checkpoint:checkpoint
      });
      if(failure)throw failure;
      if(epoch!==sessionEpoch || !user || user.id!==ownerId)return;
      if(!data || data.id!==id || !Number.isInteger(data.version))throw new Error("INVALID_RESPONSE");
      projectId=id;version=data.version;archived=data.archived||false;
      if(changed===serial){dirty=false;notify(checkpoint?"Версия сохранена":"Сохранено в облаке","saved");}
      else{dirty=true;notify("Есть новые изменения");scheduleAutosave();}
      updateControls();
      await refresh();
      if(checkpoint||expected===0)await refreshHistory();
      return data;
    })();
    inFlight=action;
    try {return await action;}
    catch(err){
      if(epoch===sessionEpoch) {
        dirty=true;conflict=String(err?.message||"").includes("VERSION_CONFLICT")||err?.code==="23505";
        notify(conflict?"Конфликт версий":"Ошибка синхронизации","error");error(friendlyError(err));
      }
      throw err;
    }finally{if(inFlight===action)inFlight=null;}
  }
  async function ensureSaved() {
    if(!user)return false;
    if(inFlight){try{await inFlight;}catch{return false;}}
    if(!projectId || dirty){
      try{await save(false);}catch{return false;}
    }
    return true;
  }
  async function openProject(id){
    if(!user||!id||id===projectId)return;
    if(!await ensureSaved())return;
    const epoch=sessionEpoch,uid=user.id;
    error("");notify("Загружаем проект…");
    const {data,error:failure}=await client.from("anons_studio_projects")
      .select("id,owner_id,title,snapshot,version,archived")
      .eq("owner_id",uid).eq("id",id).maybeSingle();
    if(epoch!==sessionEpoch)return;
    if(failure||!data){error(friendlyError(failure));notify("Ошибка загрузки","error");return;}
    try{editor().loadSnapshot(data.snapshot);}catch(err){error("Не удалось открыть содержимое этого проекта.");return;}
    projectId=data.id;version=data.version;archived=data.archived;
    dirty=false;conflict=false;elements.name.value=data.title;
    updateControls();renderList();notify("Проект загружен","saved");
    await refreshHistory();
    $("editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function restoreRevision(revisionId){
    if(!user||!projectId)return;
    if(!confirm("Восстановить эту версию? Перед восстановлением текущие изменения будут сохранены в облаке."))return;
    try{await save(true);}catch{return;}
    const id=projectId,uid=user.id;
    const {data,error:failure}=await client.from("anons_studio_project_revisions")
      .select("snapshot,title").eq("project_id",id).eq("owner_id",uid).eq("id",revisionId).maybeSingle();
    if(failure||!data){error(friendlyError(failure));return;}
    try{
      editor().loadSnapshot(data.snapshot);
      elements.name.value=data.title;
      markDirty();
      await save(true);
      $("editor").scrollIntoView({behavior:"smooth",block:"start"});
    }catch(err){error(friendlyError(err));}
  }
  async function newDraft(){
    if(!user)return;
    if(!await ensureSaved())return;
    editor().newDraft();
    clearCurrent(editor().getSuggestedName());
    error("");
    $("editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function duplicate(){
    if(!user)return;
    const local=editor()?.getSnapshot();
    const oldName=elements.name.value;
    const epoch=sessionEpoch;
    if(!await ensureSaved())return;
    if(epoch!==sessionEpoch)return;
    editor().loadSnapshot(local);
    clearCurrent((oldName+" (копия)").slice(0,100));
    try{await save(true);}catch{}
  }
  async function toggleArchive() {
    if(!projectId||!user)return;
    if(!await ensureSaved())return;
    const newArchived=!archived,uid=user.id;
    const {data,error:failure}=await client.from("anons_studio_projects")
      .update({archived:newArchived,updated_at:new Date().toISOString()})
      .eq("id",projectId).eq("owner_id",uid).select("id,archived").maybeSingle();
    if(failure||!data){error(friendlyError(failure));return;}
    archived=newArchived;updateControls();notify(archived?"Перенесён в архив":"Возвращён из архива","saved");
    await refresh();
  }
  async function removeProject(){
    if(!projectId||!user)return;
    if(!confirm("Безвозвратно удалить проект и всю его историю из облачной библиотеки?"))return;
    clearPending();
    if(inFlight){try{await inFlight;}catch{return;}}
    const id=projectId,uid=user.id;
    const {data,error:failure}=await client.from("anons_studio_projects")
      .delete().eq("id",id).eq("owner_id",uid).select("id").maybeSingle();
    if(failure||!data){error(friendlyError(failure));return;}
    editor().newDraft();clearCurrent(editor().getSuggestedName());error("");
    await refresh();
  }
  function setUser(next){
    const id=next?.id||null;
    if(id===user?.id)return;
    ++sessionEpoch;historyEpoch++;
    clearPending();user=next?.id?{id:next.id,email:next.email}:null;
    projects=[];projectId=null;version=0;archived=false;dirty=false;conflict=false;
    elements.guest.hidden=Boolean(user);
    elements.auth.hidden=!user;
    elements.search.value="";elements.filter.value="active";
    clearCurrent(editor()?.getSuggestedName?.());
    error("");
    if(user){notify("Библиотека подключена");refresh().catch(()=>error("Не удалось загрузить список проектов."));}
  }
  elements.search.addEventListener("input",renderList);
  elements.filter.addEventListener("change",renderList);
  $("library-refresh").addEventListener("click",()=>refresh().catch(()=>error("Не удалось обновить библиотеку.")));
  elements.name.addEventListener("input",()=>{updateControls();markDirty();});
  elements.save.addEventListener("click",()=>save(false).catch(()=>{}));
  elements.checkpoint.addEventListener("click",()=>save(true).catch(()=>{}));
  $("library-new").addEventListener("click",()=>newDraft());
  elements.duplicate.addEventListener("click",()=>duplicate());
  elements.archive.addEventListener("click",()=>toggleArchive());
  elements.remove.addEventListener("click",()=>removeProject());
  window.addEventListener("anons:editor-reset",()=>{if(user)clearCurrent(editor()?.getSuggestedName?.());});
  window.addEventListener("anons:editor-change",markDirty);
  setUser(null);
  return {setUser};
}
