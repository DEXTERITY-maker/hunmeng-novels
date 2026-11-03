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
  const defaults = { preset: "update", theme: "ultraviolet", ratio: "portrait", ...presets.update, imageData: "" };
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {}; } catch (_) {}
  const state = { ...defaults };
  for (const key of ["preset", "theme", "ratio", "project", "title", "description", "points", "imageData"]) {
    if (typeof saved[key] === "string") state[key] = saved[key];
  }
  if (!presets[state.preset]) state.preset = "update";
  if (!themes[state.theme]) state.theme = "ultraviolet";
  if (!sizes[state.ratio]) state.ratio = "portrait";
  for (const key of ["project", "title", "description", "points"]) state[key] = state[key].slice(0, {project:45,title:85,description:210,points:240}[key]);
  let photo = null;
  const paidAccess = { premium: false, plan: "free" };
  let toastTimer = null;
  let pendingRender = false;

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
    $("clear-image").hidden = !state.imageData;
    $("image-name").textContent = state.imageData ? "Фото добавлено" : "PNG, JPG или WebP";
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {
      showToast("Не удалось сохранить проект в браузере. Экспорт остаётся доступен.");
    }
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
    if (!photo) return;
    const x = W * 0.52, y = H * 0.11, w = W * 0.49, h = Math.min(H * 0.36, 570);
    ctx.save(); ctx.globalAlpha = 0.36;
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
    drawPhoto(W,H);
    drawDecoration(W,H,t);
  }
  function drawWatermark(W,H,t) {
    if(paidAccess.premium)return;
    // The same pixels are rendered in the live preview AND the downloaded PNG.
    // Production billing will need server-side entitlement enforcement.
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
    const sz = sizes[state.ratio];const W=sz.w,H=sz.h; const t=themes[state.theme];
    if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}
    ctx.textBaseline="alphabetic";ctx.textAlign="left";
    drawBackground(W,H,t);
    const margin=76; const contentWidth=W-2*margin;
    // Topline
    ctx.font="800 27px Manrope, sans-serif"; ctx.fillStyle=t.text;
    const project=(state.project||"МОЙ ПРОЕКТ").trim().slice(0,45);
    const projectWidth=Math.min(ctx.measureText(project).width,contentWidth*.52);
    ctx.save();roundedRect(margin,72,projectWidth+48,56,28);ctx.fillStyle=rgba(t.text,.10);ctx.fill();ctx.restore();
    ctx.fillStyle=t.text;ctx.save();ctx.beginPath();ctx.rect(margin+24,72,projectWidth,56);ctx.clip();ctx.fillText(project,margin+24,109);ctx.restore();
    ctx.textAlign="right";ctx.font="700 24px Manrope, sans-serif";ctx.fillStyle=rgba(t.text,.75);
    ctx.fillText("✳ ANONS / STUDIO",W-margin,105);ctx.textAlign="left";

    const titleY=Math.round(H*(H>=1700?.258:H<=1100?.265:.285));
    const detailsY=Math.round(H*(H>=1700?.735:H<=1100?.716:.733));
    ctx.fillStyle=t.accent;ctx.font="800 24px Manrope, sans-serif";
    ctx.fillText((presets[state.preset]?.label||"АНОНС")+"  /  2026",margin,titleY-52);
    const rawTitle=state.title.trim()||"Заголовок публикации";
    const maxTitleHeight=Math.max(195,detailsY-titleY-225);
    const f=chooseFont(rawTitle,contentWidth,H<=1100?83:105,maxTitleHeight,H<=1100?3:4);
    ctx.font="800 "+f.size+"px Manrope, sans-serif";ctx.fillStyle=t.text;
    let y=titleY+f.size*.8;
    for(const line of f.lines){ctx.fillText(line,margin,y);y+=f.size*1.14;}
    const descText=state.description.trim()||"Расскажите коротко, что произошло и почему это важно.";
    const descY=Math.min(detailsY-130,y+28);
    let dsize=H<=1100?29:32;
    ctx.font="500 "+dsize+"px Manrope, sans-serif";ctx.fillStyle=t.sub;
    let dlines=fitLines(descText,contentWidth-(H<=1100?10:80),dsize,3);
    for(let i=0;i<dlines.length;i++){ctx.fillText(dlines[i],margin,descY+i*(dsize*1.5));}

    // Structured, legible highlights
    const points=state.points.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(0,3);
    const list=points.length?points:["Важная информация","Следите за новостями"];
    const rowHeight=H<=1100?61:H>=1700?91:76;
    const top=detailsY;
    ctx.save();roundedRect(margin,top-27,contentWidth,28+list.length*rowHeight+21,23);
    ctx.fillStyle=rgba(t.text,t.dark?.08:.085);ctx.fill();ctx.restore();
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
    $(key).addEventListener("input",(e)=>{state[key]=e.target.value;persist();scheduleRender();});
  }
  $("ratio").addEventListener("change",(e)=>{state.ratio=sizes[e.target.value]?e.target.value:"portrait";persist();scheduleRender();});
  document.querySelectorAll("[data-theme]").forEach((b)=>b.addEventListener("click",()=>{
    state.theme=b.dataset.theme;syncFields();persist();scheduleRender();
  }));
  document.querySelectorAll("[data-preset]").forEach((b)=>b.addEventListener("click",()=>{
    const p=b.dataset.preset;if(!presets[p])return;
    const changed=state.preset!==p;
    state.preset=p;
    if(changed) for(const k of ["project","title","description","points"])state[k]=presets[p][k];
    syncFields();persist();scheduleRender();
  }));
  $("reset").addEventListener("click",()=>{
    const keep=window.confirm("Начать заново? Текущий текст, оформление и загруженное фото будут удалены из этого браузера.");
    if(!keep)return;
    Object.assign(state,defaults);photo=null;$("upload").value="";
    syncFields();persist();scheduleRender();showToast("Создан новый чистый проект.");
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
      showToast("Фото добавлено. Оно сохранено только в этом браузере.");
    }catch(err){console.error(err);showToast("Не удалось прочитать изображение.");}
  });
  $("clear-image").addEventListener("click",()=>{
    state.imageData="";photo=null;$("upload").value="";syncFields();persist();scheduleRender();showToast("Фото удалено.");
  });
  $("export").addEventListener("click",()=>{
    render();
    if(!canvas.toBlob){showToast("Этот браузер не поддерживает экспорт PNG.");return;}
    canvas.toBlob((blob)=>{
      if(!blob){showToast("Не удалось создать файл PNG.");return;}
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;
      a.download="anons-studio-"+state.preset+"-"+state.ratio+".png";
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),30000);
      showToast("Изображение PNG готово. Проверьте загрузки браузера.");
    },"image/png");
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
      ? "Активный тариф "+paidAccess.plan.toUpperCase()+" · Экспорт без водяного знака"
      : "Free · Водяной знак в предпросмотре и PNG · Снять по подписке";
    scheduleRender();
  });
  syncFields();render();if(state.imageData)loadPhoto(state.imageData);
  if(document.fonts?.ready)document.fonts.ready.then(scheduleRender).catch(()=>{});
})();
