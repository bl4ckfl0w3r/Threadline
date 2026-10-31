'use client';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, DownloadSimple, GitBranch, LinkSimple, MagnifyingGlass, MapPin, PencilSimple, Plus, Stop, X } from './icons.ts';
import { regions, type WorkspaceState } from './use-workspace.ts';
import type { CaseFile, Clue, EnquiryResponse } from '../../lib/contracts.ts';
import { controlFor, getEnquiryIdentity, getEnquiryIdentityJson, providerRanks, whatTheReferencesChanged } from '../../lib/domain.ts';
import { humanDate, humanRange, placeHint } from './format.ts';
import { changeSentence, matchesInputs } from './reference-change.ts';
import { agentSteps,hasNewEnquiryResponse,requestCounts } from './agent-steps.ts';

const relationLabel={chose_place:'They chose the place',observed_at_place:'Seen or heard at the place',personal_interests:'Personal interests only'} as const;

const toolLabel:Record<string,string>={refresh:'Refresh Qloo results · example setup',resolve:'Look up a reference in Qloo',discover:'Search Qloo for places',inspect:'Read a public source',ask:'Ask you',finish:'Draft the next enquiry',run_control:'Complete the Qloo comparison',model:'Model step'};
const applicability={
  chose_place:'They chose the place, so taste may help order the checks. Nothing shows it drove the booking.',
  observed_at_place:'The references were seen or heard at the place. Their associations may suggest an order for checking records; they do not identify the place.',
  personal_interests:'Personal interests only: taste is a weak signal for which place. The agent should say so before spending a Qloo request.',
} as const;
export function AgentPanel({w}:{w:WorkspaceState}) {
  const f=w.file!,model=!!w.services?.model,running=w.running.current,steps=agentSteps(f),status=f.agent.status;
  const asked=status==='stopped'&&f.agent.stopReason==='ask';
  const state=running?`Step ${Math.min(f.agent.steps+1,12)} of 12`:status==='complete'?'Enquiry drafted':asked?'Needs your answer':status==='stopped'?'Stopped':status==='error'?'Last step failed':model?'Ready':'Not connected';
  const fresh=status==='idle'||status==='working',canContinue=hasNewEnquiryResponse(f);
  const run=w.agentRuns?.find(r=>r.runId===f.agent.runId);
  return <details className="research-drawer" open={running||!fresh||undefined}><summary><GitBranch size={18}/><span>Research agent</span><span>{state}</span><Plus size={18}/></summary>
    <div className="research-content"><p>{!model?'Connect a model on the server to enable agent research. Manual research is available.':asked?f.agent.pendingQuestion?.question||f.agent.reason:status==='error'?'The last step didn’t complete. Earlier findings and receipts are kept.':status==='stopped'?f.agent.reason:status==='complete'?canContinue?'A new response is recorded. Continue from what it establishes.':'Review the drafted enquiry and record a response before continuing.':'The agent picks one tool at a time and stops at a question or drafted enquiry.'}</p>
      <div className="source-commands">{running?<button className="button secondary" onClick={()=>{w.running.current=false;w.setNotice('Stopping after the current step.');}}><Stop size={17}/>Stop after step</button>:fresh?<button className="button primary" disabled={w.disabled||!model} onClick={()=>w.runAgent()}>{status==='working'?'Resume investigation':'Investigate'} <ArrowRight size={17}/></button>:status==='complete'?<button className="button primary" disabled={w.disabled||(canContinue&&!model)} onClick={()=>canContinue?w.continueAgent():w.goToStep('enquiry')}>{canContinue?'Continue investigation':'Open the drafted enquiry'} <ArrowRight size={17}/></button>:null}
      {!running&&!fresh&&<button className="button secondary" disabled={w.disabled||!model} onClick={w.restartAgent}>Start a new investigation <ArrowRight size={17}/></button>}</div></div>
    {(steps.length>0||running)&&<ol className="agent-timeline" aria-label={f.agent.runId?'Agent steps in this run':'Recent agent decisions — run boundaries unknown'}>
      <li className="agent-step applicability"><span className="step-number">—</span><div><strong>Can taste help here?</strong><p>{f.referenceRelation?applicability[f.referenceRelation]:'How the references relate to the place isn’t stated, so a taste-based order carries little weight.'}</p><small>Current case context · not an executed agent step</small></div></li>
      {!f.agent.runId&&<li className="agent-step"><span className="step-number">—</span><div><strong>Legacy history · not grouped into runs</strong><p>These recent decisions have no recorded run boundaries. Manual results are not assigned to them.</p></div></li>}
      {steps.map(s=><li key={s.id} className={`agent-step ${s.tool}`}><span className="step-number">{s.step??'—'}</span><div><strong>{toolLabel[s.tool]||s.tool}</strong><p>{s.reason}</p>{s.result&&<p className="step-result"><span>{s.result.title}</span> {s.result.detail}</p>}{s.error&&<p className="step-result" role="status"><span>Step needs attention.</span> {s.error}</p>}{run?.steps.find(row=>row.step===s.step)&&<small>Attempts: {requestCounts(run.steps.find(row=>row.step===s.step)!.usage)}</small>}</div></li>)}
      {running&&status!=='complete'&&status!=='stopped'&&<li className="agent-step pending" aria-live="polite"><span className="step-number">{Math.min(f.agent.steps+1,12)}</span><div><strong>Choosing the next step</strong></div></li>}
    </ol>}
    {run?<p className="agent-usage">Attempts in this run: {requestCounts(run.usage)}. Source counts are retrieval attempts, not redirect hops.</p>:w.usage&&(steps.length>0||running)?<p className="agent-usage">Attempts in this case so far: {requestCounts(w.usage)}. Counts are for the whole case; run totals are unavailable.</p>:null}
  </details>;
}

