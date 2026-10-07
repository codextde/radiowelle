import crypto from 'node:crypto';
import fs from 'node:fs';
const key = JSON.parse(fs.readFileSync(new URL('../../credentials/play-service-account.json', import.meta.url)));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export async function token() {
  const now = Math.floor(Date.now() / 1000);
  const h = b64({ alg: 'RS256', typ: 'JWT' });
  const p = b64({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = crypto.sign('sha256', Buffer.from(`${h}.${p}`), key.private_key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${h}.${p}.${sig}` });
  const j = await r.json();
  if (!j.access_token) throw new Error(JSON.stringify(j));
  return j.access_token;
}
export async function api(method, path, body, { upload, contentType } = {}) {
  const t = await token();
  const base = upload ? 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3' : 'https://androidpublisher.googleapis.com/androidpublisher/v3';
  const r = await fetch(base + path, { method, headers: { Authorization: `Bearer ${t}`, ...(body && !upload ? { 'Content-Type': 'application/json' } : {}), ...(upload ? { 'Content-Type': contentType ?? 'application/octet-stream' } : {}) }, body: upload ? body : body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const [method, path, body] = process.argv.slice(2);
  const res = await api(method, path, body ? JSON.parse(body) : undefined);
  console.log(res.status, JSON.stringify(res.json, null, 1));
}
