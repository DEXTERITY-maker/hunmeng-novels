// Editor-only responsive navigation. Canvas state and cloud drafts remain owned
// by app.js and library-entry.js; switching panels never mutates project data.
(() => {
  "use strict";
  const workspace = document.querySelector("#editor .workspace");
  const toolbar = document.querySelector(".editor-view-switch");
  const buttons = [...document.querySelectorAll("[data-workspace-view]")];
  const previewAction = document.getElementById("editor-show-preview");
  const mobileDownload = document.getElementById("editor-mobile-download");
  if (!workspace || !toolbar || buttons.length !== 2 || !previewAction) return;

  document.getElementById("editor")?.classList.add("editor-workspace-ready");
  const mobile = window.matchMedia("(max-width: 760px)");
  function setView(view, fromInsidePanel = false) {
    if (view !== "edit" && view !== "preview") return;
    workspace.dataset.mobileView = view;
    for (const button of buttons) {
      const active = button.dataset.workspaceView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    if (mobile.matches) {
      // The toolbar is sticky and both panels share a viewport position.
      toolbar.scrollIntoView({block: "start", behavior: "auto"});
      if (fromInsidePanel) {
        buttons.find(button => button.dataset.workspaceView === view)
          ?.focus({preventScroll: true});
      }
    }
  }

  for (const button of buttons) {
    button.addEventListener("click", () => setView(button.dataset.workspaceView));
  }
  previewAction.addEventListener("click", () => setView("preview", true));
  mobileDownload?.addEventListener("click", () => {
    // Reuse the exact existing export action. Paid PNG entitlement stays
    // checked by the server; this shortcut does not create another path.
    setView("preview");
    document.getElementById("export")?.click();
  });

  // If a deep link targets a tool group, make the settings visible first.
  window.addEventListener("hashchange", () => {
    if (location.hash.startsWith("#editor-group-")) setView("edit");
    if (location.hash === "#editor-preview" || location.hash === "#poster") setView("preview");
  });
  if (location.hash.startsWith("#editor-group-")) setView("edit");
  if (location.hash === "#editor-preview" || location.hash === "#poster") setView("preview");
})();

// Small responsive visual catalogue: the select and the editor remain the
// single source of truth. Paid templates stay disabled until verified access.
(() => {
  "use strict";
  const select=document.getElementById("template-select");
  const grid=document.getElementById("template-visual-grid");
  const more=document.getElementById("template-visual-more");
  const count=document.getElementById("template-visual-count");
  if(!select||!grid||!more||!count)return;
  const options=[...select.options].filter(o=>o.value);
  const freeNames=new Set(["aurora","editorial","spotlight","pulse","minimal","bulletin"]);
  const tiers=[
    ["business-","Бизнес"],["pro-","Про"],["studio-","Студия"],
    ["agency-","Агентство"],["ultimate-","Максимум"]
  ];
  let expanded=false;
  const labelOf=key=>freeNames.has(key)?"Free":tiers.find(([prefix])=>key.startsWith(prefix))?.[1]||"Free";
  const views=options.map((option,index)=>{
    const parts=option.textContent.trim().split(" — ");
    const tile=document.createElement("button");
    tile.type="button";tile.className="template-mini-card";
    tile.dataset.previewTemplate=option.value;
    tile.dataset.tier=labelOf(option.value);
    tile.setAttribute("aria-label","Выбрать оформление "+parts.join(", "));
    const art=document.createElement("span");
    art.className="template-mini-art";
    art.dataset.variant=option.value;
    const tag=document.createElement("small");tag.textContent="ANONS / "+labelOf(option.value);
    const title=document.createElement("strong");title.textContent="Новая история.";
    const decoration=document.createElement("i");decoration.setAttribute("aria-hidden","true");
    art.append(tag,title,decoration);
    art.setAttribute("aria-hidden","true");
    const caption=document.createElement("span");caption.className="template-mini-caption";
    const name=document.createElement("strong");name.textContent=parts[0];
    const description=document.createElement("small");description.textContent=parts.slice(1).join(" — ")||"Композиция";
    const state=document.createElement("span");state.className="template-mini-state";
    caption.append(name,description);
    tile.append(art,caption,state);
    tile.addEventListener("click",()=>{
      if(option.disabled)return;
      select.value=option.value;
      select.dispatchEvent(new Event("change",{bubbles:true}));
      update();
    });
    grid.appendChild(tile);
    return {option,tile,state,index};
  });
  function update(){
    const selected=select.value;
    const activeIndex=options.findIndex(o=>o.value===selected);
    if(activeIndex>=6)expanded=true;
    const accessible=options.filter(o=>!o.disabled).length;
    count.textContent="Доступно "+accessible+" из "+options.length;
    grid.classList.toggle("is-expanded",expanded);
    for(const {option,tile,state,index} of views){
      const isActive=option.value===selected;
      tile.disabled=option.disabled;
      tile.hidden=!expanded&&index>=6;
      tile.classList.toggle("is-active",isActive);
      tile.classList.toggle("is-locked",option.disabled);
      tile.setAttribute("aria-pressed",String(isActive));
      state.textContent=option.disabled?"По подписке":isActive?"Выбрано":labelOf(option.value);
    }
    more.setAttribute("aria-expanded",String(expanded));
    more.textContent=expanded?"Свернуть до 6 базовых":"Показать все "+options.length+" шаблонов";
  }
  more.addEventListener("click",()=>{expanded=!expanded;update();});
  select.addEventListener("change",update);
  window.addEventListener("anons:editor-change",update);
  window.addEventListener("anons:access",()=>requestAnimationFrame(update));
  update();
})();
