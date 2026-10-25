// Report the type and file only. Never print a matched credential.
export function publicSecretKinds(text) {
  const kinds = [];
  if (/sb_secret_[A-Za-z0-9_-]+/.test(text)) kinds.push('секретный Supabase key');
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) kinds.push('приватный ключ');
  if (/GOCSPX-[A-Za-z0-9_-]{10,}/.test(text)) kinds.push('OAuth client secret');
  for (const token of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(token[0].split('.')[1], 'base64url').toString()).role === 'service_role')
        kinds.push('service-role JWT');
    } catch { /* Not a JWT. */ }
  }
  return [...new Set(kinds)];
}
