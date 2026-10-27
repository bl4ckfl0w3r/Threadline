import { readFile, writeFile } from 'node:fs/promises';

const [input, output] = process.argv.slice(2);
if (!input || !output || !output.startsWith('private/')) throw new Error('Usage: node scripts/prepare-demo-seed.mjs data/recorded/example.json private/demo-seed.sql');
const document = JSON.parse(await readFile(input, 'utf8'));
if (document.mode !== 'recorded' || !Array.isArray(document.queries) || !Array.isArray(document.sources)) throw new Error('Expected the curated recorded fictional example.');
const literal = JSON.stringify(document).replaceAll("'", "''");
await writeFile(output, `INSERT INTO demo_assets (id, document) VALUES ('curated-fictional-example', '${literal}') ON CONFLICT(id) DO UPDATE SET document=excluded.document;\n`, { mode: 0o600 });
console.log('Prepared private demo seed; no remote data changed.');
