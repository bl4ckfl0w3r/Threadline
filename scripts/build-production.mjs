import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
if (git('status', '--porcelain')) throw new Error('Commit authored changes before a production build.');
const revision = git('rev-parse', 'HEAD');
for (const command of ['test', 'typecheck', 'build']) execFileSync('pnpm', [command], { stdio: 'inherit' });
if (git('rev-parse', 'HEAD') !== revision || git('status', '--porcelain')) throw new Error('Checkout changed during the build.');
execFileSync(process.execPath, ['scripts/prepare-cloudflare.mjs', ...process.argv.slice(2)], { stdio: 'inherit' });
writeFileSync('dist/server/release.json', JSON.stringify({ revision }) + '\n');
console.log(`Production build verified for Git ${revision}.`);
