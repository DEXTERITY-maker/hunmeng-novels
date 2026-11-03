export function initBilling(client) {
  const base='https://kvgnjsntumofwqhywiea.supabase.co/functions/v1';
  const endpoint=base+'/anons-billing',byId=id=>document.getElementById(id);
  const buy=byId('buy-basic'),state=byId('billing-availability'),history=byId('billing-history');
  const status=byId('billing-member-status'),check=byId('billing-check');
  let enabled=false,accountId=null,fresh=0;
  const msg=text=>{if(state)state.textContent=text;};
  async function session(){const {data,error}=await client.auth.getSession();return error?null:data.session;}
  async function call(action,{method='GET',body,requiresUser=true}={}){
    const logged=requiresUser?await session():null;
    if(requiresUser&&!logged)throw Error('LOGIN_REQUIRED');
    const response=await fetch(endpoint+'?action='+encodeURIComponent(action),{
      method,headers:{'Content-Type':'application/json',
        ...(logged?{'Authorization':'Bearer '+logged.access_token}:{}),
        'apikey':'sb_publishable_8nleVqBbbyDEbgyMWPkS6A_oEHkisoN'},
      body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'
    });
    let data;try{data=await response.json();}catch{throw Error('BILLING_ERROR');}
    if(!response.ok)throw Error(data?.error||'BILLING_ERROR');
    return data;
  }
  function renderOrders(data){
    const p=data?.membership;
    const valid=p&&['active','trialing'].includes(p.status)&&Date.parse(p.current_period_end)>Date.now();
    if(status)status.textContent=valid?
      'Активный тариф '+p.plan.toUpperCase()+' до '+new Date(p.current_period_end).toLocaleDateString('ru-RU'):
      'Активной платной подписки нет';
    if(history){
      history.replaceChildren();
      const list=data?.orders||[];
      if(!list.length){const x=document.createElement('p');x.textContent='Оплаченных заказов пока нет.';history.append(x);}
      else for(const o of list){
        const row=document.createElement('div');row.className='billing-order';
        const label=document.createElement('strong');label.textContent=o.plan.toUpperCase()+' — '+Math.round(o.amount_kopecks/100)+' ₽';
        const sub=document.createElement('span');sub.textContent=new Date(o.created_at).toLocaleDateString('ru-RU')+' · '+
          ({created:'Создаётся',pending:'Ожидает оплаты',succeeded:'Оплачено',canceled:'Отменено',refunded:'Возврат'}[o.state]||o.state);
        row.append(label,sub);history.append(row);
      }
    }
    window.dispatchEvent(new Event('anons:billing-updated'));
  }
  async function refresh(sync=false){
    if(!accountId)return;
    const id=accountId,serial=++fresh;
    try {
      const data=await call(sync?'sync':'history',{method:sync?'POST':'GET'});
      if(id!==accountId||serial!==fresh)return;
      renderOrders(data);
      if(sync)msg('Статус проверен. После оплаты информация может обновиться не сразу.');
    }catch(e){if(id===accountId)msg('Не удалось проверить оплату. Проверь соединение.');}
  }
  async function loadConfig(){
    buy.disabled=true;
    try {
      const data=await call('config',{requiresUser:false});
      enabled=data.enabled===true;
      if(enabled){
        buy.disabled=!accountId;buy.textContent=accountId?'Оплатить Basic':'Войти для покупки';
        msg('Оплата доступна. Доступ на 30 дней без автоматических списаний.');
      }else{
        msg('Приём платежей готовится. Покупки пока отключены, деньги не списываются.');
        buy.textContent='Оплата пока недоступна';
      }
    }catch{enabled=false;msg('Платёжная система временно недоступна.');}
  }
  async function buyBasic(){
    if(!enabled||!accountId)return;
    buy.disabled=true;buy.textContent='Создаём оплату…';
    try{
      const result=await call('checkout',{method:'POST',body:{plan:'basic'}});
      if(!/^https:\/\//.test(result.url))throw Error('BAD_REDIRECT');
      window.location.assign(result.url);
    }catch(e){
      const issues={LOGIN_REQUIRED:'войдите в аккаунт',RATE_LIMITED:'слишком много попыток',
        PAYMENTS_DISABLED:'приём платежей отключён',PROVIDER_UNAVAILABLE:'сервис оплаты недоступен'};
      msg('Оплата не началась: '+(issues[e.message]||'попробуйте позднее'));
      buy.disabled=false;buy.textContent='Оплатить Basic';
    }
  }
  buy.addEventListener('click',buyBasic);
  check?.addEventListener('click',()=>refresh(true));
  async function exportPremium(snapshot,index){
    const logged=await session();if(!logged)throw Error('LOGIN_REQUIRED');
    const response=await fetch(base+'/anons-premium-export',{
      method:'POST',headers:{'Content-Type':'application/json',
        'Authorization':'Bearer '+logged.access_token,
        'apikey':'sb_publishable_8nleVqBbbyDEbgyMWPkS6A_oEHkisoN'},
      body:JSON.stringify({snapshot,cardIndex:index}),cache:'no-store'
    });
    if(!response.ok){
      let error='PREMIUM_EXPORT_UNAVAILABLE';try{error=(await response.json()).error||error;}catch{}
      throw Error(error);
    }
    if(!(response.headers.get('content-type')||'').startsWith('image/png'))throw Error('INVALID_RENDER');
    const blob=await response.blob();if(blob.size<2000)throw Error('INVALID_PNG');
    return blob;
  }
  function setUser(user){
    const id=user?.id||null;if(id===accountId)return;
    accountId=id;++fresh;
    if(status)status.textContent=id?'Проверяем подписку…':'Войдите, чтобы увидеть подписку и покупки';
    if(history)history.replaceChildren();
    buy.disabled=!id||!enabled;
    if(enabled)buy.textContent=id?'Оплатить Basic':'Войти для покупки';
    if(id)refresh();
  }
  loadConfig();setUser(null);
  return {setUser,refresh,exportPremium};
}