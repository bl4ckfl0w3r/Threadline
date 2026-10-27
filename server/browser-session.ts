import { SignJWT, jwtVerify } from 'jose';

const COOKIE = '__Host-threadline_session';
const LIFETIME = 30 * 86400;
const SUBJECT = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export type BrowserSession = { request: Request; cookie?: string; created: boolean };

/** Anonymous browser identity: no login, no shared workspace, no recovery account. */
export async function browserSession(request: Request, secret?: string): Promise<BrowserSession | Response> {
  if (!secret || secret.length < 48) return Response.json({ error: 'Workspace sessions are not configured.' }, { status: 503 });
  const url = new URL(request.url);
  if (url.protocol !== 'https:') return Response.json({ error: 'Use the secure website address.' }, { status: 400 });
  const key = new TextEncoder().encode(secret);
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(s => s.trim()).filter(s => s.startsWith(`${COOKIE}=`));
  let subject: string | undefined;
  let expires = 0;
  if (cookies.length === 1 && cookies[0].length < 4096) {
    try {
      const { payload } = await jwtVerify(cookies[0].slice(COOKIE.length + 1), key, {
        algorithms: ['HS256'], issuer: 'threadline-browser', audience: url.origin,
        requiredClaims: ['sub', 'exp', 'iat'], maxTokenAge: LIFETIME,
      });
      if (typeof payload.sub === 'string' && SUBJECT.test(payload.sub)) { subject = payload.sub; expires = payload.exp!; }
    } catch { /* Invalid and expired cookies never select an existing owner. */ }
  }
  const created = !subject;
  if (!subject) {
    if (!['GET', 'HEAD'].includes(request.method) || !['/', '/workspace', '/demo'].includes(url.pathname)) {
      return Response.json({ error: 'Open the website to start a private browser session.', code: 'session_required' }, { status: 401 });
    }
    subject = crypto.randomUUID();
  }
  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
  headers.delete('Cf-Access-Jwt-Assertion');
  headers.set('oai-authenticated-user-id', `browser:${subject}`);
  headers.set('oai-authenticated-user-email', 'browser-session@example.invalid');
  let cookie: string | undefined;
  if (created || expires - Date.now() / 1000 < 7 * 86400) {
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(subject)
      .setIssuer('threadline-browser').setAudience(url.origin).setIssuedAt().setExpirationTime(`${LIFETIME}s`).sign(key);
    cookie = `${COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${LIFETIME}`;
  }
  return { request: new Request(request, { headers }), cookie, created };
}
