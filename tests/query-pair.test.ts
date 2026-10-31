import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { blankCase, whatTheReferencesChanged } from '../lib/domain.ts';
import type { CaseFile } from '../lib/contracts.ts';

// Runtime boundaries are replaced before loading qloo; no network or Cloudflare binding is used.
let contexts:unknown[]=[],reservations:number[]=[],attempts:unknown[]=[],results:unknown[]=[],released:number[]=[],allow=true;
const state={
 bindings:()=>({QLOO_API_KEY:'test-key'}),
 reserveRequests:async (_owner:string,_provider:string,count:number)=>{if(!allow)throw new Error('Pair allowance exceeded');reservations.push(count);return {remaining:count,buckets:[]};},
 releaseRequests:async (r:{remaining:number})=>{released.push(r.remaining);r.remaining=0;},
 beginReceipt:async (_owner:string,_caseId:string,_provider:string,request:unknown,r:{remaining:number},context?:unknown)=>{r.remaining--;contexts.push(context);attempts.push(request);return `receipt-${attempts.length}`;},
 endReceipt:async (...args:unknown[])=>{results.push(args);},
};
(globalThis as any).__threadlineQlooTest=state;
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/server/qloo.ts')){
  if(specifier==='./runtime')return {url:'data:text/javascript,'+encodeURIComponent(`export class AppError extends Error { constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;} } export const bindings=()=>globalThis.__threadlineQlooTest.bindings();`),shortCircuit:true};
  if(specifier==='./store')return {url:'data:text/javascript,'+encodeURIComponent(['beginReceipt','endReceipt','reserveRequests','releaseRequests'].map(n=>`export const ${n}=(...args)=>globalThis.__threadlineQlooTest.${n}(...args);`).join('\n')),shortCircuit:true};
  if(specifier==='../lib/domain')return next('../lib/domain.ts',context);
 }
 return next(specifier,context);
}});
const {discover,runControl}=await import('../server/qloo.ts');hooks.deregister();
function file():CaseFile {const f=blankCase('case');f.category='all_places';f.clues=[{id:'film',label:'Film',kind:'movie',provenance:'supplied_interest',enabled:true,entity:{id:'entity-film',name:'Film',kind:'movie'}}];return f;}
function reset(){contexts=[];reservations=[];attempts=[];results=[];released=[];allow=true;}
const originalFetch=globalThis.fetch;
function responses(statuses:number[]){globalThis.fetch=async ()=>{const status=statuses.shift();assert.ok(status,'Unexpected provider call');return new Response(JSON.stringify(status===200?{results:{entities:[{entity_id:'venue',name:'Venue',query:{affinity:0.5}}]}}:{error:'provider failure'}),{status});};}

