import {test} from 'node:test';import assert from 'node:assert/strict';
import {blankCase,applyEdits,discoveryScope,sameQueryScope,matchesDiscoveryInputs} from '../lib/domain.ts';
import type{Query}from'../lib/contracts.ts';
const a='10000000-0000-4000-8000-00000000000a',b='10000000-0000-4000-8000-00000000000b';
test('candidate scope is sorted, immutable through client edits and rejects empty, invalid or duplicate IDs',()=>{
 const f=blankCase('case');f.candidateEntityIds=[b,a];assert.deepEqual(discoveryScope(f).candidateEntityIds,[a,b]);assert.deepEqual(f.candidateEntityIds,[b,a]);
 const edited=applyEdits(f,{title:'Edited',candidateEntityIds:[]});assert.deepEqual(edited.candidateEntityIds,[b,a]);
 for(const ids of [[],['not-a-qloo-id'],[a,a.toUpperCase()],Array.from({length:21},(_,i)=>`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`)]){f.candidateEntityIds=ids;assert.throws(()=>discoveryScope(f));}
 delete f.candidateEntityIds;assert.equal(discoveryScope(f).candidateEntityIds,undefined);
});
test('duplicate-query checks use full scope and confirmed identities rather than reusing a clue handle',()=>{
 const f=blankCase('case');f.category='all_places';f.candidateEntityIds=[a,b];f.clues=[{id:'film',label:'Film',kind:'movie',provenance:'supplied_interest',enabled:true,entity:{id:a,name:'Film',kind:'movie'}}];
 const q={id:'q',mode:'live',scope:discoveryScope(f),clueIds:['film'],inputSnapshot:{clues:[{id:'film',entityId:a}]}} as Query;
 assert.equal(matchesDiscoveryInputs(f,q,['film']),true);f.clues[0].entity!.id=b;assert.equal(matchesDiscoveryInputs(f,q,['film']),false);f.clues[0].entity!.id=a;
 for(const change of [{take:10},{tags:['cinema']},{candidateEntityIds:[a]},{candidateEntityIds:undefined}])assert.equal(matchesDiscoveryInputs(f,{...q,scope:{...q.scope!,...change}},['film']),false);
 assert.equal(matchesDiscoveryInputs(f,{...q,scope:undefined},['film']),false);assert.equal(matchesDiscoveryInputs(f,{...q,inputSnapshot:undefined},['film']),false);
 assert.equal(sameQueryScope(q.scope!,{...q.scope!,candidateEntityIds:[b.toUpperCase(),a.toUpperCase()]}),true);
 assert.equal(matchesDiscoveryInputs(f,{...q,clueIds:[],inputSnapshot:undefined},[]),true);
});
