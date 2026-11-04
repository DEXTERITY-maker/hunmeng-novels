// Manual paid plan requests. No card charging, no automatic entitlements.
// All identities, prices, statuses and admin approvals are enforced by database RPCs.
export function initManualOrders(client) {
  const $=id=>document.getElementById(id);
  const root=$("manual-order-root");
  const profile=$("manual-customer-number");
  const accountOrders=$("manual-account-orders");
  const adminPanel=$("manual-admin-panel");
  if(!root&&!profile&&!accountOrders&&!adminPanel)return {setUser(){}};
  const button=$("manual-order-create");
  const planSelect=$("manual-order-plan");
  const planPrice=$("manual-order-price");
  const planSummary=$("manual-order-plan-summary");
  const plans=Object.freeze({
    basic:{name:"Бизнес",amount:29900},
    pro:{name:"Про",amount:49900},
    studio:{name:"Студия",amount:99900}
  });
  const selectedPlan=()=>Object.hasOwn(plans,planSelect?.value)?planSelect.value:"basic";
  function renderPlan(){
    const plan=plans[selectedPlan()];
    if(planPrice)planPrice.textContent=(plan.amount/100)+" ₽";
    if(planSummary)planSummary.textContent=plan.name+" · "+(plan.amount/100)+" ₽ за 30 дней. Без автоматических списаний.";
    if(button&&!loading)button.textContent=orderButtonText();
  }
  const customerLabel=$("manual-order-customer");
  const message=$("manual-order-status");
  const pricingOrders=$("manual-order-list");
  const accountList=$("manual-account-order-list");
  const adminList=$("manual-admin-order-list");
  const adminMessage=$("manual-admin-status");
  const signedPrompt=$("manual-order-login");
  const statusLabels={
    awaiting_instructions:"Ожидает согласования перевода",
    payment_reported:"Пользователь сообщил о переводе · проверяем",
    approved:"Перевод подтверждён · доступ активирован",
    rejected:"Оплата не подтверждена",
    canceled:"Отменён"
  };
  const renderMoney=kopecks=>(kopecks/100).toLocaleString("ru-RU")+" ₽";
  const number=orderNo=>"AS-"+String(orderNo);
  let userId=null,epoch=0,loading=false,orders=[],customerNo=null,isAdmin=false,activeSubscription=false;
  const hasOpenOrder=()=>orders.some(o=>o.status==="awaiting_instructions"||o.status==="payment_reported");
  const newOrderBlocked=()=>activeSubscription||hasOpenOrder();
  const orderButtonText=()=>activeSubscription?"Подписка уже активна"
    :hasOpenOrder()?"Заявка уже оформлена":"Заказать «"+plans[selectedPlan()].name+"»";
  function broadcastOrders(){
    window.dispatchEvent?.(new CustomEvent("anons:manual-orders",{
      detail:{userId,orders:orders.map(o=>({order_no:o.order_no,plan:o.plan,status:o.status}))}
    }));
  }
  const own=()=>userId!==null;
  const live=(id,serial)=>userId===id&&epoch===serial;
  function say(el,value,error=false){
    if(!el)return;
    el.textContent=value;
    el.dataset.error=String(error);
  }
  function unavailableText(error){
    const code=String(error?.message||error?.code||"");
    if(code.includes("VERIFIED_ACCOUNT_REQUIRED"))return "Для номера пользователя подтвердите электронную почту и войдите заново.";
    if(code.includes("ORDER_RATE_LIMITED"))return "Слишком много заявок. Попробуйте оформить заказ позже.";
    if(code.includes("ORDER_NOT_ELIGIBLE"))return "Этот заказ уже изменён или не может быть обработан.";
    if(code.includes("ORDER_NOT_REVIEWABLE"))return "Проверьте состояние заказа: его нельзя подтвердить повторно.";
    if(code.includes("OTHER_PLAN_ACTIVE"))return "Другой действующий тариф нельзя сменить до окончания оплаченного периода. Новый тариф можно заказать после его завершения."; 
    if(code.includes("ORDER_ALREADY_OPEN_OTHER_PLAN"))return "Уже есть заявка на другой тариф. Сначала отмените её, затем создайте новую."; 
    if(code.includes("INVALID_PLAN"))return "Выберите доступный тариф.";
    if(code.includes("23505"))return "Заявка уже существует. Обновите список.";
    if(code.includes("ADMIN_REQUIRED"))return "У аккаунта нет доступа к проверке платежей.";
    return "Не удалось связаться с заказами. Проверьте соединение и попробуйте ещё раз.";
  }
  function setBusy(value){
    loading=value;
    if(button)button.disabled=value||!own()||customerNo===null||newOrderBlocked();
    if(button)button.textContent=value?"Обработка…":orderButtonText();
  }
  function renderProfile(){
    const label=customerNo===null?"Проверяем номер…":String(customerNo);
    if(profile)profile.textContent=own()?label:"Войдите, чтобы получить номер";
    if(customerLabel)customerLabel.textContent=own()?label:"После входа появится постоянный номер";
    if(signedPrompt)signedPrompt.hidden=own();
    if(button)button.disabled=loading||!own()||customerNo===null||newOrderBlocked();
    if(button&&!loading)button.textContent=orderButtonText();
  }
  function addText(tag,value,cls){
    const el=document.createElement(tag);
    el.textContent=value;
    if(cls)el.className=cls;
    return el;
  }
  function renderOrders(target){
    if(!target)return;
    target.replaceChildren();
    if(!own()){
      target.append(addText("p","Войдите в аккаунт, чтобы увидеть свои заказы.","manual-orders-empty"));
      return;
    }
    if(!orders.length){
      target.append(addText("p","Заявок пока нет.","manual-orders-empty"));
      return;
    }
    for(const order of orders){
      const card=document.createElement("article");
      card.className="manual-order-item";
      const heading=addText("strong","Заказ "+number(order.order_no)+" · "+(plans[order.plan]?.name||"Тариф"));
      const detail=addText("span",renderMoney(order.amount_kopecks)+" / 30 дней · "+(statusLabels[order.status]||"Проверяется"));
      const when=addText("small","Создан "+new Date(order.created_at).toLocaleDateString("ru-RU"));
      card.append(heading,detail,when);
      if(order.status==="awaiting_instructions"){
        const controls=document.createElement("div");
        controls.className="manual-order-item-actions";
        const field=document.createElement("input");
        field.type="text";field.maxLength=280;
        field.placeholder="Время и сумма перевода (необязательно)";
        field.setAttribute("aria-label","Информация о переводе для заказа "+number(order.order_no));
        const report=document.createElement("button");
        report.type="button";report.textContent="Я перевёл";
        report.addEventListener("click",()=>{
          if(!window.confirm("Сообщить о переводе по заказу "+number(order.order_no)+"? Подписка активируется только после реальной проверки поступления денег владельцем."))return;
          void reportTransfer(order.order_no,field.value);
        });
        const cancel=document.createElement("button");
        cancel.type="button";cancel.textContent="Отменить";
        cancel.addEventListener("click",()=>{
          if(window.confirm("Отменить заявку "+number(order.order_no)+"?"))void cancelOrder(order.order_no);
        });
        controls.append(field,report,cancel);card.append(controls);
      }
      if(order.status==="payment_reported"){
        card.append(addText("p","Мы получили сообщение о переводе, но не считаем его подтверждением оплаты. Владелец сверит реальное поступление.", "manual-orders-note"));
      }
      target.append(card);
    }
  }
  function renderAll(){
    renderProfile();
    renderOrders(pricingOrders);
    renderOrders(accountList);
    if(adminPanel)adminPanel.hidden=!isAdmin;
  }
  async function getOrders(id,serial){
    const {data,error}=await client.from("anons_studio_manual_orders")
      .select("order_no,plan,amount_kopecks,status,created_at,reported_at")
      .eq("user_id",id).order("created_at",{ascending:false}).limit(20);
    if(!live(id,serial))return;
    if(error)throw error;
    orders=Array.isArray(data)?data:[];
    renderAll();
    broadcastOrders();
  }
  async function refresh(){
    const id=userId;
    if(!id)return;
    const serial=epoch;
    try{
      const [{data:no,error:idError},{data:admin,error:adminError}]=await Promise.all([
        client.rpc("anons_studio_customer_number"),
        client.rpc("anons_studio_manual_is_admin")
      ]);
      if(!live(id,serial))return;
      if(idError)throw idError;
      customerNo=Number.isSafeInteger(Number(no))&&Number(no)>=1?Number(no):null;
      isAdmin=adminError?false:admin===true;
      renderAll();
      await getOrders(id,serial);
      if(isAdmin)await refreshAdmin(id,serial);
      if(live(id,serial))say(message,activeSubscription
        ?"Ваш платный тариф уже активен. Повторная заявка не требуется."
        :hasOpenOrder()?"У вас уже есть заявка. Дождитесь подтверждения; оформлять её повторно не нужно."
        :"Номер пользователя постоянный. Оплата оформляется только заявкой.");
    }catch(error){
      if(!live(id,serial))return;
      say(message,unavailableText(error),true);
      if(customerNo===null)renderProfile();
    }
  }
  async function createOrder(){
    if(!own()||loading||customerNo===null||newOrderBlocked())return;
    const id=userId,serial=epoch;setBusy(true);
    say(message,"Создаём заявку…");
    try{
      const {data,error}=await client.rpc("anons_studio_manual_create_order",{p_plan:selectedPlan()});
      if(!live(id,serial))return;
      if(error)throw error;
      await getOrders(id,serial);
      if(live(id,serial))say(message,"Заявка "+number(data)+" создана. Согласуйте реквизиты с владельцем. Не переводите деньги по неподтверждённым реквизитам.");
    }catch(error){
      if(live(id,serial))say(message,unavailableText(error),true);
    }finally{if(live(id,serial))setBusy(false);}
  }
  async function reportTransfer(no,note){
    const id=userId,serial=epoch;
    if(!id||loading)return;
    setBusy(true);
    try{
      const {error}=await client.rpc("anons_studio_manual_report_transfer",
        {p_order_no:no,p_note:String(note||"").trim().slice(0,280)});
      if(!live(id,serial))return;
      if(error)throw error;
      await getOrders(id,serial);
      if(live(id,serial))say(message,"Сообщение о переводе отправлено. Доступ пока не активирован.");
    }catch(error){if(live(id,serial))say(message,unavailableText(error),true);}
    finally{if(live(id,serial))setBusy(false);}
  }
  async function cancelOrder(no){
    const id=userId,serial=epoch;
    if(!id||loading)return;
    setBusy(true);
    try{
      const {error}=await client.rpc("anons_studio_manual_cancel_order",{p_order_no:no});
      if(!live(id,serial))return;
      if(error)throw error;
      await getOrders(id,serial);
      if(live(id,serial))say(message,"Заявка "+number(no)+" отменена.");
    }catch(error){if(live(id,serial))say(message,unavailableText(error),true);}
    finally{if(live(id,serial))setBusy(false);}
  }
  async function refreshAdmin(id=userId,serial=epoch){
    if(!id||!isAdmin||!adminList)return;
    const {data,error}=await client.rpc("anons_studio_manual_admin_orders");
    if(!live(id,serial))return;
    if(error){say(adminMessage,unavailableText(error),true);return;}
    adminList.replaceChildren();
    if(!data?.length){adminList.append(addText("p","Новых заказов пока нет."));return;}
    for(const order of data){
      const row=document.createElement("article");
      row.className="manual-admin-order";
      row.append(
        addText("strong",number(order.order_no)+" · Клиент № "+order.customer_no+" · "+(plans[order.plan]?.name||order.plan)+" · "+renderMoney(order.amount_kopecks)),
        addText("span",order.contact_email),
        addText("span",statusLabels[order.status]||order.status)
      );
      if(order.transfer_note)row.append(addText("p","Сообщение клиента: "+order.transfer_note));
      if(order.status==="payment_reported"||order.status==="awaiting_instructions"){
        const controls=document.createElement("div");
        controls.className="manual-admin-actions";
        if(order.status==="payment_reported"){
          const confirmButton=addText("button","Подтвердить поступление");
          confirmButton.type="button";
          confirmButton.addEventListener("click",()=>{
            if(window.confirm("Вы лично проверили банковское поступление "+renderMoney(order.amount_kopecks)+" для "+number(order.order_no)+"? Подтвердить и активировать «"+(plans[order.plan]?.name||"тариф")+"» на 30 дней?"))
              void reviewOrder(order.order_no,true);
          });
          controls.append(confirmButton);
        }
        const rejectButton=addText("button","Отклонить");
        rejectButton.type="button";
        rejectButton.addEventListener("click",()=>{
          if(window.confirm("Отклонить заявку "+number(order.order_no)+"?"))void reviewOrder(order.order_no,false);
        });
        controls.append(rejectButton);
        row.append(controls);
      }
      adminList.append(row);
    }
  }
  async function reviewOrder(orderNo,approve){
    const id=userId,serial=epoch;
    if(!id||!isAdmin||loading)return;
    setBusy(true);
    try{
      const {data,error}=await client.rpc("anons_studio_manual_review",
        {p_order_no:orderNo,p_approve:approve});
      if(!live(id,serial))return;
      if(error)throw error;
      say(adminMessage,data==="approved"?
        "Поступление подтверждено. Выбранный тариф активирован на 30 дней.":
        "Заявка отклонена. Подписка не изменена.");
      await Promise.all([getOrders(id,serial),refreshAdmin(id,serial)]);
      if(data==="approved")window.AnonsBilling?.refresh?.();
    }catch(error){if(live(id,serial))say(adminMessage,unavailableText(error),true);}
    finally{if(live(id,serial))setBusy(false);}
  }
  function setUser(user){
    const id=typeof user?.id==="string"?user.id:null;
    if(id===userId){renderAll();return;}
    ++epoch;
    userId=id;orders=[];customerNo=null;isAdmin=false;loading=false;activeSubscription=false;
    say(message,id?"Проверяем аккаунт и постоянный ID…":"Для оформления заказа требуется подтверждённый аккаунт.");
    if(adminList)adminList.replaceChildren();
    if(adminMessage)say(adminMessage,"");
    renderAll();
    broadcastOrders();
    if(id)void refresh();
  }
  window.addEventListener("anons:access",event=>{
    activeSubscription=event.detail?.loggedIn===true
      &&event.detail?.verified!==false&&event.detail?.premium===true;
    renderProfile();
    if(activeSubscription)say(message,"Ваш платный тариф уже активен. Повторная заявка не требуется.");
  });
  planSelect?.addEventListener("change",renderPlan);
  button?.addEventListener("click",()=>{void createOrder();});
  $("manual-order-refresh")?.addEventListener("click",()=>{void refresh();});
  $("manual-account-refresh")?.addEventListener("click",()=>{void refresh();});
  $("manual-admin-refresh")?.addEventListener("click",()=>{void refreshAdmin();});
  window.addEventListener("online",()=>{if(own())void refresh();});
  try{
    const requested=new URLSearchParams(window.location.search).get("plan");
    if(planSelect&&Object.hasOwn(plans,requested))planSelect.value=requested;
  }catch{}
  renderPlan();
  setUser(null);
  return {setUser,refresh};
}
