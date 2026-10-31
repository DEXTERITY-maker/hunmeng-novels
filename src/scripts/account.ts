import { initProfile } from './profile';
import { profileHash, resolveProfileTab } from '../lib/profile-navigation';
import type { User } from '@supabase/supabase-js';
import { assertAuthStorage, clearReaderAuthStorage, createReaderClient, readerAuthConfigured, readerAuthMessage } from '../lib/reader-auth';

export async function initAccount() {
  const status = document.getElementById('account-status')!;
  const form = document.querySelector<HTMLFormElement>('#auth-form')!;
  const fields = document.querySelector<HTMLFieldSetElement>('#reader-auth-fields')!;
  const authFields = document.getElementById('auth-fields')!;
  const loggedIn = document.getElementById('auth-logged-in')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  const confirm = form.elements.namedItem('confirmPassword') as HTMLInputElement;
  const submit = document.getElementById('reader-auth-submit')!;
  const buttons = document.querySelectorAll<HTMLButtonElement>('[data-auth-mode]');
  const logout = document.querySelector<HTMLButtonElement>('#account-signout')!;
  const address = new URL(location.href);
  const code = address.searchParams.get('code');
  const callbackError = address.searchParams.has('error');
  let mode = address.searchParams.get('mode') === 'signup' ? 'signup' : 'signin';
  // Never read access/refresh tokens from a URL or honor a next/redirect destination.
  const profileTarget = profileHash(address.hash);
  if (address.search || address.hash !== profileTarget)
    history.replaceState(null, '', '/account/' + profileTarget);
  window.addEventListener('hashchange', () => {
    const target = profileHash(location.hash);
    if (location.hash && !resolveProfileTab(location.hash)) {
      history.replaceState(null, '', '/account/');
      status.textContent = 'Only known profile tab links are supported.';
    } else if (target && target !== location.hash) {
      history.replaceState(null, '', '/account/' + target);
      window.dispatchEvent(new Event('popstate'));
    }
  });
  let busy = true;
  let updateProfile: ((user: User | null) => void) | undefined;
  const render = (user: User | null, message?: string) => {
    authFields.hidden = !!user;
    document.getElementById('account-title')!.textContent = user ? 'My profile' : 'Sign in or register';
    document.getElementById('account-subtitle')!.textContent = user ? 'Make yourself at home and read your way.' : 'You can read novels without an account.';
    document.title = (user ? 'My profile' : 'Sign in or register') + ' — Hunmeng novels';
    updateProfile?.(user);
    window.dispatchEvent(new CustomEvent('reader:auth-change'));
    loggedIn.hidden = !user;
    document.getElementById('profile-guest-hero')!.hidden = !!user;
    status.hidden = !!user && !message;
    document.getElementById('account-email')!.textContent = user?.email ?? '';
    status.textContent = message ?? (user ? 'You are signed in.' : 'Sign in or create a reader account.');
  };
  const setMode = (value: string) => {
    mode = value === 'signup' ? 'signup' : 'signin';
    const signup = mode === 'signup';
    document.getElementById('confirm-password-label')!.hidden = !signup;
    document.getElementById('signup-hint')!.hidden = !signup;
    confirm.disabled = !signup;
    confirm.required = signup;
    confirm.value = '';
    password.value = '';
    password.autocomplete = signup ? 'new-password' : 'current-password';
    password.minLength = signup ? 8 : 1;
    submit.textContent = signup ? 'Create account' : 'Sign in';
    buttons.forEach(button => {
      const active = button.dataset.authMode === mode;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('secondary', !active);
    });
  };
  setMode(mode);
  buttons.forEach(button => button.addEventListener('click', () => {
    if (busy) return;
    setMode(button.dataset.authMode!);
    status.textContent = mode === 'signup' ? 'Create an account with your email and password.' : 'Enter your email and password.';
  }));
  // Attach before any asynchronous work, so a slow SDK never submits credentials to the static host.
  form.addEventListener('submit', event => { event.preventDefault(); });
  if (!readerAuthConfigured) { status.textContent = 'Sign-in is not configured. You can still read without an account.'; return; }
  try { assertAuthStorage(); }
  catch { status.textContent = 'Allow browser storage to sign in. You can read without an account.'; return; }
  const client = createReaderClient();
  updateProfile = initProfile(client, () => render(null, 'Your session has ended. Please sign in again.'));
  const refresh = async (message?: string) => {
    const {data:stored,error:sessionError} = await client.auth.getSession();
    if (sessionError) { render(null, 'Your session has ended. Please sign in again.'); return; }
    if (!stored.session) { render(null,message); return; }
    const {data,error} = await client.auth.getUser();
    if (error) { render(null, readerAuthMessage(error)); return; }
    render(data.user,message);
  };
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') render(null, 'You are signed out.');
    if (!busy && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED'))
      setTimeout(() => { void refresh().catch(()=>render(null,'Unable to verify your session. Please sign in again.')); }, 0);
  });
  form.addEventListener('submit', async () => {
    if (busy) return;
    if (mode === 'signup' && password.value !== confirm.value) {
      status.textContent = 'Passwords do not match.';
      confirm.focus(); return;
    }
    busy = true; fields.disabled = true;
    buttons.forEach(button=>button.disabled=true);
    status.textContent = mode === 'signup' ? 'Creating your account…' : 'Signing in…';
    try {
      assertAuthStorage();
      if (mode === 'signup') {
        const {data,error} = await client.auth.signUp({email:email.value.trim(),password:password.value,
          options:{emailRedirectTo:new URL('/account/',location.origin).href}});
        if (error) {status.textContent=readerAuthMessage(error);return;}
        if (data.session) await refresh('Account created. You are signed in to Hunmeng.');
        else render(null, 'Check your inbox. If registration is available for this address, you will receive a confirmation link. You can sign in after confirming your email.');
      } else {
        const {error} = await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});
        if (error) {status.textContent=readerAuthMessage(error);return;}
        await refresh();
      }
    } catch { status.textContent='Unable to complete the action. Check your connection and browser storage permissions.'; }
    finally {
      password.value='';confirm.value='';busy=false;fields.disabled=false;
      buttons.forEach(button=>button.disabled=false);
    }
  });
  logout.addEventListener('click', async()=>{
    if (busy) return;
    busy=true;logout.disabled=true;
    try {
      const {error} = await client.auth.signOut({scope:'local'});
      if (error) {
        client.auth.stopAutoRefresh();
        clearReaderAuthStorage();
        // Reload to discard any SDK memory after local logout. The flag contains no credentials.
        sessionStorage.setItem('hunmeng-reader-local-logout','1');
        location.replace('/account/');return;
      }
      render(null,'You are signed out. Your library on this device is preserved.');
    } catch {
      clearReaderAuthStorage();
      render(null,'Sign-in data was cleared from this browser. The server could not confirm sign-out.');
    } finally {busy=false;logout.disabled=false;}
  });
  try {
    if (code && code.length <= 2048) {
      status.textContent='Confirming your email…';
      const {error} = await client.auth.exchangeCodeForSession(code);
      if (error) render(null,'Confirmation could not be completed. Open the link in the same browser, or sign in after confirming your email.');
      else await refresh('Email confirmed. You are signed in to Hunmeng.');
    } else if (callbackError || address.hash.includes('access_token')) {
      render(null,'Confirmation could not be completed. Try signing in with your email and password.');
    } else await refresh();
    if (sessionStorage.getItem('hunmeng-reader-local-logout')) {
      sessionStorage.removeItem('hunmeng-reader-local-logout');
      render(null,'You are signed out in this browser. The server could not confirm sign-out.');
    }
  } catch {render(null,'Unable to verify your session. Please sign in again.');}
  finally {
    busy=false;fields.disabled=false;
    if (profileTarget && !loggedIn.hidden && !['#overview','#progress','#titles-achievements','#xp-history'].includes(profileTarget))
      document.querySelector(profileTarget)?.scrollIntoView();
  }
}
