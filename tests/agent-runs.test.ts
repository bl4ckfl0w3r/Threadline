import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {blankCase,draftEnquiry,applyAgentEnquiry,actionSchema} from '../lib/domain.ts';
import {ensureAgentRun,startAgentRun,continueAgentRun,exampleRefreshClueIds} from '../lib/agent-runs.ts';
import {agentRunUsage} from '../server/usage-limits.ts';
import {serializeModelContext} from '../server/model-context.ts';

function completed(){const f=blankCase('case');f.leads=['a','b'].map(id=>({id,name:id,address:'Here',tags:[],introducedBy:'supplied'}));f.enquiry=draftEnquiry(f,f.leads[0]);f.agent.status='complete';return f;}
const reply={id:'reply-1',respondent:'Record holder',receivedAt:'2026-10-30',passage:'The receiving ledger lists the serial, but not the onward consignment.',outcomeBranch:'confirming' as const,unresolved:'Which consignment contained it?'};
test('run starts and explicit restarts keep evidence, preserve reviewed replies and never infer old grouping',()=>{
 const f=blankCase('case');f.agent.steps=5;f.activityLog=[{id:'legacy',at:'2026-10-30',kind:'agent',title:'Old step',detail:'Not grouped'}];
 ensureAgentRun(f);const first=f.agent.runId;ensureAgentRun(f);assert.equal(f.agent.runId,first);assert.equal(f.agent.steps,5);assert.equal(f.activityLog[0].runId,undefined);
 f.agent.reviewedResponseIds=['old-reply'];startAgentRun(f);assert.notEqual(f.agent.runId,first);assert.equal(f.agent.steps,0);assert.deepEqual(f.agent.reviewedResponseIds,['old-reply']);assert.equal(f.activityLog.length,1);
});
test('continue requires an unreviewed valid current response and refuses every non-complete state',()=>{
 const f=completed();assert.throws(()=>continueAgentRun(f),/response/);f.enquiry!.responses=[];assert.throws(()=>continueAgentRun(f),/response/);
 f.enquiry!.response=reply;
 for(const status of ['idle','working','stopped','error'] as const){f.agent.status=status;assert.throws(()=>continueAgentRun(f));}f.agent.status='complete';
 f.enquiry!.response={...reply,passage:''};assert.throws(()=>continueAgentRun(f));
 f.enquiry!.response={...reply,answeredQuestion:'Another enquiry'};assert.throws(()=>continueAgentRun(f));
 f.enquiry!.response=reply;const old=structuredClone(f.enquiry);continueAgentRun(f);assert.equal(f.agent.status,'idle');assert.deepEqual(f.enquiry,old);assert.deepEqual(f.agent.reviewedResponseIds,[reply.id]);
 f.agent.status='complete';assert.throws(()=>continueAgentRun(f),/new response/);
 f.enquiry!.responses=[reply,{...reply,id:'reply-2'}];continueAgentRun(f);assert.deepEqual(f.agent.reviewedResponseIds,['reply-1','reply-2']);
 assert.deepEqual(actionSchema.parse({type:'agent_continue',runId:'client-override'}),{type:'agent_continue'});
});
test('continued model context carries actual passages and a later enquiry preserves answered history',()=>{
 const f=completed();f.enquiry!.response=reply;f.enquiry!.responses=[reply];continueAgentRun(f);
 const context=JSON.parse(serializeModelContext(f));assert.equal(context.enquiry.response.passage,reply.passage);assert.equal(context.enquiry.response.unresolved,reply.unresolved);
 const next={...draftEnquiry(f,f.leads[1]),question:'Which consignment lists the serial?'};f.enquiry=applyAgentEnquiry(f.enquiry,next);
 assert.equal(f.enquiry.history![0].enquiry.response!.passage,reply.passage);assert.equal(f.enquiry.response,undefined);
});
test('example refresh runs only on new example investigations, with applicability and confirmation respected',()=>{
 const f=completed();f.mode='recorded';f.queries=[{id:'saved'} as never];f.referenceRelation='chose_place';
 f.clues=[{id:'ref',label:'Film',kind:'movie',enabled:true,provenance:'supplied_interest',entity:{id:'film',name:'Film',kind:'movie'}}];startAgentRun(f);
 assert.deepEqual(exampleRefreshClueIds(f),['ref']);f.agent.steps=1;assert.equal(exampleRefreshClueIds(f),undefined);startAgentRun(f);
 f.referenceRelation='personal_interests';assert.deepEqual(exampleRefreshClueIds(f),['ref']);delete f.referenceRelation;assert.deepEqual(exampleRefreshClueIds(f),['ref']);f.referenceRelation='observed_at_place';assert.deepEqual(exampleRefreshClueIds(f),['ref']);
 delete f.clues[0].entity;assert.equal(exampleRefreshClueIds(f),undefined);f.clues=[];f.mode='live';assert.equal(exampleRefreshClueIds(f),undefined);f.mode='recorded';
 f.agent.status='complete';f.enquiry!.response=reply;continueAgentRun(f);assert.equal(f.agent.continuedFromEnquiry,true);assert.equal(exampleRefreshClueIds(f),undefined);
 startAgentRun(f);assert.deepEqual(exampleRefreshClueIds(f),[]);f.queries=[];assert.equal(exampleRefreshClueIds(f),undefined);
});
test('run usage includes both paired attempts, source/model failures and missing results, with owner isolation and no raw data',async()=>{
 const sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE receipts(id TEXT PRIMARY KEY,case_id TEXT,owner TEXT,provider TEXT,phase TEXT,request TEXT,status INTEGER,created_at TEXT)');
 const add=sql.prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?,?)');const id='10000000-0000-4000-8000-000000000001';
 function attempt(n:string,provider:string,status:number|null,step=1,owner='owner',caseId='case',grouped=true){add.run(n,caseId,owner,provider,'attempt',JSON.stringify(grouped?{agent:{runId:id,step},secret:'must-not-be-returned'}:{}),null,'2026-10-30');if(status!==null)add.run(n+':result',caseId,owner,provider,'result','{}',status,'2026-10-30');}
 attempt('model','model',200);attempt('seeded','qloo',200);attempt('control','qloo',500);attempt('web','source',null,2);attempt('retry','qloo',200,2);attempt('bad-model','model',0,3);
 attempt('manual','qloo',200,1,'owner','case',false);attempt('foreign','model',200,1,'elsewhere');attempt('other-case','qloo',200,1,'owner','different');
 attempt('invalid-step','qloo',200,99);add.run('malformed','case','owner','qloo','attempt','not-json',null,'2026-10-30');
 const db={prepare(query:string){return{bind(...args:any[]){return{async all(){return{results:sql.prepare(query).all(...args)}}}}}}} as unknown as D1Database;
 try{const runs=await agentRunUsage(db,'owner','case');assert.equal(runs.length,1);assert.equal(runs[0].runId,id);assert.deepEqual(runs[0].usage,{modelAttempts:2,modelFailed:1,qlooAttempts:3,qlooFailed:1,sourceAttempts:1,sourceFailed:1});assert.equal(runs[0].steps[0].usage.qlooAttempts,2);assert.deepEqual(runs[0].steps.map(s=>s.step),[1,2,3]);assert.doesNotMatch(JSON.stringify(runs),/must-not-be-returned|request|secret/);assert.deepEqual(await agentRunUsage(db,'stranger','case'),[]);}finally{sql.close();}
});
