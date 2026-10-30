import{test}from'node:test';import assert from'node:assert/strict';
import{mkdtemp,mkdir,writeFile,rm}from'node:fs/promises';import{tmpdir}from'node:os';import path from'node:path';
import{createComparisonCase,createCaseSchema,ComparisonUnavailable}from'../lib/comparison-case.ts';
import{loadComparisonCase}from'../server/comparison-data.ts';import{serializeModelContext}from'../server/model-context.ts';
import{discoveryScope,exportBrief}from'../lib/domain.ts';import{comparisonFixture}from'./fixtures/comparison-intake.ts';
import{prepareCh01Intake}from'../scripts/prepare-ch01-intake.mjs';

test('CH01 creates isolated live comparison cases with three verified references, five inputs and no replay state',()=>{
 const template=comparisonFixture(),a=createComparisonCase('new-a',template),b=createComparisonCase('new-b',template);
 assert.deepEqual(a.clues.map(c=>c.label),['Interstellar','Inception','Daft Punk']);assert.equal(a.leads.length,5);assert.equal(a.referenceRelation,'chose_place');assert.equal(a.origin?.fictional,true);assert.equal(a.mode,'live');
 assert.deepEqual(a.queries,[]);assert.deepEqual(a.sources,[]);assert.deepEqual(a.activityLog,[]);assert.equal(a.enquiry,undefined);assert.equal(a.agent.steps,0);assert.deepEqual(discoveryScope(a).candidateEntityIds,template.candidates.map(c=>c.entityId));
 assert.deepEqual(a.clues.map(c=>c.entity!.id),template.references.map(r=>r.entityId));assert.ok(!a.leads.some(l=>/^L0/.test(l.id)));a.clues[0].label='Edited';assert.equal(b.clues[0].label,'Interstellar');assert.equal(template.references[0].label,'Interstellar');
 const context=serializeModelContext(b);for(const key of ['highlightedLeadId','agentDecisions','inspectionBudget','nextRequest','arms','recordIds','affinities'])assert.ok(!context.includes(`"${key}"`));
 assert.match(exportBrief(b),/Fictional CH01/);assert.match(exportBrief(b),/5 supplied places/);
 for(const injected of [{highlightedLeadId:'SECRET_OUTCOME'},{queries:[{order:['SECRET_OUTCOME']}]},{records:[]},{owner:'other'}])assert.throws(()=>createComparisonCase('bad',{...template,...injected}));
 for(const mutate of [(t:typeof template)=>{t.references.pop();},(t:typeof template)=>{t.references[0].year=1990;},(t:typeof template)=>{t.candidates[1].entityId=t.candidates[0].entityId;}]){const bad=structuredClone(template);mutate(bad);assert.throws(()=>createComparisonCase('bad',bad));}
});
test('case creation preserves existing variants and rejects conflicting selectors and template overrides',()=>{
 for(const body of [{},{example:true},{example:false},{fromDemo:'ch01'}])assert.deepEqual(createCaseSchema.parse(body),body);
 for(const body of [{example:true,fromDemo:'ch01'},{fromDemo:'other'},{fromDemo:'ch01',candidateEntityIds:[]},{template:comparisonFixture()}])assert.equal(createCaseSchema.safeParse(body).success,false);
});
test('comparison loader fails closed for missing/invalid data and propagates real database failures',async()=>{
 const db=(row:unknown,error?:Error)=>({prepare(){return{async first(){if(error)throw error;return row;}}}}) as unknown as D1Database;
 for(const row of [null,{document:'not-json'},{document:JSON.stringify({...comparisonFixture(),highlightedLeadId:'SECRET_OUTCOME'})}])await assert.rejects(loadComparisonCase(db(row),'new'),ComparisonUnavailable);
 await assert.rejects(loadComparisonCase(db(null,new Error('no such table: demo_assets')),'new'),ComparisonUnavailable);
 await assert.rejects(loadComparisonCase(db(null,new Error('storage fault')),'new'),/storage fault/);
 const fresh=await loadComparisonCase(db({document:JSON.stringify(comparisonFixture())}),'new');assert.equal(fresh.id,'new');
});
test('intake preparation uses named canonical lookup handles, not sorted IDs or outcome files',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'threadline-intake-test-'));const template=comparisonFixture();
 const write=async(name:string,value:unknown)=>{const target=path.join(root,name);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,JSON.stringify(value));};
 const intake={id:'CH01',title:'Fictional CH01',brief:'Fictional unresolved intake.',geography:{city:'London',center:[51.515,-0.095],radius_m:8000},supplied_interests:template.references.map(r=>({name:r.label,type:r.kind,origin:r.origin,reliability:r.reliability})),candidates:template.candidates.map(c=>({name:c.name,address:c.address}))};
 const rows=[...template.references.map(r=>({name:r.label,entity_id:r.entityId,types:['urn:entity:'+r.kind],properties:{release_year:r.year}})),...template.candidates.map(c=>({name:c.name,entity_id:c.entityId,types:['urn:entity:place'],properties:{}}))];
 const handles=rows.map((row,i)=>({sequence:i+1,index:1,name:row.name}));const budgets=rows.map((_,i)=>({receipt:`raw/${i+1}.json`}));
 try{
  await write('public/cases.json',[intake]);await write('runs/B/CH01/qloo-insights.json',{seed_rows:handles.slice(0,3),candidate_rows:handles.slice(3)});
  for(let i=0;i<rows.length;i++)await write(`raw/${i+1}.json`,{sequence:i+1,path:'/search',status:200,at:'2026-10-25T18:00:00Z',response:{results:[{name:'Wrong first result'},rows[i]]}});
  await write('raw/seeded.json',{sequence:9,path:'/v2/insights',status:200,params:{'filter.type':'urn:entity:place',take:'20','filter.location':'POINT(-0.095 51.515)','filter.location.radius':'8000','filter.results.entities':template.candidates.map(c=>c.entityId).reverse().join(','),'signal.interests.entities':template.references.map(r=>r.entityId).join(',')},response:{results:{entities:[{DO_NOT_PROJECT:'SECRET_OUTCOME'}]}}});
  await mkdir(path.join(root,'runs/B/CH01'),{recursive:true});await writeFile(path.join(root,'runs/B/CH01/budget.jsonl'),[...budgets,{receipt:'raw/seeded.json'}].map(x=>JSON.stringify(x)).join('\n'));
  const prepared=await prepareCh01Intake(root);assert.deepEqual(prepared.candidates.map(c=>c.entityId),template.candidates.map(c=>c.entityId));assert.doesNotMatch(JSON.stringify(prepared),/SECRET_OUTCOME|DO_NOT_PROJECT/);assert.equal(createComparisonCase('fresh',prepared).clues.length,3);
  rows[0].properties={release_year:1999};await write('raw/1.json',{sequence:1,path:'/search',status:200,at:'2026-10-25T18:00:00Z',response:{results:[{},rows[0]]}});await assert.rejects(prepareCh01Intake(root),/Film version/);
 }finally{await rm(root,{recursive:true,force:true});}
});
