import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
import {applyAgentEnquiry,blankCase,actionSchema,draftEnquiry} from '../lib/domain.ts';
import {continueAgentRun} from '../lib/agent-runs.ts';
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
let allowed=true,reservations:unknown[][]=[],attempts=0,results:unknown[][]=[],fetches=0,receiptRequests:unknown[][]=[];
const state={bindings:()=>config,reserveRequests:async(...args:unknown[])=>{if(!allowed)throw new Error('Model allowance exhausted');reservations.push(args);return {remaining:1,buckets:[],pendingBucket:'pending'};},releaseRequests:async()=>{},beginReceipt:async(...args:unknown[])=>{attempts++;receiptRequests.push(args);(args[4] as {remaining:number}).remaining--;return `model-receipt-${attempts}`;},endReceipt:async(...args:unknown[])=>{results.push(args);},discover:async(..._args:unknown[]):Promise<{title:string;detail:string;receipt?:string}>=>{throw new Error('Unexpected tool');},inspect:async(..._args:unknown[]):Promise<{title:string;detail:string;receipt?:string}>=>{throw new Error('Unexpected tool');}};
(globalThis as unknown as {__modelSecurityTest:typeof state}).__modelSecurityTest=state;
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/server/agent.ts')){
  if(specifier==='./runtime')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent("export class AppError extends Error{constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;}}export const bindings=()=>globalThis.__modelSecurityTest.bindings();")};
  if(specifier==='./store')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(['beginReceipt','endReceipt','reserveRequests','releaseRequests'].map(name=>`export const ${name}=(...args)=>globalThis.__modelSecurityTest.${name}(...args);`).join('\n'))};
  if(specifier==='./qloo'||specifier==='./sources')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const resolveClue=()=>{throw new Error("Unexpected tool")};export const discover=(...args)=>globalThis.__modelSecurityTest.discover(...args);export const runControl=resolveClue;export const inspect=(...args)=>globalThis.__modelSecurityTest.inspect(...args);')};
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
  const text=String(options?.body),body=JSON.parse(text);assert.equal(body.model,'gemini-3.8-flash');assert.equal(body.reasoning_effort,'medium');assert.equal(body.max_tokens,8000);assert.doesNotMatch(text,/private-test-provider-key/);
  return Response.json({choices:[{message:{content:JSON.stringify({tool:'ask',reason:'The case has no dates.',question:'What date did the reported incident occur?'})}}]});
 };
 const file=blankCase('test');const request=new Request('https://threadline.test/api/cases/test/actions',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.8'},body:JSON.stringify({MODEL_API_KEY:'attacker',MODEL_BASE_URL:'https://attacker.test'})});
 await agentStep('owner',file,request);assert.equal(fetches,1);assert.equal(attempts,1);assert.equal(results.length,1);assert.match(String(reservations[0][3]),/^[a-f0-9]{64}$/);assert.equal(file.agent.status,'stopped');assert.equal(file.agent.stopReason,'ask');assert.equal(file.agent.pendingQuestion?.question,'What date did the reported incident occur?');assert.ok(file.agent.runId);assert.equal(file.activityLog[0].runId,file.agent.runId);assert.equal(file.activityLog[0].step,1);assert.match(file.activityLog[0].detail,/What date/);assert.doesNotMatch(JSON.stringify(file),/private-test-provider-key/);
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
test('a continued real agent step reads the recorded answer and archives it when drafting another enquiry',async()=>{
 allowed=true;const file=blankCase('continued');file.leads=['a','b'].map(id=>({id,name:id,address:'Here',tags:[],introducedBy:'supplied'}));file.enquiry=draftEnquiry(file,file.leads[0]);
 const reply={id:'actual-reply',respondent:'Records desk',receivedAt:'2026-10-30',passage:'The ledger identifies the item but gives no consignment contents.',outcomeBranch:'confirming' as const,unresolved:'Obtain the contents manifest.'};file.enquiry.response=reply;file.agent.status='complete';continueAgentRun(file);const runId=file.agent.runId;
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(String(options?.body)),context=JSON.parse(body.messages[1].content);assert.equal(context.enquiry.response.passage,reply.passage);assert.match(body.messages[0].content,/actual passage/);return Response.json({choices:[{message:{content:JSON.stringify({tool:'finish',reason:'The receiving entry leaves the consignment unresolved.',enquiry:{...draftEnquiry(file,file.leads[1]),question:'Which consignment contents manifest lists this item?'}})}}]});};
 await agentStep('owner',file);assert.equal(file.agent.runId,runId);assert.equal(file.agent.status,'complete');assert.equal(file.agent.steps,1);assert.equal(file.enquiry.leadId,'b');assert.equal(file.enquiry.history![0].enquiry.response!.id,reply.id);assert.equal(file.enquiry.response,undefined);
});
const modelReply=(content:string,finish_reason='stop')=>Response.json({choices:[{finish_reason,message:{content}}]});
const finishing=(file:ReturnType<typeof blankCase>,draft:string)=>JSON.stringify({tool:'finish',reason:'The worksheet leaves the receipt open.',enquiry:{...draftEnquiry(file,file.leads[0]),draft}});
const leadCase=(id:string)=>{const file=blankCase(id);file.leads=[{id:'a',name:'Libreria',address:'Here',website:'https://libreria.example.org/',tags:[],introducedBy:'qloo'}];return file;};
test('a reply cut off at the length limit is retried once with lower reasoning and its own receipt',async()=>{
 allowed=true;const attemptsBefore=attempts,resultsBefore=results.length,bodies:{reasoning_effort:string;messages:unknown[]}[]=[];
 globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return bodies.length===1?modelReply('{"tool":"ask","reason":"The ca','length'):modelReply(JSON.stringify({tool:'ask',reason:'Dates are missing.',question:'What date?'}));};
 const file=blankCase('cut-off');await agentStep('owner',file);
 assert.equal(bodies.length,2);assert.equal(bodies[0].reasoning_effort,'medium');assert.equal(bodies[1].reasoning_effort,'low');assert.equal(bodies[1].messages.length,3);assert.equal(attempts,attemptsBefore+2);assert.equal(results.length,resultsBefore+2);assert.equal(file.agent.steps,1);assert.equal(file.agent.status,'stopped');assert.equal(file.agent.pendingQuestion?.question,'What date?');
});
test('two unusable replies stop the step and name the cut-off without running a tool',async()=>{
 allowed=true;let calls=0;globalThis.fetch=async()=>{calls++;return modelReply('{"tool":"ask","rea','length');};
 const file=blankCase('cut-off-twice');
 await assert.rejects(agentStep('owner',file),(error:unknown)=>error instanceof Error&&'code' in error&&error.code==='model_response'&&/cut off.*finish_reason: length; attempt 2 of 2/.test(error.message));
 assert.equal(calls,2);assert.equal(file.agent.status,'error');assert.equal(file.activityLog.length,0);
});
test('an apparently complete action with a length finish reason is retried and never applied',async()=>{
 allowed=true;let calls=0;const file=blankCase('parseable-cut-off');
 globalThis.fetch=async()=>{calls++;return modelReply(JSON.stringify({tool:'ask',reason:'Need a date.',question:calls===1?'Incomplete first action':'Which date?'}),calls===1?'length':'stop');};
 await agentStep('owner',file);assert.equal(calls,2);assert.equal(file.agent.pendingQuestion?.question,'Which date?');assert.equal(file.activityLog.length,1);
});
test('malformed envelopes fail safely, spend at most two attempts and include a safe finish reason',async()=>{
 allowed=true;
 for(const body of [null,{choices:[{message:{content:{text:'bad shape'}}}]},{choices:[{finish_reason:config.MODEL_API_KEY,message:{content:'{"tool":"ask","reason":"Missing date","question":"When?"}'}}]}]){
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json(body);};const file=blankCase('bad-envelope');
  await assert.rejects(agentStep('owner',file),(error:unknown)=>error instanceof Error&&/finish_reason: (missing|unknown); attempt 2 of 2/.test(error.message)&&!error.message.includes(config.MODEL_API_KEY));
  assert.equal(calls,2);assert.equal(file.agent.status,'error');assert.equal(file.activityLog.length,0);
 }
});
test('filtered or explicitly refused replies stop without retrying or applying their JSON',async()=>{
 allowed=true;
 for(const reply of [{finish_reason:'content_filter',message:{content:'{"tool":"ask","reason":"Missing date","question":"When?"}'}},{finish_reason:'stop',message:{refusal:'Provider refusal details'}}]){
  let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({choices:[reply]});};const file=blankCase('refused');
  await assert.rejects(agentStep('owner',file),(error:unknown)=>error instanceof Error&&'code' in error&&error.code==='model_refused'&&/finish_reason: (content_filter|stop)/.test(error.message)&&!error.message.includes('Provider refusal details'));
  assert.equal(calls,1);assert.equal(file.activityLog.length,0);assert.equal(file.agent.status,'error');
 }
});
test('retry attempts have distinct receipts, share a run step and record actual generation settings',async()=>{
 allowed=true;receiptRequests=[];const resultsBefore=results.length,reservationsBefore=reservations.length;let calls=0;
 globalThis.fetch=async()=>{calls++;return calls===1?modelReply('unreadable'):modelReply('{"tool":"ask","reason":"Missing date","question":"When?"}');};
 const file=blankCase('counted-retry');await agentStep('owner',file);
 assert.equal(calls,2);assert.equal(reservations.length,reservationsBefore+2);const finished=results.slice(resultsBefore);assert.equal(finished.length,2);assert.notEqual(finished[0][3],finished[1][3]);
 for(const [i,args] of receiptRequests.entries()){
  assert.deepEqual(args[5],{runId:file.agent.runId,step:1});const request=args[3] as {maxTokens:number;reasoningEffort:string;attempt:number};
  assert.equal(request.maxTokens,8000);assert.equal(request.reasoningEffort,i===0?'medium':'low');assert.equal(request.attempt,i+1);
 }
 assert.equal(file.agent.steps,1);
});
test('a fenced model reply is accepted without spending a retry',async()=>{
 allowed=true;let calls=0;globalThis.fetch=async()=>{calls++;return modelReply('```json\n{"tool":"ask","reason":"Dates are missing.","question":"What date?"}\n```');};
 const file=blankCase('fenced');await agentStep('owner',file);assert.equal(calls,1);assert.equal(file.agent.status,'stopped');
});
test('a retry the allowance cannot cover reports the first failure and makes no second request',async()=>{
 allowed=true;let calls=0;globalThis.fetch=async()=>{calls++;allowed=false;return modelReply('not json');};
 const file=blankCase('no-allowance');
 try{await assert.rejects(agentStep('owner',file),/unreadable action/);assert.equal(calls,1);}finally{allowed=true;}
});
test('a slow first reply leaves a bounded retry budget before research and case saving',async()=>{
 allowed=true;const originalNow=Date.now,originalTimeout=AbortSignal.timeout,timeouts:number[]=[];let now=1000,calls=0;
 Date.now=()=>now;AbortSignal.timeout=(milliseconds:number)=>{timeouts.push(milliseconds);return originalTimeout(milliseconds);};
 globalThis.fetch=async()=>{calls++;if(calls===1){now+=59000;return modelReply('unreadable');}return modelReply('{"tool":"ask","reason":"Need dates","question":"When?"}');};
 try{await agentStep('owner',blankCase('slow-retry'));assert.equal(calls,2);assert.deepEqual(timeouts,[60000,21000]);}finally{Date.now=originalNow;AbortSignal.timeout=originalTimeout;}
});
test('an overclaiming draft is sent back once and a corrected draft is kept',async()=>{
 allowed=true;const bodies:{messages:{content:string}[]}[]=[];const file=leadCase('overclaim');const fixed='Could you confirm whether a reading took place at your venue on 15 October? A supplied worksheet lists RP-140, not RP-104.';
 globalThis.fetch=async(_url,options)=>{bodies.push(JSON.parse(String(options?.body)));return modelReply(finishing(file,bodies.length===1?'I am writing about a reading hosted at your venue on 15 October, and wondered if you hold a record.':fixed));};
 await agentStep('owner',file);assert.equal(bodies.length,2);assert.match(bodies[1].messages[2].content,/hosted at your venue/);assert.equal(file.enquiry!.draft,fixed);assert.equal(file.agent.status,'complete');
});
test('a draft that overclaims twice is replaced by the neutral draft and says so',async()=>{
 allowed=true;let calls=0;const file=leadCase('overclaim-twice');
 globalThis.fetch=async()=>{calls++;return modelReply(finishing(file,'Your staff received portfolio RP-104 from our courier.'));};
 await agentStep('owner',file);assert.equal(calls,2);assert.doesNotMatch(file.enquiry!.draft,/received/);assert.match(file.enquiry!.draft,/remains unresolved/);assert.equal(file.agent.status,'complete');assert.match(file.activityLog.at(-1)!.detail,/neutral draft/);
});
test('a failed retry cannot resurrect an overclaiming enquiry from an earlier reply',async()=>{
 allowed=true;let calls=0;const file=leadCase('stale-fallback');
 globalThis.fetch=async()=>{calls++;return calls===1?modelReply(finishing(file,'Your staff received portfolio RP-104 from our courier.')):modelReply('{"tool":"finish"','length');};
 await assert.rejects(agentStep('owner',file),/finish_reason: length; attempt 2 of 2/);assert.equal(calls,2);assert.equal(file.enquiry,undefined);assert.equal(file.agent.status,'error');assert.equal(file.activityLog.length,0);
});
test('the agent may read a place website with or without www, but not an unrelated host',async()=>{
 allowed=true;const read:unknown[][]=[];state.inspect=async(...args)=>{read.push(args);return {title:'Source captured',detail:'Page',receipt:'r'};};
 const reply=(url:string)=>modelReply(JSON.stringify({tool:'inspect',leadId:'a',url,reason:'Check listed events.'}));
 const file=leadCase('lead-host');globalThis.fetch=async()=>reply('https://www.libreria.example.org/events');
 await agentStep('owner',file);assert.equal(read.length,1);assert.equal(file.agent.status,'working');
 const other=leadCase('other-host');globalThis.fetch=async()=>reply('https://elsewhere.example.net/');
 await assert.rejects(agentStep('owner',other),(error:unknown)=>error instanceof Error&&'code' in error&&error.code==='source_reference_invalid');assert.equal(read.length,1);
});
test('a site refusing to be read is logged, the run continues, and the same URL is not retried',async()=>{
 allowed=true;state.inspect=async()=>{throw Object.assign(new Error('This source could not be read.'),{code:'source_unavailable'});};
 const file=leadCase('refused'),url='https://libreria.example.org/events';globalThis.fetch=async()=>modelReply(JSON.stringify({tool:'inspect',leadId:'a',url,reason:'Check listed events.'}));
 await agentStep('owner',file);assert.equal(file.agent.status,'working');assert.equal(file.activityLog.at(-1)!.title,'Source could not be read');
 await assert.rejects(agentStep('owner',file),(error:unknown)=>error instanceof Error&&'code' in error&&error.code==='repeated_action');
});
test('an unexpected source failure still stops the run',async()=>{
 allowed=true;state.inspect=async()=>{throw new Error('boom');};
 const file=leadCase('source-crash');globalThis.fetch=async()=>modelReply(JSON.stringify({tool:'inspect',leadId:'a',url:'https://libreria.example.org/',reason:'Check.'}));
 await assert.rejects(agentStep('owner',file),/boom/);assert.equal(file.agent.status,'error');
});
test('starting the supplied example refreshes Qloo in the current run before spending a model call',async()=>{
 allowed=true;const file=leadCase('refresh-example');file.mode='recorded';file.referenceRelation='chose_place';file.queries=[{id:'saved'} as never];
 file.clues=[{id:'film',label:'Film',kind:'movie',enabled:true,provenance:'supplied_interest',entity:{id:'film-id',name:'Film',kind:'movie'}}];
 const calls:unknown[][]=[];state.discover=async(...args)=>{calls.push(args);return {title:'Five places returned',detail:'Fresh Qloo comparison.',receipt:'fresh-qloo'};};
 const modelAttemptsBefore=attempts;globalThis.fetch=async()=>{throw new Error('No model should be called during the refresh');};
 await agentStep('owner',file);assert.equal(calls.length,1);assert.deepEqual(calls[0][2],['film']);assert.deepEqual(calls[0][3],{runId:file.agent.runId,step:1});assert.deepEqual(calls[0][4],{freshControl:true});assert.equal(attempts,modelAttemptsBefore);assert.equal(file.agent.status,'working');assert.equal(file.activityLog[0].title,'Example research refresh');assert.equal(file.activityLog[1].receiptId,'fresh-qloo');
 globalThis.fetch=async()=>modelReply('{"tool":"ask","reason":"Need dates","question":"When?"}');await agentStep('owner',file);assert.equal(calls.length,1);assert.equal(file.agent.steps,2);assert.equal(file.agent.pendingQuestion?.question,'When?');
});
test('a failed example refresh is visible and cannot silently draft from old research',async()=>{
 const file=leadCase('failed-refresh');file.mode='recorded';file.queries=[{id:'saved'} as never];state.discover=async()=>{throw new Error('Qloo allowance exhausted');};
 globalThis.fetch=async()=>{throw new Error('No model should be called after a failed refresh');};
 await assert.rejects(agentStep('owner',file),/Qloo allowance exhausted/);assert.equal(file.agent.status,'error');assert.equal(file.enquiry,undefined);assert.equal(file.agent.steps,1);
});
test.after(()=>{globalThis.fetch=originalFetch;delete (globalThis as unknown as {__modelSecurityTest?:typeof state}).__modelSecurityTest;});
