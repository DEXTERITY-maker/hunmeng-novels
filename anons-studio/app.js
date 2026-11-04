(() => {
  "use strict";
  const storageKey = "anons-studio:mvp-v1";
  const $ = (id) => document.getElementById(id);
  const canvas = $("poster");
  const ctx = canvas?.getContext("2d", { alpha: false });
  if (!ctx) {
    const stage = document.querySelector(".preview-stage");
    if (stage) stage.textContent = "Ваш браузер не поддерживает редактор изображений Canvas.";
    return;
  }

  const presets = {
    update: { label: "ОБНОВЛЕНИЕ", project: "ANONS STUDIO", title: "Большое обновление!", description: "Мы добавили новые возможности, улучшили оформление и сделали работу ещё удобнее.", points: "Новый современный дизайн\nБольше полезных функций\nУлучшенная скорость работы" },
    launch: { label: "ЗАПУСК", project: "МОЙ ПРОЕКТ", title: "Мы запускаемся!", description: "Новая идея становится реальностью. Знакомьтесь с проектом, над которым мы так долго работали.", points: "Совершенно новый опыт\nУдобно с первого дня\nПрисоединяйтесь к нам" },
    event: { label: "СОБЫТИЕ", project: "НАШЕ СООБЩЕСТВО", title: "Не пропустите встречу", description: "Собираемся вместе, чтобы обменяться идеями, познакомиться и вдохновиться.", points: "Интересная программа\nНовые знакомства\nОткрыто для всех" },
    notice: { label: "ОБЪЯВЛЕНИЕ", project: "ВАЖНАЯ ИНФОРМАЦИЯ", title: "У нас важная новость", description: "Рассказываем, что изменится и как это повлияет на нашу работу и ваши возможности.", points: "Что именно меняется\nДля кого это важно\nЧто делать дальше" }
  };
  const themes = {
    ultraviolet: { name: "Ультрафиолет — смелый и современный", bg1: "#17172f", bg2: "#4a3486", glow: "#a079f7", accent: "#c2a1ff", text: "#ffffff", sub: "#e0d8f3", chip: "#ffffff", dark: true },
    emerald: { name: "Изумрудный — спокойный и уверенный", bg1: "#0c2c2b", bg2: "#145b56", glow: "#35c6a2", accent: "#7ef0cb", text: "#ffffff", sub: "#d6f4eb", chip: "#ffffff", dark: true },
    sunset: { name: "Закат — тёплый и выразительный", bg1: "#60274c", bg2: "#aa4e66", glow: "#ffaf7d", accent: "#ffcc9a", text: "#ffffff", sub: "#ffecdd", chip: "#ffffff", dark: true },
    ink: { name: "Графит — строгий и минималистичный", bg1: "#181c2a", bg2: "#34405c", glow: "#8299b8", accent: "#b8c9ef", text: "#ffffff", sub: "#e0e5ee", chip: "#ffffff", dark: true },
    paper: { name: "Светлый — мягкий и редакционный", bg1: "#f9f0e1", bg2: "#e9d5b5", glow: "#d8ac76", accent: "#95592f", text: "#302737", sub: "#5b5058", chip: "#302737", dark: false }
  };
  const sizes = {
    portrait: { w: 1080, h: 1350 },
    square: { w: 1080, h: 1080 },
    story: { w: 1080, h: 1920 }
  };
  const businessTemplates=new Set(["business-brief","business-pitch","business-report"]);
  const proTemplates=new Set(["pro-campaign","pro-magazine","pro-impact"]);
  const templates = new Set(["aurora","editorial","spotlight","pulse","minimal","bulletin",...businessTemplates,...proTemplates]);
  let currentPlan="free";
  const businessAllowed=()=>["basic","pro","studio"].includes(currentPlan);
  const proAllowed=()=>currentPlan==="pro"||currentPlan==="studio";
  const canUseTemplate=template=>templates.has(template)
    &&(!businessTemplates.has(template)||businessAllowed())
    &&(!proTemplates.has(template)||proAllowed());
  let pendingPremiumTemplate=null;
  const MAX_CARDS=8;
  const Graphics=window.AnonsGraphics; // Exact allowlisted shapes used by server PNG exports.
  if(!Graphics)throw new Error("GRAPHICS_MODULE_MISSING");
  const textFonts=new Set(["auto","manrope","georgia","arial"]);
  const decorLevels=new Set(["subtle","balanced","expressive"]);
  const textSpacings=new Set(["compact","balanced","airy"]);
  const compositions=new Set(["classic","compact","headline"]);
  const highlightStyles=new Set(["soft","outline","separated"]);
  const highlightIconKinds=new Set(["dot","check","star","diamond"]);
  function cleanIcons(raw){
    return Array.from({length:3},(_,i)=>{
      const v=Array.isArray(raw)?raw[i]:null;
      return highlightIconKinds.has(v)?v:"dot";
    });
  }
  const baseLayerNames=["decoration","photo","brand","title","description","highlights"];
  const movableLayers=["photo","brand","title","description","highlights"];
  const layerAxes={title:["x","y"],description:["x","y"],highlights:["x","y"],
    photo:["x","y"],brand:["x","y"]};
  const allowedTextLayers=new Set(movableLayers);
  function cleanLayerVisibility(raw){
    const value=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
    return Object.fromEntries(baseLayerNames.map(key=>[key,value[key]!==false]));
  }
  function cleanLayerOrder(raw){
    const unique=Array.isArray(raw)?raw.filter(key=>typeof key==="string"&&movableLayers.includes(key)):[];
    return ["decoration",...new Set([...unique,...movableLayers])];
  }
  function normalizeLocks(raw,graphics=[]){
    const existing=new Set(Graphics.normalizeElements(graphics).map(item=>item.id));
    if(!Array.isArray(raw))return [];
    return [...new Set(raw.filter(value=>typeof value==="string"&&
      (allowedTextLayers.has(value)||(value.startsWith("graphic:")&&existing.has(value.slice(8))))))].slice(0,16);
  }
  const clamp=(value,min,max,fallback)=>Number.isFinite(Number(value))
    ?Math.max(min,Math.min(max,Number(value))):fallback;
  function normalizeOffsets(raw){
    const values=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
    const result=Object.fromEntries(Object.keys(layerAxes).map(layer=>[layer,{x:0,y:0}]));
    for(const [layer,axes] of Object.entries(layerAxes)){
      for(const axis of axes)result[layer][axis]=Math.round(clamp(values[layer]?.[axis],-30,30,0));
    }
    return result;
  }
  const cardKeys=["title","description","points","preset","template","theme","accentColor","alignment","headingScale","decorations","photoOpacity","titleFont","descriptionScale","layerOffsets","graphicElements","decorationLevel","textSpacing","composition","highlightStyle","highlightIcons","featuredHighlight","lockedLayers","layers","layerOrder"];
  const limits={project:45,title:85,description:210,points:240};
  const defaults = { preset: "update", theme: "ultraviolet", ratio: "portrait", ...presets.update, imageData: "",
    template:"aurora", headingScale:100, accentColor:"", alignment:"left", decorations:true, photoOpacity:35,
    titleFont:"auto",descriptionScale:100,layerOffsets:normalizeOffsets(null),graphicElements:[],
    decorationLevel:"subtle",textSpacing:"balanced",
    composition:"classic",highlightStyle:"soft",highlightIcons:["dot","dot","dot"],featuredHighlight:-1,
    lockedLayers:[],layers:cleanLayerVisibility(null),layerOrder:cleanLayerOrder(null),
    activeCard:0, cards:[] };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {}; } catch (_) {}
  const state = { ...defaults };
  for (const key of ["preset", "theme", "ratio", "project", "title", "description", "points", "imageData","template","accentColor","alignment","titleFont","decorationLevel","textSpacing","composition","highlightStyle"]) {
    if (typeof saved[key] === "string") state[key] = saved[key];
  }
  if (!presets[state.preset]) state.preset = "update";
  if (!themes[state.theme]) state.theme = "ultraviolet";
  if (!sizes[state.ratio]) state.ratio = "portrait";
  if (!templates.has(state.template)) state.template = "aurora";
  state.alignment = state.alignment==="center"?"center":"left";
  state.accentColor = /^#[0-9a-fA-F]{6}$/.test(state.accentColor)?state.accentColor:"";
  state.headingScale = Number.isFinite(saved.headingScale)?Math.max(80,Math.min(120,saved.headingScale)):100;
  state.photoOpacity = Number.isFinite(saved.photoOpacity)?Math.max(15,Math.min(85,saved.photoOpacity)):35;
  state.decorations = typeof saved.decorations === "boolean" ? saved.decorations : true;
  state.titleFont=textFonts.has(state.titleFont)?state.titleFont:"auto";
  state.descriptionScale=Math.round(clamp(saved.descriptionScale,80,130,100));
  state.layerOffsets=normalizeOffsets(saved.layerOffsets);
  state.graphicElements=Graphics.normalizeElements(saved.graphicElements);
  state.lockedLayers=normalizeLocks(saved.lockedLayers,state.graphicElements);
  state.layers=cleanLayerVisibility(saved.layers);
  state.layerOrder=cleanLayerOrder(saved.layerOrder);
  if(!decorLevels.has(state.decorationLevel))state.decorationLevel="subtle";
  if(!textSpacings.has(state.textSpacing))state.textSpacing="balanced";
  if(!compositions.has(state.composition))state.composition="classic";
  if(!highlightStyles.has(state.highlightStyle))state.highlightStyle="soft";
  state.highlightIcons=cleanIcons(saved.highlightIcons);
  state.featuredHighlight=Number.isInteger(saved.featuredHighlight)&&saved.featuredHighlight>=-1&&saved.featuredHighlight<=2
    ?saved.featuredHighlight:-1;
  for (const key of ["project","title","description","points"]) state[key]=state[key].slice(0,limits[key]);
  const sanitizeCard = (v) => {
    const original=(v && typeof v==="object")?v:{};
    const out={};
    for(const key of ["title","description","points"]) out[key]=(typeof original[key]==="string"?original[key]:(state[key]||"")).slice(0,limits[key]);
    out.preset=presets[original.preset]?original.preset:state.preset;
    out.template=templates.has(original.template)?original.template:state.template;
    out.theme=themes[original.theme]?original.theme:state.theme;
    const color=typeof original.accentColor==="string"?original.accentColor:state.accentColor;
    out.accentColor=/^#[0-9a-fA-F]{6}$/.test(color)?color:"";
    out.alignment=original.alignment==="center"?"center":state.alignment;
    out.headingScale=Number.isFinite(original.headingScale)?Math.max(80,Math.min(120,original.headingScale)):state.headingScale;
    out.decorations=typeof original.decorations==="boolean"?original.decorations:state.decorations;
    out.photoOpacity=Number.isFinite(original.photoOpacity)?Math.max(15,Math.min(85,original.photoOpacity)):state.photoOpacity;
    // Old project snapshots must not accidentally inherit the currently
    // active card's typography when those fields did not yet exist.
    out.titleFont=textFonts.has(original.titleFont)?original.titleFont:"auto";
    out.descriptionScale=Math.round(clamp(original.descriptionScale,80,130,100));
    out.layerOffsets=normalizeOffsets(original.layerOffsets);
    out.graphicElements=Graphics.normalizeElements(original.graphicElements);
    out.lockedLayers=normalizeLocks(original.lockedLayers,out.graphicElements);
    out.layers=cleanLayerVisibility(original.layers);
    out.layerOrder=cleanLayerOrder(original.layerOrder);
    out.decorationLevel=decorLevels.has(original.decorationLevel)?original.decorationLevel:"subtle";
    out.textSpacing=textSpacings.has(original.textSpacing)?original.textSpacing:"balanced";
    out.composition=compositions.has(original.composition)?original.composition:"classic";
    out.highlightStyle=highlightStyles.has(original.highlightStyle)?original.highlightStyle:"soft";
    out.highlightIcons=cleanIcons(original.highlightIcons);
    out.featuredHighlight=Number.isInteger(original.featuredHighlight)&&original.featuredHighlight>=-1&&original.featuredHighlight<=2
      ?original.featuredHighlight:-1;
    return out;
  };
  // Migration: keep a previously saved single-card project when upgrading v0.2.
  const firstCard=sanitizeCard({title:state.title,description:state.description,points:state.points,preset:state.preset,template:state.template});
  state.cards=Array.isArray(saved.cards)&&saved.cards.length ? saved.cards.slice(0,MAX_CARDS).map(sanitizeCard):[firstCard];
  state.activeCard=Number.isInteger(saved.activeCard)?Math.min(Math.max(0,saved.activeCard),state.cards.length-1):0;
  Object.assign(state,state.cards[state.activeCard]);
  let photo = null;
  let selectedGraphicIndex=-1;
  const paidAccess = { premium: false, plan: "free" };
  let toastTimer = null;
  let pendingRender = false;
  let suppressEditorSignal = false;
  const HISTORY_LIMIT = 30;
  const undoStack = [];
  const redoStack = [];
  let historyCurrent = "";
  let historyKind = "";
  let lastHistoryKind = "";
  let lastHistoryAt = 0;
  let historyApplying = false;

  function updateHistoryControls() {
    $("undo").disabled = undoStack.length === 0;
    $("redo").disabled = redoStack.length === 0;
  }
  function resetHistory() {
    undoStack.length = 0;
    redoStack.length = 0;
    historyCurrent = JSON.stringify(getSnapshot());
    historyKind = "";
    lastHistoryKind = "";
    lastHistoryAt = 0;
    updateHistoryControls();
  }
  function recordHistory() {
    if (historyApplying) return;
    const next = JSON.stringify(getSnapshot());
    if (next === historyCurrent) return;
    const now = Date.now();
    const kind = historyKind;
    const grouped = kind && kind === lastHistoryKind && (now - lastHistoryAt) < 900 && undoStack.length > 0;
    if (!grouped && historyCurrent) {
      undoStack.push(historyCurrent);
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    }
    historyCurrent = next;
    redoStack.length = 0;
    lastHistoryKind = kind;
    lastHistoryAt = now;
    updateHistoryControls();
  }
  function stepHistory(direction) {
    const from = direction === "undo" ? undoStack : redoStack;
    const to = direction === "undo" ? redoStack : undoStack;
    if (!from.length) return;
    to.push(historyCurrent);
    if (to.length > HISTORY_LIMIT) to.shift();
    historyCurrent = from.pop();
    historyApplying = true;
    try {
      loadSnapshot(JSON.parse(historyCurrent), true);
    } finally {
      historyApplying = false;
    }
    lastHistoryKind = "";
    lastHistoryAt = 0;
    updateHistoryControls();
    window.dispatchEvent(new Event("anons:editor-change"));
    showToast(direction === "undo" ? "Последнее изменение отменено." : "Изменение повторено.");
  }

  function snapshotCard() {
    const card=state.cards[state.activeCard];
    for(const k of cardKeys) card[k]=state[k];
  }
  function activateCard(index) {
    if(!Number.isInteger(index)||index<0||index>=state.cards.length)return;
    snapshotCard();
    state.activeCard=index;
    selectedGraphicIndex=-1;
    Object.assign(state,state.cards[index]);
    syncFields();
    persist();
    scheduleRender();
  }
  function renderCardTabs() {
    const holder=$("card-list");
    holder.replaceChildren();
    state.cards.forEach((card,i)=>{
      const b=document.createElement("button");
      b.type="button";
      b.className="card-tab"+(i===state.activeCard?" active":"");
      b.setAttribute("role","tab");
      b.setAttribute("aria-selected",String(i===state.activeCard));
      b.setAttribute("aria-label","Карточка "+(i+1)+": "+(card.title||"Без названия"));
      b.textContent=String(i+1).padStart(2,"0");
      b.addEventListener("click",()=>activateCard(i));
      holder.append(b);
    });
    $("card-count").textContent=state.cards.length+" из "+MAX_CARDS;
    $("current-card-label").textContent="Карточка "+(state.activeCard+1)+" / "+state.cards.length;
    $("add-card").disabled=$("duplicate-card").disabled=state.cards.length>=MAX_CARDS;
    $("remove-card").disabled=state.cards.length<=1;
  }
  function renderGraphicControls(){
    const items=state.graphicElements;
    if(!Array.isArray(items))return;
    if(selectedGraphicIndex>=items.length)selectedGraphicIndex=items.length-1;
    $("graphic-count").textContent=items.length+" из "+Graphics.MAX;
    $("graphic-add").disabled=items.length>=Graphics.MAX;
    const list=$("graphic-list");
    list.replaceChildren();
    items.forEach((item,index)=>{
      const button=document.createElement("button");
      button.type="button";
      button.className="graphic-list-item"+(index===selectedGraphicIndex?" active":"");
      button.setAttribute("aria-pressed",String(index===selectedGraphicIndex));
      button.textContent=(index+1)+". "+(item.label||Graphics.labels[item.kind]);
      button.addEventListener("click",()=>{selectedGraphicIndex=index;renderGraphicControls();});
      list.appendChild(button);
    });
    const current=items[selectedGraphicIndex];
    $("graphic-settings").hidden=!current;
    $("graphic-remove").disabled=!current;
    if(!current)return;
    $("graphic-kind").value=current.kind;
    for(const id of ["x","y","size","rotation","opacity"]){
      $("graphic-"+id).value=current[id];
      $("graphic-"+id+"-value").textContent=current[id]+(id==="rotation"?"°":"%");
    }
    $("graphic-color").value=current.color;
  }
  function syncCardAndSave() {
    snapshotCard();
    renderCardTabs();
    persist();
    scheduleRender();
  }
  function syncFields() {
    for (const k of ["project", "title", "description", "points", "ratio"]) $(k).value = state[k];
    document.querySelectorAll("[data-preset]").forEach((b) => {
      const active = b.dataset.preset === state.preset;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-theme]").forEach((b) => {
      const active = b.dataset.theme === state.theme;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    $("theme-label").textContent = themes[state.theme].name;
    $("template-select").value=state.template;
    document.querySelectorAll("[data-template]").forEach(b=>{
      const active=b.dataset.template===state.template;
      b.classList.toggle("active",active);
      b.setAttribute("aria-pressed",String(active));
    });
    $("heading-scale").value=state.headingScale;
    $("heading-scale-value").textContent=state.headingScale+"%";
    $("accent-color").value=state.accentColor||themes[state.theme].accent;
    $("text-align").value=state.alignment;
    $("photo-opacity").value=state.photoOpacity;
    $("photo-opacity-value").textContent=state.photoOpacity+"%";
    $("ornaments").checked=state.decorations;
    $("decoration-level").value=state.decorationLevel;
    $("text-spacing").value=state.textSpacing;
    $("composition").value=state.composition;
    $("highlight-style").value=state.highlightStyle;
    $("featured-highlight").value=String(state.featuredHighlight);
    for(let i=0;i<3;i++)$("highlight-icon-"+i).value=state.highlightIcons[i];
    $("title-font").value=state.titleFont;
    $("description-scale").value=state.descriptionScale;
    $("description-scale-value").textContent=state.descriptionScale+"%";
    const sliderIds=[
      ["title-offset-x","title","x"],["title-offset-y","title","y"],
      ["description-offset-x","description","x"],["description-offset-y","description","y"],
      ["highlights-offset-x","highlights","x"],["highlights-offset-y","highlights","y"],
      ["photo-offset-x","photo","x"],["photo-offset-y","photo","y"]
    ];
    for(const [id,layer,axis] of sliderIds){
      const value=state.layerOffsets?.[layer]?.[axis]||0;
      $(id).value=value;
      $(id+"-value").textContent=(value>0?"+":"")+value+"%";
    }
    renderGraphicControls();
    renderCardTabs();
    $("clear-image").hidden = !state.imageData;
    $("image-name").textContent = state.imageData ? "Фото добавлено" : "PNG, JPG или WebP";
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {
      showToast("Не удалось сохранить проект в браузере. Экспорт остаётся доступен.");
    }
    recordHistory();
    historyKind = "";
    if(!suppressEditorSignal)window.dispatchEvent(new Event("anons:editor-change"));
  }
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 4200);
  }
  function scheduleRender() {
    if (pendingRender) return;
    pendingRender = true;
    requestAnimationFrame(() => { pendingRender = false; render(); });
  }
  function rgba(hex, a) {
    const h = hex.replace("#", "");
    const n = Number.parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function roundedRect(x, y, w, h, r) {
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + rad, y); ctx.lineTo(x + w - rad, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad); ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad); ctx.quadraticCurveTo(x, y, x + rad, y); ctx.closePath();
  }
  function drawPhoto(W, H) {
    if (!photo) return;
    const scene=window.AnonsScene.layout({ratio:state.ratio,project:state.project},state);
    const f=scene.photo,off=scene.offsets.photo;
    const x=f.x+off.x*W/100,y=f.y+off.y*H/100,w=f.width,h=f.height;
    ctx.save(); ctx.globalAlpha = state.photoOpacity/100;
    roundedRect(x, y, w, h, 140); ctx.clip();
    const sc = Math.max(w / photo.width, h / photo.height);
    const dw = photo.width * sc, dh = photo.height * sc;
    ctx.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  function drawDecoration(W,H,t,scene) {
    const d=scene.decorationTuning;
    const cx=W*.84,cy=H*d.centerY;
    ctx.save();
    ctx.strokeStyle=rgba(t.accent,d.rings);ctx.lineWidth=2.5;
    for(let i=0;i<3;i++){
      ctx.beginPath();ctx.ellipse(cx,cy,d.ringRadius+i*d.ringStep,
        d.ringRadius*.88+i*d.ringStep,-.35,0,Math.PI*2);ctx.stroke();
    }
    ctx.fillStyle=rgba(t.accent,d.disc);
    ctx.beginPath();ctx.arc(cx,cy,d.discRadius,0,Math.PI*2);ctx.fill();
    ctx.translate(cx,cy);ctx.rotate(Math.PI/4);
    ctx.globalAlpha=d.spark;ctx.fillStyle=t.accent;
    ctx.beginPath();ctx.moveTo(0,-43);
    ctx.quadraticCurveTo(12,-12,43,0);ctx.quadraticCurveTo(12,12,0,43);
    ctx.quadraticCurveTo(-12,12,-43,0);ctx.quadraticCurveTo(-12,-12,0,-43);ctx.fill();
    ctx.restore();
  }
  function drawBackground(W,H,t,scene) {
    const aurora=scene.template==="aurora";
    const d=scene.decorationTuning;
    const grad=ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0,t.bg1);grad.addColorStop(1,t.bg2);
    ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(W*.87,H*.16,20,W*.87,H*.16,W*.85);
    glow.addColorStop(0,rgba(t.glow,aurora?d.glow:.34));
    glow.addColorStop(1,rgba(t.glow,0));
    ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.lineWidth=1.5;
    ctx.strokeStyle=rgba(t.text,aurora?(state.decorations?d.grid:0):.055);
    if(scene.enabled.decoration&&(!aurora||state.decorations)){
      for(let i=-H;i<W+H;i+=73){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+H,H);ctx.stroke();}
    }
    if(scene.enabled.decoration&&state.decorations && scene.template!=="minimal") {
      if(scene.template==="editorial"){
        ctx.strokeStyle=rgba(t.text,.3);ctx.lineWidth=3;ctx.strokeRect(38,38,W-76,H-76);
        ctx.fillStyle=rgba(t.accent,.28);ctx.fillRect(W-170,95,76,76);
      }else if(scene.template==="spotlight"){
        ctx.fillStyle=rgba(t.accent,.22);
        ctx.beginPath();ctx.arc(W*.84,H*.24,270,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(W*.84,H*.24,185,0,Math.PI*2);ctx.fill();
      }else if(scene.template==="pulse"){
        ctx.save();ctx.translate(W*.77,H*.15);ctx.rotate(-.36);
        ctx.fillStyle=rgba(t.accent,.48);ctx.fillRect(0,-190,118,H*.72);
        ctx.fillStyle=rgba(t.text,.16);ctx.fillRect(137,-190,38,H*.72);ctx.restore();
      }else if(scene.template==="bulletin"){
        ctx.fillStyle=t.accent;ctx.fillRect(0,0,W,20);
        ctx.fillStyle=rgba(t.text,.12);ctx.fillRect(0,136,W,8);
        for(let x=75;x<W-75;x+=80){ctx.fillStyle=rgba(t.accent,.3);ctx.fillRect(x,H*.19,48,8);}
      }else drawDecoration(W,H,t,scene);
    }
  }
  function drawWatermark(W,H,t) {
    // All local exports carry multiple brand stamps, including on paid plans;
    // only the server provides a clean PNG after entitlement verification.
    ctx.save();
    ctx.textAlign="center";ctx.textBaseline="middle";
    for(const stamp of window.AnonsScene.watermarkStamps(W,H,t.dark)){
      ctx.save();
      ctx.translate(stamp.x,stamp.y);ctx.rotate(stamp.rotation);
      ctx.font="800 "+stamp.size+"px Manrope, sans-serif";
      ctx.fillStyle=rgba(t.text,stamp.alpha);
      ctx.fillText("ANONS STUDIO",0,0);
      ctx.restore();
    }
    ctx.restore();
  }
  function draw() {
    // Scene order and visibility are shared with the paid PNG renderer.
    // Only the footer and the Free watermark are not editable layers.
    const scene=window.AnonsScene.layout({ratio:state.ratio,project:state.project},state);
    const W=scene.width,H=scene.height,t=scene.palette;
    if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
    ctx.textBaseline="alphabetic";ctx.textAlign="left";
    drawBackground(W,H,t,scene);
    const margin=scene.margin,contentWidth=scene.contentWidth;
    const layout=scene.template,titleY=scene.titleY,detailsY=scene.detailsY;
    const rawTitle=state.title.trim()||"Заголовок публикации";
    const f=window.AnonsScene.titleLines(rawTitle,scene);
    const drawBrandLayer=()=>{
      ctx.save();
      ctx.translate(scene.offsets.brand.x*W/100,scene.offsets.brand.y*H/100);
    // Topline
    ctx.font="700 27px Manrope, sans-serif"; ctx.fillStyle=t.text;
    const project=scene.project.trim()||"МОЙ ПРОЕКТ";
    const projectWidth=Math.min(ctx.measureText(project).width,contentWidth*.52);
    ctx.save();roundedRect(margin,72,projectWidth+48,56,28);ctx.fillStyle=rgba(t.text,.10);ctx.fill();ctx.restore();
    ctx.fillStyle=t.text;ctx.save();ctx.beginPath();ctx.rect(margin+24,72,projectWidth,56);ctx.clip();ctx.fillText(project,margin+24,109);ctx.restore();
    ctx.textAlign="right";ctx.font="700 24px Manrope, sans-serif";ctx.fillStyle=rgba(t.text,.75);
    ctx.fillText("✳ ANONS / STUDIO",W-margin,105);ctx.textAlign="left";

      ctx.restore();
    };
    const drawTitleLayer=()=>{
    ctx.save();
    ctx.translate(scene.offsets.title.x*W/100,scene.offsets.title.y*H/100);
    ctx.fillStyle=t.accent;ctx.font="800 24px Manrope, sans-serif";
    ctx.fillText(scene.label+"  /  2026",margin,titleY-52);
    const titleFont=scene.titleFamily==="georgia"?"'Noto Serif', Georgia, serif":scene.titleFamily==="arial"?"Arial, sans-serif":"Manrope, sans-serif";
    ctx.font=scene.titleWeight+" "+f.size+"px "+titleFont;ctx.fillStyle=t.text;
    const center=scene.center;
    ctx.textAlign=center?"center":"left";
    const tx=center?W/2:margin;
    let y=titleY+f.size*.8;
    for(const line of f.lines){ctx.fillText(line,tx,y);y+=f.size*1.14;}
    ctx.restore();
    };
    const drawDescriptionLayer=()=>{
    const descText=state.description.trim()||"Расскажите коротко, что произошло и почему это важно.";
    const descY=window.AnonsScene.descriptionTop(scene,f);
    const dsize=scene.descriptionSize;
    ctx.save();
    ctx.translate(scene.offsets.description.x*W/100,scene.offsets.description.y*H/100);
    ctx.textAlign=center?"center":"left";
    ctx.font="700 "+dsize+"px Manrope, sans-serif";ctx.fillStyle=t.sub;
    const dlines=window.AnonsScene.breakLines(descText,contentWidth-(H<=1100?10:80),dsize,3);
    // CSS/Satori places the first text baseline within its line box; align
    // the Canvas baseline instead of painting above the server text position.
    for(let i=0;i<dlines.length;i++){ctx.fillText(dlines[i],tx,descY+dsize*.82+i*(dsize*1.5));}
    ctx.restore();
    ctx.textAlign="left";

    };
    const drawHighlightsLayer=()=>{
    // Structured, legible highlights
    const points=state.points.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,3);
    const list=points.length?points:["Важная информация","Следите за новостями"];
    const h=window.AnonsScene.highlightGeometry(scene,list.length);
    const top=detailsY,rowHeight=h.rowHeight;
    ctx.save();
    ctx.translate(scene.offsets.highlights.x*W/100,scene.offsets.highlights.y*H/100);
    if(h.style!=="separated"){
      ctx.save();
      roundedRect(margin,h.top,h.width,h.height,23);
      if(h.style==="outline"||layout==="minimal"||layout==="editorial"){
        ctx.strokeStyle=rgba(t.text,.36);ctx.lineWidth=2;ctx.stroke();
      }else{
        ctx.fillStyle=rgba(t.text,.085);ctx.fill();
      }
      ctx.restore();
    }
    list.forEach((p,i)=>{
      const cy=top+i*rowHeight+16;
      if(h.featured===i){
        ctx.save();
        roundedRect(margin+13,h.top+12+i*rowHeight,contentWidth-26,rowHeight-3,12);
        ctx.fillStyle=rgba(t.accent,.16);ctx.fill();ctx.restore();
      }
      if(h.style==="separated"&&i>0){
        ctx.strokeStyle=rgba(t.text,.22);ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(margin+12,h.top+12+i*rowHeight);
        ctx.lineTo(margin+contentWidth-12,h.top+12+i*rowHeight);ctx.stroke();
      }
      const kind=h.icons[i];
      ctx.fillStyle=t.accent;
      if(kind==="dot"){
        ctx.beginPath();ctx.arc(margin+31,cy+9,11,0,2*Math.PI);ctx.fill();
      }else{
        ctx.save();ctx.translate(margin+19,cy-3);
        ctx.scale(24/100,24/100);ctx.fill(new Path2D(Graphics.paths[kind]));
        ctx.restore();
      }
      ctx.fillStyle=t.text;ctx.font="700 "+(H<=1100?27:30)+"px Manrope,sans-serif";
      let short=p;
      while(window.AnonsScene.textWidth(short,H<=1100?27:30)>contentWidth-112&&short.length>1)
        short=short.slice(0,-1);
      if(short!==p)short=short.slice(0,-1)+"…";
      ctx.fillText(short,margin+63,cy+18);
    });
    ctx.restore();
    };
    const layers={
      photo:()=>drawPhoto(W,H),
      brand:drawBrandLayer,title:drawTitleLayer,
      description:drawDescriptionLayer,highlights:drawHighlightsLayer
    };
    for(const name of scene.order){
      if(name==="decoration"||scene.enabled[name]===false)continue;
      const action=layers[name];
      if(action)action();
    }
    // The same allowlisted SVG paths and normalized geometry are used by
    // the premium server renderer; arbitrary user-supplied paths are rejected.
    for(const graphic of Graphics.normalizeElements(state.graphicElements)){
      if(graphic.hidden)continue;
      const frame=Graphics.frame(graphic,W,H);
      ctx.save();
      ctx.translate(frame.x,frame.y);
      ctx.rotate(frame.rotation*Math.PI/180);
      ctx.scale(frame.size/100,frame.size/100);
      ctx.translate(-50,-50);
      ctx.globalAlpha=frame.opacity;
      ctx.fillStyle=frame.color;
      ctx.fill(new Path2D(frame.path));
      ctx.restore();
    }
    const footerY=scene.footerY;
    ctx.strokeStyle=rgba(t.text,.22);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin,footerY-39);ctx.lineTo(W-margin,footerY-39);ctx.stroke();
    ctx.fillStyle=t.sub;ctx.font="800 20px Manrope,sans-serif";ctx.fillText("СОЗДАНО ДЛЯ ВДОХНОВЕНИЯ",margin,footerY);
    ctx.textAlign="right";ctx.fillStyle=t.accent;ctx.fillText("✦",W-margin,footerY);ctx.textAlign="left";
    drawWatermark(W,H,t);
  }
  function render() { try { draw(); } catch(err) { console.error(err); showToast("Ошибка предпросмотра. Попробуйте другой текст или фото."); } }
  async function loadPhoto(data) {
    if(!data){photo=null;scheduleRender();return;}
    const img=new Image();
    img.onload=()=>{photo=img;scheduleRender();};
    img.onerror=()=>{state.imageData="";photo=null;showToast("Изображение не удалось открыть.");syncFields();persist();scheduleRender();};
    img.src=data;
  }
  for (const key of ["project","title","description","points"]) {
    $(key).addEventListener("input",(e)=>{
      historyKind="text:"+key;
      state[key]=e.target.value;
      if(key==="project"){persist();scheduleRender();}else syncCardAndSave();
    });
  }
  $("ratio").addEventListener("change",(e)=>{state.ratio=sizes[e.target.value]?e.target.value:"portrait";persist();scheduleRender();});
  document.querySelectorAll("[data-theme]").forEach((b)=>b.addEventListener("click",()=>{
    state.theme=b.dataset.theme;state.accentColor="";syncFields();syncCardAndSave();
  }));
  document.querySelectorAll("[data-preset]").forEach((b)=>b.addEventListener("click",()=>{
    const p=b.dataset.preset;if(!presets[p])return;
    const changed=state.preset!==p;
    state.preset=p;
    if(changed) for(const k of ["project","title","description","points"])state[k]=presets[p][k];
    syncFields();syncCardAndSave();
  }));
  const themeForTemplate={aurora:"ultraviolet",editorial:"paper",spotlight:"sunset",pulse:"ink",minimal:"paper",bulletin:"emerald",
    "business-brief":"ink","business-pitch":"sunset","business-report":"paper",
    "pro-campaign":"ink","pro-magazine":"ink","pro-impact":"sunset"};
  function changeTemplate(next) {
    if(!templates.has(next))return;
    if(!canUseTemplate(next)){
      syncFields();
      showToast(proTemplates.has(next)
        ?"Шаблоны «Про» доступны на тарифах «Про» и «Студия»."
        :"Шаблоны «Бизнес» доступны по платной подписке. Откройте тарифы для заказа.");
      return;
    }
    state.template=next;
    state.theme=themeForTemplate[next];
    state.accentColor="";
    syncFields();syncCardAndSave();
  }
  $("undo").addEventListener("click",()=>stepHistory("undo"));
  $("redo").addEventListener("click",()=>stepHistory("redo"));
  document.addEventListener("keydown",e=>{
    if(!(e.ctrlKey||e.metaKey)||e.altKey)return;
    // Native text editing undo remains available inside form controls.
    if(e.target?.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(e.target?.tagName))return;
    const key=e.key.toLowerCase();
    if(key==="z"){e.preventDefault();stepHistory(e.shiftKey?"redo":"undo");}
    else if(key==="y"&&!e.shiftKey){e.preventDefault();stepHistory("redo");}
  });
  $("template-select").addEventListener("change",e=>changeTemplate(e.target.value));
  document.querySelectorAll("[data-template]").forEach(b=>{
    b.addEventListener("click",()=>{
      changeTemplate(b.dataset.template);
      document.getElementById("editor").scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
  function createProSeries(){
    if(!proAllowed()){
      showToast("Для серии публикаций нужна подписка «Про» или «Студия».");
      return false;
    }
    if(state.cards.length>MAX_CARDS-2){
      showToast("Для новой серии нужно два свободных места (не более 8 карточек).");
      return false;
    }
    if(!window.confirm("Добавить две карточки к текущей публикации? Существующие карточки не изменятся, действие можно отменить."))return false;
    snapshotCard();
    const source=state.cards[state.activeCard];
    const details=sanitizeCard({
      ...source,template:"pro-campaign",theme:themeForTemplate["pro-campaign"],
      accentColor:"",title:"Ключевые моменты",description:source.description,
      points:source.points
    });
    const next=sanitizeCard({
      ...source,template:"pro-magazine",theme:themeForTemplate["pro-magazine"],
      accentColor:"",title:"Что дальше",
      description:"Добавьте планы, сроки и дальнейшие шаги.",
      points:"Следующий шаг\\nВажные сроки\\nГде узнать подробности"
    });
    const firstNew=state.cards.length;
    state.cards.push(details,next);
    state.activeCard=firstNew;
    Object.assign(state,details);
    selectedGraphicIndex=-1;
    syncFields();
    historyKind="";
    syncCardAndSave();
    showToast("Серия дополнена двумя карточками. Исходные материалы сохранены.");
    return true;
  }
  function applyProTemplateToAll(){
    if(!proAllowed())return false;
    const next=$("pro-series-template")?.value;
    if(!proTemplates.has(next))return false;
    if(!window.confirm("Применить дизайн "+next+" ко всем карточкам? Их заголовки, тексты, фото и порядок останутся прежними."))return false;
    snapshotCard();
    const theme=themeForTemplate[next];
    state.cards=state.cards.map(card=>sanitizeCard({...card,template:next,theme,accentColor:""}));
    Object.assign(state,state.cards[state.activeCard]);
    selectedGraphicIndex=-1;
    syncFields();
    historyKind="";
    syncCardAndSave();
    showToast("Дизайн всех карточек обновлён. При необходимости отмените изменение.");
    return true;
  }
  $("pro-series-generate")?.addEventListener("click",createProSeries);
  $("pro-series-apply")?.addEventListener("click",applyProTemplateToAll);
  $("add-card").addEventListener("click",()=>{
    if(state.cards.length>=MAX_CARDS)return;
    snapshotCard();
    const fresh=sanitizeCard({title:"Новая карточка",description:"Опишите следующую важную деталь.",points:"Ключевой факт\nПочему это важно\nЧто будет дальше",preset:state.preset,template:state.template});
    state.cards.push(fresh);
    activateCard(state.cards.length-1);
    showToast("Карточка добавлена. Заполни её текст.");
  });
  $("duplicate-card").addEventListener("click",()=>{
    if(state.cards.length>=MAX_CARDS)return;
    snapshotCard();
    state.cards.splice(state.activeCard+1,0,sanitizeCard(
      JSON.parse(JSON.stringify(state.cards[state.activeCard]))));
    activateCard(state.activeCard+1);
    showToast("Карточка продублирована.");
  });
  $("remove-card").addEventListener("click",()=>{
    if(state.cards.length<=1)return;
    if(!confirm("Удалить текущую карточку? Её можно восстановить кнопкой «Отменить»."))return;
    const index=state.activeCard;
    state.cards.splice(index,1);
    state.activeCard=Math.min(index,state.cards.length-1);
    selectedGraphicIndex=-1;
    Object.assign(state,state.cards[state.activeCard]);
    syncFields();persist();scheduleRender();
    showToast("Карточка удалена.");
  });
  $("heading-scale").addEventListener("input",e=>{
    historyKind="slider:heading";
    state.headingScale=Math.max(80,Math.min(120,Number(e.target.value)||100));
    $("heading-scale-value").textContent=state.headingScale+"%";syncCardAndSave();
  });
  $("accent-color").addEventListener("input",e=>{
    if(!/^#[0-9a-fA-F]{6}$/.test(e.target.value))return;
    historyKind="color:accent";
    state.accentColor=e.target.value;syncCardAndSave();
  });
  $("text-align").addEventListener("change",e=>{
    state.alignment=e.target.value==="center"?"center":"left";syncCardAndSave();
  });
  $("photo-opacity").addEventListener("input",e=>{
    historyKind="slider:photo";
    state.photoOpacity=Math.max(15,Math.min(85,Number(e.target.value)||35));
    $("photo-opacity-value").textContent=state.photoOpacity+"%";syncCardAndSave();
  });
  $("ornaments").addEventListener("change",e=>{state.decorations=e.target.checked;syncCardAndSave();});
  $("decoration-level").addEventListener("change",e=>{
    state.decorationLevel=decorLevels.has(e.target.value)?e.target.value:"subtle";syncCardAndSave();
  });
  $("text-spacing").addEventListener("change",e=>{
    state.textSpacing=textSpacings.has(e.target.value)?e.target.value:"balanced";syncCardAndSave();
  });
  $("composition").addEventListener("change",e=>{
    state.composition=compositions.has(e.target.value)?e.target.value:"classic";
    syncCardAndSave();
  });
  $("highlight-style").addEventListener("change",e=>{
    state.highlightStyle=highlightStyles.has(e.target.value)?e.target.value:"soft";
    syncCardAndSave();
  });
  $("featured-highlight").addEventListener("change",e=>{
    const value=Number(e.target.value);
    state.featuredHighlight=Number.isInteger(value)&&value>=-1&&value<=2?value:-1;
    syncCardAndSave();
  });
  document.querySelectorAll("[data-highlight-icon]").forEach(select=>{
    select.addEventListener("change",e=>{
      const index=Number(e.target.dataset.highlightIcon);
      if(!Number.isInteger(index)||index<0||index>2)return;
      state.highlightIcons=cleanIcons(state.highlightIcons);
      state.highlightIcons[index]=highlightIconKinds.has(e.target.value)?e.target.value:"dot";
      syncCardAndSave();
    });
  });
  $("title-font").addEventListener("change",e=>{
    state.titleFont=textFonts.has(e.target.value)?e.target.value:"auto";
    syncCardAndSave();
  });
  $("description-scale").addEventListener("input",e=>{
    historyKind="slider:description-scale";
    state.descriptionScale=Math.round(clamp(e.target.value,80,130,100));
    $("description-scale-value").textContent=state.descriptionScale+"%";
    syncCardAndSave();
  });
  const positionSliders=[
    ["title-offset-x","title","x"],["title-offset-y","title","y"],
    ["description-offset-x","description","x"],["description-offset-y","description","y"],
      ["highlights-offset-x","highlights","x"],["highlights-offset-y","highlights","y"],
      ["photo-offset-x","photo","x"],["photo-offset-y","photo","y"]
  ];
  for(const [id,layer,axis] of positionSliders){
    $(id).addEventListener("input",e=>{
      historyKind="slider:layer:"+id;
      state.layerOffsets=normalizeOffsets(state.layerOffsets);
      const value=Math.round(clamp(e.target.value,-30,30,0));
      state.layerOffsets[layer][axis]=value;
      $(id+"-value").textContent=(value>0?"+":"")+value+"%";
      syncCardAndSave();
    });
  }
  $("reset-layer-positions").addEventListener("click",()=>{
    state.layerOffsets=normalizeOffsets(null);
    syncFields();syncCardAndSave();
    showToast("Расположение текстовых блоков восстановлено.");
  });
  $("graphic-add").addEventListener("click",()=>{
    if(state.graphicElements.length>=Graphics.MAX)return;
    const next=Graphics.normalizeOne({
      id:"g-"+Date.now().toString(36)+"-"+state.graphicElements.length,
      kind:"spark",x:78,y:40,size:10,rotation:0,opacity:100,
      color:state.accentColor||themes[state.theme].accent
    },state.graphicElements.length);
    state.graphicElements=[...state.graphicElements,next];
    selectedGraphicIndex=state.graphicElements.length-1;
    renderGraphicControls();
    syncCardAndSave();
    showToast("Графический элемент добавлен.");
  });
  $("graphic-remove").addEventListener("click",()=>{
    if(selectedGraphicIndex<0 || selectedGraphicIndex>=state.graphicElements.length)return;
    state.graphicElements=state.graphicElements.filter((_,i)=>i!==selectedGraphicIndex);
    state.lockedLayers=normalizeLocks(state.lockedLayers,state.graphicElements);
    selectedGraphicIndex=Math.min(selectedGraphicIndex,state.graphicElements.length-1);
    renderGraphicControls();
    syncCardAndSave();
    showToast("Элемент удалён. Отменить удаление можно кнопкой «Отменить».");
  });
  for(const key of ["kind","x","y","size","rotation","opacity","color"]){
    const id="graphic-"+key;
    const input=$(id);
    input.addEventListener(key==="kind"?"change":"input",e=>{
      if(selectedGraphicIndex<0||selectedGraphicIndex>=state.graphicElements.length)return;
      const old=state.graphicElements[selectedGraphicIndex];
      historyKind=key==="kind"?"":"graphic:"+old.id+":"+key;
      const value=["kind","color"].includes(key)?e.target.value:Number(e.target.value);
      const updated=Graphics.normalizeOne({...old,[key]:value},selectedGraphicIndex);
      state.graphicElements=state.graphicElements.map((item,i)=>i===selectedGraphicIndex?updated:item);
      renderGraphicControls();
      syncCardAndSave();
    });
  }
  $("reset").addEventListener("click",()=>{
    const keep=window.confirm("Начать заново? Текущий текст, оформление и загруженное фото будут удалены из этого браузера.");
    if(!keep)return;
    Object.assign(state,{...defaults,cards:[],activeCard:0});
    state.cards=[sanitizeCard({title:state.title,description:state.description,points:state.points,preset:state.preset,template:state.template})];
    photo=null;$("upload").value="";
    syncFields();window.dispatchEvent(new Event("anons:editor-reset"));persist();resetHistory();scheduleRender();showToast("Создан новый чистый проект.");
  });
  $("upload").addEventListener("change",async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){showToast("Выберите PNG, JPG или WebP.");return;}
    if(file.size>10*1024*1024){showToast("Файл слишком большой. Максимум 10 МБ.");return;}
    try{
      const image=await createImageBitmap(file);
      let encoded="";
      try {
        // Paid server exports reject data URLs >= 600,000 characters. Compress
        // uploaded photos before saving them so a project remains exportable.
        if(image.width*image.height>24000000)throw new Error("IMAGE_DIMENSIONS_TOO_LARGE");
        const steps=[[1400,.76],[1200,.68],[1000,.60],[850,.50],[700,.42]];
        for(const [longest,quality] of steps){
          const scale=Math.min(1,longest/Math.max(image.width,image.height));
          const temp=document.createElement("canvas");
          temp.width=Math.max(1,Math.round(image.width*scale));
          temp.height=Math.max(1,Math.round(image.height*scale));
          const pen=temp.getContext("2d");
          if(!pen)throw new Error("PHOTO_CANVAS_UNAVAILABLE");
          pen.drawImage(image,0,0,temp.width,temp.height);
          encoded=temp.toDataURL("image/jpeg",quality);
          if(encoded.length<=560000)break;
        }
        if(!encoded||encoded.length>=600000)throw new Error("PHOTO_EXPORT_LIMIT");
      } finally {
        image.close?.();
      }
      state.imageData=encoded;
      loadPhoto(state.imageData);persist();syncFields();
      showToast("Фото подготовлено для сохранения и экспорта.");
    }catch(err){
      console.warn("Photo import failed",err?.message||"image");
      showToast(err?.message==="IMAGE_DIMENSIONS_TOO_LARGE"?"Слишком большое разрешение фото. Выберите изображение до 24 млн пикселей.":err?.message==="PHOTO_EXPORT_LIMIT"?"Не удалось уменьшить фотографию до лимита экспорта. Попробуйте другое изображение.":"Не удалось прочитать изображение.");
    }
  });
  $("clear-image").addEventListener("click",()=>{
    state.imageData="";photo=null;$("upload").value="";syncFields();persist();scheduleRender();showToast("Фото удалено.");
  });
  async function localWatermarkedPng(){
    if(!canvas.toBlob)throw new Error("NO_CANVAS_EXPORT");
    render();
    return await new Promise((resolve,reject)=>{
      canvas.toBlob(b=>b?resolve(b):reject(new Error("PNG_EXPORT_FAILED")),"image/png");
    });
  }
  $("export").addEventListener("click",async()=>{
    const button=$("export");
    if(button.disabled)return;
    button.disabled=true;
    try {
      const blob=paidAccess.premium
        ? await window.AnonsBilling?.exportPremium(getSnapshot(),state.activeCard)
        : await localWatermarkedPng();
      if(!blob)throw new Error("PREMIUM_EXPORT_UNAVAILABLE");
      triggerDownload(blob,"anons-studio-"+(state.activeCard+1)+"-"+state.preset+"-"+state.ratio+".png");
      showToast(paidAccess.premium?"Премиальный PNG получен с сервера.":"Бесплатный PNG скачан с водяным знаком.");
    }catch(e){
      console.warn("Export denied or failed",e?.message);
      showToast(e?.message==="IMAGE_TOO_LARGE"
        ?"Фото слишком большое для серверного экспорта. Попробуй уменьшить его размер."
        :"Не удалось скачать PNG. Проверь подписку и подключение или попробуй ещё раз.");
    }finally{button.disabled=false;}
  });
  function crc32(bytes) {
    let crc=0xffffffff;
    for(const value of bytes) {
      crc^=value;
      for(let bit=0;bit<8;bit++) crc=(crc>>>1)^((crc&1)?0xedb88320:0);
    }
    return (crc^0xffffffff)>>>0;
  }
  async function packZip(files) {
    // Standards-compliant uncompressed ZIP; PNG images are already compressed.
    const encoder=new TextEncoder();
    const local=[],central=[];
    let position=0;
    for(const file of files) {
      const name=encoder.encode(file.name);
      const data=new Uint8Array(await file.blob.arrayBuffer());
      const crc=crc32(data);
      const lh=new Uint8Array(30+name.length);
      let v=new DataView(lh.buffer);
      v.setUint32(0,0x04034b50,true);
      v.setUint16(4,20,true);
      v.setUint16(6,0x0800,true);
      v.setUint16(8,0,true);
      v.setUint32(14,crc,true);
      v.setUint32(18,data.length,true);
      v.setUint32(22,data.length,true);
      v.setUint16(26,name.length,true);
      lh.set(name,30);
      local.push(lh,data);
      const ch=new Uint8Array(46+name.length);
      v=new DataView(ch.buffer);
      v.setUint32(0,0x02014b50,true);
      v.setUint16(4,20,true);
      v.setUint16(6,20,true);
      v.setUint16(8,0x0800,true);
      v.setUint16(10,0,true);
      v.setUint32(16,crc,true);
      v.setUint32(20,data.length,true);
      v.setUint32(24,data.length,true);
      v.setUint16(28,name.length,true);
      v.setUint32(42,position,true);
      ch.set(name,46);
      central.push(ch);
      position+=lh.length+data.length;
    }
    const centralSize=central.reduce((sum,part)=>sum+part.length,0);
    const end=new Uint8Array(22);
    const v=new DataView(end.buffer);
    v.setUint32(0,0x06054b50,true);
    v.setUint16(8,files.length,true);
    v.setUint16(10,files.length,true);
    v.setUint32(12,centralSize,true);
    v.setUint32(16,position,true);
    return new Blob([...local,...central,end],{type:"application/zip"});
  }
  function triggerDownload(blob,name) {
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");a.href=url;a.download=name;
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  $("export-all").addEventListener("click",async()=>{
    const btn=$("export-all");
    if(btn.disabled)return;
    const idleButtonMarkup=btn.innerHTML;
    snapshotCard();
    const oldIndex=state.activeCard;
    btn.disabled=true;btn.textContent="Готовим ZIP…";
    const output=[];
    try{
      for(let i=0;i<state.cards.length;i++){
        state.activeCard=i;
        Object.assign(state,state.cards[i]);
        const blob=paidAccess.premium
          ? await window.AnonsBilling?.exportPremium(getSnapshot(),i)
          : await localWatermarkedPng();
        if(!blob)throw new Error("PREMIUM_EXPORT_UNAVAILABLE");
        output.push({name:"anons-card-"+String(i+1).padStart(2,"0")+".png",blob});
      }
      const zip=await packZip(output);
      triggerDownload(zip,"anons-studio-"+state.cards.length+"-cards.zip");
      showToast("ZIP с "+output.length+" карточками подготовлен.");
    }catch(err){
      console.error("ZIP export failed",err);
      showToast("Не удалось создать ZIP. Можно скачать карточки по одной.");
    }finally{
      state.activeCard=oldIndex;
      Object.assign(state,state.cards[oldIndex]);
      syncFields();render();
      btn.disabled=false;btn.innerHTML=idleButtonMarkup;
    }
  });
  $("copy").addEventListener("click",async()=>{
    const points=state.points.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).slice(0,3);
    const text=[state.title.trim(),state.description.trim(),points.length?"\n"+points.map(p=>"• "+p).join("\n"):""].filter(Boolean).join("\n\n");
    try{
      if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);
      else{const temp=document.createElement("textarea");temp.value=text;temp.style.position="fixed";temp.style.opacity="0";document.body.appendChild(temp);temp.select();if(!document.execCommand("copy"))throw new Error("clipboard unavailable");temp.remove();}
      showToast("Текст публикации скопирован.");
    }catch(_){showToast("Не удалось скопировать текст — выделите его в полях редактора.");}
  });

  window.addEventListener("anons:access", event => {
    const access=event.detail || {};
    paidAccess.plan=["basic","pro","studio"].includes(access.plan)?access.plan:"free";
    paidAccess.premium=access.premium===true && paidAccess.plan!=="free";
    const caption=document.querySelector(".preview-caption");
    if(caption) caption.textContent=paidAccess.premium
      ? "Активный тариф "+paidAccess.plan.toUpperCase()+" · Предпросмотр с водяным знаком, серверный экспорт без него"
      : "Free · Водяной знак в предпросмотре и PNG · Снять по подписке";
    scheduleRender();
  });

  function getSnapshot() {
    snapshotCard();
    const copy={
      schemaVersion:4,project:state.project,ratio:state.ratio,
      theme:state.theme,template:state.template,
      activeCard:state.activeCard,
      cards:state.cards.map(card=>({...card,layerOffsets:normalizeOffsets(card.layerOffsets),
        graphicElements:Graphics.normalizeElements(card.graphicElements),
        highlightIcons:cleanIcons(card.highlightIcons),
        lockedLayers:normalizeLocks(card.lockedLayers,card.graphicElements),
        layers:cleanLayerVisibility(card.layers),
        layerOrder:cleanLayerOrder(card.layerOrder)})),
      imageData:state.imageData,
      accentColor:state.accentColor,alignment:state.alignment,
      headingScale:state.headingScale,photoOpacity:state.photoOpacity,
      decorations:state.decorations
    };
    return copy;
  }
  function loadSnapshot(raw, preserveHistory=false) {
    if(!raw||typeof raw!=="object"||!Array.isArray(raw.cards)||!raw.cards.length||raw.cards.length>MAX_CARDS)throw new Error("INVALID_SNAPSHOT");
    const nextCards=raw.cards.map(sanitizeCard);
    const data=(typeof raw.imageData==="string" && raw.imageData.length<900000 &&
      /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(raw.imageData))?raw.imageData:"";
    suppressEditorSignal=true;
    try{
      state.project=typeof raw.project==="string"?raw.project.slice(0,45):"МОЙ ПРОЕКТ";
      state.ratio=sizes[raw.ratio]?raw.ratio:"portrait";
      state.cards=nextCards;
      state.activeCard=Number.isInteger(raw.activeCard)?Math.max(0,Math.min(nextCards.length-1,raw.activeCard)):0;
      selectedGraphicIndex=-1;
      Object.assign(state,nextCards[state.activeCard]);
      state.imageData=data;
      photo=null;
      $("upload").value="";
      syncFields();
      persist();
      scheduleRender();
      if(data)loadPhoto(data);
    } finally {
      suppressEditorSignal=false;
      if(!preserveHistory)resetHistory();
    }
  }
  function newDraft() {
    suppressEditorSignal=true;
    try{
      Object.assign(state,{...defaults,cards:[],activeCard:0});
      state.cards=[sanitizeCard({...presets.update,template:"aurora",theme:"ultraviolet"})];
      Object.assign(state,state.cards[0]);
      photo=null;$("upload").value="";
      syncFields();persist();scheduleRender();
    } finally {
      suppressEditorSignal=false;
      resetHistory();
    }
  }
  // Interactive editing geometry is derived from the exact scene used to
  // draw the poster. Selection handles are HTML only, never printed into PNG.
  function getDirectTargets(){
    const scene=window.AnonsScene.layout({ratio:state.ratio,project:state.project},state);
    const W=scene.width,H=scene.height;
    const offsets=scene.offsets;
    const locked=new Set(state.lockedLayers);
    const titleSpec=window.AnonsScene.titleLines(state.title.trim()||"Заголовок публикации",scene);
    const titleLines=titleSpec.lines.length||1;
    const descSize=scene.descriptionSize;
    const descLines=window.AnonsScene.breakLines(
      state.description.trim()||"Расскажите коротко, что произошло и почему это важно.",
      scene.contentWidth-(H<=1100?10:80),descSize,3);
    const bestWidth=(lines,size)=>Math.min(scene.contentWidth,
      Math.max(size*2,...lines.map(line=>window.AnonsScene.textWidth(line,size)))+24);
    const titleWidth=bestWidth(titleSpec.lines,titleSpec.size);
    const descWidth=bestWidth(descLines,descSize);
    const x=(size,offset)=>(
      scene.center?(W-size)/2:scene.margin
    )+offset.x*W/100;
    const list=state.points.split(/\r?\n/).map(p=>p.trim()).filter(Boolean).slice(0,3);
    const h=window.AnonsScene.highlightGeometry(scene,list.length||2);
    const items=[
      {key:"title",label:"Заголовок",type:"text",
        rect:{x:x(titleWidth,offsets.title),
          y:scene.titleY+offsets.title.y*H/100,w:titleWidth,
          h:titleSpec.size*titleLines*1.14}},
      {key:"description",label:"Описание",type:"text",
        rect:{x:x(descWidth,offsets.description),
          y:window.AnonsScene.descriptionTop(scene,titleSpec)+offsets.description.y*H/100,
          w:descWidth,h:descSize*1.55*Math.max(1,descLines.length)}},
      {key:"highlights",label:"Ключевые изменения",type:"text",
        rect:{x:scene.margin+offsets.highlights.x*W/100,
          y:h.top+offsets.highlights.y*H/100,w:h.width,h:h.height}}
    ];
    items.push({key:"brand",label:"Название проекта",type:"text",
      rect:{x:scene.margin+scene.offsets.brand.x*W/100,
        y:72+scene.offsets.brand.y*H/100,w:scene.contentWidth*.52,h:60}});
    if(state.imageData){
      items.push({key:"photo",label:"Загруженное изображение",type:"photo",
        rect:{x:scene.photo.x+offsets.photo.x*W/100,
          y:scene.photo.y+offsets.photo.y*H/100,
          w:scene.photo.width,h:scene.photo.height}});
    }
    for(const graphic of Graphics.normalizeElements(state.graphicElements)){
      if(graphic.hidden)continue;
      const frame=Graphics.frame(graphic,W,H);
      const side=Math.max(frame.size,34);
      items.push({key:"graphic:"+graphic.id,label:(graphic.label||Graphics.labels[graphic.kind])+" · "+graphic.id,
        type:"graphic",size:graphic.size,rotation:graphic.rotation,
        rect:{x:frame.x-side/2,y:frame.y-side/2,w:side,h:side}});
    }
    for(const item of items)item.locked=locked.has(item.key);
    return {width:W,height:H,items:items.filter(item=>
      item.type==="graphic"||scene.enabled[item.key]!==false)};
  }
  function transformDirect(key,changes,group=""){
    if(typeof key!=="string"||!changes||typeof changes!=="object")return false;
    const target=getDirectTargets().items.find(item=>item.key===key);
    if(!target||target.locked)return false;
    let changed=false;
    if(target.type==="graphic"){
      const id=key.slice(8),index=state.graphicElements.findIndex(item=>item.id===id);
      if(index<0)return false;
      const previous=state.graphicElements[index];
      const patch={};
      for(const property of ["x","y","size","rotation"]){
        if(Object.hasOwn(changes,property))patch[property]=changes[property];
      }
      const next=Graphics.normalizeOne({...previous,...patch},index);
      changed=Object.keys(patch).some(prop=>next[prop]!==previous[prop]);
      if(changed){
        const dx=next.x-previous.x,dy=next.y-previous.y;
        // Grouping is non-destructive: members retain their individual
        // coordinates, but moving one shifts its unlocked group peers.
        state.graphicElements=state.graphicElements.map((graphic,i)=>{
          if(i===index)return next;
          if(!previous.groupId||graphic.groupId!==previous.groupId||
            state.lockedLayers.includes("graphic:"+graphic.id))return graphic;
          if(!dx&&!dy)return graphic;
          return Graphics.normalizeOne({...graphic,x:graphic.x+dx,y:graphic.y+dy},i);
        });
        selectedGraphicIndex=index;
        renderGraphicControls();
      }
    }else{
      const old=normalizeOffsets(state.layerOffsets),newPosition={...old[key]};
      for(const axis of ["x","y"]){
        if(Object.hasOwn(changes,axis)){
          newPosition[axis]=Math.round(clamp(changes[axis],-30,30,0)*10)/10;
        }
      }
      changed=newPosition.x!==old[key].x||newPosition.y!==old[key].y;
      if(changed){
        state.layerOffsets={...old,[key]:newPosition};
        for(const axis of ["x","y"]){
          const node=$(key+"-offset-"+axis);
          if(node){
            node.value=newPosition[axis];
            $(node.id+"-value").textContent=(newPosition[axis]>0?"+":"")+newPosition[axis]+"%";
          }
        }
      }
    }
    if(!changed)return false;
    historyKind="direct:"+key+":"+group;
    syncCardAndSave();
    return true;
  }
  function toggleDirectLock(key){
    const target=getDirectTargets().items.find(item=>item.key===key);
    if(!target)return false;
    const old=new Set(state.lockedLayers);
    if(old.has(key))old.delete(key);else old.add(key);
    state.lockedLayers=normalizeLocks([...old],state.graphicElements);
    historyKind="";
    syncCardAndSave();
    return state.lockedLayers.includes(key);
  }
  const baseLayerLabels={
    decoration:"Фоновые элементы",photo:"Загруженное фото",brand:"Название проекта",
    title:"Заголовок",description:"Описание",highlights:"Ключевые изменения"
  };
  function getLayerPanel(){
    snapshotCard();
    const order=cleanLayerOrder(state.layerOrder);
    const base=order.map(key=>({
      key,label:baseLayerLabels[key],type:"base",
      visible:state.layers[key]!==false,
      locked:state.lockedLayers.includes(key),
      movable:key!=="decoration",
      position:order.indexOf(key)
    }));
    const figures=Graphics.normalizeElements(state.graphicElements).map((graphic,index)=>({
      key:"graphic:"+graphic.id,
      label:graphic.label||Graphics.labels[graphic.kind],
      type:"graphic",visible:!graphic.hidden,
      locked:state.lockedLayers.includes("graphic:"+graphic.id),
      movable:true,index,groupId:graphic.groupId||""
    }));
    return {base,figures,limit:Graphics.MAX,cardIndex:state.activeCard};
  }
  function toggleLayerLock(key){
    const known=getLayerPanel();
    const item=[...known.base,...known.figures].find(row=>row.key===key);
    if(!item||key==="decoration")return false;
    const locks=new Set(state.lockedLayers);
    if(locks.has(key))locks.delete(key);else locks.add(key);
    state.lockedLayers=normalizeLocks([...locks],state.graphicElements);
    historyKind="";
    syncCardAndSave();
    return state.lockedLayers.includes(key);
  }
  function changeLayerVisibility(key,visible){
    if(typeof visible!=="boolean")return false;
    if(baseLayerNames.includes(key)){
      if(state.layers[key]===visible)return false;
      state.layers={...cleanLayerVisibility(state.layers),[key]:visible};
    }else if(typeof key==="string"&&key.startsWith("graphic:")){
      const index=state.graphicElements.findIndex(graphic=>graphic.id===key.slice(8));
      if(index<0)return false;
      if(state.graphicElements[index].hidden===!visible)return false;
      state.graphicElements=state.graphicElements.map((item,i)=>
        i===index?Graphics.normalizeOne({...item,hidden:!visible},i):item);
    }else return false;
    historyKind="";
    syncCardAndSave();
    return true;
  }
  function moveLayer(key,delta){
    if(delta!==1&&delta!==-1)return false;
    if(movableLayers.includes(key)){
      const order=cleanLayerOrder(state.layerOrder);
      const pos=order.indexOf(key),dest=pos+delta;
      if(dest<1||dest>=order.length)return false;
      [order[pos],order[dest]]=[order[dest],order[pos]];
      state.layerOrder=cleanLayerOrder(order);
    }else if(typeof key==="string"&&key.startsWith("graphic:")){
      const index=state.graphicElements.findIndex(g=>g.id===key.slice(8));
      const dest=index+delta;
      if(index<0||dest<0||dest>=state.graphicElements.length)return false;
      const figures=[...state.graphicElements];
      [figures[index],figures[dest]]=[figures[dest],figures[index]];
      state.graphicElements=Graphics.normalizeElements(figures);
      selectedGraphicIndex=dest;
      renderGraphicControls();
    }else return false;
    historyKind="";
    syncCardAndSave();
    return true;
  }
  function duplicateGraphicLayer(key){
    const index=typeof key==="string"&&key.startsWith("graphic:")
      ?state.graphicElements.findIndex(g=>g.id===key.slice(8)):-1;
    if(index<0||state.graphicElements.length>=Graphics.MAX)return "";
    const source=state.graphicElements[index];
    let id="g-copy-"+Date.now().toString(36)+"-"+state.graphicElements.length;
    if(state.graphicElements.some(g=>g.id===id))id="g-copy-"+Date.now().toString(36)+"-"+(index+1);
    const newGraphic=Graphics.normalizeOne({...source,id,
      x:Math.min(100,source.x+5),y:Math.min(100,source.y+5),
      hidden:false,label:source.label?source.label.slice(0,41)+" копия":""},index+1);
    const figures=[...state.graphicElements];
    figures.splice(index+1,0,newGraphic);
    state.graphicElements=Graphics.normalizeElements(figures);
    selectedGraphicIndex=index+1;
    renderGraphicControls();
    historyKind="";
    syncCardAndSave();
    return "graphic:"+newGraphic.id;
  }
  function renameGraphicLayer(key,label){
    if(typeof label!=="string")return false;
    const index=typeof key==="string"&&key.startsWith("graphic:")
      ?state.graphicElements.findIndex(g=>g.id===key.slice(8)):-1;
    if(index<0)return false;
    const next=label.trim().slice(0,48);
    if(state.graphicElements[index].label===next)return false;
    state.graphicElements=state.graphicElements.map((g,i)=>i===index
      ?Graphics.normalizeOne({...g,label:next},i):g);
    historyKind="";
    syncCardAndSave();
    return true;
  }
  function groupGraphicLayers(keys){
    if(!Array.isArray(keys)||keys.length<2)return "";
    const ids=[...new Set(keys.filter(k=>typeof k==="string"&&k.startsWith("graphic:")
      ).map(k=>k.slice(8)))];
    const present=new Set(state.graphicElements.map(g=>g.id));
    if(ids.length<2||ids.some(id=>!present.has(id)))return "";
    const groupId="group-"+Date.now().toString(36);
    state.graphicElements=state.graphicElements.map((g,i)=>ids.includes(g.id)
      ?Graphics.normalizeOne({...g,groupId},i):g);
    historyKind="";
    syncCardAndSave();
    return groupId;
  }
  function ungroupGraphicLayer(key){
    const item=typeof key==="string"&&key.startsWith("graphic:")
      ?state.graphicElements.find(g=>g.id===key.slice(8)):null;
    if(!item?.groupId)return false;
    state.graphicElements=state.graphicElements.map((g,i)=>g.groupId===item.groupId
      ?Graphics.normalizeOne({...g,groupId:""},i):g);
    historyKind="";
    syncCardAndSave();
    return true;
  }
  // Personal styles contain only visual settings of the active card.
  // They never include project text, the uploaded photo, plan status, or other cards.
  const personalStyleKeys=[
    "template","theme","accentColor","alignment","headingScale","decorations",
    "photoOpacity","titleFont","descriptionScale","layerOffsets","graphicElements",
    "decorationLevel","textSpacing","composition","highlightStyle","highlightIcons",
    "featuredHighlight","lockedLayers","layers","layerOrder"
  ];
  function getStyleSnapshot(){
    snapshotCard();
    return JSON.parse(JSON.stringify(Object.fromEntries(personalStyleKeys.map(k=>[k,state[k]]))));
  }
  function applyStyleSnapshot(raw){
    if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;
    // Guard against unexpectedly large/corrupt browser data before sanitizing graphics.
    let payload;
    try{
      const serialized=JSON.stringify(raw);
      if(!serialized||serialized.length>32000)return false;
      payload=JSON.parse(serialized);
    }catch{return false;}
    const patch={};
    for(const key of personalStyleKeys){
      if(Object.hasOwn(payload,key))patch[key]=payload[key];
    }
    if(!Object.keys(patch).length)return false;
    if(patch.template&&!canUseTemplate(patch.template))return false;
    const cleaned=sanitizeCard({...state,...patch});
    selectedGraphicIndex=-1;
    for(const key of personalStyleKeys)state[key]=cleaned[key];
    syncFields();
    historyKind="";
    syncCardAndSave(); // preserves existing content/photo and records an undo step.
    return true;
  }
  // Brand kits change the shared brand label and only the named visual fields.
  // Publication copy, photos, templates, dimensions, layers and billing are untouched.
  function getBrandKitSnapshot(){
    snapshotCard();
    return Object.freeze({
      project:state.project.trim()||"МОЙ ПРОЕКТ",
      theme:state.theme,
      accentColor:state.accentColor||themes[state.theme].accent,
      titleFont:state.titleFont
    });
  }
  function applyBrandKitSnapshot(raw,scope="active"){
    if(!raw||typeof raw!=="object"||Array.isArray(raw)
      ||!["active","all"].includes(scope))return false;
    const allowed=["project","theme","accentColor","titleFont"];
    if(Object.keys(raw).some(key=>!allowed.includes(key)))return false;
    const brand=typeof raw.project==="string"?raw.project.trim():"";
    if(!brand||brand.length>limits.project
      ||/[\u0000-\u001f\u007f]/.test(brand)
      ||!themes[raw.theme]
      ||!/^#[0-9a-fA-F]{6}$/.test(raw.accentColor)
      ||!textFonts.has(raw.titleFont))return false;
    snapshotCard();
    const patch={theme:raw.theme,accentColor:raw.accentColor,titleFont:raw.titleFont};
    state.project=brand;
    if(scope==="all"){
      state.cards=state.cards.map(card=>sanitizeCard({...card,...patch}));
      Object.assign(state,state.cards[state.activeCard]);
    }else{
      Object.assign(state,patch);
    }
    selectedGraphicIndex=-1;
    syncFields();
    historyKind="";
    syncCardAndSave(); // Single undo checkpoint for every affected card.
    return true;
  }
  // The menu is cosmetic: server-side paid export independently re-checks
  // active verified membership and NEVER trusts the value of currentPlan.
  window.addEventListener("anons:access",event=>{
    currentPlan=event.detail?.premium===true&&["basic","pro","studio"].includes(event.detail?.plan)
      ?event.detail.plan:"free";
    document.querySelectorAll("#template-select option").forEach(option=>{
      if(businessTemplates.has(option.value))option.disabled=!businessAllowed();
      if(proTemplates.has(option.value))option.disabled=!proAllowed();
    });
    const selection=document.getElementById("template-select");
    if(selection)selection.title=proAllowed()?"Все шаблоны доступны":
      businessAllowed()?"Дополнительные композиции «Про» доступны в старших тарифах":
      "Платные шаблоны открываются при действующей подписке";
    for(const id of ["pro-series-generate","pro-series-apply","pro-series-template"]){
      const control=$(id);
      if(control)control.disabled=!proAllowed();
    }
    const notice=$("pro-series-status");
    if(notice)notice.textContent=proAllowed()
      ?"Подписка подтверждена. Создавайте серии карточек и меняйте их дизайн вместе."
      :"Доступно по активной подписке «Про» или «Студия».";
    if(pendingPremiumTemplate&&canUseTemplate(pendingPremiumTemplate)){
      const selected=pendingPremiumTemplate;
      pendingPremiumTemplate=null;
      changeTemplate(selected);
    }
  });
  document.querySelectorAll("#template-select option").forEach(option=>{
    if(businessTemplates.has(option.value)||proTemplates.has(option.value))option.disabled=true;
  });
  window.AnonsEditor=Object.freeze({
    getSnapshot,
    getBrandKitSnapshot,
    applyBrandKitSnapshot,
    getStyleSnapshot,
    applyStyleSnapshot,
    loadSnapshot,
    newDraft,
    getDirectTargets,
    transformDirect,
    toggleDirectLock,
    getLayerPanel,
    changeLayerVisibility,
    toggleLayerLock,
    moveLayer,
    duplicateGraphicLayer,
    renameGraphicLayer,
    groupGraphicLayers,
    ungroupGraphicLayer,
    getSuggestedName:()=> {
      snapshotCard();
      return (state.cards[0]?.title||"Новый анонс").trim().slice(0,100)||"Новый анонс";
    }
  });
  // The gallery passes a single selected template to the editor. Apply it
  // without discarding the existing draft, then remove the one-time URL
  // parameter so refreshing does not overwrite later customization.
  const editorUrl=new URL(window.location.href);
  const requestedTemplate=editorUrl.searchParams.get("template");
  if(requestedTemplate && templates.has(requestedTemplate)){
    if(canUseTemplate(requestedTemplate))changeTemplate(requestedTemplate);
    else if(businessTemplates.has(requestedTemplate)||proTemplates.has(requestedTemplate)){
      pendingPremiumTemplate=requestedTemplate;
    }
    editorUrl.searchParams.delete("template");
  }
  // Homepage examples can initialize an untouched editor, but must never
  // replace a local draft or an active cloud project without user action.
  const requestedPreset=editorUrl.searchParams.get("preset");
  if(requestedPreset && presets[requestedPreset]){
    let activeCloudDraft=false;
    try{activeCloudDraft=Boolean(localStorage.getItem("anons-studio:cloud-active-v05"));}catch{}
    const hasExistingDraft=Object.keys(saved).length>0 || activeCloudDraft;
    if(!hasExistingDraft){
      const example=presets[requestedPreset];
      state.preset=requestedPreset;
      for(const key of ["project","title","description","points"])state[key]=example[key];
      state.cards=[sanitizeCard({...state.cards[0],...example,preset:requestedPreset})];
      state.activeCard=0;
      Object.assign(state,state.cards[0]);
      persist();
      showToast("Пример публикации загружен. Измените текст и оформление под свой проект.");
    }else{
      const selected=document.querySelector('[data-preset="'+requestedPreset+'"]');
      selected?.classList.add("preset-suggested");
      showToast("Существующий черновик не изменён. Тип публикации можно выбрать в настройках редактора.");
      window.setTimeout(()=>selected?.classList.remove("preset-suggested"),10000);
    }
    editorUrl.searchParams.delete("preset");
  }
  if(editorUrl.href!==window.location.href){
    window.history.replaceState(null,"",editorUrl.pathname+editorUrl.search+editorUrl.hash);
  }
  syncFields();resetHistory();render();if(state.imageData)loadPhoto(state.imageData);
  if(document.fonts?.ready)document.fonts.ready.then(scheduleRender).catch(()=>{});
})();
