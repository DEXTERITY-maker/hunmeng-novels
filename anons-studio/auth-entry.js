import { createClient } from "@supabase/supabase-js";
import { initLibrary } from "./library-entry.js";

// Public publishable key only. Never bundle a service_role or Supabase secret.
const client=createClient("https://kvgnjsntumofwqhywiea.supabase.co","sb_publishable_8nleVqBbbyDEbgyMWPkS6A_oEHkisoN",{
  auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
});
const byId=id=>document.getElementById(id);
const library=initLibrary(client);
const guest=byId("account-guest");
const signed=byId("account-signed");
const recovery=byId("account-recovery");
const emailInput=byId("account-email");
const passwordInput=byId("account-password");
const submit=byId("account-submit");
const message=byId("account-message");
const accountEmail=byId("account-email-signed");
const accountPlan=byId("account-plan-signed");
const status=byId("account-status");
const navAccount=byId("nav-account");
const AUTH_RETURN_URL="https://anons-studio-preview.pages.dev/#account";
const SIGNUP_MIN_PASSWORD=10;
let mode="signup";
let requestSerial=0;
let recovering=false;
let lastSignupEmail="";
let currentAccountId=null;

const readableError=err=>{
  const code=err?.code||"";
  if(code==="invalid_credentials")return "Неверная электронная почта или пароль.";
  if(code==="email_not_confirmed")return "Подтверди электронную почту по ссылке из письма.";
  if(code==="weak_password")return "Пароль слишком простой. Добавь цифры, буквы разного регистра или символы.";
  if(code==="over_email_send_rate_limit"||code==="over_request_rate_limit")
    return "Слишком много запросов. Попробуй немного позже.";
  if(code==="user_already_exists"||code==="user_already_registered")
    return "Адрес уже зарегистрирован. Войди в аккаунт или восстанови пароль.";
  if(code==="same_password")return "Придумай пароль, отличающийся от предыдущего.";
  return "Не удалось выполнить запрос. Проверь интернет и настройки аккаунта.";
};
const setBusy=(button,value)=>{button.disabled=value;button.setAttribute("aria-busy",String(value));};
function showMessage(text,isError=false){
  message.textContent=text;
  message.classList.toggle("error",Boolean(isError));
}
function showPanels(user){
  if(recovering){
    guest.hidden=true;signed.hidden=true;recovery.hidden=false;
  }else{
    recovery.hidden=true;guest.hidden=Boolean(user);signed.hidden=!user;
  }
}
function setMode(next){
  mode=["signup","login","reset-request"].includes(next)?next:"signup";
  document.querySelectorAll("[data-account-mode]").forEach(b=>{
    const active=b.dataset.accountMode===mode;
    b.classList.toggle("active",active);
    b.setAttribute("aria-pressed",String(active));
  });
  const resetting=mode==="reset-request";
  const login=mode==="login";
  byId("account-forgot").hidden=!login;
  byId("account-back-login").hidden=!resetting;
  passwordInput.hidden=resetting;
  passwordInput.required=!resetting;
  byId("account-password-label").hidden=resetting;
  passwordInput.minLength=mode==="signup"?SIGNUP_MIN_PASSWORD:8;
  passwordInput.autocomplete=mode==="signup"?"new-password":"current-password";
  submit.textContent=resetting?"Отправить ссылку":login?"Войти в аккаунт":"Зарегистрироваться";
  byId("account-resend").hidden=!lastSignupEmail||mode!=="signup";
  showMessage("");
}
function renderGuest(){
  currentAccountId=null;
  showPanels(null);
  navAccount.textContent="Войти";
  status.textContent="Гость · Free";
  library.setUser(null);
}
function renderUser(user,plan){
  accountEmail.textContent=user.email||"Аккаунт";
  const labels={free:"Free",basic:"Basic",pro:"Pro",studio:"Studio"};
  const label=labels[plan]||"Free";
  accountPlan.textContent=label;
  status.textContent="Аккаунт · "+label;
  navAccount.textContent="Мой аккаунт";
  showPanels(user);
  // If an account was switched or signed out, private drafts must not leak to the next account.
  if(currentAccountId&&currentAccountId!==user.id)window.AnonsEditor?.newDraft?.();
  currentAccountId=user.id;
  library.setUser(user);
}
function publishEntitlements(plan,premium){
  window.dispatchEvent(new CustomEvent("anons:access",{detail:{plan,premium}}));
}
async function refreshAccount(session){
  const serial=++requestSerial;
  const uid=session?.user?.id;
  if(!uid){
    const wasSignedIn=Boolean(currentAccountId);
    renderGuest();
    if(wasSignedIn)window.AnonsEditor?.newDraft?.();
    publishEntitlements("free",false);
    return;
  }
  const {data:validated,error:validationError}=await client.auth.getUser();
  if(serial!==requestSerial)return;
  if(validationError||!validated?.user||validated.user.id!==uid){
    const wasSignedIn=Boolean(currentAccountId);
    renderGuest();
    if(wasSignedIn)window.AnonsEditor?.newDraft?.();
    publishEntitlements("free",false);
    showMessage("Сеанс больше не действителен. Войди повторно.",true);
    return;
  }
  let plan="free",premium=false;
  try{
    const {data,error}=await client.from("anons_studio_memberships")
      .select("plan,status,current_period_end").eq("user_id",uid).maybeSingle();
    if(error)throw error;
    if(data&&["basic","pro","studio"].includes(data.plan)
      &&["active","trialing"].includes(data.status)
      &&data.current_period_end&&Date.parse(data.current_period_end)>Date.now()){
      plan=data.plan;premium=true;
    }
  }catch(err){
    console.warn("Paid membership lookup failed",err?.code||"network");
    showMessage("Проверка тарифа временно недоступна; применяется бесплатный экспорт с водяным знаком.",true);
  }
  if(serial!==requestSerial)return;
  renderUser(validated.user,plan);
  publishEntitlements(plan,premium);
}
function checkPasswords(password,confirmPassword){
  if(password.length<SIGNUP_MIN_PASSWORD||password.length>128)
    return "Используй пароль от 10 до 128 символов.";
  if(password!==confirmPassword)return "Пароли не совпадают.";
  return "";
}
setMode("signup");
renderGuest();
publishEntitlements("free",false);
document.querySelectorAll("[data-account-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.accountMode)));
byId("account-forgot").addEventListener("click",()=>setMode("reset-request"));
byId("account-back-login").addEventListener("click",()=>setMode("login"));
byId("account-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const email=emailInput.value.trim();
  const password=passwordInput.value;
  if(!email){showMessage("Укажи электронную почту.",true);return;}
  if(mode!=="reset-request"&&password.length<(mode==="signup"?SIGNUP_MIN_PASSWORD:8)){
    showMessage("Пароль слишком короткий.",true);return;
  }
  setBusy(submit,true);
  try{
    if(mode==="signup"){
      const {data,error}=await client.auth.signUp({
        email,password,options:{emailRedirectTo:AUTH_RETURN_URL}
      });
      if(error)throw error;
      lastSignupEmail=email;
      byId("account-resend").hidden=false;
      showMessage(data?.session?"Аккаунт создан.":"Проверь электронную почту и подтверди регистрацию по ссылке из письма.");
    }else if(mode==="login"){
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error)throw error;
      showMessage("Вход выполнен.");
    }else{
      // Use a generic confirmation, not a hint whether an email is registered.
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:AUTH_RETURN_URL});
      if(error&&error.code!=="user_not_found")throw error;
      showMessage("Если аккаунт существует, письмо со ссылкой для восстановления будет отправлено. Проверь также папку «Спам».");
      setMode("login");
      showMessage("Если аккаунт существует, письмо со ссылкой для восстановления будет отправлено. Проверь также папку «Спам».");
    }
  }catch(err){showMessage(readableError(err),true);}
  finally{passwordInput.value="";setBusy(submit,false);}
});
byId("account-resend").addEventListener("click",async()=>{
  if(!lastSignupEmail)return;
  const b=byId("account-resend");setBusy(b,true);
  try{
    const {error}=await client.auth.resend({
      type:"signup",email:lastSignupEmail,options:{emailRedirectTo:AUTH_RETURN_URL}
    });
    if(error)throw error;
    showMessage("Если подтверждение ещё требуется, новое письмо отправлено.");
  }catch(err){showMessage(readableError(err),true);}
  finally{setBusy(b,false);}
});
byId("account-recovery-form").addEventListener("submit",async e=>{
  e.preventDefault();
  if(!recovering){showMessage("Сначала перейди по действительной ссылке из письма.",true);return;}
  const pwd=byId("account-recovery-password"),repeat=byId("account-recovery-confirm");
  const issue=checkPasswords(pwd.value,repeat.value);
  if(issue){showMessage(issue,true);return;}
  const button=byId("account-recovery-submit");setBusy(button,true);
  try{
    const {error}=await client.auth.updateUser({password:pwd.value});
    if(error)throw error;
    pwd.value="";repeat.value="";
    recovering=false;
    const {error:signOutError}=await client.auth.signOut({scope:"global"});
    if(signOutError)throw signOutError;
    setMode("login");showMessage("Пароль обновлён. Теперь войди с новым паролем.");
  }catch(err){showMessage(readableError(err),true);}
  finally{setBusy(button,false);}
});
byId("account-recovery-cancel").addEventListener("click",async()=>{
  recovering=false;
  try{await client.auth.signOut({scope:"local"});}catch{}
  setMode("login");showPanels(null);showMessage("Восстановление отменено.");
});
byId("account-change-form").addEventListener("submit",async e=>{
  e.preventDefault();
  const pwd=byId("account-new-password"),repeat=byId("account-change-confirm");
  const issue=checkPasswords(pwd.value,repeat.value);
  if(issue){showMessage(issue,true);return;}
  const button=byId("account-change-button");setBusy(button,true);
  try{
    const {error}=await client.auth.updateUser({password:pwd.value});
    if(error)throw error;
    pwd.value="";repeat.value="";
    showMessage("Новый пароль установлен. Рекомендуется выйти из сеансов на других устройствах.");
  }catch(err){showMessage(readableError(err),true);}
  finally{setBusy(button,false);}
});
async function signOut(scope){
  const button=byId(scope==="global"?"account-logout-all":"account-logout");
  if(scope==="global"&&!confirm("Завершить сеансы на всех устройствах? Другие устройства могут оставаться авторизованными до истечения срока их текущих токенов."))return;
  if(!await library.flushPending()){
    showMessage("Есть несохранённые изменения. Сначала сохрани проект в облаке или экспортируй его, чтобы не потерять данные.",true);
    return;
  }
  setBusy(button,true);
  try{
    const {error}=await client.auth.signOut({scope});
    if(error)throw error;
    showMessage(scope==="global"?"Выход со всех устройств запрошен.":"Выход выполнен.");
  }catch(err){showMessage(readableError(err),true);}
  finally{setBusy(button,false);}
}
byId("account-logout").addEventListener("click",()=>signOut("local"));
byId("account-logout-all").addEventListener("click",()=>signOut("global"));
client.auth.onAuthStateChange((event,session)=>{
  if(event==="PASSWORD_RECOVERY"){
    recovering=true;
    showPanels(session?.user||null);
    showMessage("Подтверди новый пароль.");
    window.location.hash="account";
  }else if(event==="SIGNED_OUT"){
    recovering=false;
    setMode("login");
  }
  // Supabase advises against awaiting other Supabase queries inside this callback.
  setTimeout(()=>refreshAccount(session).catch(()=>{
    renderGuest();publishEntitlements("free",false);
    showMessage("Не удалось проверить сеанс. Перезагрузи страницу или войди заново.",true);
  }),0);
});
