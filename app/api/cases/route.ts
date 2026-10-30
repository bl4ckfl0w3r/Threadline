import {owner,json,failure,readBody,database,AppError} from '@/server/runtime';
import {listCases,createCase} from '@/server/store';
import {blankCase} from '@/lib/domain';
import {createCaseSchema,ComparisonUnavailable} from '../../../lib/comparison-case.ts';
import {loadComparisonCase} from '../../../server/comparison-data.ts';
import {exampleCase} from '@/server/example';
export async function GET(request:Request){try{return json({cases:await listCases(await owner(request))});}catch(e){return failure(e);}}
export async function POST(request:Request){try{const user=await owner(request,true);const body=createCaseSchema.parse(await readBody(request));const id=crypto.randomUUID();return json({case:await createCase(user,'fromDemo' in body?await loadComparisonCase(database(),id):body.example===true?await exampleCase(id):blankCase(id))},201);}catch(e){if(e instanceof ComparisonUnavailable)return failure(new AppError('The live CH01 comparison inputs are not installed or are invalid. The recorded demo is still available.',503,'demo_comparison_unavailable'));return failure(e);}}
