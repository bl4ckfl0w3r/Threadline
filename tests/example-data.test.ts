import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadExampleCase } from '../server/example-data.ts';

function storage(document: unknown) {
  return { prepare(sql: string) {
    assert.equal(sql, "SELECT document FROM demo_assets WHERE id='curated-fictional-example'");
    return { async first() { return document === null ? null : { document: JSON.stringify(document) }; } };
  } } as unknown as D1Database;
}
test('demo reads only curated data and gives each copied example its own identity', async () => {
  const data = { id: 'old', revision: 13, mode: 'recorded', title: 'Fictional fixture', queries: [], sources: [], agent: { status: 'complete' } };
  const a = await loadExampleCase(storage(data), 'case-a');
  const b = await loadExampleCase(storage(data), 'case-b');
  assert.equal(a.id, 'case-a'); assert.equal(b.id, 'case-b');
  assert.equal(a.revision, 0); assert.equal(a.agent.status, 'idle');
  assert.equal(a.title, data.title);
  assert.notEqual(a.queries, b.queries);
});
test('missing demo data produces an empty example, never fabricated results', async () => {
  const file = await loadExampleCase(storage(null), 'blank');
  assert.deepEqual(file.queries, []); assert.deepEqual(file.sources, []);
});
test('public demo loader rejects live case data and malformed recordings', async () => {
  await assert.rejects(loadExampleCase(storage({ mode: 'live', queries: [], sources: [] }), 'demo'), /invalid/);
  await assert.rejects(loadExampleCase(storage({ mode: 'recorded' }), 'demo'), /invalid/);
});
