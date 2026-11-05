/* Anons Studio: read-only publication preflight. Does not modify a draft or
   change payment/export permissions. All untrusted labels use textContent. */
(() => {
  "use strict";
  const list=document.getElementById("series-quality-list");
  const summary=document.getElementById("series-quality-summary");
  const score=document.getElementById("series-quality-score");
  const bar=document.getElementById("series-quality-bar");
  const progress=document.querySelector(".series-quality-progress");
  const buttons=[...document.querySelectorAll("[data-series-quality-filter]")];
  if(!list||!summary||!score||!bar||!progress||buttons.length!==2)return;
  let filter="all";
  function audit(card){
    const problems=[];
    const title=typeof card.title==="string"?card.title.trim():"";
    const description=typeof card.description==="string"?card.description.trim():"";
    const name=typeof card.issueName==="string"?card.issueName.trim():"";
    const date=typeof card.issueDate==="string"?card.issueDate:"";
    const points=typeof card.points==="string"?card.points.trim():"";
    if(!name)problems.push("Назови выпуск");
    if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))problems.push("Укажи плановую дату");
    if(!title||title==="Новая карточка"||title==="Новое обновление")
      problems.push("Добавь итоговый заголовок");
    if(!description||description==="Опишите следующую важную деталь."
      ||description==="Добавь главную новость этого выпуска.")
      problems.push("Проверь описание");
    if(!points||points==="Ключевой факт\nПочему это важно\nЧто будет дальше"
      ||points==="Что изменилось\nПочему это важно\nЧто дальше")
      problems.push("Замени пункты-заготовки");
    if(card.issueReady!==true)problems.push("Отметь выпуск готовым");
    return problems;
  }
  function render(){
    const api=window.AnonsEditor;
    if(!api||typeof api.getSnapshot!=="function")return;
    const snapshot=api.getSnapshot();
    const cards=Array.isArray(snapshot?.cards)?snapshot.cards:[];
    const reports=cards.map((card,index)=>({card,index,problems:audit(card)}));
    const clean=reports.filter(report=>!report.problems.length).length;
    const percent=cards.length?Math.round(clean/cards.length*100):0;
    score.textContent=clean+" / "+cards.length;
    bar.style.width=percent+"%";
    progress.setAttribute("aria-valuenow",String(percent));
    list.replaceChildren();
    const visible=filter==="issues"?reports.filter(r=>r.problems.length):reports;
    for(const report of visible){
      const row=document.createElement("div");
      row.className="series-quality-item"+(report.problems.length?"":" is-ready");
      row.setAttribute("role","listitem");
      const top=document.createElement("div");top.className="series-quality-item-head";
      const title=document.createElement("strong");
      const name=typeof report.card.issueName==="string"?report.card.issueName.trim():"";
      title.textContent=(report.index+1)+". "+(name||"Без названия выпуска");
      const status=document.createElement("span");
      status.textContent=report.problems.length?report.problems.length+" замеч.":"Готов";
      top.append(title,status);
      row.append(top);
      if(report.problems.length){
        const details=document.createElement("ul");
        for(const issue of report.problems){
          const li=document.createElement("li");li.textContent=issue;details.append(li);
        }
        row.append(details);
      }else{
        const note=document.createElement("p");note.textContent="Все шесть пунктов проверены";
        row.append(note);
      }
      const open=document.createElement("button");
      open.type="button";open.textContent="Открыть выпуск";
      open.setAttribute("aria-label","Открыть выпуск "+(report.index+1)+" для проверки");
      open.addEventListener("click",()=>{
        const tab=document.querySelectorAll("#card-list [role=tab]")[report.index];
        if(!tab)return;
        const switchToEdit=document.querySelector('[data-workspace-view="edit"]');
        if(switchToEdit&&window.matchMedia("(max-width: 760px)").matches)
          switchToEdit.click();
        tab.click();
        document.getElementById("issue-name")?.focus({preventScroll:true});
        document.getElementById("series-planner")?.scrollIntoView({block:"nearest"});
      });
      row.append(open);
      list.append(row);
    }
    if(!visible.length){
      const empty=document.createElement("p");
      empty.className="series-quality-empty";
      empty.textContent="Замечаний нет — все выпуски готовы.";
      list.append(empty);
    }
    summary.textContent=clean===cards.length&&cards.length
      ?"Все выпуски прошли проверку. Перед публикацией проверь результат экспорта."
      :clean+" из "+cards.length+" выпусков без замечаний. Проверка носит рекомендательный характер.";
  }
  for(const button of buttons)button.addEventListener("click",()=>{
    filter=button.dataset.seriesQualityFilter;
    for(const item of buttons)item.setAttribute("aria-pressed",String(item===button));
    render();
  });
  window.addEventListener("anons:editor-change",render);
  window.addEventListener("DOMContentLoaded",render,{once:true});
  render();
})();