export function RecoveryBanner({w}:{w:WorkspaceState}) {
  if (!w.recoveryState) return null;
  return <div className="feedback error recovery-banner" role="alert">
    <p><strong>This case changed elsewhere.</strong> {w.recoveryState.errorMsg}</p>
    <div className="banner-actions"><button className="button secondary" type="button" onClick={w.copyLocalWork}>Copy my edits</button><button className="button primary" type="button" onClick={w.resolveConflictKeepServer}>Load the saved case</button></div>
  </div>;
}

export function ParkedDraftsBanner({w}:{w:WorkspaceState}) {
  const [reviewingKey, setReviewingKey] = useState<string | null>(null);
  const summaries = w.getParkedDraftSummaries ? w.getParkedDraftSummaries() : [];
  if (!summaries.length) return null;
  return <div className="parked-drafts">
    <div className="parked-top"><strong>{summaries.length} unsaved draft{summaries.length === 1 ? '' : 's'} kept from earlier</strong><button type="button" className="text-button" onClick={() => { setReviewingKey(null); w.clearAllParkedDrafts(); }}>Discard all</button></div>
    <ul>{summaries.map(s => <li key={s.key}>
      <div className="parked-row"><span>{s.type === 'source' ? 'Source note' : 'Response'} for <strong>{s.leadName}</strong>: “{s.preview.slice(0, 40)}{s.preview.length > 40 ? '…' : ''}”</span>
        <div className="parked-actions"><button type="button" className="text-button" onClick={() => setReviewingKey(reviewingKey === s.key ? null : s.key)}>{reviewingKey === s.key ? 'Hide' : 'Review'}</button><button type="button" className="text-button" onClick={() => w.copyParkedDraft(s)}>Copy</button><button type="button" className="text-button" onClick={() => { if (reviewingKey === s.key) setReviewingKey(null); w.discardParkedDraft(s.key, s.type); }}>Discard</button></div></div>
      {reviewingKey === s.key && <pre className="parked-details">{s.details}</pre>}
    </li>)}</ul>
  </div>;
}

