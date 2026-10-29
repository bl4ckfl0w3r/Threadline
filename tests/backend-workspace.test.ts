import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { blankCase, applyEdits, draftEnquiry, getEnquiryIdentity, sameQueryScope, isScopeCompatible, whatTheReferencesChanged, controlFor, exportBrief } from '../lib/domain.ts';
import type { Query, QueryScope } from '../lib/contracts.ts';
import { reserveResearchBudget, releaseResearchBudget, caseUsage } from '../server/usage-limits.ts';

const scope:QueryScope={endpoint:'/v2/insights',filterType:'urn:entity:place',category:'all_places',tags:[],geography:{latitude:51,longitude:0,radius:8000},take:20,candidateEntityIds:['a','b']};
function query(id:string,leadIds:string[],clueIds:string[]=[]):Query {return {id,label:id,mode:'live',createdAt:'2026-10-29T12:00:00Z',clueIds,leadIds,affinities:{},warnings:[],receiptId:`receipt-${id}`,geography:scope.geography,category:scope.category,scope:structuredClone(scope)};}

test('comparison describes observed moves, unchanged ranks, additions and omissions without probability claims',()=>{
 const result=whatTheReferencesChanged(query('control',['a','b','c','d']),query('seeded',['b','a','c','e'],['film']));
 assert.deepEqual(result.counts,{up:1,down:1,same:1,new:1,dropped:1});
 assert.deepEqual(result.places.map(p=>[p.leadId,p.change,p.delta]),[['b','up',1],['a','down',-1],['c','same',undefined],['e','new',undefined],['d','dropped',undefined]]);
 assert.deepEqual(result.capturedAt,{control:'2026-10-29T12:00:00Z',seeded:'2026-10-29T12:00:00Z'});
 assert.equal(whatTheReferencesChanged(query('a',['a']),query('b',['a'])).counts.same,1);
});
test('every full scope dimension gates comparisons, but timing only informs them',()=>{
 for(const changed of [{endpoint:'/other'},{filterType:'other'},{category:'book_store'},{tags:['tag']},{geography:{...scope.geography,radius:9000}},{take:10},{candidateEntityIds:['a']},{candidateEntityIds:undefined}]){
  const a=query('a',['a']),b=query('b',['a']);b.scope={...scope,...changed};
  assert.equal(isScopeCompatible(a,b),false);assert.deepEqual(whatTheReferencesChanged(a,b).places,[]);
 }
 assert.equal(sameQueryScope(scope,{...scope,candidateEntityIds:['b','a']}),true);
 const a=query('a',['a']),b=query('b',['b']);b.createdAt='2026-09-01T00:00:00Z';assert.equal(whatTheReferencesChanged(a,b).compatible,true);
 delete b.scope;const result=whatTheReferencesChanged(a,b);assert.equal(result.compatible,true);assert.match(result.warnings[0],/not recorded/);
});
test('controls reuse only identical full scopes captured on the same UTC day; explicit later retry remains paired',()=>{
 const file=blankCase('case'),control=query('control',['a']),seeded=query('seeded',['a'],['film']);file.queries=[control,seeded];
 assert.equal(controlFor(file,seeded)?.id,'control');
 control.scope!.take=10;assert.equal(controlFor(file,seeded),undefined);control.scope!.take=20;
 control.scope!.candidateEntityIds=['c'];assert.equal(controlFor(file,seeded),undefined);control.scope!.candidateEntityIds=['a','b'];
 control.createdAt='2026-10-28T12:00:00Z';assert.equal(controlFor(file,seeded),undefined);
 seeded.controlQueryId=control.id;assert.equal(controlFor(file,seeded)?.id,control.id);
 delete control.scope;assert.equal(controlFor(file,seeded),undefined);
});
test('reference relation survives edits and explanatory check text never changes response identity',()=>{
 const file=blankCase('case');file.leads=[{id:'venue',name:'Venue',address:'Here',tags:[],introducedBy:'query'}];
 const edited=applyEdits(file,{referenceRelation:'personal_interests'});assert.equal(edited.referenceRelation,'personal_interests');
 assert.throws(()=>applyEdits(file,{referenceRelation:'proved_visit'}));assert.equal(applyEdits(file,{title:'Old case'}).referenceRelation,undefined);
 const enquiry=draftEnquiry(edited,edited.leads[0]);assert.equal(enquiry.whyThisCheck,'');
 const identity=getEnquiryIdentity(enquiry);enquiry.whyThisCheck='Resolve the unmatched serial on the consignment manifest.';assert.deepEqual(getEnquiryIdentity(enquiry),identity);
 edited.enquiry=enquiry;assert.match(exportBrief(edited,{qlooAttempts:3,qlooFailed:1,modelAttempts:2,modelFailed:0}),/3 Qloo attempts \(1 failed or pending\)/);assert.match(exportBrief(edited),/personal_interests/);assert.match(exportBrief(edited),/Resolve the unmatched serial/);
});

