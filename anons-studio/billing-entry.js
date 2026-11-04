export function initBilling(client) {
  const base='https://kvgnjsntumofwqhywiea.supabase.co/functions/v1';
  const endpoint=base+'/anons-billing',byId=id=>document.getElementById(id);
  const buy=byId('buy-basic'),state=byId('billing-availability'),history=byId('billing-history');
  const status=byId('billing-member-status'),check=byId('billing-check');
  let enabled=false,accountId=null,fresh=0,accountGeneration=0,inflightCheckout=null;
  const uncertainAccounts=new Set();
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
  const label=plan=>({basic:"Бизнес",pro:"Про",studio:"Студия"})[plan]||String(plan||"Free");
  function renderOrders(data){
    const p=data?.membership;
    const valid=p&&['active','trialing'].includes(p.status)&&Date.parse(p.current_period_end)>Date.now();
    if(status)status.textContent=valid?
      'Активный тариф '+label(p.plan)+' до '+new Date(p.current_period_end).toLocaleDateString('ru-RU'):
      'Активной платной подписки нет';
    if(history){
      history.replaceChildren();
      const list=data?.orders||[];
      if(!list.length){const x=document.createElement('p');x.textContent='Оплаченных заказов пока нет.';history.append(x);}
      else for(const o of list){
        const row=document.createElement('div');row.className='billing-order';
        const planLabel=document.createElement('strong');planLabel.textContent=label(o.plan)+' — '+Math.round(o.amount_kopecks/100)+' ₽';
        const partiallyRefunded=o.state==='succeeded'&&o.refunded_kopecks>0&&o.refunded_kopecks<o.amount_kopecks;
        const orderState=partiallyRefunded?'Частичный возврат '+(o.refunded_kopecks/100).toLocaleString('ru-RU')+' ₽':
          ({created:'Создаётся',pending:'Ожидает оплаты',succeeded:'Оплачено',canceled:'Отменено',refunded:'Возврат'}[o.state]||o.state);
        const sub=document.createElement('span');sub.textContent=new Date(o.created_at).toLocaleDateString('ru-RU')+' · '+orderState;
        row.append(planLabel,sub);history.append(row);
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
      if(sync){
        const r=data.reconciliation;
        if(!r||!r.available)msg('История загружена, но сверка с платёжным сервисом сейчас недоступна.');
        else if(r.failed)msg('Не все платежи удалось проверить. Попробуйте позднее или обратитесь в поддержку.');
        else if(r.attempted)msg('Платежи сверены с платёжным сервисом.');
        else msg('История загружена. Платежей для сверки пока нет.');
      }
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
    if(!enabled||!accountId||inflightCheckout||uncertainAccounts.has(accountId))return;
    const generation=accountGeneration,attempt={};inflightCheckout=attempt;
    buy.disabled=true;buy.textContent='Создаём оплату…';
    try{
      const result=await call('checkout',{method:'POST',body:{plan:'basic'}});
      if(generation!==accountGeneration)return;
      const confirmation=new URL(result.url);
      if(confirmation.protocol!=='https:'||confirmation.username||confirmation.password
        ||!['yookassa.ru','yoomoney.ru'].some(d=>confirmation.hostname===d||confirmation.hostname.endsWith('.'+d)))
        throw Error('BAD_REDIRECT');
      window.location.assign(confirmation.href);
    }catch(e){
      if(generation!==accountGeneration)return;
      if(e.message==='PAYMENTS_DISABLED'){
        enabled=false;msg('Приём платежей отключён.');
        buy.disabled=true;buy.textContent='Оплата пока недоступна';return;
      }
      const issues={LOGIN_REQUIRED:'войдите в аккаунт',RATE_LIMITED:'слишком много попыток',
        INVALID_PLAN:'тариф недоступен',PLAN_NOT_YET_AVAILABLE:'тариф пока недоступен',
        BAD_JSON:'ошибка запроса',TOO_LARGE:'ошибка запроса',
        ORDER_CREATE_FAILED:'не удалось создать заказ',BILLING_UNAVAILABLE:'сервис временно недоступен'};
      if(Object.hasOwn(issues,e.message)){
        msg('Оплата не началась: '+issues[e.message]);
        buy.disabled=false;buy.textContent='Оплатить Basic';return;
      }
      // The provider may have created a payment even when its response was lost.
      uncertainAccounts.add(accountId);buy.disabled=true;buy.textContent='Проверьте статус оплаты';
      msg('Не удалось определить, создан ли платёж. Проверьте историю и обратитесь в поддержку перед повторной попыткой.');
    }finally{
      if(inflightCheckout===attempt)inflightCheckout=null;
    }
  }
  buy?.addEventListener('click',buyBasic);
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
    accountId=id;++fresh;++accountGeneration;inflightCheckout=null;
    if(status)status.textContent=id?'Проверяем подписку…':'Войдите, чтобы увидеть подписку и покупки';
    if(history)history.replaceChildren();
    if(buy){
      buy.disabled=!id||!enabled||uncertainAccounts.has(id);
      if(enabled)buy.textContent=uncertainAccounts.has(id)?'Проверьте статус оплаты':id?'Оплатить Basic':'Войти для покупки';
    }
    if(id)refresh();
  }
  if(buy)loadConfig();
  setUser(null);
  return {setUser,refresh,exportPremium};
}
