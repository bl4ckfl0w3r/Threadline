import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDemoV2 } from '../lib/demo-v2.ts';

const [input, output] = process.argv.slice(2);
const relative=output&&path.relative(path.resolve('private'),path.resolve(output));
if (!input || !output || !relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Usage: node scripts/prepare-demo-seed.mjs RECORDING_JSON private/demo-seed.sql');
const document = JSON.parse(await readFile(input, 'utf8'));
let id='curated-fictional-example';
if(document.version===2){
  if(!buildDemoV2(document))throw new Error('Invalid CH01 demo document.');
  id='ch01-demo';
}else if(document.mode !== 'recorded' || !Array.isArray(document.queries) || !Array.isArray(document.sources)) throw new Error('Expected the curated recorded fictional example.');
const literal = JSON.stringify(document).replaceAll("'", "''");
await writeFile(output, `INSERT INTO demo_assets (id, document) VALUES ('${id}', '${literal}') ON CONFLICT(id) DO UPDATE SET document=excluded.document;\n`, { mode: 0o600 });
console.log(`Prepared private ${id} seed; no remote data changed.`);
