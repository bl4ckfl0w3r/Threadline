import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {applyAgentEnquiry,blankCase,actionSchema,draftEnquiry} from '../lib/domain.ts';
import {serializeModelContext,MODEL_CONTEXT_MAX_BYTES} from '../server/model-context.ts';
import {reserveResearchBudget,clientBucket,MODEL_LIMITS} from '../server/usage-limits.ts';

function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE usage_buckets(bucket TEXT PRIMARY KEY,used INTEGER NOT NULL,expires_at INTEGER); CREATE TABLE receipts(id TEXT PRIMARY KEY,owner TEXT,phase TEXT,created_at TEXT)');
 const db={prepare(sql:string){return {bind(...args:unknown[]){const values=args as Array<string|number|null>;return {async all(){return {results:sqlite.prepare(sql).all(...values)};},async run(){return sqlite.prepare(sql).run(...values);}};}};}} as unknown as D1Database;
 return {sqlite,db};
}
test('changing browser sessions cannot reset atomic model network limits',async()=>{
 const {sqlite,db}=database(),now=Date.parse('2026-10-30T12:00:00Z'),client='a'.repeat(64),day=Math.floor(now/86400000);
 try{
  for(let i=0;i<MODEL_LIMITS.clientDay;i++)await reserveResearchBudget(db,`browser-${i}`,'model',1,now+Math.floor(i/MODEL_LIMITS.clientMinute)*60000,client);
  await assert.rejects(reserveResearchBudget(db,'fresh-cookie','model',1,now+120000,client),/allowance/);
  assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(`model-global:${day}`)!.used,MODEL_LIMITS.clientDay);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM usage_buckets WHERE bucket LIKE ?').get('research-owner:fresh-cookie:%')!.n,0);
  await reserveResearchBudget(db,'another-client','model',1,now+120000,'b'.repeat(64));
 }finally{sqlite.close();}
});
test('model burst and owner limits reject before any other budget is charged',async()=>{
 const {sqlite,db}=database(),now=Date.parse('2026-10-30T12:00:00Z'),client='a'.repeat(64),day=Math.floor(now/86400000);
 try{
  for(let i=0;i<MODEL_LIMITS.clientMinute;i++)await reserveResearchBudget(db,`browser-${i}`,'model',1,now,client);
  await assert.rejects(reserveResearchBudget(db,'burst','model',1,now,client));
  assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(`model-global:${day}`)!.used,MODEL_LIMITS.clientMinute);
  for(let i=0;i<MODEL_LIMITS.ownerDay;i++)await reserveResearchBudget(db,'fixed-owner','model',1,now+120000,i.toString(16).padStart(64,'0'));
  await assert.rejects(reserveResearchBudget(db,'fixed-owner','model',1,now+180000,'c'.repeat(64)));
  assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(`model-global:${day}`)!.used,MODEL_LIMITS.clientMinute+MODEL_LIMITS.ownerDay);
 }finally{sqlite.close();}
});
test('unavailable or invalid network identities share an allowance instead of creating unlimited fresh buckets',async()=>{
 const {sqlite,db}=database(),now=Date.parse('2026-10-30T12:00:00Z');
 try{
  for(let i=0;i<MODEL_LIMITS.clientDay;i++)await reserveResearchBudget(db,`fallback-${i}`,'model',1,now+Math.floor(i/MODEL_LIMITS.clientMinute)*60000,`untrusted-${i}`);
  await assert.rejects(reserveResearchBudget(db,'another-cookie','model',1,now+120000));
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM usage_buckets WHERE bucket LIKE ?').get('model-client:%')!.n,1);
 }finally{sqlite.close();}
});
test('network identity ignores cookies and forwarded-for and stores only a keyed hash',async()=>{
 const request=(cookie:string,forwarded:string)=>new Request('https://threadline.test/api/cases/x/actions',{headers:{'CF-Connecting-IP':'192.0.2.8',Cookie:cookie,'X-Forwarded-For':forwarded}});
 const first=await clientBucket(request('first','192.0.2.1'),'secret-signing-key'),second=await clientBucket(request('new-cookie','198.51.100.4'),'secret-signing-key');
 assert.equal(first,second);assert.match(first,/^[a-f0-9]{64}$/);assert.notEqual(first,await clientBucket(request('first','192.0.2.1'),'different-secret'));
});
test('large legacy provider rows are omitted without mutating the case; actual evidence remains bounded by bytes',()=>{
 const file=blankCase('test');file.queries=[{id:'q',label:'Query',mode:'recorded',createdAt:new Date().toISOString(),clueIds:[],leadIds:[],affinities:{},warnings:[],receiptId:'r',geography:{latitude:0,longitude:0,radius:1000},category:'all_places',rawRows:[{entity_id:'a',properties:{description:'x'.repeat(500000)}}]}];
 const context=serializeModelContext(file);assert.ok(new TextEncoder().encode(context).byteLength<MODEL_CONTEXT_MAX_BYTES);assert.doesNotMatch(context,/rawRows/);assert.equal(file.queries[0].rawRows!.length,1);
 file.sources=Array.from({length:5},(_,i)=>({id:String(i),leadId:'a',title:'Supplied evidence',excerpt:'é'.repeat(12000),kind:'user_record',mode:'supplied',capturedAt:new Date().toISOString(),note:''}));
 assert.throws(()=>serializeModelContext(file),/too large/);
 assert.deepEqual(actionSchema.parse({type:'agent_step',model:'attacker',MODEL_API_KEY:'attacker',max_tokens:999999}),{type:'agent_step'});
});
test('model drafts cannot invent recorded replies or discard answered enquiries',()=>{
 const file=blankCase('test'),lead={id:'venue',name:'Venue',address:'Here',tags:[],introducedBy:'q'};
 const previous=draftEnquiry(file,lead),reply={id:'human-reply',respondent:'Records officer',receivedAt:'2026-10-30',passage:'The manifest is incomplete.',outcomeBranch:'unavailable' as const};
 previous.response=reply;previous.responses=[reply];
 const generated={...previous,question:'Which depot intake record is available?',response:{...reply,id:'fabricated'},responses:[{...reply,id:'fabricated'}],history:[]};
 const fresh=applyAgentEnquiry(previous,generated,'2026-10-30T12:00:00Z');assert.equal(fresh.response,undefined);assert.equal(fresh.responses,undefined);assert.equal(fresh.history![0].enquiry.response!.id,'human-reply');assert.equal(previous.question,draftEnquiry(file,lead).question);
 const same=applyAgentEnquiry(previous,{...generated,question:previous.question,whyThisCheck:'Resolve the missing manifest.'});assert.equal(same.response!.id,'human-reply');assert.equal(same.whyThisCheck,'Resolve the missing manifest.');
 assert.equal(applyAgentEnquiry(undefined,generated).response,undefined);
});

