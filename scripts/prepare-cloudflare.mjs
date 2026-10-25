import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// The profile contains deployment identifiers, never provider secrets. Keep it
// under ignored private/; this command prepares configuration but never deploys.
const profilePath = process.argv[2];
if (!profilePath) throw new Error('Usage: node scripts/prepare-cloudflare.mjs private/cloudflare.json');
const profile = JSON.parse(await readFile(resolve(profilePath), 'utf8'));
if (!/^[a-f0-9]{32}$/.test(profile.account_id ?? '')) throw new Error('A real Cloudflare account ID is required.');
if (!/^[a-f0-9-]{36}$/.test(profile.database_id ?? '') || profile.database_id === '00000000-0000-4000-8000-000000000000') throw new Error('A real D1 database ID is required.');
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(profile.worker_name ?? '')) throw new Error('A valid Worker name is required.');
if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(profile.database_name ?? '')) throw new Error('A valid D1 database name is required.');
if (!/^https:\/\/[a-z0-9][a-z0-9-]*\.cloudflareaccess\.com$/.test(profile.access_team_domain ?? '') || !/^[a-f0-9]{64}$/.test(profile.access_aud ?? '')) throw new Error('Verified Cloudflare Access configuration is required.');
const base = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
const config = {
  ...base, name: profile.worker_name, account_id: profile.account_id,
  workers_dev: true, preview_urls: false,
  vars: { ACCESS_TEAM_DOMAIN: profile.access_team_domain, ACCESS_AUD: profile.access_aud },
  d1_databases: [{ binding: 'DB', database_name: profile.database_name, database_id: profile.database_id, migrations_dir: '../../drizzle' }],
  // Case contents and request URLs must not become automatic invocation logs.
  observability: { enabled: false },
};
await writeFile('dist/server/wrangler.production.json', `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
console.log('Prepared dist/server/wrangler.production.json; no remote resources were changed.');
