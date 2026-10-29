import assert from 'node:assert/strict';
import { buildDemoV2 } from '../lib/demo-v2.ts';

const [origin, revision] = process.argv.slice(2);
assert.ok(origin && new URL(origin).protocol === 'https:', 'An HTTPS production URL is required.');
assert.match(revision || '', /^[a-f0-9]{40}$/, 'An exact Git revision is required.');
let response;
for (let attempt = 0; attempt < 6; attempt++) {
  response = await fetch(origin, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (response.ok && response.headers.get('x-threadline-revision') === revision) break;
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.ok(response?.ok, 'Production homepage failed.');
assert.equal(response.headers.get('x-threadline-revision'), revision, 'Production revision differs from Git.');
assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
const cookie = response.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie, 'Production did not create a browser session.');
const headers = { Cookie: cookie };
const status = await fetch(new URL('/api/status', origin), { headers });
assert.equal(status.status, 200);
const services = await status.json();
assert.ok(services.storage && services.signedIn && services.qloo, 'Storage, session or Qloo configuration missing.');
const cases = await fetch(new URL('/api/cases', origin), { headers });
assert.equal(cases.status, 200, 'Case storage failed.');
assert.deepEqual((await cases.json()).cases, [], 'Fresh session unexpectedly sees existing cases.');
const anonymous = await fetch(new URL('/api/cases', origin));
assert.equal(anonymous.status, 401, 'Unauthenticated case access was not rejected.');
const demo = await fetch(new URL('/api/demo?version=2', origin), { headers });
assert.equal(demo.status, 200, 'CH01 demo data is unavailable; install the approved recording before release.');
assert.ok(buildDemoV2((await demo.json()).demo), 'The live demo is not a valid CH01 V2 recording.');
console.log(`Verified deployed Git revision ${revision}; noindex, sessions, case isolation and demo passed. No provider calls made.`);