test('seeded discovery reserves both calls before requesting; exact same-day controls are reused',async()=>{
 reset();responses([200,200]);const f=file();const first=await discover('owner',f,['film']);
 assert.deepEqual(reservations,[2]);assert.equal(attempts.length,2);assert.equal(f.queries.length,2);assert.equal(f.queries.at(-1)!.id,first.query.id);
 assert.equal(first.query.controlQueryId,f.queries[0].id);assert.deepEqual(first.query.scope,f.queries[0].scope);
 const sent=attempts as Array<{params:Record<string,string>}>;assert.equal(sent[0].params['signal.interests.entities'],'entity-film');assert.equal(sent[1].params['signal.interests.entities'],undefined);
 responses([200]);await discover('owner',f,['film']);assert.deepEqual(reservations,[2,1]);assert.equal(attempts.length,3);
});
test('an explicit example refresh requests a new seeded/control pair even when today’s control exists',async()=>{
 reset();responses([200,200]);const f=file();await discover('owner',f,['film']);const oldControl=f.queries[0].id;
 const run={runId:'10000000-0000-4000-8000-000000000001',step:1};responses([200,200]);const fresh=await discover('owner',f,['film'],run,{freshControl:true});
 assert.deepEqual(reservations,[2,2]);assert.equal(attempts.length,4);assert.equal(f.queries.length,4);assert.notEqual(fresh.query.controlQueryId,oldControl);assert.deepEqual(contexts.slice(-2),[run,run]);
 const params=attempts as Array<{params:Record<string,string>}>;assert.equal(params[2].params['signal.interests.entities'],'entity-film');assert.equal(params[3].params['signal.interests.entities'],undefined);assert.equal(f.queries.at(-1)!.id,fresh.query.id);
});
test('failed control leaves seeded result and both receipts, and retry requests only the original scope control',async()=>{
 reset();responses([200,500]);const f=file();await assert.rejects(discover('owner',f,['film']),/Receipt:/);
 assert.equal(f.queries.length,1);assert.equal(f.queries[0].clueIds[0],'film');assert.equal(f.queries[0].controlQueryId,undefined);assert.match(f.queries[0].warnings[0],/Comparison incomplete/);assert.equal(attempts.length,2);assert.equal(results.length,2);
 const originalScope=structuredClone(f.queries[0].scope);f.radius=30000;responses([200]);await runControl('owner',f,f.queries[0].id);
 assert.deepEqual(reservations,[2,1]);assert.deepEqual(f.queries[1].scope,originalScope);assert.equal(f.queries[0].controlQueryId,f.queries[1].id);assert.deepEqual(f.queries[0].warnings,[]);
});
test('seeded failure keeps a previously successful control and returns unused reservation capacity',async()=>{
 reset();responses([200]);const f=file();await discover('owner',f,[]);const control=f.queries[0];responses([500]);await assert.rejects(discover('owner',f,['film']));assert.deepEqual(f.queries,[control]);assert.deepEqual(reservations,[1,1]);
 reset();responses([500]);await assert.rejects(discover('owner',file(),['film']));assert.deepEqual(released,[1]);assert.equal(attempts.length,1);
});
test('insufficient paired allowance makes no provider calls or case mutations',async()=>{
 reset();allow=false;responses([]);const f=file();await assert.rejects(discover('owner',f,['film']),/allowance/);assert.equal(attempts.length,0);assert.equal(f.queries.length,0);
});
test('a legacy control can be displayed but is never reused to skip a newly scoped provider control',async()=>{
 reset();responses([200]);const f=file();await discover('owner',f,[]);
 delete f.queries[0].scope;
 reset();responses([200,200]);await discover('owner',f,['film']);
 assert.deepEqual(reservations,[2]);assert.equal(attempts.length,2);
 assert.notEqual(f.queries.at(-1)!.controlQueryId,f.queries[0].id);
});
test('live query rows stay small while full receipts and provider positions survive malformed and duplicate rows',async()=>{
 reset();
 const rows=Array.from({length:20},(_,index)=>({entity_id:`venue-${index}`,name:`Venue ${index}`,properties:{address:`${index} Test Street`,description:'Provider-only detail. '.repeat(1600)},tags:[{name:'Cinema'}],query:{affinity:0.5}}));
 const malformed={name:'Unresolved provider row',properties:{description:'No canonical identity'}};
 const providerRows:unknown[]=rows.map((row,index)=>index===4?malformed:index===9?{...rows[0],name:'Duplicate venue'}:row);
 const body={results:{entities:providerRows}};
 globalThis.fetch=async()=>new Response(JSON.stringify(body),{status:200});
 const f=file();const {query}=await discover('owner',f,[]);
 assert.ok(Buffer.byteLength(JSON.stringify(body))>400_000,'Fixture must reproduce the large provider response');
 assert.deepEqual((results[0] as unknown[])[5],body,'The result receipt retains every original provider field');
 assert.equal(query.rawRows!.length,20);
 for(const row of query.rawRows!){assert.ok(Object.keys(row as object).every(key=>key==='entity_id'||key==='ordinal'));}
 assert.ok(Buffer.byteLength(JSON.stringify(query))<20_000,'Twenty query rows must fit within 20 KB');
 const legacy={...query,id:'legacy-full-rows',rawRows:providerRows.map((row,index)=>({...row as object,ordinal:index}))};
 const compared=whatTheReferencesChanged(legacy,query);
 assert.equal(compared.counts.same,18);
 assert.ok(compared.places.every(place=>place.controlRank===place.seededRank));
 assert.equal(compared.places.find(place=>place.leadId==='venue-0')!.seededRank,1,'A duplicate never replaces the first position');
 assert.equal(compared.places.find(place=>place.leadId==='venue-5')!.seededRank,6,'A malformed row must not compress later ranks');
 const oldDocument=JSON.stringify(legacy);f.queries.unshift(legacy);
 await discover('owner',f,[]);
 assert.equal(JSON.stringify(f.queries[0]),oldDocument,'New searches leave legacy documents intact');
 assert.equal(results.length,2);
});
test('agent metadata follows both paired requests and a control retry, while manual requests stay ungrouped',async()=>{
 reset();responses([200,500]);const f=file(),run={runId:'10000000-0000-4000-8000-000000000001',step:1};
 await assert.rejects(discover('owner',f,['film'],run));assert.deepEqual(contexts,[run,run]);
 responses([200]);const retry={...run,step:2};await runControl('owner',f,f.queries[0].id,retry);assert.deepEqual(contexts,[run,run,retry]);
 responses([200]);await discover('owner',f,[]);assert.equal(contexts.at(-1),undefined);
});
test('restricted paired discovery sends the same verified set, preserves identity casing and rejects outside results',async()=>{
 reset();const f=file(),a='10000000-0000-4000-8000-00000000000A',b='10000000-0000-4000-8000-00000000000B';f.candidateEntityIds=[b,a];
 globalThis.fetch=async()=>Response.json({results:{entities:[{entity_id:a.toLowerCase(),name:'Supplied candidate',query:{affinity:0.5}}]}});
 await discover('owner',f,['film']);const params=attempts as Array<{params:Record<string,string>}>;
 assert.equal(params[0].params['filter.results.entities'],[a,b].join(','));assert.equal(params[1].params['filter.results.entities'],params[0].params['filter.results.entities']);assert.equal(f.queries[0].leadIds[0],a);
 reset();globalThis.fetch=async()=>Response.json({results:{entities:[{entity_id:'20000000-0000-4000-8000-000000000001',name:'Outside the five sites'}]}});
 const restricted=file();restricted.candidateEntityIds=[a];await assert.rejects(discover('owner',restricted,[]),/outside the candidate/);assert.equal(restricted.queries.length,0);assert.equal(restricted.leads.length,0);assert.equal(results.length,1);
 reset();restricted.candidateEntityIds=[];await assert.rejects(discover('owner',restricted,[]));assert.equal(attempts.length,0);
});
test.after(()=>{globalThis.fetch=originalFetch;delete (globalThis as any).__threadlineQlooTest;});
