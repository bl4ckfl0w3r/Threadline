import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { registerHooks } from 'node:module';
import { caseUsage,agentRunUsage } from '../server/usage-limits.ts';

const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE usage_buckets(bucket TEXT PRIMARY KEY,used INTEGER NOT NULL,expires_at INTEGER); CREATE TABLE receipts(id TEXT PRIMARY KEY,case_id TEXT,owner TEXT,provider TEXT,phase TEXT,request TEXT,response TEXT,created_at TEXT,status INTEGER)');
function statement(sql:string,args:any[]=[]):any{return {bind(...values:any[]){return statement(sql,values);},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){return sqlite.prepare(sql).run(...args);},async first(){return sqlite.prepare(sql).get(...args)||null;},execute(){return sqlite.prepare(sql).run(...args);}};}
const db={prepare:statement,async batch(items:any[]){sqlite.exec('BEGIN');try{const results=items.map(item=>({meta:{changes:Number(item.execute().changes)}}));sqlite.exec('COMMIT');return results;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
(globalThis as any).__threadlineReceiptDB=db;
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/server/store.ts')){
  if(specifier==='./runtime')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export const database=()=>globalThis.__threadlineReceiptDB;export class AppError extends Error {}')};
  if(specifier==='./usage-limits')return next('./usage-limits.ts',context);
 }
 return next(specifier,context);
}});
const {reserveRequests,beginReceipt,endReceipt,releaseRequests}=await import('../server/store.ts');hooks.deregister();

test('attempt insertion atomically consumes pending allowance, preserving exact provider counts for a failed pair',async()=>{
 const reservation=await reserveRequests('owner','qloo',2);
 const pending=()=>sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(reservation.pendingBucket)!.used;
 assert.equal(pending(),2);
 const first=await beginReceipt('owner','case','qloo',{purpose:'seeded'},reservation);assert.equal(pending(),1);
 await endReceipt('owner','case','qloo',first,200,{results:[]});
 const second=await beginReceipt('owner','case','qloo',{purpose:'control'},reservation);assert.equal(pending(),0);
 await endReceipt('owner','case','qloo',second,500,{error:'provider failed'});await releaseRequests(reservation);
 assert.deepEqual(await caseUsage(db as unknown as D1Database,'owner','case'),{qlooAttempts:2,qlooFailed:1,modelAttempts:0,modelFailed:0});
 await assert.rejects(beginReceipt('owner','case','qloo',{},reservation),/exhausted/);
});
test('expired reservation cannot create an attempt or consume pending capacity after another request could reserve it',async()=>{
 const reservation=await reserveRequests('expiring-owner','qloo',2);
 sqlite.prepare('UPDATE usage_buckets SET expires_at=0 WHERE bucket=?').run(reservation.pendingBucket);
 await assert.rejects(beginReceipt('expiring-owner','expired-case','qloo',{purpose:'must not run'},reservation),/reservation expired/);
 assert.equal(sqlite.prepare("SELECT count(*) AS count FROM receipts WHERE owner='expiring-owner'").get()!.count,0);
 assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(reservation.pendingBucket)!.used,2);
 assert.equal(reservation.remaining,2);
 await releaseRequests(reservation);
 assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(reservation.pendingBucket)!.used,0);
});
test('receipt writer accepts only explicit server metadata and does not group spoofed or manual requests',async()=>{
 const context={runId:'10000000-0000-4000-8000-000000000009',step:2};
 const reservation=await reserveRequests('metadata-owner','qloo',2);
 const id=await beginReceipt('metadata-owner','metadata-case','qloo',{agent:{runId:'spoofed',step:12},params:{take:'20'}},reservation,context);await endReceipt('metadata-owner','metadata-case','qloo',id,200,{});
 const manual=await beginReceipt('metadata-owner','metadata-case','qloo',{agent:context},reservation);await endReceipt('metadata-owner','metadata-case','qloo',manual,200,{});
 const grouped=await agentRunUsage(db as unknown as D1Database,'metadata-owner','metadata-case');assert.equal(grouped.length,1);assert.equal(grouped[0].usage.qlooAttempts,1);assert.equal(grouped[0].steps[0].step,2);
 assert.equal(JSON.parse(sqlite.prepare('SELECT request FROM receipts WHERE id=?').get(manual)!.request as string).agent,undefined);
});
test.after(()=>{sqlite.close();delete (globalThis as any).__threadlineReceiptDB;});