export function CaseView({w}:{w:WorkspaceState}) {
  const f=w.file!;
  return <div className="case-spread">
    <RecoveryBanner w={w} />
    <ParkedDraftsBanner w={w} />
    <section className="account-sheet">
      <div className="section-top"><h2>Reported account</h2><button className="text-button" disabled={w.disabled} onClick={()=>w.editingBrief?w.finishBrief():w.setEditingBrief(true)}>{w.editingBrief?'Save brief':'Edit brief'}{w.editingBrief?<Check size={17}/>:<PencilSimple size={17}/>}</button></div>
      {w.editingBrief?<div className="brief-editor"><label className="field">Case title<input value={f.title} maxLength={160} disabled={w.disabled} onChange={e=>w.edit({title:e.target.value})}/></label><label className="field">Investigation question<input value={f.question} disabled={w.disabled} onChange={e=>w.edit({question:e.target.value})}/></label><label className="field">Reported account<textarea rows={5} value={f.notes} disabled={w.disabled} onChange={e=>w.edit({notes:e.target.value})}/></label><label className="field">Known timeline<textarea rows={3} value={f.caseContext?.known||''} disabled={w.disabled} onChange={e=>w.edit({caseContext:{known:e.target.value,gap:f.caseContext?.gap||''}})}/></label><label className="field">Gap to resolve<textarea rows={3} value={f.caseContext?.gap||''} disabled={w.disabled} onChange={e=>w.edit({caseContext:{known:f.caseContext?.known||'',gap:e.target.value}})}/></label></div>:<><p className="reported-account">{f.notes||'Add the reported incident, the known details and the gap to investigate.'}</p><details className="timeline-note"><summary>Known timeline <Plus size={17}/></summary><p>{f.caseContext?.known||'No timeline anchors recorded.'}</p></details><div className="open-question"><ArrowUpRight size={26}/><div><h3>Gap to resolve</h3><p>{f.caseContext?.gap||f.question}</p></div></div></>}
      <details className="scope"><summary><MapPin size={19}/><strong>{f.area}</strong><span>{f.radius/1000} km</span><span>{humanRange(f.startDate,f.endDate)||'Set dates'}</span><Plus size={17}/></summary><div className="scope-fields"><div className="form-row"><label className="field">Area<select value={regions.some(r=>r.name===f.area)?f.area:'Custom area'} disabled={w.disabled} onChange={e=>{const r=regions.find(r=>r.name===e.target.value)!;w.edit({area:r.name,...(r.name!=='Custom area'?{latitude:r.lat,longitude:r.lon}:{})});}}>{regions.map(r=><option key={r.name}>{r.name}</option>)}</select></label><label className="field">Search radius<select value={f.radius} disabled={w.disabled} onChange={e=>w.edit({radius:Number(e.target.value)})}>{[2000,5000,10000,20000,40000,50000].map(v=><option key={v} value={v}>{v/1000} km</option>)}</select></label></div><div className="form-row"><label className="field">From<input type="date" value={f.startDate} disabled={w.disabled} onChange={e=>w.edit({startDate:e.target.value})}/></label><label className="field">Until<input type="date" value={f.endDate} min={f.startDate} disabled={w.disabled} onChange={e=>w.edit({endDate:e.target.value})}/></label></div><label className="field">Remembered activity<input value={f.activity} disabled={w.disabled} onChange={e=>w.edit({activity:e.target.value})}/></label><label className="field">Places to explore<select value={f.category} disabled={w.disabled} onChange={e=>w.edit({category:e.target.value as CaseFile['category']})}><option value="book_store">Bookshops & associated places</option><option value="all_places">All place categories</option></select></label><details><summary>Precise centre</summary><div className="form-row"><label className="field">Latitude<input type="number" step="any" min="-90" max="90" value={f.latitude} disabled={w.disabled} onChange={e=>w.edit({latitude:Number(e.target.value)})}/></label><label className="field">Longitude<input type="number" step="any" min="-180" max="180" value={f.longitude} disabled={w.disabled} onChange={e=>w.edit({longitude:Number(e.target.value)})}/></label></div></details></div></details>
    </section>
    <aside className="references-column"><h2>Cultural references</h2><p className="muted">{f.clues.filter(c=>c.entity).length} of {f.clues.length} identities confirmed</p><label className="field reference-relation">How the references relate to the place<select value={f.referenceRelation||''} disabled={w.disabled} onChange={e=>w.edit({referenceRelation:e.target.value as NonNullable<CaseFile['referenceRelation']>})}><option value="" disabled>Not stated</option>{(Object.keys(relationLabel) as Array<keyof typeof relationLabel>).map(k=><option key={k} value={k}>{relationLabel[k]}</option>)}</select><small>{f.referenceRelation==='personal_interests'?'Taste is a weak signal here: it can reorder places, not place anyone.':f.referenceRelation==='chose_place'?'Their taste may have shaped the choice; nothing yet shows it did.':'Says how much weight a taste-based order deserves.'}</small></label><div className="reference-list">{f.clues.map(c=><article className={`reference ${c.enabled?'':'withdrawn'}`} key={c.id}><div className="reference-title"><label><input type="checkbox" checked={c.enabled} disabled={w.disabled} onChange={e=>w.edit({clues:f.clues.map(x=>x.id===c.id?{...x,enabled:e.target.checked}:x)})}/><strong>{c.label}</strong></label><button className="icon-button" aria-label={`Remove ${c.label}`} disabled={w.disabled} onClick={()=>w.edit({clues:f.clues.filter(x=>x.id!==c.id)})}><X size={17}/></button></div><span className="reference-meta">{c.kind} · {c.entity?'Confirmed':'Unconfirmed'}</span><details className="reference-details"><summary>Origin & identity</summary><label className="field">Origin<select value={c.provenance} disabled={w.disabled} onChange={e=>w.edit({clues:f.clues.map(x=>x.id===c.id?{...x,provenance:e.target.value as Clue['provenance']}:x)})}><option value="supplied_interest">Explicitly supplied interest</option><option value="observation">Observed reference</option><option value="uncertain">Uncertain recollection</option></select></label>{c.entity&&<p>{c.entity.name}</p>}</details>{!c.entity&&(c.matches?.length?<label className="field">Confirm identity<select defaultValue="" disabled={w.disabled} onChange={e=>w.perform({type:'confirm',clueId:c.id,entityId:e.target.value},'Confirming reference')}><option value="" disabled>Choose the intended match</option>{c.matches.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>:<button className="text-button" disabled={w.disabled||!w.services?.qloo} onClick={()=>w.perform({type:'resolve',clueId:c.id},`Resolving ${c.label}`)}>Find identity <ArrowUpRight size={17}/></button>)}</article>)}</div><details className="add-reference"><summary><Plus size={18}/>Add a reference</summary><form onSubmit={e=>{e.preventDefault();w.addClue();}}><label className="field">Reference name<input value={w.newClue} onChange={e=>w.setNewClue(e.target.value)} placeholder="Artist, book, brand…" maxLength={180} disabled={w.disabled||f.clues.length>=8}/></label><label className="field">Reference type<select value={w.newKind} onChange={e=>w.setNewKind(e.target.value as Clue['kind'])} disabled={w.disabled}>{['artist','book','brand','movie','place'].map(k=><option key={k}>{k}</option>)}</select></label><button className="button secondary" disabled={w.disabled||!w.newClue.trim()||f.clues.length>=8}>Add reference <Plus size={17}/></button></form></details><button className="button primary next-action" disabled={w.disabled||(!f.queries.length&&(!w.services?.qloo||w.enabledClues.some(c=>!c.entity)))} onClick={()=>f.queries.length?w.goToStep('leads'):w.perform({type:'discover',clueIds:w.enabledClues.map(c=>c.id)},'Finding places','leads')}>Explore leads <ArrowRight size={19}/></button></aside>
  </div>;
}

export function LeadsView({w}:{w:WorkspaceState}) {
  const f=w.file!;
  const [showAll,setShowAll]=useState(false);
  const enabledIds=w.enabledClues.map(c=>c.id);
  const matching=f.queries.filter(q=>matchesInputs(f,q,enabledIds)).at(-1);
  const seeded=!!w.query?.clueIds.length;
  const paired=w.query&&seeded?controlFor(f,w.query):undefined;
  const control=w.comparison||paired;
  const canPair=!!w.query&&w.query.mode==='live'&&!!w.query.scope;
  const change=w.query&&control?whatTheReferencesChanged(control,w.query):null;
  const movement=new Map(change?.places.map(p=>[p.leadId,p])||[]);
  const ranks=w.query?providerRanks(w.query):new Map<string,number>();
  const filtered=w.leads.filter(l=>l.name.toLowerCase().includes(w.filter.toLowerCase()));
  const shown=showAll||w.filter?filtered:filtered.slice(0,10);
  const dropped=change?.compatible?change.places.filter(p=>p.change==='dropped').map(p=>({p,lead:f.leads.find(l=>l.id===p.leadId)})).filter(x=>x.lead):[];
  function toggle(id:string,on:boolean){
    const clues=f.clues.map(x=>x.id===id?{...x,enabled:on}:x);
    w.edit({clues});
    const next=f.queries.filter(q=>matchesInputs({...f,clues},q,clues.filter(c=>c.enabled).map(c=>c.id))).at(-1);
    if(next){w.setQueryId(next.id);w.setCompareId('');w.setLeadId('');}
  }
  const selected=w.selected;
  const returnedBy=selected?f.queries.filter(q=>q.leadIds.includes(selected.id)):[];
  const inControl=selected&&control?providerRanks(control).get(selected.id)||0:0;
  const enquiryHere=f.enquiry?.leadId===selected?.id;
  return <>
    <RecoveryBanner w={w} />
    <ParkedDraftsBanner w={w} />
    {change&&<p className="finding-sentence" role="status">{change.compatible?changeSentence(change):change.reason}</p>}
    {w.query&&seeded&&!control&&<p className="finding-sentence muted">{canPair?'No search without references to compare with yet.':'No comparable search without references was recorded for this one.'}</p>}
    <div className="query-composer"><div><span className="field-label">References in this search</span><div className="reference-toggles">{f.clues.map(c=><label key={c.id} className={c.enabled?'on':''}><input type="checkbox" checked={c.enabled} disabled={w.disabled} onChange={e=>toggle(c.id,e.target.checked)}/>{c.label}</label>)}{!f.clues.length&&<span>Area and activity only</span>}</div>
      <p className="composer-status">{matching&&w.query?.id===matching.id
        ?<>Showing the search captured on {humanDate(matching.createdAt)} {enabledIds.length?'with these references':'for the area alone'}.</>
        :matching?<>A search with these inputs was captured on {humanDate(matching.createdAt)}. <button type="button" className="text-button inline" onClick={()=>{w.setQueryId(matching.id);w.setCompareId('');w.setLeadId('');}}>Show it</button></>
        :<>These inputs haven’t been searched yet.{w.query&&<> Showing an earlier search: {w.query.label}, captured {humanDate(w.query.createdAt)}.</>}</>}</p></div>
      <div className="composer-actions">
        {!matching&&<><button className="button primary" disabled={w.disabled||!w.services?.qloo||w.enabledClues.some(c=>!c.entity)} onClick={()=>w.perform({type:'discover',clueIds:enabledIds},'Querying Qloo','leads')}>Run this search <ArrowRight size={18}/></button><span className="composer-cost">{enabledIds.length?'Up to 2 Qloo requests: this search and the same search without references. 1 if a matching one from today is reused.':'1 Qloo request.'}</span></>}
        {w.query&&seeded&&!control&&canPair&&<><button className="text-button" disabled={w.disabled||!w.services?.qloo} onClick={()=>w.perform({type:'run_control',queryId:w.query!.id},'Running the same search without references','leads')}>Run without references <ArrowUpRight size={17}/></button><span className="composer-cost">Up to 1 Qloo request, with this search’s exact settings.</span></>}
        {w.usage&&<span className="composer-cost">This case so far: {w.usage.qlooAttempts} Qloo request{w.usage.qlooAttempts===1?'':'s'}{w.usage.qlooFailed?`, ${w.usage.qlooFailed} failed or unfinished`:''}.</span>}
      </div></div>
    {w.query?.warnings.map((text,i)=><p className="feedback error" key={i}>{text}</p>)}
    <div className={`lead-spread ${w.leadId?'has-selection':''}`}><section className="candidate-list"><div className="list-tools"><h2>{w.query?`${w.query.leadIds.length} places returned`:'Returned places'}</h2><label className="search-field"><MagnifyingGlass size={18}/><span className="sr-only">Filter places</span><input value={w.filter} onChange={e=>w.setFilter(e.target.value)} placeholder="Find a place"/></label></div><div className="candidate-rows">{shown.map(l=>{
      const rank=ranks.get(l.id)||w.leads.indexOf(l)+1;
      const m=change?.compatible?movement.get(l.id):undefined;
      return <button key={l.id} className={`candidate-row ${w.selected?.id===l.id?'selected':''}`} onClick={()=>w.setLeadId(l.id)}><span className="rank">{rank}</span><span className="candidate-name"><strong>{l.name}</strong><small>{l.address}</small></span>{m&&m.change!=='same'&&<span className={`movement ${m.change}`}>{m.change==='new'?'New':m.change==='up'?`↑ ${m.delta}`:`↓ ${Math.abs(m.delta||0)}`}</span>}<ArrowUpRight size={20}/></button>;
    })}{!filtered.length&&<p className="empty-copy">{w.leads.length?'No places match that name.':'Run a search to find places in the selected area.'}</p>}</div>
      {!showAll&&!w.filter&&filtered.length>10&&<button className="text-button show-all" onClick={()=>setShowAll(true)}>Show all {filtered.length} <Plus size={17}/></button>}
      {!!dropped.length&&!w.filter&&<div className="dropped-places"><h3>Not in this result</h3><p>Returned without the references, missing with them.</p>{dropped.map(({p,lead})=><button key={p.leadId} className="candidate-row dropped" onClick={()=>w.setLeadId(p.leadId)}><span className="rank">{p.controlRank}</span><span className="candidate-name"><strong>{lead!.name}</strong><small>{lead!.address}</small></span><span className="movement dropped">Was {p.controlRank}</span></button>)}</div>}
      <p className="list-note">Position in this response, not likelihood of a visit.</p></section>
    <aside className="candidate-detail">{selected?<><button className="text-button mobile-back" onClick={()=>w.setLeadId('')}>← Back to places</button><span className="field-label">Place under review</span><h2>{selected.name}</h2><p className="muted">{selected.address}</p><dl><dt>Returned by</dt><dd>{returnedBy.length} of {f.queries.length} search{f.queries.length===1?'':'es'} in this case{control&&change?.compatible&&<>; {inControl?`position ${inControl} without the references`:'not returned without the references'}</>}</dd><dt>Still to establish</dt><dd><ul className="establish-list">{!w.selectedSources.length&&<li>No source attached yet: check what the place offers.</li>}{f.activity&&<li>Whether it fits “{f.activity}”.</li>}{(f.startDate||f.endDate)&&<li>Whether anything there is recorded for {humanRange(f.startDate,f.endDate)}.</li>}<li>{enquiryHere?'An enquiry is drafted; a record linking the place to the case is still needed.':'A record linking the place to the case.'}</li></ul></dd></dl><div className="detail-commands"><button className="button primary" onClick={()=>w.goToStep('sources')}>Check sources <ArrowRight size={18}/></button><button className="text-button" disabled={w.disabled} onClick={()=>w.chooseEnquiry(selected)}>Draft enquiry <ArrowUpRight size={17}/></button></div>{!!w.selectedSources.length&&<button className="source-count text-button" onClick={()=>w.goToStep('sources')}><LinkSimple size={17}/>{w.selectedSources.length} source note{w.selectedSources.length===1?'':'s'}</button>}{selected.website&&<a className="text-button" href={selected.website} target="_blank" rel="noopener noreferrer">Listed website <ArrowUpRight size={17}/></a>}</>:<p className="empty-copy">Select a returned place.</p>}</aside></div>
    {w.query&&<details className="provenance"><summary>Search details and comparison <Plus size={17}/></summary>
      <p>Inputs: {w.query.inputSnapshot ? w.query.inputSnapshot.clues.map(c=>c.label).join(', ')||'No cultural references' : w.query.clueIds.map(id=>f.clues.find(c=>c.id===id)?.label||'Reference removed').join(', ')||'No cultural references'} · {w.query.mode==='recorded'?'Recorded':'Live'} Qloo response, {humanDate(w.query.createdAt)}</p>
      <p>Centre: {w.query.geography.latitude}, {w.query.geography.longitude} · Radius: {w.query.geography.radius/1000} km · Category: {w.query.category}{w.query.scope?<> · Result limit: {w.query.scope.take}{w.query.scope.tags.length?<> · Tags: {w.query.scope.tags.join(', ')}</>:null}</>:<> · Result limit and filters not recorded</>}</p>
      {change&&<p>Compared with the search captured on {humanDate(change.capturedAt.control)}. {change.warnings.map(t=>/[.!?]$/.test(t)?t:`${t}.`).join(' ')}</p>}
      <code>{w.query.receiptId}</code>
      <div className="query-controls advanced"><label className="field">View result<select value={w.query?.id||''} onChange={e=>{w.setQueryId(e.target.value);w.setCompareId('');w.setLeadId('');}}>{f.queries.map(q=><option key={q.id} value={q.id}>{q.label} · {q.mode} · {humanDate(q.createdAt)}</option>)}</select></label>{seeded&&<label className="field">Compare with a search without references<select value={w.compareId} onChange={e=>w.setCompareId(e.target.value)}><option value="">{paired?`The matching search · ${humanDate(paired.createdAt)}`:'None chosen'}</option>{f.queries.filter(q=>q.id!==w.query?.id&&!q.clueIds.length).map(q=><option key={q.id} value={q.id}>{q.label} · {q.mode} · {humanDate(q.createdAt)}</option>)}</select></label>}</div>
    </details>}
  </>;
}

export function SourcesView({w}:{w:WorkspaceState}) {
  const f=w.file!;
  return <div className="sources-spread">
    <RecoveryBanner w={w} />
    <ParkedDraftsBanner w={w} />
    <section><label className="field place-picker">Place under review<select value={w.selected?.id||''} disabled={w.disabled} onChange={e=>w.setLeadId(e.target.value)}>{!f.leads.length&&<option value="">Discover a place first</option>}{!!w.leads.length&&<optgroup label="In the current result">{w.leads.map((l,i)=><option key={l.id} value={l.id}>{w.query?providerRanks(w.query).get(l.id)||i+1:i+1}. {l.name}{placeHint(l.address)?` · ${placeHint(l.address)}`:''}</option>)}</optgroup>}{f.leads.some(l=>!w.leads.includes(l))&&<optgroup label="From earlier searches">{f.leads.filter(l=>!w.leads.includes(l)).map(l=><option key={l.id} value={l.id}>{l.name}{placeHint(l.address)?` · ${placeHint(l.address)}`:''}</option>)}</optgroup>}</select></label>{w.selectedSources.map(s=><article className="source-document" key={s.id}><div className="document-meta"><span>{s.mode==='recorded'?'Recorded source note':s.kind==='user_record'?'Investigator-supplied record':s.kind==='user_excerpt'?'Supplied excerpt':'Retrieved page'}</span><time>{humanDate(s.capturedAt)}</time></div><h2>{s.title}</h2><p className="source-passage">{s.excerpt}</p><div className="source-caveat"><h3>What remains open</h3><p>{s.note||'Review the source’s scope and limits before relying on it.'}</p></div>{s.url&&<a className="text-button" href={s.url} target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={17}/></a>}</article>)}{!w.selectedSources.length&&<div className="empty-copy">No sources attached. Read a public page or add a relevant passage.</div>}<div className="source-commands">{w.selected?.website&&<button className="button secondary" disabled={w.disabled} onClick={()=>w.perform({type:'inspect',leadId:w.selected!.id,url:w.selected!.website!.replace(/^http:/,'https:')},'Reading public source')}>Read public page <ArrowUpRight size={17}/></button>}{w.selected&&<button className="button primary" disabled={w.disabled} onClick={()=>w.chooseEnquiry(w.selected!)}>Draft next enquiry <ArrowRight size={18}/></button>}</div></section><form className="source-composer" onSubmit={async e=>{e.preventDefault();if(!w.selected||!w.file)return;const targetLeadId=w.selected.id;await w.perform({type:'source',leadId:targetLeadId,...w.sourceForm,url:w.sourceForm.url||undefined},'Saving source note');}}><h2>Attach a source</h2><label className="field">Source type<select disabled={w.disabled} value={w.sourceForm.kind} onChange={e=>w.setSourceForm({...w.sourceForm,kind:e.target.value as typeof w.sourceForm.kind})}><option value="user_excerpt">Public source excerpt</option><option value="user_record">Investigator-supplied record</option></select></label><label className="field">Title<input required disabled={w.disabled} value={w.sourceForm.title} onChange={e=>w.setSourceForm({...w.sourceForm,title:e.target.value})}/></label><label className="field">Source link (optional)<input type="url" disabled={w.disabled} value={w.sourceForm.url} onChange={e=>w.setSourceForm({...w.sourceForm,url:e.target.value})} placeholder="https://…"/></label><label className="field">Relevant passage<textarea required rows={5} disabled={w.disabled} value={w.sourceForm.excerpt} onChange={e=>w.setSourceForm({...w.sourceForm,excerpt:e.target.value})}/></label><label className="field">What does it establish?<textarea rows={3} disabled={w.disabled} value={w.sourceForm.note} onChange={e=>w.setSourceForm({...w.sourceForm,note:e.target.value})}/></label><div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}><button className="button primary" disabled={w.disabled||!w.selected}>Attach source <Plus size={18}/></button>{(!!w.sourceForm.title.trim() || !!w.sourceForm.excerpt.trim()) && <button type="button" className="button secondary" disabled={w.disabled} onClick={()=>w.clearSourceForm()}>Discard draft</button>}</div></form></div>;
}

