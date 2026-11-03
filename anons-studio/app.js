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
  const templates = new Set(["aurora","editorial","spotlight","pulse","minimal","bulletin"]);
  const MAX_CARDS=8;
  const layerNames=["brand","title","description","highlights","photo","decoration"];
  const defaultLayers=Object.freeze(Object.fromEntries(layerNames.map(name=>[name,true])));
  const cardKeys=["title","description","points","preset","template","theme","accentColor","alignment","headingScale","decorations","photoOpacity","layers","titleShift","descriptionShift"];
  const limits={project:45,title:85,description:210,points:240};
  const defaults = { preset: "update", theme: "ultraviolet", ratio: "portrait", ...presets.update, imageData: "",
    template:"aurora", headingScale:100, accentColor:"", alignment:"left", decorations:true, photoOpacity:35,
    layers:{...defaultLayers},titleShift:0,descriptionShift:0,activeCard:0,cards:[] };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {}; } catch (_) {}
  const state = { ...defaults };
  for (const key of ["preset", "theme", "ratio", "project", "title", "description", "points", "imageData","template","accentColor","alignment"]) {
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
    const oldLayers=original.layers && typeof original.layers==="object" && !Array.isArray(original.layers)?original.layers:defaultLayers;
    out.layers=Object.fromEntries(layerNames.map(name=>[name,oldLayers[name]!==false]));
    out.titleShift=Number.isFinite(original.titleShift)?Math.round(Math.max(-12,Math.min(12,original.titleShift))):0;
    out.descriptionShift=Number.isFinite(original.descriptionShift)?Math.round(Math.max(-12,Math.min(12,original.descriptionShift))):0;
    return out;
  };
  // Migration: keep a previously saved single-card project when upgrading v0.2.
  const firstCard=sanitizeCard({title:state.title,description:state.description,points:state.points,preset:state.preset,template:state.template});
  state.cards=Array.isArray(saved.cards)&&saved.cards.length ? saved.cards.slice(0,MAX_CARDS).map(sanitizeCard):[firstCard];
  state.activeCard=Number.isInteger(saved.activeCard)?Math.min(Math.max(0,saved.activeCard),state.cards.length-1):0;
  Object.assign(state,state.cards[state.activeCard]);
  let photo = null;
  const paidAccess = { premium: false, plan: "free" };
  let toastTimer = null;
  let pendingRender = false;
  let suppressEditorSignal = false;
  const brandKitKey="anons-studio:brand-kit-v1";
  const undoFrames=[],redoFrames=[];
  const HISTORY_LIMIT=20;
  let historyReplaying=false,lastHistorySource="",lastHistoryAt=0;
  let historyPresent=JSON.stringify(getSnapshot());
  function updateHistoryButtons(){
    $("editor-undo").disabled=undoFrames.length===0;
    $("editor-redo").disabled=redoFrames.length===0;
  }
  function replayHistory(direction){
    const source=direction==="undo"?undoFrames:redoFrames;
    const destination=direction==="undo"?redoFrames:undoFrames;
    if(!source.length)return;
    const frame=source.pop();
    destination.push(JSON.stringify(getSnapshot()));
    if(destination.length>HISTORY_LIMIT)destination.shift();
    historyReplaying=true;
    try {loadSnapshot(JSON.parse(frame));}
    finally{historyReplaying=false;historyPresent=JSON.stringify(getSnapshot());lastHistorySource="";lastHistoryAt=0;}
    updateHistoryButtons();
    window.dispatchEvent(new Event("anons:editor-change"));
    showToast(direction==="undo"?"Последнее действие отменено.":"Действие повторено.");
  }

  function snapshotCard() {
    const card=state.cards[state.activeCard];
    for(const k of cardKeys) card[k]=state[k];
  }
  function activateCard(index) {
    if(!Number.isInteger(index)||index<0||index>=state.cards.length)return;
    snapshotCard();
    state.activeCard=index;
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
    document.querySelectorAll("[data-layer]").forEach(input=>{input.checked=state.layers[input.dataset.layer]!==false;});
    $("title-shift").value=state.titleShift;
    $("title-shift-value").textContent=(state.titleShift>0?"+":"")+state.titleShift+"%";
    $("description-shift").value=state.descriptionShift;
    $("description-shift-value").textContent=(state.descriptionShift>0?"+":"")+state.descriptionShift+"%";
    renderCardTabs();
    $("clear-image").hidden = !state.imageData;
    $("image-name").textContent = state.imageData ? "Фото добавлено" : "PNG, JPG или WebP";
  }

  function persist() {
    const updated=JSON.stringify(getSnapshot());
    if(suppressEditorSignal){
      if(!historyReplaying){undoFrames.length=0;redoFrames.length=0;}
      historyPresent=updated;lastHistorySource="";lastHistoryAt=0;
    }else if(!historyReplaying && updated!==historyPresent){
      const active=document.activeElement;
      const group=(active&&(active.tagName==="TEXTAREA"||active.type==="range"||active.type==="text"))?active.id:"";
      const now=Date.now();
      if(!group||group!==lastHistorySource||now-lastHistoryAt>650||!undoFrames.length){
        undoFrames.push(historyPresent);
        if(undoFrames.length>HISTORY_LIMIT)undoFrames.shift();
      }
      redoFrames.length=0;
      historyPresent=updated;lastHistorySource=group;lastHistoryAt=now;
    }
    updateHistoryButtons();
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {
      showToast("Не удалось сохранить проект в браузере. Экспорт остаётся доступен.");
    }
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
  function fitLines(text, maxWidth, fontSize, maxLines = 5) {
    const words = (text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) return [];
    let lines = []; let line = "";
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (ctx.measureText(candidate).width > maxWidth && line) { lines.push(line); line = word; }
      else line = candidate;
    }
    if (line) lines.push(line);
    // Split a single very long word to guarantee every line stays within the canvas.
    lines = lines.flatMap((l) => {
      if (ctx.measureText(l).width <= maxWidth) return [l];
      const chunks = []; let cur = "";
      for (const ch of Array.from(l)) {
        if (ctx.measureText(cur + ch).width > maxWidth && cur) { chunks.push(cur); cur = ch; } else cur += ch;
      }
      if (cur) chunks.push(cur);
      return chunks;
    });
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last.length && ctx.measureText(last + "…").width > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last + "…";
    }
    return lines;
  }
  function chooseFont(text, width, startSize, maxHeight, maxLines) {
    let size = startSize; let lines = [];
    while (size >= 42) {
      ctx.font = "800 " + size + "px Manrope, sans-serif";
      lines = fitLines(text, width, size, maxLines);
      if (lines.length * size * 1.17 <= maxHeight) break;
      size -= 3;
    }
    return {size, lines};
  }
  function drawPhoto(W, H) {
    if (!photo || state.layers.photo===false) return;
    const x = W * 0.52, y = H * 0.11, w = W * 0.49, h = Math.min(H * 0.36, 570);
    ctx.save(); ctx.globalAlpha = state.photoOpacity/100;
    roundedRect(x, y, w, h, 140); ctx.clip();
    const sc = Math.max(w / photo.width, h / photo.height);
    const dw = photo.width * sc, dh = photo.height * sc;
    ctx.drawImage(photo, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    ctx.restore();
  }
  function drawDecoration(W, H, t) {
    const cx = W * .84, cy = H * .31;
    ctx.save(); ctx.strokeStyle = rgba(t.accent, .28);ctx.lineWidth=3;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx, cy, 188+i*37, 170+i*37, -.35, 0, Math.PI*2);ctx.stroke();}
    ctx.fillStyle=rgba(t.accent,.15);ctx.beginPath();ctx.arc(cx,cy,142,0,Math.PI*2);ctx.fill();
    ctx.translate(cx,cy);ctx.rotate(Math.PI/4);ctx.fillStyle=t.accent;
    ctx.beginPath(); ctx.moveTo(0,-48);ctx.quadraticCurveTo(13,-13,48,0);ctx.quadraticCurveTo(13,13,0,48);ctx.quadraticCurveTo(-13,13,-48,0);ctx.quadraticCurveTo(-13,-13,0,-48);ctx.fill();
    ctx.restore();
  }
  function drawBackground(W,H,t) {
    const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,t.bg1);grad.addColorStop(1,t.bg2);ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
    const glow=ctx.createRadialGradient(W*.87,H*.16,20,W*.87,H*.16,W*.85);
    glow.addColorStop(0,rgba(t.glow,.34));glow.addColorStop(1,rgba(t.glow,0));ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);
    ctx.lineWidth=1.5;ctx.strokeStyle=rgba(t.text,.055);
    for(let i=-H;i<W+H;i+=73){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i+H,H);ctx.stroke();}
    if(state.decorations && state.layers.decoration!==false && state.template!=="minimal") {
      if(state.template==="editorial") {
        ctx.strokeStyle=rgba(t.text,.3);ctx.lineWidth=3;ctx.strokeRect(38,38,W-76,H-76);
        ctx.fillStyle=rgba(t.accent,.28);ctx.fillRect(W-170,95,76,76);
      } else if(state.template==="spotlight") {
        ctx.fillStyle=rgba(t.accent,.22);
        ctx.beginPath();ctx.arc(W*.84,H*.24,270,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.arc(W*.84,H*.24,185,0,Math.PI*2);ctx.fill();
      } else if(state.template==="pulse") {
        ctx.save();ctx.translate(W*.77,H*.15);ctx.rotate(-.36);
        ctx.fillStyle=rgba(t.accent,.48);ctx.fillRect(0,-190,118,H*.72);
        ctx.fillStyle=rgba(t.text,.16);ctx.fillRect(137,-190,38,H*.72);ctx.restore();
      } else if(state.template==="bulletin") {
        ctx.fillStyle=t.accent;ctx.fillRect(0,0,W,20);
        ctx.fillStyle=rgba(t.text,.12);ctx.fillRect(0,136,W,8);
        for(let x=75;x<W-75;x+=80){ctx.fillStyle=rgba(t.accent,.3);ctx.fillRect(x,H*.19,48,8);}
      } else drawDecoration(W,H,t);
    }
    drawPhoto(W,H);
  }
  function drawWatermark(W,H,t) {
    // Preview and local PNGs always carry a watermark; only the server may
    // provide a clean export after independently checking the subscription.
    ctx.save();
    ctx.translate(W*.5,H*.51);
    ctx.rotate(-Math.PI/6.4);
    ctx.textAlign="center";
    ctx.textBaseline="middle";
    ctx.font="800 79px Manrope, sans-serif";
    ctx.fillStyle=rgba(t.text,t.dark?.21:.25);
    for(const dy of [-260,80,410]) {
      ctx.fillText("ANONS STUDIO",0,dy);
    }
    ctx.restore();
  }
  function draw() {
    const sz = sizes[state.ratio];const W=sz.w,H=sz.h; const t={...themes[state.theme],accent:state.accentColor||themes[state.theme].accent};
    if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
    ctx.textBaseline="alphabetic";ctx.textAlign="left";
    drawBackground(W,H,t);
    const margin=76; const contentWidth=W-2*margin;
    // Topline
    ctx.font="800 27px Manrope, sans-serif"; ctx.fillStyle=t.text;
    if(state.layers.brand!==false) {
      const project=(state.project||"МОЙ ПРОЕКТ").trim().slice(0,45);
      const projectWidth=Math.min(ctx.measureText(project).width,contentWidth*.52);
      ctx.save();roundedRect(margin,72,projectWidth+48,56,28);ctx.fillStyle=rgba(t.text,.10);ctx.fill();ctx.restore();
      ctx.fillStyle=t.text;ctx.save();ctx.beginPath();ctx.rect(margin+24,72,projectWidth,56);ctx.clip();ctx.fillText(project,margin+24,109);ctx.restore();
      ctx.textAlign="right";ctx.font="700 24px Manrope, sans-serif";ctx.fillStyle=rgba(t.text,.75);
      ctx.fillText("✳ ANONS / STUDIO",W-margin,105);ctx.textAlign="left";
    }

    const layout=state.template;
    const titleY=Math.round(H*(layout==="editorial"?.31:layout==="minimal"?.35:layout==="bulletin"?.27:H>=1700?.258:H<=1100?.265:.285))+Math.round(H*state.titleShift/100);
    const detailsY=Math.round(H*(layout==="editorial"?.75:layout==="minimal"?.77:layout==="bulletin"?.72:H>=1700?.735:H<=1100?.716:.733));
    ctx.fillStyle=t.accent;ctx.font="800 24px Manrope, sans-serif";
    if(state.layers.title!==false)ctx.fillText((presets[state.preset]?.label||"АНОНС")+"  /  2026",margin,titleY-52);
    const rawTitle=state.title.trim()||"Заголовок публикации";
    const maxTitleHeight=Math.max(195,detailsY-titleY-225);
    const titleFont=(layout==="editorial"||layout==="minimal")?"Georgia, serif":"Manrope, sans-serif";
    const baseSize=Math.round((H<=1100?83:105)*state.headingScale/100);
    const f=chooseFont(rawTitle,contentWidth,baseSize,maxTitleHeight,H<=1100?3:4);
    ctx.font=(layout==="editorial"||layout==="minimal"?"700 ":"800 ")+f.size+"px "+titleFont;ctx.fillStyle=t.text;
    const center=state.alignment==="center";
    ctx.textAlign=center?"center":"left";
    const tx=center?W/2:margin;
    let y=titleY+f.size*.8;
    for(const line of f.lines){if(state.layers.title!==false)ctx.fillText(line,tx,y);y+=f.size*1.14;}
    const descText=state.description.trim()||"Расскажите коротко, что произошло и почему это важно.";
    const descY=Math.min(detailsY-130,y+28)+Math.round(H*state.descriptionShift/100);
    let dsize=H<=1100?29:32;
    ctx.font="500 "+dsize+"px Manrope, sans-serif";ctx.fillStyle=t.sub;
    let dlines=fitLines(descText,contentWidth-(H<=1100?10:80),dsize,3);
    if(state.layers.description!==false)for(let i=0;i<dlines.length;i++){ctx.fillText(dlines[i],tx,descY+i*(dsize*1.5));}
    ctx.textAlign="left";

    // Structured, legible highlights
    const points=state.points.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,3);
    const list=points.length?points:["Важная информация","Следите за новостями"];
    const rowHeight=H<=1100?61:H>=1700?91:76;
    const top=detailsY;
    if(state.layers.highlights!==false){
    ctx.save();roundedRect(margin,top-27,contentWidth,28+list.length*rowHeight+21,23);
    ctx.fillStyle=rgba(t.text,t.dark?.08:.085);
    if(layout==="minimal"||layout==="editorial"){ctx.strokeStyle=rgba(t.text,.3);ctx.lineWidth=2;ctx.stroke();}
    else ctx.fill();
    ctx.restore();
    list.forEach((p,i)=>{
      const cy=top+i*rowHeight+16;
      ctx.fillStyle=t.accent;ctx.beginPath();ctx.arc(margin+31,cy+9,11,0,2*Math.PI);ctx.fill();
      ctx.fillStyle=t.dark?t.bg1:"#fff";ctx.font="900 15px Manrope,sans-serif";ctx.textAlign="center";ctx.fillText("✓",margin+31,cy+15);ctx.textAlign="left";
      ctx.fillStyle=t.text;ctx.font="700 "+(H<=1100?27:30)+"px Manrope,sans-serif";
      let short=p;
      while(ctx.measureText(short).width>contentWidth-112&&short.length>0)short=short.slice(0,-2).trim();
      if(short!==p)short+="…";
      ctx.fillText(short,margin+63,cy+18);
    });
    }
    const footerY=H-74;
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
  const themeForTemplate={aurora:"ultraviolet",editorial:"paper",spotlight:"sunset",pulse:"ink",minimal:"paper",bulletin:"emerald"};
  function changeTemplate(next) {
    if(!templates.has(next))return;
    state.template=next;
    state.theme=themeForTemplate[next];
    state.accentColor="";
    syncFields();syncCardAndSave();
  }
  $("template-select").addEventListener("change",e=>changeTemplate(e.target.value));
  document.querySelectorAll("[data-template]").forEach(b=>{
    b.addEventListener("click",()=>{
      changeTemplate(b.dataset.template);
      document.getElementById("editor").scrollIntoView({behavior:"smooth",block:"start"});
    });
  });
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
    state.cards.splice(state.activeCard+1,0,{...state.cards[state.activeCard],layers:{...state.cards[state.activeCard].layers}});
    activateCard(state.activeCard+1);
    showToast("Карточка продублирована.");
  });
  $("remove-card").addEventListener("click",()=>{
    if(state.cards.length<=1)return;
    if(!confirm("Удалить текущую карточку? Это действие нельзя отменить."))return;
    const index=state.activeCard;
    state.cards.splice(index,1);
    state.activeCard=Math.min(index,state.cards.length-1);
    Object.assign(state,state.cards[state.activeCard]);
    syncFields();persist();scheduleRender();
    showToast("Карточка удалена.");
  });
  $("heading-scale").addEventListener("input",e=>{
    state.headingScale=Math.max(80,Math.min(120,Number(e.target.value)||100));
    $("heading-scale-value").textContent=state.headingScale+"%";syncCardAndSave();
  });
  $("accent-color").addEventListener("input",e=>{
    if(!/^#[0-9a-fA-F]{6}$/.test(e.target.value))return;
    state.accentColor=e.target.value;syncCardAndSave();
  });
  $("text-align").addEventListener("change",e=>{
    state.alignment=e.target.value==="center"?"center":"left";syncCardAndSave();
  });
  $("photo-opacity").addEventListener("input",e=>{
    state.photoOpacity=Math.max(15,Math.min(85,Number(e.target.value)||35));
    $("photo-opacity-value").textContent=state.photoOpacity+"%";syncCardAndSave();
  });
  $("ornaments").addEventListener("change",e=>{state.decorations=e.target.checked;syncCardAndSave();});
  document.querySelectorAll("[data-layer]").forEach(input=>{
    input.addEventListener("change",()=>{
      const name=input.dataset.layer;
      if(!layerNames.includes(name))return;
      state.layers={...state.layers,[name]:input.checked};
      syncCardAndSave();
    });
  });
  for(const [id,key] of [["title-shift","titleShift"],["description-shift","descriptionShift"]]){
    $(id).addEventListener("input",event=>{
      state[key]=Math.max(-12,Math.min(12,Math.round(Number(event.target.value)||0)));
      $(id+"-value").textContent=(state[key]>0?"+":"")+state[key]+"%";
      syncCardAndSave();
    });
  }
  $("layer-reset").addEventListener("click",()=>{
    state.titleShift=0;state.descriptionShift=0;
    syncFields();syncCardAndSave();showToast("Положение текста восстановлено.");
  });
  $("editor-undo").addEventListener("click",()=>replayHistory("undo"));
  $("editor-redo").addEventListener("click",()=>replayHistory("redo"));
  document.addEventListener("keydown",event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey)return;
    const active=event.target;
    if(active instanceof HTMLElement && (active.closest("input,textarea,[contenteditable=true]")))return;
    const key=event.key.toLowerCase();
    if(key==="z" && event.shiftKey){event.preventDefault();replayHistory("redo");}
    else if(key==="z"){event.preventDefault();replayHistory("undo");}
    else if(key==="y"){event.preventDefault();replayHistory("redo");}
  });
  function readBrandKit(){
    try{
      const kit=JSON.parse(localStorage.getItem(brandKitKey)||"null");
      if(!kit||typeof kit!=="object"||!themes[kit.theme])return null;
      return {
        theme:kit.theme,
        project:typeof kit.project==="string"?kit.project.slice(0,45):"МОЙ ПРОЕКТ",
        accentColor:/^#[0-9a-fA-F]{6}$/.test(kit.accentColor)?kit.accentColor:themes[kit.theme].accent
      };
    }catch{return null;}
  }
  function refreshBrandKit(){
    const kit=readBrandKit();
    $("brand-kit-status").textContent=kit
      ?"Сохранено: "+kit.project+" · "+themes[kit.theme].name.split(" — ")[0]
      :"Набор ещё не сохранён";
    $("brand-kit-apply").disabled=!kit;
  }
  $("brand-kit-save").addEventListener("click",()=>{
    const kit={project:state.project.slice(0,45),theme:state.theme,accentColor:state.accentColor||themes[state.theme].accent};
    try{
      localStorage.setItem(brandKitKey,JSON.stringify(kit));
      refreshBrandKit();
      showToast("Фирменный стиль сохранён в этом браузере.");
    }catch{showToast("Не удалось сохранить фирменный стиль.");}
  });
  $("brand-kit-apply").addEventListener("click",()=>{
    const kit=readBrandKit();
    if(!kit){showToast("Сначала сохрани фирменный стиль.");refreshBrandKit();return;}
    state.project=kit.project;state.theme=kit.theme;state.accentColor=kit.accentColor;
    syncFields();syncCardAndSave();
    showToast("Фирменный стиль применён к текущей карточке.");
  });
  refreshBrandKit();
  updateHistoryButtons();
  $("reset").addEventListener("click",()=>{
    const keep=window.confirm("Начать заново? Текущий текст, оформление и загруженное фото будут удалены из этого браузера.");
    if(!keep)return;
    Object.assign(state,{...defaults,cards:[],activeCard:0});
    state.cards=[sanitizeCard({title:state.title,description:state.description,points:state.points,preset:state.preset,template:state.template})];
    photo=null;$("upload").value="";
    syncFields();window.dispatchEvent(new Event("anons:editor-reset"));persist();scheduleRender();showToast("Создан новый чистый проект.");
  });
  $("upload").addEventListener("change",async(e)=>{
    const file=e.target.files?.[0];if(!file)return;
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){showToast("Выберите PNG, JPG или WebP.");return;}
    if(file.size>10*1024*1024){showToast("Файл слишком большой. Максимум 10 МБ.");return;}
    try{
      const image=await createImageBitmap(file);
      const scale=Math.min(1,1400/Math.max(image.width,image.height));
      const temp=document.createElement("canvas");temp.width=Math.round(image.width*scale);temp.height=Math.round(image.height*scale);
      temp.getContext("2d").drawImage(image,0,0,temp.width,temp.height);image.close?.();
      state.imageData=temp.toDataURL("image/jpeg",.76);
      loadPhoto(state.imageData);persist();syncFields();
      showToast("Фото добавлено. При облачном сохранении оно попадёт в проект.");
    }catch(err){console.error(err);showToast("Не удалось прочитать изображение.");}
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
      btn.disabled=false;btn.textContent="⇩ Все карточки ZIP";
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
      schemaVersion:5,project:state.project,ratio:state.ratio,
      theme:state.theme,template:state.template,
      activeCard:state.activeCard,
      cards:state.cards.map(card=>({...card,layers:{...card.layers}})),
      imageData:state.imageData,
      accentColor:state.accentColor,alignment:state.alignment,
      headingScale:state.headingScale,photoOpacity:state.photoOpacity,
      decorations:state.decorations
    };
    return copy;
  }
  function loadSnapshot(raw) {
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
      Object.assign(state,nextCards[state.activeCard]);
      state.imageData=data;
      photo=null;
      $("upload").value="";
      syncFields();
      persist();
      scheduleRender();
      if(data)loadPhoto(data);
    } finally {suppressEditorSignal=false;}
  }
  function newDraft() {
    suppressEditorSignal=true;
    try{
      Object.assign(state,{...defaults,cards:[],activeCard:0});
      state.cards=[sanitizeCard({...presets.update,template:"aurora",theme:"ultraviolet"})];
      Object.assign(state,state.cards[0]);
      photo=null;$("upload").value="";
      syncFields();persist();scheduleRender();
    } finally {suppressEditorSignal=false;}
  }
  window.AnonsEditor=Object.freeze({
    getSnapshot,
    loadSnapshot,
    newDraft,
    getSuggestedName:()=> {
      snapshotCard();
      return (state.cards[0]?.title||"Новый анонс").trim().slice(0,100)||"Новый анонс";
    }
  });
  syncFields();render();if(state.imageData)loadPhoto(state.imageData);
  if(document.fonts?.ready)document.fonts.ready.then(scheduleRender).catch(()=>{});
})();
