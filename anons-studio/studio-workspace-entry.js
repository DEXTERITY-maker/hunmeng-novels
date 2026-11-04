// Studio workspace: apply one validated brand appearance to multiple cloud projects.
// Supabase verifies real Studio membership, ownership and project versions atomically.
export function initStudioWorkspace(client) {
  const $=id=>document.getElementById(id);
  const root=$("studio-workspace");
  if(!root)return {setUser(){}};
  const projectList=$("studio-project-list");
  const status=$("studio-workspace-status");
  const counter=$("studio-selected-count");
  const refreshButton=$("studio-projects-refresh");
  const styleButton=$("studio-refresh-style");
  const applyButton=$("studio-apply-brand");
  const styleDesc=$("studio-style-description");
  const swatch=$("studio-style-swatch");
  const MAX=8;
  const limits=Object.freeze({studio:8,agency:16,ultimate:30});
  const projectLimit=()=>limits[plan]||MAX;
  const themes={ultraviolet:"Ультрафиолет",emerald:"Изумрудный",sunset:"Закат",ink:"Графит",paper:"Светлый"};
  const fonts={auto:"По композиции",manrope:"Manrope",georgia:"Noto Serif",arial:"Arial"};
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let userId=null,serial=0,plan="free",premium=false,loading=false,projects=[],selected=new Set();
  const studioAllowed=()=>Boolean(userId&&premium&&Object.hasOwn(limits,plan));
  const live=(uid,epoch)=>userId===uid&&serial===epoch;
  const say=(message,error=false)=>{
    status.textContent=message;
    status.dataset.error=String(error);
  };
  const activeCloudId=()=>{
    try{
      const active=JSON.parse(localStorage.getItem("anons-studio:cloud-active-v05")||"null");
      return active?.userId===userId&&uuid.test(active?.id||"")?active.id:null;
    }catch{return null;}
  };
  function getStyle(){
    try{
      const kit=window.AnonsEditor?.getBrandKitSnapshot?.();
      if(!kit||!Object.hasOwn(themes,kit.theme)||!Object.hasOwn(fonts,kit.titleFont)
        ||typeof kit.accentColor!=="string"||!/^#[0-9a-fA-F]{6}$/.test(kit.accentColor))return null;
      return {theme:kit.theme,accentColor:kit.accentColor,titleFont:kit.titleFont};
    }catch{return null;}
  }
  function showStyle(){
    const kit=getStyle();
    styleDesc.textContent=kit
      ?themes[kit.theme]+" · "+fonts[kit.titleFont]+" · "+kit.accentColor.toUpperCase()
      :"В редакторе пока нет подходящего оформления.";
    swatch.style.backgroundColor=kit?.accentColor||"#999999";
    return kit;
  }
  function updateControls(){
    const count=selected.size;
    counter.textContent="Выбрано: "+count+" из "+projectLimit();
    refreshButton.disabled=!studioAllowed()||loading;
    applyButton.disabled=!studioAllowed()||loading||count<1||count>projectLimit()||!getStyle();
    styleButton.disabled=loading;
  }
  function render(){
    const allowed=studioAllowed();
    projectList.replaceChildren();
    if(!userId){
      projectList.append(text("p","Войдите в аккаунт, чтобы увидеть облачные проекты."));
    }else if(!allowed){
      projectList.append(text("p","Для массового оформления требуется действующий тариф «Студия»."));
    }else{
      const currentId=activeCloudId();
      const usable=projects.filter(p=>p.id!==currentId);
      selected=new Set([...selected].filter(id=>usable.some(p=>p.id===id)));
      if(!usable.length){
        projectList.append(text("p","Пока нет других сохранённых проектов. Создайте проекты в библиотеке и обновите список."));
      }
      for(const project of usable){
        const label=document.createElement("label");
        label.className="studio-project-choice";
        const input=document.createElement("input");
        input.type="checkbox";
        input.checked=selected.has(project.id);
        input.disabled=loading;
        input.setAttribute("aria-label","Выбрать проект "+project.title);
        input.addEventListener("change",()=>{
          if(input.checked){
            if(selected.size>=projectLimit()){
              input.checked=false;
              say("Можно выбрать не более "+projectLimit()+" проектов.",true);
              return;
            }
            selected.add(project.id);
          }else selected.delete(project.id);
          updateControls();
        });
        const body=document.createElement("span");
        body.append(text("strong",project.title),text("small","Версия "+project.version));
        label.append(input,body);
        projectList.append(label);
      }
    }
    updateControls();
    root.dataset.active=String(allowed);
  }
  function text(tag,value){
    const node=document.createElement(tag);
    node.textContent=String(value);
    return node;
  }
  async function refreshProjects(){
    if(!studioAllowed()||loading)return;
    const id=userId,epoch=serial;
    say("Загружаем облачные проекты…");
    try{
      const {data,error}=await client.from("anons_studio_projects")
        .select("id,title,version,archived,updated_at")
        .eq("owner_id",id).eq("archived",false)
        .order("updated_at",{ascending:false}).limit(31);
      if(!live(id,epoch))return;
      if(error)throw error;
      projects=(Array.isArray(data)?data:[]).filter(p=>
        p&&uuid.test(p.id)&&typeof p.title==="string"&&Number.isSafeInteger(p.version)&&p.version>0&&!p.archived);
      render();
      say("Выберите сохранённые проекты. Открытый проект можно оформить и сохранить через редактор.");
    }catch(error){
      if(!live(id,epoch))return;
      say("Не удалось получить проекты. Проверьте соединение и попробуйте обновить список.",true);
    }
  }
  async function applyBrand(){
    if(!studioAllowed()||loading||!selected.size)return;
    const kit=showStyle();
    if(!kit){say("Проверьте цветовую тему и шрифт текущего редактора.",true);return;}
    const open=activeCloudId();
    const targets=projects.filter(p=>selected.has(p.id)&&p.id!==open)
      .map(({id,version})=>({id,version}));
    if(targets.length!==selected.size||targets.length>projectLimit())return;
    const names=projects.filter(p=>selected.has(p.id)).map(p=>p.title).join(", ");
    if(!window.confirm("Применить фирменные настройки к "+targets.length+" проектам?\\n"+names+
      "\\nТексты, изображения и названия проектов сохранятся. Перед изменением будет создана версия для восстановления."))return;
    const id=userId,epoch=serial;
    loading=true;render();
    say("Проверяем права и версии, затем обновляем выбранные проекты…");
    try{
      const {data,error}=await client.rpc("anons_studio_studio_apply_brand",{
        p_targets:targets,p_style:kit
      });
      if(!live(id,epoch))return;
      if(error)throw error;
      if(!Number.isSafeInteger(Number(data))||Number(data)!==targets.length)
        throw Error("RESULT_MISMATCH");
      selected.clear();
      projects=[];
      loading=false;
      render();
      window.dispatchEvent(new Event("anons:studio-projects-changed"));
      await refreshProjects();
      if(live(id,epoch))say("Обновлено "+data+" проектов. Восстановить предыдущие версии можно в библиотеке.");
    }catch(error){
      if(!live(id,epoch))return;
      const detail=String(error?.message||"");
      if(detail.includes("VERSION_CONFLICT"))say("Один из проектов изменён в другом окне. Ни один проект не обновлён. Перезагрузите список.",true);
      else if(detail.includes("STUDIO_SUBSCRIPTION_REQUIRED"))say("Подписка «Студия» не подтверждена сервером. Права на изменение отклонены.",true);
      else say("Изменение проектов не выполнено. Ничего не перезаписано; проверьте соединение и права.",true);
    }finally{
      if(live(id,epoch)){loading=false;render();}
    }
  }
  function setUser(user){
    const id=typeof user?.id==="string"?user.id:null;
    if(id===userId&&serial>0)return;
    ++serial;
    userId=id;plan="free";premium=false;loading=false;projects=[];selected.clear();
    showStyle();
    render();
    say(id?"Проверяем подписку «Студия»…":"Войдите в аккаунт для доступа к инструментам «Студии».");
  }
  window.addEventListener("anons:access",event=>{
    const next=event.detail||{};
    const previously=studioAllowed();
    plan=["free","basic","pro","studio","agency","ultimate"].includes(next.plan)?next.plan:"free";
    premium=next.premium===true&&plan!=="free";
    if(!studioAllowed()){projects=[];selected.clear();}
    showStyle();render();
    if(studioAllowed()&&!previously)void refreshProjects();
    else if(studioAllowed()&&previously)updateControls();
    else if(!studioAllowed()&&userId)say("Инструменты нескольких проектов доступны с подпиской «Студия» и выше.");
  });
  refreshButton.addEventListener("click",()=>{void refreshProjects();});
  styleButton.addEventListener("click",()=>{
    showStyle();
    updateControls();
    say("Фирменный стиль взят из текущего редактора. Данные проектов ещё не изменены.");
  });
  applyButton.addEventListener("click",()=>{void applyBrand();});
  window.addEventListener("anons:editor-change",()=>{showStyle();updateControls();});
  window.addEventListener("online",()=>{if(studioAllowed())void refreshProjects();});
  setUser(null);
  return {setUser,refreshProjects};
}
