import{test}from'node:test';import assert from'node:assert/strict';import{DatabaseSync}from'node:sqlite';import{readFileSync}from'node:fs';import{registerHooks}from'node:module';
import{comparisonFixture}from'./fixtures/comparison-intake.ts';import{blankCase}from'../lib/domain.ts';
const sqlite=new DatabaseSync(':memory:');for(const file of ['0000_amazing_wolfpack.sql','0001_usage_limits.sql','0002_demo_assets.sql'])sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
let user='owner-a';
function statement(sql:string,args:any[]=[]):any{return{bind(...values:any[]){return statement(sql,values)},async all(){return{results:sqlite.prepare(sql).all(...args)}},async first(){return sqlite.prepare(sql).get(...args)||null},async run(){return sqlite.prepare(sql).run(...args)}};}
const db={prepare:statement};const boundary={db,owner:()=>user,blankCase};(globalThis as any).__creationTest=boundary;
const hooks=registerHooks({resolve(specifier,context,next){
 const parent=decodeURIComponent(context.parentURL||'');
 if((parent.endsWith('/app/api/cases/route.ts')&&specifier==='@/server/runtime')||(parent.endsWith('/server/store.ts')&&specifier==='./runtime'))return{shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(`export class AppError extends Error{constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;}}export const database=()=>globalThis.__creationTest.db;export const owner=async()=>globalThis.__creationTest.owner();export const json=(body,status=200)=>Response.json(body,{status});export const readBody=r=>r.json();export const failure=e=>json({error:e.name==='ZodError'?'Invalid creation request':e.message,code:e.code||'validation_failed'},e.name==='ZodError'?400:e.status||500);`)};
 if(parent.endsWith('/app/api/cases/route.ts')){
  if(specifier==='@/server/store')return next(new URL('../server/store.ts',import.meta.url).href,context);
  if(specifier==='@/lib/domain')return next(new URL('../lib/domain.ts',import.meta.url).href,context);
  if(specifier==='@/server/example')return{shortCircuit:true,url:'data:text/javascript,export const exampleCase=id=>({...globalThis.__creationTest.blankCase(id),title:"Existing legacy example",mode:"recorded"})'};
 }
 if(parent.endsWith('/server/store.ts')&&specifier==='./usage-limits')return next('./usage-limits.ts',context);
 return next(specifier,context);
}});
const {POST,GET}=await import('../app/api/cases/route.ts');const{readCase}=await import('../server/store.ts');hooks.deregister();
const post=(body:unknown)=>POST(new Request('https://threadline.test/api/cases',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
function asset(value:unknown=comparisonFixture()){sqlite.prepare("INSERT OR REPLACE INTO demo_assets VALUES ('ch01-comparison-intake',?)").run(JSON.stringify(value));}
test('real creation route produces fresh restricted cases and real store isolates owners without spending provider calls',async()=>{
 asset();const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('Case creation must not call providers');};
 try{const first=await post({fromDemo:'ch01'}),second=await post({fromDemo:'ch01'});assert.equal(first.status,201);assert.equal(second.status,201);const a=(await first.json() as any).case,b=(await second.json() as any).case;assert.notEqual(a.id,b.id);assert.equal(a.clues.length,3);assert.equal(a.candidateEntityIds.length,5);assert.deepEqual(a.queries,[]);assert.equal(a.origin.fictional,true);
  user='owner-b';assert.deepEqual((await(await GET(new Request('https://threadline.test/api/cases'))).json() as any).cases,[]);await assert.rejects(readCase(user,a.id));assert.equal(sqlite.prepare('SELECT count(*) AS n FROM receipts').get()!.n,0);
 }finally{globalThis.fetch=original;user='owner-a';}
});
test('creation route keeps blank and legacy example variants and fails closed on template errors/overrides',async()=>{
 const before=Number(sqlite.prepare('SELECT count(*) AS n FROM cases').get()!.n);
 for(const body of [{fromDemo:'wrong'},{fromDemo:'ch01',example:true},{fromDemo:'ch01',candidateEntityIds:[]}])assert.equal((await post(body)).status,400);
 assert.equal(Number(sqlite.prepare('SELECT count(*) AS n FROM cases').get()!.n),before);
 sqlite.exec("DELETE FROM demo_assets WHERE id='ch01-comparison-intake'");const missing=await post({fromDemo:'ch01'});assert.equal(missing.status,503);assert.equal((await missing.json() as any).code,'demo_comparison_unavailable');
 asset({...comparisonFixture(),highlightedLeadId:'MUST_NOT_LEAK'});assert.equal((await post({fromDemo:'ch01'})).status,503);
 const blank=await post({example:false}),legacy=await post({example:true});assert.equal(blank.status,201);assert.equal((await legacy.json() as any).case.title,'Existing legacy example');
});
test.after(()=>{sqlite.close();delete(globalThis as any).__creationTest;});
