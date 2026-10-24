import {owner,json,failure,readBody} from '@/server/runtime';
import {listCases,createCase} from '@/server/store';
import {blankCase} from '@/lib/domain';
import {exampleCase} from '@/server/example';
export async function GET(request:Request){try{return json({cases:await listCases(await owner(request))});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const user=await owner(request,true);const body=await readBody(request);const id=crypto.randomUUID();return json({case:await createCase(user,body.example===true?exampleCase(id):blankCase(id))},201);}catch(e){return failure(e);}}
