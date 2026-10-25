import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { authenticateDeployment, privateResponse, ROBOTS_POLICY } from '../server/deployment-access.ts';

const env = { ACCESS_TEAM_DOMAIN: 'https://threadline-test.cloudflareaccess.com', ACCESS_AUD: 'test-audience' };
const { privateKey, publicKey } = await generateKeyPair('RS256');
const getKey = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'test', alg: 'RS256' }] });
async function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: 'test-owner', email: 'test@example.invalid', iss: env.ACCESS_TEAM_DOMAIN,
    aud: env.ACCESS_AUD, exp: now + 300, iat: now, ...overrides })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(privateKey);
}
function request(jwt?: string) {
  return new Request('https://threadline.example/workspace', { headers: {
    'oai-authenticated-user-id': 'forged-owner', 'oai-authenticated-user-email': 'forged@example.invalid',
    'oai-authenticated-user-full-name': 'Forged', ...(jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {}),
  } });
}
test('verified Access identity replaces every supplied app identity header', async () => {
  const result = await authenticateDeployment(request(await token()), env, { getKey });
  assert.ok(result instanceof Request);
  assert.equal(result.headers.get('oai-authenticated-user-id'), 'cf-access:test-owner');
  assert.equal(result.headers.get('oai-authenticated-user-email'), 'test@example.invalid');
  assert.equal(result.headers.get('oai-authenticated-user-full-name'), null);
  assert.equal(result.headers.get('Cf-Access-Jwt-Assertion'), null);
});
test('forged identity alone is rejected with noindex and no-store', async () => {
  const result = await authenticateDeployment(request(), env, { getKey });
  assert.ok(result instanceof Response); assert.equal(result.status, 401);
  assert.equal(result.headers.get('X-Robots-Tag'), ROBOTS_POLICY);
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store');
});
for (const [name, claims] of Object.entries({
  expired: { exp: 1 }, wrongAudience: { aud: 'another-app' }, wrongIssuer: { iss: 'https://other.cloudflareaccess.com' },
  missingExpiry: { exp: undefined }, missingIssuedAt: { iat: undefined }, missingSubject: { sub: undefined },
  missingEmail: { email: undefined }, invalidEmail: { email: 'bad\r\nHeader: value' }, futureToken: { nbf: 9999999999 },
})) test(`rejects ${name}`, async () => {
  const result = await authenticateDeployment(request(await token(claims)), env, { getKey });
  assert.ok(result instanceof Response); assert.equal(result.status, 401);
  assert.doesNotMatch(await result.text(), /test-owner|forged-owner|eyJ/);
});
test('rejects unsigned and wrong-key tokens', async () => {
  const other = await generateKeyPair('RS256');
  const signed = await new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(other.privateKey);
  for (const value of ['eyJhbGciOiJub25lIn0.eyJzdWIiOiJmb3JnZWQifQ.', signed]) {
    const result = await authenticateDeployment(request(value), env, { getKey });
    assert.ok(result instanceof Response); assert.equal(result.status, 401);
  }
});
test('invalid configuration fails closed without fetching an arbitrary origin', async () => {
  for (const domain of ['', 'http://test.cloudflareaccess.com', 'https://cloudflareaccess.com.evil.invalid', 'https://team.cloudflareaccess.com/path']) {
    const result = await authenticateDeployment(request(), { ...env, ACCESS_TEAM_DOMAIN: domain });
    assert.ok(result instanceof Response); assert.equal(result.status, 503);
  }
  const result = await authenticateDeployment(request(), { ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN });
  assert.ok(result instanceof Response); assert.equal(result.status, 503);
});
test('local preview bypass requires both a development build and loopback host', async () => {
  const local = new Request('http://127.0.0.1/workspace');
  assert.ok(await authenticateDeployment(local, {}, { development: true }) instanceof Request);
  assert.ok(await authenticateDeployment(local, {}) instanceof Response);
  assert.ok(await authenticateDeployment(request(), {}, { development: true }) instanceof Response);
});
test('response policy retains body, redirects and existing useful headers', async () => {
  const result = privateResponse(new Response('saved', { status: 201, headers: { 'Content-Type': 'text/plain', 'X-Test': 'ok' } }));
  assert.equal(await result.text(), 'saved'); assert.equal(result.status, 201);
  assert.equal(result.headers.get('X-Test'), 'ok'); assert.equal(result.headers.get('X-Robots-Tag'), ROBOTS_POLICY);
  assert.equal(privateResponse(Response.redirect('https://example.invalid')).headers.get('Location'), 'https://example.invalid/');
});
