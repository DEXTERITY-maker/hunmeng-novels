import { backendConfigured, BackendError, getStaffRole, signIn, signOut } from '../lib/backend';

export async function initAdminLogin() {
  const form = document.querySelector<HTMLFormElement>('#admin-login-form')!;
  const fields = document.querySelector<HTMLFieldSetElement>('#admin-login-fields')!;
  const status = document.getElementById('admin-login-status')!;
  const email = form.elements.namedItem('email') as HTMLInputElement;
  const password = form.elements.namedItem('password') as HTMLInputElement;
  let busy = false;
  const failure = (error: unknown) => {
    status.textContent = error instanceof BackendError ? error.message : 'Unable to sign in. Please try again.';
  };
  // Never accept next/redirect parameters. The sole destination is our editorial panel.
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || !backendConfigured) return;
    busy = true;
    fields.disabled = true;
    status.textContent = 'Checking sign-in and editorial access…';
    try {
      await signIn(email.value.trim(), password.value);
      const role = await getStaffRole();
      if (!role) {
        await signOut();
        status.textContent = 'No editorial access. The owner must assign an administrator or editor role.';
        return;
      }
      location.replace('/admin/');
    } catch (error) {
      await signOut();
      failure(error);
    } finally {
      password.value = '';
      fields.disabled = false;
      busy = false;
    }
  });
  if (!backendConfigured) {
    status.textContent = 'Sign-in is not configured. Contact the project owner.';
    return;
  }
  try {
    const role = await getStaffRole();
    if (role) { location.replace('/admin/'); return; }
    status.textContent = 'Enter your editorial account email and password.';
  } catch (error) { failure(error); }
  fields.disabled = false;
}
