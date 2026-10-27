import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { browserSession } from '../server/browser-session.ts';
import { BUDGET_SQL, reserveBudget, clientBucket } from '../server/usage-limits.ts';
const secret = 'test-only-'.repeat(8);
function request(path = '/', cookie?: string, host = 'https://threadline.example') {
  return new Request(host + path, {headers: {...(cookie ? {cookie} : {}), 'oai-authenticated-user-id':'forged'}});
}
test('browser session is signed, secure and isolated between new visitors', async () => {
  const a = await browserSession(request(), secret), b = await browserSession(request(), secret);
  assert.ok(!(a instanceof Response) && !(b instanceof Response));
  assert.notEqual(a.request.headers.get('oai-authenticated-user-id'), b.request.headers.get('oai-authenticated-user-id'));
  assert.match(a.cookie!, /Secure; HttpOnly; SameSite=Lax/);
  assert.notEqual(a.request.headers.get('oai-authenticated-user-id'), 'forged');
  const again = await browserSession(request('/api/cases', a.cookie!.split(';')[0]), secret);
  assert.ok(!(again instanceof Response));
  assert.equal(again.request.headers.get('oai-authenticated-user-id'), a.request.headers.get('oai-authenticated-user-id'));
  assert.equal(again.created, false);
});
test('API cannot acquire an identity from forged headers, tampered cookies or another origin', async () => {
  const session = await browserSession(request(), secret);assert.ok(!(session instanceof Response));
  const cookie = session.cookie!.split(';')[0];
  for (const r of [request('/api/cases'), request('/api/cases', cookie+'tampered'), request('/api/cases', cookie, 'https://another.example'), request('/api/cases', cookie+'; '+cookie)]) {
    const result = await browserSession(r, secret);assert.ok(result instanceof Response);assert.equal(result.status,401);
  }
});
test('missing signing key and insecure origin fail closed', async () => {
  for (const [r,key] of [[request(), undefined],[request('/',undefined,'http://threadline.example'),secret]] as const) {
    assert.ok(await browserSession(r,key) instanceof Response);
  }
});
test('IP rate keys are keyed hashes, not raw addresses', async () => {
  const r=new Request('https://threadline.example',{headers:{'CF-Connecting-IP':'192.0.2.1'}});
  const a=await clientBucket(r,secret);assert.equal(a.length,64);assert.ok(!a.includes('192.0.2.1'));
  assert.notEqual(a,await clientBucket(r,secret+'other'));
});
test('usage reservation is atomic, bounded and resets in a new time window', async () => {
  const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE usage_buckets(bucket TEXT PRIMARY KEY,used INTEGER,expires_at INTEGER)');
  const db={prepare(query:string){return {bind(...args:(string|number)[]){return {async first(){return sql.prepare(query).get(...args) ?? null;}};}};}} as unknown as D1Database;
  assert.match(BUDGET_SQL,/WHERE used<\?/);
  await reserveBudget(db,'test',2,60,1000);await reserveBudget(db,'test',2,60,1000);
  await assert.rejects(reserveBudget(db,'test',2,60,1000),/usage limit/);
  assert.equal(sql.prepare('SELECT used FROM usage_buckets').get()!.used,2);
  await reserveBudget(db,'test',2,60,61000);sql.close();
});
