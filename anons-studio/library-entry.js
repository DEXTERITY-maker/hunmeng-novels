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
    remove: $("library-delete"), duplicate: $("library-duplicate"),
    conflictPanel: $("library-conflict"), conflictCopy: $("library-conflict-copy"),
    loadLatest: $("library-load-latest")
  };
  const maximumSnapshotBytes = 900000;
  const activeKey = "anons-studio:cloud-active-v05";
  function readActive() {
    try {return JSON.parse(localStorage.getItem(activeKey) || "null");}
    catch {return null;}
  }
  function clearActive() {try {localStorage.removeItem(activeKey);}catch {}}

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
  // Invalidate delayed cloud reads whenever the current draft changes identity.
  let loadSerial = 0;
  function persistActive() {
    if(!user||!projectId)return;
    try {
      localStorage.setItem(activeKey,JSON.stringify({
        userId:user.id,id:projectId,version,archived,
        title:elements.name.value.trim(),dirty
      }));
    }catch {}
  }
  function showConflict(visible) {elements.conflictPanel.hidden=!visible;}


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
    persistActive();
    notify(!navigator.onLine ? "Офлайн — изменения только в браузере"
      : projectId ? "Ожидает синхронизации" : "Не сохранён в облаке",
      !navigator.onLine ? "error" : "");
    if (projectId && !conflict) scheduleAutosave();
  }
  function scheduleAutosave() {
    clearPending();
    if(!user || !projectId || conflict || !navigator.onLine)return;
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
    ++loadSerial;
    clearPending();
    projectId=null;version=0;archived=false;conflict=false;dirty=false;
    clearActive();showConflict(false);
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
    if(projectId) {
      const remote=projects.find(p=>p.id===projectId);
      if(remote && remote.version>version){
        conflict=true;clearPending();showConflict(true);
        notify("Обновлено на другом устройстве","error");
        error("Серверная версия новее. Выбери «Сохранить копию» или «Открыть облачную версию».");
      } else if(!remote) {
        conflict=true;clearPending();
        notify("Проект отсутствует в облаке","error");
        error("Проект удалён или стал недоступен на другом устройстве. Сохрани локальный черновик как копию.");
      } else if(dirty&&!conflict) scheduleAutosave();
    }
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
    if(!navigator.onLine){
      dirty=true;
      persistActive();
      notify("Офлайн — сохранено только в браузере","error");
      error("Нет соединения с интернетом. Правки остались в браузере и будут отправлены в облако после восстановления связи.");
      throw new Error("OFFLINE");
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
      conflict=false;showConflict(false);persistActive();
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
        if(conflict)showConflict(true);
        notify(conflict?"Конфликт версий":"Ошибка синхронизации","error");error(friendlyError(err));
      }
      throw err;
    }finally{if(inFlight===action)inFlight=null;}
  }
  async function ensureSaved() {
    if(!user || conflict)return false;
    const uid=user.id, epoch=sessionEpoch;
    if(inFlight){try{await inFlight;}catch{return false;}}
    if(epoch!==sessionEpoch || user?.id!==uid || conflict)return false;
    // Never switch if a new edit arrived during an asynchronous save.
    if(dirty){
      try{await save(false);}catch{return false;}
    }
    return epoch===sessionEpoch && user?.id===uid && !dirty && !conflict;
  }
  async function openProject(id,force=false){
    if(!user||!id||(id===projectId&&!force))return;
    const loadId=++loadSerial;
    if(force){
      if(inFlight){try{await inFlight;}catch{}}
      clearPending();
    }else if(!await ensureSaved())return;
    if(loadId!==loadSerial || !user)return;
    const epoch=sessionEpoch,uid=user.id,editAtStart=changed;
    error("");notify("Загружаем проект…");
    const {data,error:failure}=await client.from("anons_studio_projects")
      .select("id,owner_id,title,snapshot,version,archived")
      .eq("owner_id",uid).eq("id",id).maybeSingle();
    if(epoch!==sessionEpoch||loadId!==loadSerial||user?.id!==uid)return;
    if(changed!==editAtStart){
      notify("Загрузка отменена — есть новые изменения","error");
      error("Пока проект загружался, ты изменил текущий черновик. Повтори открытие после сохранения, чтобы не потерять правки.");
      return;
    }
    if(failure||!data){error(friendlyError(failure));notify("Ошибка загрузки","error");return;}
    try{editor().loadSnapshot(data.snapshot);}catch(err){error("Не удалось открыть содержимое этого проекта.");return;}
    projectId=data.id;version=data.version;archived=data.archived;
    dirty=false;conflict=false;elements.name.value=data.title;
    showConflict(false);persistActive();
    updateControls();renderList();notify("Проект загружен","saved");
    await refreshHistory();
    $("editor").scrollIntoView({behavior:"smooth",block:"start"});
  }
  async function restoreRevision(revisionId){
    if(!user||!projectId)return;
    if(!confirm("Восстановить эту версию? Перед восстановлением текущие изменения будут сохранены в облаке."))return;
    const epoch=sessionEpoch, uid=user.id, id=projectId, loadId=++loadSerial;
    try{await save(true);}catch{return;}
    if(epoch!==sessionEpoch||user?.id!==uid||projectId!==id||loadId!==loadSerial||dirty)return;
    const editAtStart=changed;
    const {data,error:failure}=await client.from("anons_studio_project_revisions")
      .select("snapshot,title").eq("project_id",id).eq("owner_id",uid).eq("id",revisionId).maybeSingle();
    if(epoch!==sessionEpoch||user?.id!==uid||projectId!==id||loadId!==loadSerial)return;
    if(changed!==editAtStart){
      error("Восстановление отменено: во время загрузки версии появились новые изменения.");
      notify("Изменения сохранены в редакторе","error");
      return;
    }
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
    // On a remote conflict, never attempt to overwrite the stale project.
    if(conflict){
      clearPending();
      if(inFlight){try{await inFlight;}catch{}}
    }else if(!await ensureSaved())return;
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
    archived=newArchived;persistActive();updateControls();notify(archived?"Перенесён в архив":"Возвращён из архива","saved");
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
    if(id===(user?.id||null))return;
    const remembered=readActive();
    const former=user?.id||null;
    ++sessionEpoch;historyEpoch++;++loadSerial;
    clearPending();
    // Previous account's request may still be pending. It must not block a
    // different account's save or be mistaken for its in-flight write.
    inFlight=null;
    user=next?.id?{id:next.id,email:next.email}:null;
    projects=[];projectId=null;version=0;archived=false;dirty=false;conflict=false;
    elements.guest.hidden=Boolean(user);
    elements.auth.hidden=!user;
    elements.search.value="";elements.filter.value="active";
    if(remembered?.userId && id && remembered.userId!==id)editor()?.newDraft?.();
    if(former && former!==id)editor()?.newDraft?.();
    clearCurrent(editor()?.getSuggestedName?.());
    error("");
    if(user){
      if(remembered?.userId===id
        &&typeof remembered.id==="string"&&/^[0-9a-f-]{36}$/.test(remembered.id)
        &&Number.isInteger(remembered.version)&&remembered.version>=1){
        projectId=remembered.id;version=remembered.version;
        archived=Boolean(remembered.archived);
        elements.name.value=String(remembered.title||"Новый анонс").slice(0,100);
        dirty=Boolean(remembered.dirty);
        persistActive();updateControls();
        notify(dirty?"Несохранённые изменения в браузере":"Черновик из прошлого сеанса");
      }else notify("Библиотека подключена");
      refresh().catch(()=>error("Не удалось загрузить список проектов."));
    }
  }
  elements.search.addEventListener("input",renderList);
  elements.filter.addEventListener("change",renderList);
  $("library-refresh").addEventListener("click",()=>refresh().catch(()=>error("Не удалось обновить библиотеку.")));
  elements.name.addEventListener("input",()=>{updateControls();markDirty();});
  elements.save.addEventListener("click",()=>save(false).catch(()=>{}));
  elements.checkpoint.addEventListener("click",()=>save(true).catch(()=>{}));
  $("library-new").addEventListener("click",()=>newDraft());
  elements.duplicate.addEventListener("click",()=>duplicate());
  elements.conflictCopy.addEventListener("click",()=>duplicate());
  elements.loadLatest.addEventListener("click",async()=>{
    if(!projectId)return;
    if(!confirm("Открыть облачную версию? Несинхронизированные изменения в этом браузере будут заменены. Чтобы сохранить их, сначала создай копию."))return;
    await openProject(projectId,true);
  });
  elements.archive.addEventListener("click",()=>toggleArchive());
  elements.remove.addEventListener("click",()=>removeProject());
  window.addEventListener("anons:editor-reset",()=>{if(user)clearCurrent(editor()?.getSuggestedName?.());});
  window.addEventListener("anons:editor-change",markDirty);
  window.addEventListener("offline",()=>{
    clearPending();
    if(user&&dirty)notify("Офлайн — изменения только в браузере","error");
  });
  window.addEventListener("online",()=>{
    if(user&&projectId&&dirty&&!conflict)scheduleAutosave();
    if(user)refresh().catch(()=>{});
  });
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible"&&user)refresh().catch(()=>{});
  });
  window.addEventListener("beforeunload",event=>{
    if(!dirty||!user)return;
    event.preventDefault();event.returnValue="";
  });
  async function flushPending(){
    if(!user)return true;
    if(conflict)return false;
    try{
      if(inFlight)await inFlight;
      if(dirty)await save(false);
      return !dirty&&!conflict;
    }catch{return false;}
  }
  setUser(null);
  return {setUser,flushPending};
}
