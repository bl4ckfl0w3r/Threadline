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
const {LeadsView,AgentPanel}=await import('../components/threadline/workspace-views.tsx');hooks.deregister();
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

test('agent outcomes and failures are matched by run and step, never by adjacent manual activity',async()=>{
 const {agentSteps}=await import('../components/threadline/agent-steps.ts');const file=blankCase('agent-run'),at='2026-10-30T12:00:00Z';
 file.agent={steps:2,status:'error',reason:'Control failed',runId:'current'};
 file.activityLog=[
  {id:'old',at,kind:'agent',title:'Agent chose inspect',detail:'Earlier run',runId:'old',step:1},
  {id:'a1',at,kind:'agent',title:'Agent chose discover',detail:'Compare inputs',runId:'current',step:1},
  {id:'manual',at,kind:'research',title:'Manual search',detail:'Not the agent'},
  {id:'r1',at,kind:'research',title:'Five places',detail:'Paired comparison',runId:'current',step:1},
  {id:'a2',at,kind:'agent',title:'Agent chose run_control',detail:'Retry missing comparison',runId:'current',step:2},
  {id:'error',at,kind:'error',title:'Research needs attention',detail:'Control unavailable',runId:'current',step:2},
 ];
 const steps=agentSteps(file);assert.deepEqual(steps.map(s=>s.id),['a1','a2']);assert.equal(steps[0].result?.title,'Five places');assert.equal(steps[1].error,'Control unavailable');
 file.activityLog.push({id:'no-choice',at,kind:'error',title:'Research needs attention',detail:'Invalid model action',runId:'current',step:3});assert.equal(agentSteps(file).at(-1)?.tool,'model');
 file.activityLog.push({id:'refresh',at,kind:'agent',title:'Example research refresh',detail:'Required example setup; later choices belong to the model.',runId:'current',step:4});assert.equal(agentSteps(file).at(-1)?.tool,'refresh');
 delete file.agent.runId;const legacy=agentSteps(file);assert.deepEqual(legacy.map(s=>s.id),['old','a1','a2','refresh']);assert.ok(legacy.every(s=>!s.result&&!s.error&&s.step===undefined));
});

test('agent panel uses actual stop reasons, run usage and explicit legacy fallback',()=>{
 const file=blankCase('agent-panel'),at='2026-10-30T12:00:00Z';file.referenceRelation='chose_place';file.agent={steps:1,status:'stopped',stopReason:'ask',reason:'Which branch did they use?',runId:'current'};
 file.activityLog=[{id:'a1',at,kind:'agent',title:'Agent chose discover',detail:'Compare inputs',runId:'current',step:1},{id:'error',at,kind:'error',title:'Needs attention',detail:'One control failed',runId:'current',step:1}];
 const usage={modelAttempts:1,modelFailed:0,qlooAttempts:2,qlooFailed:1,sourceAttempts:0,sourceFailed:0};
 const w={file,running:{current:false},services:{qloo:true,model:true,storage:true,signedIn:true},usage:{qlooAttempts:20,qlooFailed:4,modelAttempts:10,modelFailed:0},agentRuns:[{runId:'current',usage,steps:[{step:1,usage}]}],disabled:false} as unknown as WorkspaceState;
 let markup=renderToStaticMarkup(React.createElement(AgentPanel,{w}));assert.match(markup,/Needs your answer/);assert.match(markup,/Nothing shows it drove the booking/);assert.match(markup,/not an executed agent step/);assert.match(markup,/One control failed/);assert.match(markup,/Attempts in this run: 1 model, 2 Qloo, 0 source/);assert.doesNotMatch(markup,/20 Qloo|saved/i);
 w.agentRuns=null;delete file.agent.runId;markup=renderToStaticMarkup(React.createElement(AgentPanel,{w}));assert.match(markup,/Legacy history/);assert.match(markup,/whole case/);assert.match(markup,/20 Qloo/);
});
test('completed enquiry offers guarded continuation only for a new current response',()=>{
 const file=blankCase('continue-panel');file.leads=[{id:'a',name:'Venue',address:'Here',tags:[],introducedBy:'input'}];file.enquiry={leadId:'a',question:'Which manifest?',rationale:'Missing record',sourceIds:[],confirming:'Check',conflicting:'Revise',unavailable:'Unresolved',draft:'Draft'};file.agent.status='complete';
 const w={file,running:{current:false},services:{model:true},disabled:false} as unknown as WorkspaceState;
 let markup=renderToStaticMarkup(React.createElement(AgentPanel,{w}));assert.match(markup,/Open the drafted enquiry/);assert.doesNotMatch(markup,/>Continue investigation/);
 file.enquiry.response={id:'reply',respondent:'Desk',receivedAt:'2026-10-30',passage:'The item is in the receiving ledger.',outcomeBranch:'confirming'};markup=renderToStaticMarkup(React.createElement(AgentPanel,{w}));assert.match(markup,/>Continue investigation/);
 file.agent.reviewedResponseIds=['reply'];markup=renderToStaticMarkup(React.createElement(AgentPanel,{w}));assert.doesNotMatch(markup,/>Continue investigation/);
});

test('scoreboard counts actual inspections and labels the unrun control independently',async()=>{
 const {checksScore}=await import('../components/threadline/demo-scoreboard.ts');const {demoFixture}=await import('./fixtures/demo-v2.ts');const data=demoFixture();
 data.arms[0].inspections=[{order:1,leadId:'B',reason:'Checked record',found:'nothing_relevant',recordIds:[]}];data.control.order=[{leadId:'B',rank:1},{leadId:'A',rank:2}];const rows=checksScore(data);
 assert.equal(rows[0].note,'In 1 check · recorded run');assert.equal(rows[1].value,'Check 2');assert.equal(rows[1].note,'Order only · not run');assert.equal(rows[2].value,'Check 1');
});
