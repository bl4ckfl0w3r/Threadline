import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { releaseContext } from './release-context.mjs';

// Run only after the build/test command succeeds. No developer-only files are
// needed by this command; Worker secrets stay in Cloudflare.
const run = (program, args) => execFileSync(program, args, { stdio: 'inherit' });
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const changes = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
if (changes) throw new Error('Commit all authored changes before deploying.');
releaseContext(process.env, execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), head);
const productionUrl = process.env.THREADLINE_PRODUCTION_URL;
if (!productionUrl || new URL(productionUrl).protocol !== 'https:') throw new Error('Set an HTTPS THREADLINE_PRODUCTION_URL before deployment.');
const config = 'dist/server/wrangler.production.json';
const prepared = JSON.parse(readFileSync(config, 'utf8'));
if (prepared.vars?.RELEASE_SHA !== head) throw new Error('Prepared configuration is for a different revision. Rebuild first.');
if (JSON.parse(readFileSync('dist/server/release.json', 'utf8')).revision !== head) throw new Error('Run build:production for this revision before deploying.');
const cli = ['--import', './scripts/sites-env.mjs', './node_modules/wrangler/bin/wrangler.js'];
run(process.execPath, [...cli, 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', config]);
run(process.execPath, [...cli, 'deploy', '--config', config, '--message', `Git ${head}`]);
run(process.execPath, ['scripts/verify-production.mjs', productionUrl, head]);
