import { database,json,failure } from '@/server/runtime';
import { demoResponse } from '@/server/demo-data';

// Version selection keeps the existing frontend working during the CH01 rollout.
export async function GET(request:Request) {
  try {
    const result=await demoResponse(database(),new URL(request.url).searchParams.get('version'));
    return json(result.body,result.status);
  } catch(error){return failure(error);}
}
