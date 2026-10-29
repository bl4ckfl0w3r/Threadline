import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { blankCase, draftEnquiry, getEnquiryIdentity } from '../lib/domain.ts';
let current=blankCase('case');
const boundary={
 readCase:async()=>structuredClone(current),acquire:async()=>'lock',release:async()=>{},
 saveCase:async(_owner:string,file:typeof current)=>{current=structuredClone(file);return current;},
};
(globalThis as any).__threadlineResponseTest=boundary;
const hooks=registerHooks({resolve(specifier,context,next){
 if(decodeURIComponent(context.parentURL||'').includes('/app/api/cases/[id]/actions/route.ts')){
  if(specifier==='@/server/runtime')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(`export class AppError extends Error { constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;} } export const owner=async()=> 'owner'; export const json=(body,status=200)=>Response.json(body,{status}); export const readBody=request=>request.json();export const failure=e=>json({error:e.message,code:e.code||'request_failed'},e.status||500);`)};
  if(specifier==='@/server/store')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(['readCase','acquire','saveCase','release'].map(n=>`export const ${n}=(...args)=>globalThis.__threadlineResponseTest.${n}(...args);`).join('\n'))};
  if(specifier==='@/lib/domain')return next(new URL('../lib/domain.ts',import.meta.url).href,context);
  if(specifier==='@/server/qloo')return {shortCircuit:true,url:'data:text/javascript,export const resolveClue=()=>{};export const discover=()=>{};export const runControl=()=>{};export const safeWebsite=()=>{};'};
  if(specifier==='@/server/sources')return {shortCircuit:true,url:'data:text/javascript,export const inspect=()=>{};'};
  if(specifier==='@/server/agent')return {shortCircuit:true,url:'data:text/javascript,export const agentStep=()=>{};'};
 }
 return next(specifier,context);
}});
const {POST}=await import('../app/api/cases/[id]/actions/route.ts');hooks.deregister();
test('a response carrying the valid identity of one enquiry cannot be attached to another lead',async()=>{
 current=blankCase('case');current.leads=['a','b'].map(id=>({id,name:id,address:'Here',tags:[],introducedBy:'query'}));current.enquiry=draftEnquiry(current,current.leads[0]);
 const enquiry=structuredClone(current.enquiry);
 const response=await POST(new Request('https://threadline.test/api/cases/case/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({revision:0,action:{type:'record_enquiry_response',leadId:'b',expectedIdentity:getEnquiryIdentity(enquiry),respondent:'Record holder',receivedAt:'2026-10-29',passage:'A record excerpt',outcomeBranch:'confirming'}})}),{params:Promise.resolve({id:'case'})});
 assert.equal(response.status,409);assert.equal((await response.json() as any).code,'enquiry_conflict');assert.deepEqual(current.enquiry,enquiry);assert.equal(current.enquiry?.responses,undefined);
});
test.after(()=>{delete (globalThis as any).__threadlineResponseTest;});
