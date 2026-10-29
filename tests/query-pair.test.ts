import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { blankCase } from '../lib/domain.ts';
import type { CaseFile } from '../lib/contracts.ts';

// Runtime boundaries are replaced before loading qloo; no network or Cloudflare binding is used.
let reservations:number[]=[],attempts:unknown[]=[],results:unknown[]=[],released:number[]=[],allow=true;
const state={
 bindings:()=>({QLOO_API_KEY:'test-key'}),
 reserveRequests:async (_owner:string,_provider:string,count:number)=>{if(!allow)throw new Error('Pair allowance exceeded');reservations.push(count);return {remaining:count,buckets:[]};},
 releaseRequests:async (r:{remaining:number})=>{released.push(r.remaining);r.remaining=0;},
 beginReceipt:async (_owner:string,_caseId:string,_provider:string,request:unknown,r:{remaining:number})=>{r.remaining--;attempts.push(request);return `receipt-${attempts.length}`;},
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
function reset(){reservations=[];attempts=[];results=[];released=[];allow=true;}
const originalFetch=globalThis.fetch;
function responses(statuses:number[]){globalThis.fetch=async ()=>{const status=statuses.shift();assert.ok(status,'Unexpected provider call');return new Response(JSON.stringify(status===200?{results:{entities:[{entity_id:'venue',name:'Venue',query:{affinity:0.5}}]}}:{error:'provider failure'}),{status});};}

test('seeded discovery reserves both calls before requesting; exact same-day controls are reused',async()=>{
 reset();responses([200,200]);const f=file();const first=await discover('owner',f,['film']);
 assert.deepEqual(reservations,[2]);assert.equal(attempts.length,2);assert.equal(f.queries.length,2);assert.equal(f.queries.at(-1)!.id,first.query.id);
 assert.equal(first.query.controlQueryId,f.queries[0].id);assert.deepEqual(first.query.scope,f.queries[0].scope);
 const sent=attempts as Array<{params:Record<string,string>}>;assert.equal(sent[0].params['signal.interests.entities'],'entity-film');assert.equal(sent[1].params['signal.interests.entities'],undefined);
 responses([200]);await discover('owner',f,['film']);assert.deepEqual(reservations,[2,1]);assert.equal(attempts.length,3);
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
test.after(()=>{globalThis.fetch=originalFetch;delete (globalThis as any).__threadlineQlooTest;});
