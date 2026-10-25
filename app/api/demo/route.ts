import { exampleCase } from '@/server/example';
import { buildDemo } from '@/lib/demo';
import { json, failure } from '@/server/runtime';

// Only the curated fictional example is exposed here, never an owner's saved case.
export async function GET() {
  try {
    const demo = buildDemo(exampleCase('demo'));
    if (!demo) return json({ error: 'The recorded demonstration is not installed on this server.' }, 503);
    return json({ demo });
  } catch (error) { return failure(error); }
}