const config={MODEL_API_KEY:'private-test-provider-key',MODEL_BASE_URL:'https://generativelanguage.googleapis.com/v1beta/openai',MODEL_NAME:'gemini-3.8-flash',MODEL_REASONING_EFFORT:'medium',SESSION_SIGNING_KEY:'s'.repeat(64)};
let allowed=true,reservations:unknown[][]=[],attempts=0,results:unknown[][]=[],fetches=0;
const state={bindings:()=>config,reserveRequests:async(...args:unknown[])=>{if(!allowed)throw new Error('Model allowance exhausted');reservations.push(args);return {remaining:1,buckets:[],pendingBucket:'pending'};},releaseRequests:async()=>{},beginReceipt:async(...args:unknown[])=>{attempts++;(args[4] as {remaining:number}).remaining--;return 'model-receipt';},endReceipt:async(...args:unknown[])=>{results.push(args);}};
(globalThis as unknown as {__modelSecurityTest:typeof state}).__modelSecurityTest=state;
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/server/agent.ts')){
  if(specifier==='./runtime')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent("export class AppError extends Error{constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;}}export const bindings=()=>globalThis.__modelSecurityTest.bindings();")};
  if(specifier==='./store')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(['beginReceipt','endReceipt','reserveRequests','releaseRequests'].map(name=>`export const ${name}=(...args)=>globalThis.__modelSecurityTest.${name}(...args);`).join('\n'))};
  if(specifier==='./qloo'||specifier==='./sources')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const resolveClue=()=>{throw new Error("Unexpected tool")};export const discover=resolveClue;export const inspect=resolveClue;')};
  if(specifier==='@/lib/domain')return next('../lib/domain.ts',context);
  if(specifier==='./model-context')return next('./model-context.ts',context);
  if(specifier==='./usage-limits')return next('./usage-limits.ts',context);
 }
 return next(specifier,context);
}});
const {agentStep}=await import('../server/agent.ts');hooks.deregister();
const originalFetch=globalThis.fetch;
test('real agent request uses server-only Gemini settings and bounded generation, ignoring client overrides',async()=>{
 allowed=true;reservations=[];attempts=0;results=[];fetches=0;
 globalThis.fetch=async(url,options)=>{
  fetches++;assert.equal(String(url),config.MODEL_BASE_URL+'/chat/completions');assert.equal(new Headers(options?.headers).get('Authorization'),'Bearer '+config.MODEL_API_KEY);assert.equal(options?.redirect,'manual');
  const text=String(options?.body),body=JSON.parse(text);assert.equal(body.model,'gemini-3.8-flash');assert.equal(body.reasoning_effort,'medium');assert.equal(body.max_tokens,3000);assert.doesNotMatch(text,/private-test-provider-key/);
  return Response.json({choices:[{message:{content:JSON.stringify({tool:'ask',reason:'The case has no dates.',question:'What date did the reported incident occur?'})}}]});
 };
 const file=blankCase('test');const request=new Request('https://threadline.test/api/cases/test/actions',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.8'},body:JSON.stringify({MODEL_API_KEY:'attacker',MODEL_BASE_URL:'https://attacker.test'})});
 await agentStep('owner',file,request);assert.equal(fetches,1);assert.equal(attempts,1);assert.equal(results.length,1);assert.match(String(reservations[0][3]),/^[a-f0-9]{64}$/);assert.equal(file.agent.status,'stopped');assert.doesNotMatch(JSON.stringify(file),/private-test-provider-key/);
});
test('oversized context and exhausted allowances make no model request',async()=>{
 const before=fetches;allowed=false;await assert.rejects(agentStep('owner',blankCase('test')),/allowance/);assert.equal(fetches,before);
 allowed=true;const file=blankCase('test');file.notes='x'.repeat(MODEL_CONTEXT_MAX_BYTES);const reservationsBefore=reservations.length;await assert.rejects(agentStep('owner',file),/too large/);assert.equal(fetches,before);assert.equal(reservations.length,reservationsBefore);
});
test('failed provider calls are counted once and do not expose provider error bodies or credentials',async()=>{
 allowed=true;const attemptsBefore=attempts,resultsBefore=results.length;
 globalThis.fetch=async()=>Response.json({error:{message:config.MODEL_API_KEY}},{status:429});
 const file=blankCase('provider-failure');
 await assert.rejects(agentStep('owner',file),error=>error instanceof Error&&/429/.test(error.message)&&!error.message.includes(config.MODEL_API_KEY));
 assert.equal(attempts,attemptsBefore+1);assert.equal(results.length,resultsBefore+1);assert.equal(results.at(-1)![4],429);assert.equal(file.agent.status,'error');assert.doesNotMatch(JSON.stringify(file),/private-test-provider-key/);
 const previous=config.MODEL_BASE_URL;config.MODEL_BASE_URL='http://untrusted.test';
 try{await assert.rejects(agentStep('owner',blankCase('insecure-endpoint')),/HTTPS/);assert.equal(attempts,attemptsBefore+1);}finally{config.MODEL_BASE_URL=previous;}
});
test('provider redirects are not followed and preserve their HTTP status in one receipt',async()=>{
 allowed=true;let calls=0;const attemptsBefore=attempts,resultsBefore=results.length;
 globalThis.fetch=async(_url,options)=>{calls++;assert.equal(options?.redirect,'manual');return new Response(null,{status:307,headers:{Location:'https://untrusted.example/collect'}});};
 const file=blankCase('redirect');
 await assert.rejects(agentStep('owner',file),(error:unknown)=>error instanceof Error&&'code' in error&&error.code==='model_redirect');
 assert.equal(calls,1);assert.equal(attempts,attemptsBefore+1);assert.equal(results.length,resultsBefore+1);assert.equal(results.at(-1)![4],307);assert.equal(file.agent.status,'error');assert.equal(file.activityLog.length,0);
});
test('transport, timeout and non-JSON failures return safe actionable errors without retries',async()=>{
 allowed=true;
 for(const scenario of [
  {reply:()=>{throw new TypeError(config.MODEL_API_KEY);},code:'model_transport_failed',status:0},
  {reply:()=>{throw new DOMException(config.MODEL_API_KEY,'TimeoutError');},code:'model_timeout',status:0},
  {reply:()=>new Response(config.MODEL_API_KEY,{status:503}),code:'model_response',status:503},
 ]){
  const attemptsBefore=attempts,resultsBefore=results.length;let calls=0;
  globalThis.fetch=async()=>{calls++;return scenario.reply();};const file=blankCase('failure');
  await assert.rejects(agentStep('owner',file),(error:unknown)=>error instanceof Error&&'code' in error&&error.code===scenario.code&&!error.message.includes(config.MODEL_API_KEY));
  assert.equal(calls,1);assert.equal(attempts,attemptsBefore+1);assert.equal(results.length,resultsBefore+1);assert.equal(results.at(-1)![4],scenario.status);assert.doesNotMatch(JSON.stringify(results.at(-1)),/private-test-provider-key/);assert.equal(file.agent.status,'error');
 }
});
test.after(()=>{globalThis.fetch=originalFetch;delete (globalThis as unknown as {__modelSecurityTest?:typeof state}).__modelSecurityTest;});