const outcomeLabel={confirming:'Confirms the lead',conflicting:'Conflicts with the lead',unavailable:'No record available'} as const;
function receivedOn(value?:string){return value?humanDate(value):'Date not recorded';}

export function EnquiryView({w}:{w:WorkspaceState}) {
  const f=w.file!,e=f.enquiry;
  const lead=f.leads.find(l=>l.id===e?.leadId);
  if(!e)return <div className="workspace-empty"><RecoveryBanner w={w} /><ParkedDraftsBanner w={w} /><h2>No enquiry drafted yet.</h2><p>Select a place and inspect its sources.</p><button className="button primary" onClick={()=>w.goToStep('leads')}>Explore leads <ArrowRight size={18}/></button></div>;
  const responses = e.responses?.length ? e.responses : (e.response ? [e.response] : []);
  const form=w.responseForm,setForm=w.setResponseForm;
  const started=!!form.respondent.trim()||!!form.passage.trim();

  return <div className="enquiry-spread">
    <RecoveryBanner w={w} />
    <ParkedDraftsBanner w={w} />
    <section className="enquiry-sheet">
      <div className="enquiry-top"><h2>{lead?.name||'Unresolved lead'}</h2>{lead && <button className="text-button" type="button" disabled={w.disabled} onClick={()=>w.regenerateEnquiry(lead)}>Regenerate draft</button>}</div>
      <label className="field">Record to check<textarea rows={2} value={e.recordTarget||''} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,recordTarget:event.target.value}})}/></label>
      <label className="field">The next question<textarea rows={2} value={e.question} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,question:event.target.value}})}/></label>
      <label className="field">Why this check before the others<textarea rows={2} value={e.whyThisCheck||''} placeholder="The uncertainty this record can settle…" disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,whyThisCheck:event.target.value}})}/></label>
      {(['rationale','draft'] as const).map(key=><label className="field" key={key}>{key==='rationale'?'Rationale and open uncertainty':'Enquiry draft'}<textarea rows={key==='draft'?8:2} value={e[key]} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,[key]:event.target.value}})}/></label>)}
      <div className="source-commands"><button className="button primary" onClick={w.copy}>Copy enquiry <ArrowUpRight size={17}/></button><button className="button secondary" disabled={w.disabled} onClick={w.download}>Export brief <DownloadSimple size={18}/></button></div>
      <p className="list-note">Draft only. No message has been sent.</p>

      <details className="response-record" open={started||undefined}>
        <summary>Record a response <Plus size={17}/></summary>
        <form onSubmit={async (evt) => {
          evt.preventDefault();
          if (!w.file || !e || !form.respondent.trim() || !form.passage.trim()) return;
          const targetEnquiryLeadId = e.leadId;
          if (!targetEnquiryLeadId) return;
          await w.perform({
            type: 'record_enquiry_response',
            leadId: targetEnquiryLeadId,
            expectedQuestion: e.question,
            expectedIdentity: getEnquiryIdentity(e) || undefined,
            expectedIdentityJson: getEnquiryIdentityJson(e) || undefined,
            respondent: form.respondent,
            receivedAt: form.receivedAt,
            passage: form.passage,
            outcomeBranch: form.outcomeBranch,
            sourceIds: e.sourceIds,
            whatChanges: form.whatChanges,
            unresolved: form.unresolved,
            summary: form.summary || `${form.respondent} (${form.outcomeBranch})`,
            revisedActionText: form.revisedActionText || form.whatChanges
          }, 'Recording response');
        }}>
          <div className="form-row"><label className="field">Who replied<input required value={form.respondent} disabled={w.disabled} onChange={evt=>setForm({...form, respondent: evt.target.value})} placeholder="Records officer, venue manager…" /></label><label className="field">Date received<input type="date" required value={form.receivedAt} disabled={w.disabled} onChange={evt=>setForm({...form, receivedAt: evt.target.value})} /></label></div>
          <label className="field">What the reply says, or what’s missing<textarea required rows={3} value={form.passage} disabled={w.disabled} onChange={evt=>setForm({...form, passage: evt.target.value})} placeholder="Quote the relevant passage…" /></label>
          <fieldset className="outcome-choice"><legend>Outcome</legend>{(['confirming','conflicting','unavailable'] as const).map(o=><label key={o} className={form.outcomeBranch===o?'on':''}><input type="radio" name="outcome" value={o} checked={form.outcomeBranch===o} disabled={w.disabled} onChange={()=>setForm({...form, outcomeBranch:o})}/>{outcomeLabel[o]}</label>)}</fieldset>
          {!!form.passage.trim()&&<><label className="field">What changes<textarea rows={2} value={form.whatChanges} disabled={w.disabled} onChange={evt=>setForm({...form, whatChanges: evt.target.value})} placeholder="How the next step changes…" /></label>
          <label className="field">Still open<textarea rows={2} value={form.unresolved} disabled={w.disabled} onChange={evt=>setForm({...form, unresolved: evt.target.value})} placeholder="What remains unverified…" /></label></>}
          <div className="source-commands"><button className="button primary" disabled={w.disabled || !form.respondent.trim() || !form.passage.trim()}>Record the response <Plus size={18}/></button>{started && <button type="button" className="button secondary" disabled={w.disabled} onClick={()=>w.clearResponseForm()}>Discard draft</button>}</div>
        </form>
      </details>

      {!!e.history?.length && <details className="archived-history"><summary>Earlier enquiries ({e.history.length}) <Plus size={17}/></summary>
        {e.history.map((h, hIdx) => {
          const hLead = f.leads.find(l => l.id === h.enquiry.leadId);
          const hResponses = h.enquiry.responses?.length ? h.enquiry.responses : (h.enquiry.response ? [h.enquiry.response] : []);
          return <article key={hIdx} className="history-entry">
            <h3>{hLead?.name || 'Unresolved lead'} · {h.recordedAt ? humanDate(h.recordedAt) : 'Archived'}</h3>
            <p><strong>Question</strong> {h.enquiry.question}</p>
            <p><strong>Record to check</strong> {h.enquiry.recordTarget || 'Not specified'}</p>
            {h.enquiry.whyThisCheck&&<p><strong>Why this check</strong> {h.enquiry.whyThisCheck}</p>}
            <p><strong>Rationale</strong> {h.enquiry.rationale}</p>
            <ul><li><strong>If it supports the lead</strong> {h.enquiry.confirming}</li><li><strong>If it conflicts</strong> {h.enquiry.conflicting}</li><li><strong>If no answer</strong> {h.enquiry.unavailable}</li></ul>
            {hResponses.map((r, rIdx) => <ResponseCard key={r.id || rIdx} r={r} />)}
            <details><summary>Archived draft</summary><pre>{h.enquiry.draft}</pre></details>
          </article>;
        })}
      </details>}
    </section>

    <aside className="decision-column">
      <h2>Where the answer leads</h2>
      {(['confirming','conflicting','unavailable'] as const).map((key)=><label className="field decision" key={key}>{key==='confirming'?'If it supports the lead':key==='conflicting'?'If it conflicts':'If no answer is available'}<textarea rows={3} value={(e[key] as string)||''} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,[key]:event.target.value}})}/></label>)}
      {!!responses.length && <div className="response-history"><h3>Recorded responses ({responses.length})</h3>{responses.map((r, idx) => <ResponseCard key={r.id || idx} r={r} />)}</div>}
      <div className="enquiry-sources"><h3>Sources behind the enquiry</h3>{e.sourceIds.map(id=>{const s=f.sources.find(x=>x.id===id);return s?<button className="text-button" key={id} onClick={()=>{w.setLeadId(s.leadId);w.goToStep('sources');}}><LinkSimple size={17}/>{s.title}<ArrowUpRight size={17}/></button>:null;})}{!e.sourceIds.length&&<p>No sources attached.</p>}</div>
    </aside>
  </div>;
}

function ResponseCard({r}:{r:EnquiryResponse}) {
  return <article className="response-card">
    <div className="response-head"><strong>{r.respondent}</strong><span className={`outcome ${r.outcomeBranch}`}>{outcomeLabel[r.outcomeBranch]}</span></div>
    <time>{receivedOn(r.receivedAt)}</time>
    <p className="response-passage">{r.passage}</p>
    {r.whatChanges && <p><strong>What changes</strong> {r.whatChanges}</p>}
    {r.unresolved && <p><strong>Still open</strong> {r.unresolved}</p>}
    <details><summary>Record details</summary><p>Question answered: {r.answeredQuestion || 'not captured'}</p><p>Branch: {r.selectedBranchText || 'not captured'}</p>{r.receiptId && <code>{r.receiptId}</code>}</details>
  </article>;
}
