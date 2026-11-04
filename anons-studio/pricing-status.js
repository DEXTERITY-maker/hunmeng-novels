// Pricing visibility only. Never grants entitlements or marks payments as received.
// Active plans come from Supabase-validated Auth; pending orders are not subscriptions.
(()=>{
  "use strict";
  const root=document.getElementById("pricing");
  if(!root)return;
  const title=document.getElementById("pricing-current-title");
  const description=document.getElementById("pricing-current-description");
  const indicator=document.getElementById("pricing-current-indicator");
  const names={free:"Free",basic:"Бизнес",pro:"Про",studio:"Студия",agency:"Агентство",ultimate:"Максимум"};
  const cards=[...root.querySelectorAll(".pricing-grid .plan[data-plan]")];
  let resolved=false,loggedIn=false,verified=false,activePlan=null,expiresAt=null,orders=[];
  const openStatus=new Set(["awaiting_instructions","payment_reported"]);
  const formatDate=value=>{
    const n=Date.parse(value||"");
    return Number.isFinite(n)?new Date(n).toLocaleDateString("ru-RU"):"";
  };
  const openOrder=()=>orders.find(o=>openStatus.has(o.status)&&Object.hasOwn(names,o.plan));
  function render(){
    const pending=openOrder();
    const current=resolved&&loggedIn&&verified&&activePlan;
    if(!resolved){
      title.textContent="Проверяем ваш тариф…";
      description.textContent="Сведения о подписке будут загружены из аккаунта.";
      indicator.textContent="Проверка";
    }else if(!loggedIn){
      title.textContent="Войдите, чтобы увидеть свой тариф";
      description.textContent="После входа здесь появится текущая подписка и её срок действия.";
      indicator.textContent="Гость";
    }else if(!verified){
      title.textContent="Не удалось проверить подписку";
      description.textContent="Не оформляйте повторный заказ, пока не восстановится связь с сервисом. Обновите страницу позднее.";
      indicator.textContent="Нет данных";
    }else if(current){
      title.textContent="Ваш тариф: "+names[activePlan];
      const until=formatDate(expiresAt);
      description.textContent="Подписка активна"+(until?" до "+until:"")+". Платный доступ подтверждён сервером. Повторно заказывать тариф не нужно.";
      indicator.textContent="Активен";
    }else if(pending){
      title.textContent="Заказ AS-"+pending.order_no+" · "+names[pending.plan];
      description.textContent=pending.status==="payment_reported"
        ?"Перевод заявлен. Тариф станет активным только после подтверждения поступления владельцем. Повторно заказывать не нужно."
        :"Заявка уже создана. Ожидает согласования перевода. Повторно заказывать не нужно.";
      indicator.textContent=pending.status==="payment_reported"?"На проверке":"Заявка создана";
    }else{
      title.textContent="Ваш текущий тариф: Free";
      description.textContent="Платная подписка не найдена. Вы можете пользоваться базовым редактором или заказать подходящий тариф.";
      indicator.textContent="Free";
    }
    root.dataset.pricingAccess=current?activePlan:pending?"pending":loggedIn?"free":"guest";
    cards.forEach(card=>{
      const id=card.dataset.plan;
      const link=card.querySelector(".manual-plan-link");
      const state=card.querySelector(".plan-current-state");
      if(!state)return;
      const isActive=Boolean(current&&id===activePlan);
      const isPending=Boolean(!current&&pending?.plan===id);
      let note="";
      if(isActive)note="Ваш текущий тариф";
      else if(isPending)note=pending.status==="payment_reported"
        ?"Оплата ожидает подтверждения":"Заявка уже оформлена";
      else if(current&&id!=="free")note="Смена тарифа после окончания текущей подписки";
      else if(!current&&pending&&id!=="free")note="Сначала завершите текущий заказ";
      else if(id==="free"&&resolved&&loggedIn&&verified)note=current
        ?"Базовые функции включены в вашу подписку":"Ваш текущий бесплатный доступ";
      card.classList.toggle("is-current-plan",isActive);
      card.classList.toggle("is-pending-plan",isPending);
      state.hidden=!note;
      state.textContent=note;
      if(link)link.hidden=Boolean(isActive||isPending||current||pending||!verified&&loggedIn);
    });
  }
  window.addEventListener("anons:access",event=>{
    const info=event.detail||{};
    resolved=true;
    loggedIn=info.loggedIn===true;
    verified=info.verified!==false;
    const plan=info.plan;
    activePlan=info.premium===true&&["basic","pro","studio","agency","ultimate"].includes(plan)?plan:null;
    expiresAt=activePlan?info.expiresAt:null;
    if(!loggedIn)orders=[];
    render();
  });
  window.addEventListener("anons:manual-orders",event=>{
    const info=event.detail||{};
    orders=Array.isArray(info.orders)?info.orders.filter(o=>
      o&&typeof o==="object"&&Number.isSafeInteger(o.order_no)
        &&openStatus.has(o.status)&&Object.hasOwn(names,o.plan)
    ):[];
    render();
  });
  render();
})();
