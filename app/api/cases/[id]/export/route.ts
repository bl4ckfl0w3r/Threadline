import { owner, failure } from '@/server/runtime';
import { readCase } from '@/server/store';
import { exportBrief } from '@/lib/domain';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const file = await readCase(await owner(request), (await context.params).id);
    const name = file.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0,100) || 'case';
    return new Response(exportBrief(file), { headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-brief.md"`,
      'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch (error) { return failure(error); }
}
