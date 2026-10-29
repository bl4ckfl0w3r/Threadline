import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDemoV2 } from '../lib/demo-v2.ts';
import { demoResponse,loadDemoDocument } from '../server/demo-data.ts';
import { loadExampleCase } from '../server/example-data.ts';

import {demoFixture as fixture} from './fixtures/demo-v2.ts';

function db(rows:Record<string,unknown>,missingTable=false):D1Database {
  return {prepare(sql:string){const match=/WHERE id='([^']+)'/.exec(sql);assert.ok(match);return {async first(){if(missingTable)throw new Error('D1_ERROR: no such table: demo_assets');const data=rows[match[1]];return data===undefined?null:{document:JSON.stringify(data)};}};}} as unknown as D1Database;
}
test('V2 validates the study identifier, preserves receipts and returns a detached projection',()=>{
  const input=fixture(),output=buildDemoV2(input);assert.ok(output);assert.equal(output.study.id,'CH01');input.records[0].excerpt='changed';assert.equal(output.records[0].excerpt,'Fictional row');
});
test('V2 rejects missing provenance, incompatible scopes and private investigator identity',()=>{
  const mutations=[(d:any)=>d.control.receiptId='',(d:any)=>d.seeded.scope.take=5,(d:any)=>d.seeded.scope.candidateEntityIds=['entity-a'],(d:any)=>d.records[0].fictional=false,(d:any)=>d.owner='user',(d:any)=>d.caseId='11111111-1111-4111-8111-111111111111',(d:any)=>d.records[0].id='11111111-1111-4111-8111-111111111111',(d:any)=>d.intake.summary='.dev.vars'];
  for(const mutate of mutations){const d=fixture();mutate(d);assert.equal(buildDemoV2(d),null);}
});
test('V2 rejects orphan records, cross-lead record links, unknown candidates and bad ranks',()=>{
  for(const mutate of [(d:any)=>d.records.push({...d.records[0],id:'orphan'}),(d:any)=>d.records[0].leadId='B',(d:any)=>d.seeded.order[0].leadId='unknown',(d:any)=>d.seeded.order[1].rank=1]){const d=fixture();mutate(d);assert.equal(buildDemoV2(d),null);}
});
test('public CH01 document is separate from CaseFile example and existing renderer opt-in',async()=>{
  const storage=db({'ch01-demo':fixture(),'curated-fictional-example':{id:'old',mode:'recorded',queries:[],sources:[]}});
  assert.ok(await loadDemoDocument(storage));assert.equal((await demoResponse(storage,'2')).status,200);
  const example=await loadExampleCase(storage,'new-case');assert.equal(example.id,'new-case');assert.equal('version' in example,false);
  assert.equal((await demoResponse(storage)).status,503); // Empty V1 fixture is not a fake demo.
});
test('absent table, missing row and invalid recording return explicit unavailable; DB faults propagate',async()=>{
  for(const storage of [db({}),db({},true),db({'ch01-demo':{version:2}})]){
    const result=await demoResponse(storage,'2');assert.equal(result.status,503);assert.equal('code' in result.body&&result.body.code,'demo_unavailable');
  }
  const result=await demoResponse(db({'curated-fictional-example':{mode:'live'}}));assert.equal(result.status,503);
  const storage={prepare(){return {async first(){throw new Error('Storage unavailable');}};}} as unknown as D1Database;
  await assert.rejects(demoResponse(storage,'2'),/Storage unavailable/);
});
