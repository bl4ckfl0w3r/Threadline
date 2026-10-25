import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type AccessEnvironment = { ACCESS_TEAM_DOMAIN?: string; ACCESS_AUD?: string };
export const ROBOTS_POLICY = 'noindex, nofollow, noarchive, nosnippet';
const keySets = new Map<string, JWTVerifyGetKey>();

function teamOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(url.hostname)
      || url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}

export function privateResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('X-Robots-Tag', ROBOTS_POLICY);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'same-origin');
  headers.set('Cache-Control', 'private, no-store');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function denied(message: string, status: number): Response {
  return privateResponse(Response.json({ error: message }, { status }));
}

/** Only this verified boundary may create the identity consumed by the app. */
export async function authenticateDeployment(
  request: Request,
  env: AccessEnvironment,
  options: { development?: boolean; getKey?: JWTVerifyGetKey } = {},
): Promise<Request | Response> {
  const hostname = new URL(request.url).hostname;
  // The development plugin already strips supplied identities before adding its
  // loopback-only mock identity. Retain that identity to preserve local cases.
  if (options.development && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return request;
  const headers = new Headers(request.headers);
  for (const name of Array.from(headers.keys())) {
    if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
  }
  const issuer = teamOrigin(env.ACCESS_TEAM_DOMAIN);
  const audience = env.ACCESS_AUD?.trim();
  if (!issuer || !audience) return denied('Private preview sign-in is not configured.', 503);
  const token = headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 16384) return denied('Sign in through Cloudflare Access to open this preview.', 401);

  try {
    let getKey = options.getKey ?? keySets.get(issuer);
    if (!getKey) {
      getKey = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), { timeoutDuration: 5000 });
      keySets.set(issuer, getKey);
    }
    const { payload } = await jwtVerify(token, getKey, {
      issuer, audience, algorithms: ['RS256'], requiredClaims: ['sub', 'email', 'exp', 'iat'],
    });
    if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255
      || typeof payload.email !== 'string' || !payload.email || payload.email.length > 320
      || /[\r\n]/.test(payload.email)) return denied('The sign-in could not be verified.', 401);
    // Prefix avoids collisions with owners previously issued by another provider.
    headers.set('oai-authenticated-user-id', `cf-access:${payload.sub}`);
    headers.set('oai-authenticated-user-email', payload.email);
    headers.delete('Cf-Access-Jwt-Assertion');
    return new Request(request, { headers });
  } catch {
    // Never expose claims, tokens, signing errors or provider responses.
    return denied('The sign-in could not be verified. Please sign in again.', 401);
  }
}
