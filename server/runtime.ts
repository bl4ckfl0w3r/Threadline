import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { UsageLimitError } from './usage-limits';

export class AppError extends Error {
  constructor(message: string, public status = 400, public code = 'invalid_request') { super(message); }
}
export function bindings() { return env as Cloudflare.Env & {QLOO_API_KEY?:string;MODEL_API_KEY?:string;MODEL_BASE_URL?:string;MODEL_NAME?:string;MODEL_REASONING_EFFORT?:string;SOURCE_ALLOWED_HOSTS?:string}; }
export function database() { const db=bindings().DB;if(!db)throw new AppError('Case storage is not configured.',503,'storage_unavailable');return db; }
export async function owner(request: Request, mutation=false) {
  const url=new URL(request.url);
  if(mutation && request.headers.get('origin')!==url.origin) throw new AppError('Please make this request from the application.',403,'origin_mismatch');
  const user=await getChatGPTUser();if(user)return user.userId;
  if(import.meta.env.DEV && ['127.0.0.1','localhost','[::1]'].includes(url.hostname)) return 'local-preview';
  throw new AppError('Sign in to open your cases.',401,'sign_in_required');
}
export async function readBody(request: Request) {
  if(!request.headers.get('content-type')?.includes('application/json'))throw new AppError('Expected a JSON request.',415);
  if(Number(request.headers.get('content-length')||0)>60000)throw new AppError('This request is too large.',413);
  const text=await request.text();if(text.length>60000)throw new AppError('This request is too large.',413);
  try{return JSON.parse(text);}catch{throw new AppError('The request could not be read.');}
}
export function json(value: unknown, status=200) { return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}}); }
export function failure(error:unknown) {
  if(error instanceof UsageLimitError)return json({error:error.message,code:error.code},error.status);
  if(error instanceof AppError)return json({error:error.message,code:error.code},error.status);
  if(error instanceof Error && error.name==='ZodError')return json({error:'Please check the fields and try again.',code:'validation_failed'},400);
  console.error('Application request failed:',error instanceof Error?error.name:'unknown');
  return json({error:'The request could not be completed. Your saved work is still available.',code:'request_failed'},500);
}
