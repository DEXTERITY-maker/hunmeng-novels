import { createClient } from "@supabase/supabase-js";

// This is a PUBLIC publishable key, never a service_role or secret key.
// Paid entitlements are read-only, protected by Supabase RLS.
const client = createClient("https://kvgnjsntumofwqhywiea.supabase.co", "sb_publishable_8nleVqBbbyDEbgyMWPkS6A_oEHkisoN", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});
const byId = id => document.getElementById(id);
const guest = byId("account-guest");
const signed = byId("account-signed");
const emailInput = byId("account-email");
const passwordInput = byId("account-password");
const submit = byId("account-submit");
const message = byId("account-message");
const accountEmail = byId("account-email-signed");
const accountPlan = byId("account-plan-signed");
const status = byId("account-status");
const navAccount = byId("nav-account");
let mode = "signup";
let requestSerial = 0;
let activeSessionId = null;

const readableError = err => {
  const code = err?.code || "";
  if (code === "invalid_credentials") return "Неверный адрес почты или пароль.";
  if (code === "email_not_confirmed") return "Подтверди адрес электронной почты по ссылке из письма.";
  if (code === "over_email_send_rate_limit") return "Лимит писем исчерпан. Попробуй позже.";
  if (code === "user_already_exists" || code === "user_already_registered") return "Этот адрес уже зарегистрирован.";
  return "Не удалось выполнить запрос. Проверь соединение и попробуй снова.";
};
function showMessage(text, isError=false) {
  message.textContent = text;
  message.classList.toggle("error", Boolean(isError));
}
function setMode(next) {
  mode = next === "login" ? "login" : "signup";
  document.querySelectorAll("[data-account-mode]").forEach(b => {
    const active = b.dataset.accountMode === mode;
    b.classList.toggle("active", active);
    b.setAttribute("aria-pressed", String(active));
  });
  submit.textContent = mode === "signup" ? "Зарегистрироваться" : "Войти в аккаунт";
  passwordInput.autocomplete = mode === "signup" ? "new-password" : "current-password";
  showMessage("");
}
function renderGuest() {
  guest.hidden = false;
  signed.hidden = true;
  navAccount.textContent = "Войти";
  status.textContent = "Гость · Free";
}
function renderUser(user, plan) {
  guest.hidden = true;
  signed.hidden = false;
  accountEmail.textContent = user.email || "Аккаунт";
  const labels={free:"Free",basic:"Basic",pro:"Pro",studio:"Studio"};
  accountPlan.textContent = labels[plan] || "Free";
  status.textContent = "Аккаунт · " + (labels[plan] || "Free");
  navAccount.textContent = "Мой аккаунт";
}
function publishEntitlements(plan, premium) {
  window.dispatchEvent(new CustomEvent("anons:access", {
    detail: { plan, premium }
  }));
}
// Never trust user_metadata for access and never grant a plan from browser input.
async function refreshAccount(session) {
  const serial=++requestSerial;
  const uid=session?.user?.id;
  if(!uid) {
    activeSessionId=null;
    renderGuest();
    publishEntitlements("free",false);
    return;
  }
  // Validate the session server-side rather than treating a cached user as proof.
  const validated = await client.auth.getUser();
  if(serial!==requestSerial) return;
  if(validated.error || !validated.data?.user || validated.data.user.id!==uid){
    activeSessionId=null;
    renderGuest();
    publishEntitlements("free",false);
    showMessage("Не удалось подтвердить сеанс. Войди повторно.",true);
    return;
  }
  activeSessionId=uid;
  let plan="free",premium=false;
  try{
    const {data,error}=await client.from("anons_studio_memberships")
      .select("plan,status,current_period_end")
      .eq("user_id",uid).maybeSingle();
    if(error) throw error;
    if(data && ["basic","pro","studio"].includes(data.plan)
      && ["active","trialing"].includes(data.status)
      && data.current_period_end && Date.parse(data.current_period_end)>Date.now()) {
      plan=data.plan;
      premium=true;
    }
  }catch(err){
    console.warn("Membership read unavailable",err?.code || "network");
    showMessage("Не удалось проверить тариф. Пока применяется Free с водяным знаком.",true);
  }
  if(serial!==requestSerial)return;
  renderUser(validated.data.user,plan);
  publishEntitlements(plan,premium);
}
setMode("signup");
renderGuest();
publishEntitlements("free",false);
document.querySelectorAll("[data-account-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.accountMode)));
byId("account-form").addEventListener("submit",async event=>{
  event.preventDefault();
  const email=emailInput.value.trim();
  const password=passwordInput.value;
  if(!email || password.length<8){showMessage("Укажи электронную почту и пароль не короче 8 символов.",true);return;}
  submit.disabled=true;
  showMessage("Проверяем данные…");
  try {
    if(mode==="signup"){
      const redirect = window.location.origin + window.location.pathname + "#account";
      const { data, error } = await client.auth.signUp({
        email,password,options:{emailRedirectTo:redirect}
      });
      if(error) throw error;
      if(data?.session) showMessage("Аккаунт создан. Теперь можно пользоваться студией!");
      else showMessage("Проверь электронную почту и перейди по ссылке подтверждения. Затем войди в аккаунт.");
    }else{
      const {error}=await client.auth.signInWithPassword({email,password});
      if(error) throw error;
      showMessage("Вход выполнен.");
    }
  }catch(err){showMessage(readableError(err),true);}
  finally {passwordInput.value="";submit.disabled=false;}
});
byId("account-logout").addEventListener("click",async()=>{
  const b=byId("account-logout");b.disabled=true;
  try{const {error}=await client.auth.signOut();if(error)throw error;showMessage("Ты вышел из аккаунта.");}
  catch(err){showMessage(readableError(err),true);}
  finally{b.disabled=false;}
});
client.auth.onAuthStateChange((_event, session) => {
  // Avoid awaited Supabase queries within the auth callback.
  setTimeout(() => {refreshAccount(session).catch(()=>{renderGuest();publishEntitlements("free",false);});},0);
});
// The studio may be opened offline: the free watermarked editor remains available.
