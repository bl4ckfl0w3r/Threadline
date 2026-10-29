import { owner, failure, database } from '@/server/runtime';
import { readCase, caseUsage } from '@/server/store';
import { exportBrief } from '@/lib/domain';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user=await owner(request),id=(await context.params).id;
    const file = await readCase(user,id);
    const usage=await caseUsage(database(),user,id);
    const name = file.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0,100) || 'case';
    return new Response(exportBrief(file,usage), { headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-brief.md"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return failure(error); }
}
