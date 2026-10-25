export interface ContactSettings { email: string; telegram: string; rightsEmail: string }
export interface ContactChannel { label: string; value: string; href: string }

function emailChannel(value: string, label: string): ContactChannel | null {
  const email = value.trim();
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/.test(email)) return null;
  return { label, value: email, href: 'mailto:' + encodeURIComponent(email).replace('%40', '@') };
}
export function contactChannels(settings: ContactSettings, rights = false): ContactChannel[] {
  const email = emailChannel(rights ? settings.rightsEmail || settings.email : settings.email,
    rights ? 'Rights inquiries' : 'Email');
  let telegram: ContactChannel | null = null;
  try {
    const uri = new URL(settings.telegram);
    if (uri.protocol === 'https:' && uri.hostname === 't.me' && !uri.username && !uri.password &&
        !uri.port && !uri.search && !uri.hash && /^\/[A-Za-z][A-Za-z0-9_]{4,31}\/?$/.test(uri.pathname))
      telegram = { label: 'Telegram', value: uri.pathname.replace(/^\//, '@').replace(/\/$/, ''), href: uri.href };
  } catch { /* Empty or invalid addresses are not published. */ }
  return [email, telegram].filter((channel): channel is ContactChannel => channel !== null);
}
