import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import {blankCase, discoveryScope, whatTheReferencesChanged} from '../lib/domain.ts';
import type {CaseFile,Query} from '../lib/contracts.ts';
import {changeSentence,matchesInputs,openingQuery} from '../components/threadline/reference-change.ts';
import {humanDate,humanRange} from '../components/threadline/format.ts';
import type {WorkspaceState} from '../components/threadline/use-workspace.ts';

function caseAndQuery(){
 const file=blankCase('ui-test');
 file.clues=[{id:'reference',label:'Supplied reference',kind:'artist',provenance:'supplied_interest',enabled:true,entity:{id:'canonical-artist',name:'Resolved reference',kind:'artist'}}];
 const query:Query={id:'query',label:'With references',mode:'live',createdAt:'2026-10-30T12:00:00Z',clueIds:['reference'],leadIds:['a','b'],affinities:{},warnings:[],receiptId:'test-receipt',geography:{latitude:file.latitude,longitude:file.longitude,radius:file.radius},category:file.category,scope:discoveryScope(file),inputSnapshot:{category:file.category,geography:{latitude:file.latitude,longitude:file.longitude,radius:file.radius},clues:[{id:'reference',label:'Supplied reference',entityId:'canonical-artist',entityName:'Resolved reference',provenance:'supplied_interest'}]}};
 return {file,query};
}
test('saved-input matching uses the exact provider scope, including type, tags, limit and restriction',()=>{
 const {file,query}=caseAndQuery();assert.equal(matchesInputs(file,query,['reference']),true);
 for(const change of [{endpoint:'/other'},{filterType:'urn:entity:brand'},{category:'all_places'},{tags:[]},{take:10},{candidateEntityIds:['a']},{geography:{...query.geography,radius:100}}]){
  const changed=structuredClone(query);changed.scope={...changed.scope!,...change};assert.equal(matchesInputs(file,changed,['reference']),false);
 }
});
test('unknown, incomplete, duplicate or changed reference identities never count as a captured input match',()=>{
 const {file,query}=caseAndQuery();
 for(const mutate of [(q:Query)=>{delete q.scope;},(q:Query)=>{delete q.inputSnapshot;},(q:Query)=>{q.inputSnapshot!.clues=[];},(q:Query)=>{q.inputSnapshot!.clues[0].entityId=undefined;},(q:Query)=>{q.inputSnapshot!.clues[0].entityId='different-identity';},(q:Query)=>{q.clueIds=['reference','reference'];}]){
  const changed=structuredClone(query);mutate(changed);assert.equal(matchesInputs(file,changed,['reference']),false);
 }
 const unseeded={...query,clueIds:[],inputSnapshot:undefined};assert.equal(matchesInputs(file,unseeded,[]),true);
});
test('opening a case prefers the latest exact input match, otherwise its latest historical query',()=>{
 const {file,query}=caseAndQuery(),later=structuredClone(query);later.id='later';later.scope!.take=5;file.queries=[query,later];
 assert.equal(openingQuery(file),'query');delete query.scope;assert.equal(openingQuery(file),'later');file.queries=[];assert.equal(openingQuery(file),'');
});
test('opening a case with only legacy recordings prefers the one made with the ticked references',()=>{
 const {file,query}=caseAndQuery();delete query.scope;
 const control={...structuredClone(query),id:'control',clueIds:[]},single={...structuredClone(query),id:'single',clueIds:['other']};
 file.queries=[query,control,single];assert.equal(openingQuery(file),'query');
 file.clues[0].enabled=false;assert.equal(openingQuery(file),'control');
});
test('comparison wording handles a downward-only movement and limits unchanged claims to places and order',()=>{
 const {query}=caseAndQuery(),control={...query,clueIds:[],leadIds:['a']};
 assert.match(changeSentence(whatTheReferencesChanged(control,{...query,leadIds:['b','a']})),/moved 1 place down/);
 assert.match(changeSentence(whatTheReferencesChanged(control,{...query,leadIds:['a']})),/returned places or their order/);
});
test('display dates preserve calendar days without normalising invalid dates or showing undefined months',()=>{
 assert.equal(humanDate('2026-09-08T23:30:00-05:00'),'8 September 2026');
 assert.equal(humanRange('2026-09-01','2026-09-21'),'1–21 September 2026');
 for(const date of ['2026-13-01','2026-02-30','not recorded'])assert.equal(humanDate(date),date);
 assert.equal(humanRange('2026-09-08','not recorded'),'8 September 2026 – not recorded');
});

// Exercise the real view on the server; no browser, database or provider is used.
const hooks=registerHooks({load(url,context,next){
 if(url.endsWith('/components/threadline/workspace-views.tsx'))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText};
 return next(url,context);
}});
const {LeadsView}=await import('../components/threadline/workspace-views.tsx');hooks.deregister();
function workspace(file:CaseFile,query:Query,control:Query):WorkspaceState {
 return {file,query,comparison:control,enabledClues:file.clues,leads:file.leads,selected:file.leads[0],selectedSources:[],filter:'',compareId:'',usage:{qlooAttempts:0,qlooFailed:0,modelAttempts:0,modelFailed:0},services:{qloo:true,model:false,storage:true,signedIn:true},getParkedDraftSummaries:()=>[]} as unknown as WorkspaceState;
}
test('the real Leads view displays provider ranks and deltas after malformed or duplicate rows',()=>{
 const {file,query}=caseAndQuery();
 const control={...query,id:'control',label:'Without references',clueIds:[],rawRows:[{entity_id:'a',ordinal:0},{ordinal:1},{entity_id:'a',ordinal:2},{entity_id:'b',ordinal:3}]};
 query.leadIds=['b','a'];query.rawRows=[{entity_id:'b',ordinal:0},{ordinal:1},{entity_id:'b',ordinal:2},{entity_id:'a',ordinal:3}];
 file.queries=[control,query];file.leads=query.leadIds.map(id=>({id,name:`Venue ${id}`,address:'Test address',tags:[],introducedBy:query.id}));
 const markup=renderToStaticMarkup(React.createElement(LeadsView,{w:workspace(file,query,control)}));
 assert.match(markup,/class="rank">4<\/span>/);assert.match(markup,/↑ 3/);assert.match(markup,/0 Qloo requests/);
 control.scope={...control.scope!,take:10};
 const incompatible=renderToStaticMarkup(React.createElement(LeadsView,{w:workspace(file,query,control)}));
 assert.match(incompatible,/Query scopes differ/);assert.doesNotMatch(incompatible,/position 4 without the references/);
});