function database(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('CREATE TABLE usage_buckets(bucket TEXT PRIMARY KEY,used INTEGER NOT NULL,expires_at INTEGER); CREATE TABLE receipts(id TEXT PRIMARY KEY,case_id TEXT,owner TEXT,provider TEXT,phase TEXT,created_at TEXT,status INTEGER)');
 const db={prepare(sql:string){const statement=sqlite.prepare(sql);return {bind(...args:any[]){return {async all(){return {results:statement.all(...args)};},async run(){return statement.run(...args);},async first(){return statement.get(...args)||null;}};}};}} as unknown as D1Database;
 return {sqlite,db};
}
test('pair reservations are all-or-nothing across budgets; unused capacity is returned',async()=>{
 const {sqlite,db}=database(),now=Date.parse('2026-10-29T12:00:00Z'),interval=Math.floor(now/86400000);
 sqlite.prepare('INSERT INTO usage_buckets VALUES (?,?,?)').run(`research-global:${interval}`,999,now+1000);
 await assert.rejects(reserveResearchBudget(db,'owner','qloo',2,now),/No provider request/);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM usage_buckets').get()!.n,1);
 assert.equal(sqlite.prepare('SELECT used FROM usage_buckets').get()!.used,999);
 sqlite.exec('UPDATE usage_buckets SET used=998');const reserved=await reserveResearchBudget(db,'owner','qloo',2,now);
 assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(`research-global:${interval}`)!.used,1000);
 reserved.remaining--;sqlite.prepare('UPDATE usage_buckets SET used=used-1 WHERE bucket=?').run(reserved.pendingBucket);await releaseResearchBudget(db,reserved);assert.equal(sqlite.prepare('SELECT used FROM usage_buckets WHERE bucket=?').get(`research-global:${interval}`)!.used,999);
 sqlite.close();
});
test('rolling owner and model limits also reject a reservation without charging any other bucket',async()=>{
 const {sqlite,db}=database(),now=Date.parse('2026-10-29T12:00:00Z'),interval=Math.floor(now/86400000);
 const insert=sqlite.prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?)');for(let i=0;i<199;i++)insert.run(String(i),'case','owner','qloo','attempt',new Date(now-1000).toISOString(),null);
 await assert.rejects(reserveResearchBudget(db,'owner','qloo',2,now));assert.equal(sqlite.prepare('SELECT count(*) AS n FROM usage_buckets').get()!.n,0);
 sqlite.prepare('INSERT INTO usage_buckets VALUES (?,?,?)').run(`model-global:${interval}`,100,now+1000);
 await assert.rejects(reserveResearchBudget(db,'another','model',1,now));assert.equal(sqlite.prepare('SELECT count(*) AS n FROM usage_buckets').get()!.n,1);sqlite.close();
});
test('usage counts attempts once, correlates owner/case/provider results and includes failed or missing results',async()=>{
 const {sqlite,db}=database();const insert=sqlite.prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?)');
 for(const [id,provider,status] of [['a','qloo',200],['b','qloo',400],['c','qloo',null],['d','model',200],['e','model',0]] as const){
  insert.run(id,'case','owner',provider,'attempt','2026-10-29',null);if(status!==null)insert.run(id+':result','case','owner',provider,'result','2026-10-29',status);
 }
 insert.run('foreign','case','elsewhere','qloo','attempt','2026-10-29',null);insert.run('c:result','another-case','owner','qloo','result','2026-10-29',200);
 assert.deepEqual(await caseUsage(db,'owner','case'),{qlooAttempts:3,qlooFailed:2,modelAttempts:2,modelFailed:1});sqlite.close();
});

test('rolling allowance includes concurrent reservations before their attempt receipts exist, including across UTC midnight',async()=>{
 const {sqlite,db}=database(),now=Date.parse('2026-10-29T00:00:01Z');
 const insert=sqlite.prepare('INSERT INTO receipts VALUES (?,?,?,?,?,?,?)');for(let i=0;i<199;i++)insert.run(String(i),'case','owner','qloo','attempt',new Date(now-10000).toISOString(),null);
 const reserved=await reserveResearchBudget(db,'owner','qloo',1,now-2000);
 await assert.rejects(reserveResearchBudget(db,'owner','qloo',1,now));
 await releaseResearchBudget(db,reserved);await reserveResearchBudget(db,'owner','qloo',1,now);sqlite.close();
});

test('rank movements preserve provider ordinals when malformed or duplicate rows were skipped',()=>{
 const control=query('control',['a','b']),seeded=query('seeded',['b','a'],['film']);
 control.rawRows=[{entity_id:'a',ordinal:0},{name:'Invalid row',ordinal:1},{entity_id:'a',ordinal:2},{entity_id:'b',ordinal:3}];
 seeded.rawRows=[{entity_id:'b',ordinal:0},{entity_id:'a',ordinal:1}];
 const result=whatTheReferencesChanged(control,seeded);
 assert.deepEqual(result.places.map(p=>[p.leadId,p.controlRank,p.seededRank,p.delta]),[['b',4,1,3],['a',1,2,-1]]);
});
