import {owner,json,failure,readBody,AppError} from '@/server/runtime';
import {readCase,acquire,saveCase,release} from '@/server/store';
import {applyEdits} from '@/lib/domain';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{return json({case:await readCase(await owner(request),(await context.params).id)});}catch(e){return failure(e);}}
export async function PATCH(request:Request,context:Context){let user='',id='',token='';try{user=await owner(request,true);id=(await context.params).id;const body=await readBody(request);if(!Number.isInteger(body.revision))throw new AppError('A saved case revision is required.');const file=await readCase(user,id);if(body.revision!==file.revision)throw new AppError('This case changed. Reload to continue.',409,'case_conflict');let edited;try{edited=applyEdits(file,body.edits);}catch(error){throw new AppError(error instanceof Error?error.message:"Please check the case fields.",400,"validation_failed");}token=await acquire(user,id,body.revision);return json({case:await saveCase(user,edited,token)});}catch(e){if(token)await release(user,id,token);return failure(e);}}
