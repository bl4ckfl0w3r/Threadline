'use client';
import { ArrowRight, ArrowUpRight, Check, DownloadSimple, LinkSimple, MagnifyingGlass, MapPin, PencilSimple, Plus, X } from '@phosphor-icons/react';
import { regions, when, type WorkspaceState } from './use-workspace';
import type { CaseFile, Clue } from '@/lib/contracts';

export function RecoveryBanner({w}:{w:WorkspaceState}) {
  if (!w.recoveryState) return null;
  return (
    <div className="feedback error recovery-banner" style={{ margin: '1rem 0', padding: '1rem', border: '1px solid #e53e3e', borderRadius: '4px' }}>
      <p><strong>Conflict detected:</strong> {w.recoveryState.errorMsg}</p>
      <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
        <button className="button secondary" type="button" onClick={w.copyLocalWork}>Copy local edits</button>
        <button className="button primary" type="button" onClick={w.resolveConflictKeepServer}>Reload server case</button>
      </div>
    </div>
  );
}

export function CaseView({w}:{w:WorkspaceState}) {
  const f=w.file!;
  return <div className="case-spread">
    <RecoveryBanner w={w} />
    <section className="account-sheet">
      <div className="section-top"><h2>Reported account</h2><button className="text-button" disabled={w.disabled} onClick={()=>w.editingBrief?w.finishBrief():w.setEditingBrief(true)}>{w.editingBrief?'Save brief':'Edit brief'}{w.editingBrief?<Check size={17}/>:<PencilSimple size={17}/>}</button></div>
      {w.editingBrief?<div className="brief-editor"><label className="field">Case title<input value={f.title} maxLength={160} disabled={w.disabled} onChange={e=>w.edit({title:e.target.value})}/></label><label className="field">Investigation question<input value={f.question} disabled={w.disabled} onChange={e=>w.edit({question:e.target.value})}/></label><label className="field">Reported account<textarea rows={5} value={f.notes} disabled={w.disabled} onChange={e=>w.edit({notes:e.target.value})}/></label><label className="field">Known timeline<textarea rows={3} value={f.caseContext?.known||''} disabled={w.disabled} onChange={e=>w.edit({caseContext:{known:e.target.value,gap:f.caseContext?.gap||''}})}/></label><label className="field">Gap to resolve<textarea rows={3} value={f.caseContext?.gap||''} disabled={w.disabled} onChange={e=>w.edit({caseContext:{known:f.caseContext?.known||'',gap:e.target.value}})}/></label></div>:<><p className="reported-account">{f.notes||'Add the reported incident, the known details and the gap to investigate.'}</p><details className="timeline-note"><summary>Known timeline <Plus size={17}/></summary><p>{f.caseContext?.known||'No timeline anchors recorded.'}</p></details><div className="open-question"><ArrowUpRight size={26}/><div><h3>Gap to resolve</h3><p>{f.caseContext?.gap||f.question}</p></div></div></>}
      <details className="scope"><summary><MapPin size={19}/><strong>{f.area}</strong><span>{f.radius/1000} km</span><span>{f.startDate?when(f.startDate):'Set dates'}{f.endDate?` – ${when(f.endDate)}`:''}</span><Plus size={17}/></summary><div className="scope-fields"><div className="form-row"><label className="field">Area<select value={regions.some(r=>r.name===f.area)?f.area:'Custom area'} disabled={w.disabled} onChange={e=>{const r=regions.find(r=>r.name===e.target.value)!;w.edit({area:r.name,...(r.name!=='Custom area'?{latitude:r.lat,longitude:r.lon}:{})});}}>{regions.map(r=><option key={r.name}>{r.name}</option>)}</select></label><label className="field">Search radius<select value={f.radius} disabled={w.disabled} onChange={e=>w.edit({radius:Number(e.target.value)})}>{[2000,5000,10000,20000,40000,50000].map(v=><option key={v} value={v}>{v/1000} km</option>)}</select></label></div><div className="form-row"><label className="field">From<input type="date" value={f.startDate} disabled={w.disabled} onChange={e=>w.edit({startDate:e.target.value})}/></label><label className="field">Until<input type="date" value={f.endDate} min={f.startDate} disabled={w.disabled} onChange={e=>w.edit({endDate:e.target.value})}/></label></div><label className="field">Remembered activity<input value={f.activity} disabled={w.disabled} onChange={e=>w.edit({activity:e.target.value})}/></label><label className="field">Places to explore<select value={f.category} disabled={w.disabled} onChange={e=>w.edit({category:e.target.value as CaseFile['category']})}><option value="book_store">Bookshops & associated places</option><option value="all_places">All place categories</option></select></label><details><summary>Precise centre</summary><div className="form-row"><label className="field">Latitude<input type="number" step="any" min="-90" max="90" value={f.latitude} disabled={w.disabled} onChange={e=>w.edit({latitude:Number(e.target.value)})}/></label><label className="field">Longitude<input type="number" step="any" min="-180" max="180" value={f.longitude} disabled={w.disabled} onChange={e=>w.edit({longitude:Number(e.target.value)})}/></label></div></details></div></details>
    </section>
    <aside className="references-column"><h2>Cultural references</h2><p className="muted">{f.clues.filter(c=>c.entity).length} of {f.clues.length} identities confirmed</p><div className="reference-list">{f.clues.map(c=><article className={`reference ${c.enabled?'':'withdrawn'}`} key={c.id}><div className="reference-title"><label><input type="checkbox" checked={c.enabled} disabled={w.disabled} onChange={e=>w.edit({clues:f.clues.map(x=>x.id===c.id?{...x,enabled:e.target.checked}:x)})}/><strong>{c.label}</strong></label><button className="icon-button" aria-label={`Remove ${c.label}`} disabled={w.disabled} onClick={()=>w.edit({clues:f.clues.filter(x=>x.id!==c.id)})}><X size={17}/></button></div><span className="reference-meta">{c.kind} · {c.entity?'Confirmed':'Unconfirmed'}</span><details className="reference-details"><summary>Origin & identity</summary><label className="field">Origin<select value={c.provenance} disabled={w.disabled} onChange={e=>w.edit({clues:f.clues.map(x=>x.id===c.id?{...x,provenance:e.target.value as Clue['provenance']}:x)})}><option value="supplied_interest">Explicitly supplied interest</option><option value="observation">Observed reference</option><option value="uncertain">Uncertain recollection</option></select></label>{c.entity&&<p>{c.entity.name}</p>}</details>{!c.entity&&(c.matches?.length?<label className="field">Confirm identity<select defaultValue="" disabled={w.disabled} onChange={e=>w.perform({type:'confirm',clueId:c.id,entityId:e.target.value},'Confirming reference')}><option value="" disabled>Choose the intended match</option>{c.matches.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>:<button className="text-button" disabled={w.disabled||!w.services?.qloo} onClick={()=>w.perform({type:'resolve',clueId:c.id},`Resolving ${c.label}`)}>Find identity <ArrowUpRight size={17}/></button>)}</article>)}</div><details className="add-reference"><summary><Plus size={18}/>Add a reference</summary><form onSubmit={e=>{e.preventDefault();w.addClue();}}><label className="field">Reference name<input value={w.newClue} onChange={e=>w.setNewClue(e.target.value)} placeholder="Artist, book, brand…" maxLength={180} disabled={w.disabled||f.clues.length>=8}/></label><label className="field">Reference type<select value={w.newKind} onChange={e=>w.setNewKind(e.target.value as Clue['kind'])} disabled={w.disabled}>{['artist','book','brand','movie','place'].map(k=><option key={k}>{k}</option>)}</select></label><button className="button secondary" disabled={w.disabled||!w.newClue.trim()||f.clues.length>=8}>Add reference <Plus size={17}/></button></form></details><button className="button primary next-action" disabled={w.disabled||(!f.queries.length&&(!w.services?.qloo||w.enabledClues.some(c=>!c.entity)))} onClick={()=>f.queries.length?w.goToStep('leads'):w.perform({type:'discover',clueIds:w.enabledClues.map(c=>c.id)},'Finding places','leads')}>Explore leads <ArrowRight size={19}/></button></aside>
  </div>;
}

export function LeadsView({w}:{w:WorkspaceState}) {
  const f=w.file!;
  const filtered=w.leads.filter(l=>l.name.toLowerCase().includes(w.filter.toLowerCase()));
  return <>
    <RecoveryBanner w={w} />
    <div className="query-composer"><div><span className="field-label">References for your next query</span><div className="reference-toggles">{f.clues.map(c=><label key={c.id} className={c.enabled?'on':''}><input type="checkbox" checked={c.enabled} disabled={w.disabled} onChange={e=>w.edit({clues:f.clues.map(x=>x.id===c.id?{...x,enabled:e.target.checked}:x)})}/>{c.label}</label>)}{!f.clues.length&&<span>Area and activity only</span>}</div></div><button className="button primary" disabled={w.disabled||!w.services?.qloo||w.enabledClues.some(c=>!c.entity)} onClick={()=>w.perform({type:'discover',clueIds:w.enabledClues.map(c=>c.id)},'Querying Qloo','leads')}>Run live query <ArrowRight size={18}/></button></div>
    <div className="query-controls"><label className="field">View result<select value={w.query?.id||''} onChange={e=>{w.setQueryId(e.target.value);w.setLeadId('');}}>{f.queries.map(q=><option key={q.id} value={q.id}>{q.label} · {q.mode}</option>)}{!f.queries.length&&<option value="">No queries yet</option>}</select></label><label className="field">Compare with<select value={w.compareId} onChange={e=>w.setCompareId(e.target.value)}><option value="">No comparison</option>{f.queries.filter(q=>q.id!==w.query?.id).map(q=><option key={q.id} value={q.id}>{q.label} · {q.mode}</option>)}</select></label><button className="text-button" disabled={w.disabled||!w.services?.qloo} onClick={()=>w.perform({type:'discover',clueIds:[]},'Querying area baseline','leads')}>Run area baseline <ArrowUpRight size={17}/></button></div>
    {w.query&&<div className="query-meta"><span>{w.query.mode==='recorded'?'Recorded Qloo response':'Live Qloo response'} · {when(w.query.createdAt)} · {w.query.leadIds.length} places</span>{w.comparison&&(w.differences?.compatible !== false ? <span>{w.differences?.added.length} new · {w.differences?.retained.length} retained · {w.differences?.removed.length} absent from this result</span> : <span className="feedback error" style={{ display: 'block', marginTop: '0.25rem' }}>{w.differences?.reason}</span>)}</div>}
    {w.query?.warnings.map((text,i)=><p className="feedback error" key={i}>{text}</p>)}
    <div className={`lead-spread ${w.leadId?'has-selection':''}`}><section className="candidate-list"><div className="list-tools"><h2>Returned places</h2><label className="search-field"><MagnifyingGlass size={18}/><span className="sr-only">Filter places</span><input value={w.filter} onChange={e=>w.setFilter(e.target.value)} placeholder="Find a place"/></label></div><div className="candidate-rows">{filtered.map((l, idx)=>{
      let rank = idx + 1;
      if (w.query) {
        const rawRow = w.query.rawRows?.find((r: any) => (r?.entity_id === l.id || r?.id === l.id));
        if (rawRow && typeof (rawRow as any).ordinal === 'number') {
          rank = (rawRow as any).ordinal + 1;
        } else if (Array.isArray(w.query.leadIds)) {
          const leadIdx = w.query.leadIds.indexOf(l.id);
          if (leadIdx >= 0) rank = leadIdx + 1;
        }
      } else {
        const fullIdx = w.leads.findIndex(lead => lead.id === l.id);
        if (fullIdx >= 0) rank = fullIdx + 1;
      }
      return <button key={l.id} className={`candidate-row ${w.selected?.id===l.id?'selected':''}`} onClick={()=>w.setLeadId(l.id)}><span className="rank">{rank}</span><span className="candidate-name"><strong>{l.name}</strong><small>{l.address}</small>{w.comparison&&w.differences?.compatible!==false&&w.differences?.added.includes(l.id)&&<span className="result-change">New in this result</span>}</span><ArrowUpRight size={20}/></button>;
    })}{!filtered.length&&<p className="empty-copy">{w.leads.length?'No places match that name.':'Run a query to find places in the selected area.'}</p>}</div><p className="list-note">Position in this response, not likelihood of a visit.</p></section>
    <aside className="candidate-detail">{w.selected?<><button className="text-button mobile-back" onClick={()=>w.setLeadId('')}>← Back to places</button><span className="field-label">Place under review</span><h2>{w.selected.name}</h2><p className="muted">{w.selected.address}</p><dl><dt>Returned for</dt><dd>{w.selectedQuery?.label||'An earlier query'}</dd><dt>Still to establish</dt><dd>The remembered activity, the relevant dates, and a case-linked record.</dd></dl><div className="detail-commands"><button className="button primary" onClick={()=>w.goToStep('sources')}>Check sources <ArrowRight size={18}/></button><button className="text-button" disabled={w.disabled} onClick={()=>w.chooseEnquiry(w.selected!)}>Draft enquiry <ArrowUpRight size={17}/></button></div>{!!w.selectedSources.length&&<button className="source-count text-button" onClick={()=>w.goToStep('sources')}><LinkSimple size={17}/>{w.selectedSources.length} source note{w.selectedSources.length===1?'':'s'}</button>}{w.selected.website&&<a className="text-button" href={w.selected.website} target="_blank" rel="noopener noreferrer">Listed website <ArrowUpRight size={17}/></a>}</>:<p className="empty-copy">Select a returned place.</p>}</aside></div>
    {w.query&&<details className="provenance"><summary>Query provenance</summary><p>Inputs: {w.query.inputSnapshot ? w.query.inputSnapshot.clues.map(c=>c.label).join(', ') : w.query.clueIds.map(id=>f.clues.find(c=>c.id===id)?.label||'Reference removed').join(', ')||'No cultural interests'}</p><p>Centre: {w.query.geography.latitude}, {w.query.geography.longitude} · Radius: {w.query.geography.radius} metres · Category: {w.query.category}</p><code>{w.query.receiptId}</code></details>}
  </>;
}

export function SourcesView({w}:{w:WorkspaceState}) {
  const f=w.file!;
  return <div className="sources-spread">
    <RecoveryBanner w={w} />
    <section><label className="field place-picker">Place under review<select value={w.selected?.id||''} disabled={w.disabled} onChange={e=>w.setLeadId(e.target.value)}>{f.leads.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}{!f.leads.length&&<option value="">Discover a place first</option>}</select></label>{w.selectedSources.map(s=><article className="source-document" key={s.id}><div className="document-meta"><span>{s.mode==='recorded'?'Recorded source note':s.kind==='user_record'?'Investigator-supplied record':s.kind==='user_excerpt'?'Supplied excerpt':'Retrieved page'}</span><time>{when(s.capturedAt)}</time></div><h2>{s.title}</h2><p className="source-passage">{s.excerpt}</p><div className="source-caveat"><h3>What remains open</h3><p>{s.note||'Review the source’s scope and limits before relying on it.'}</p></div>{s.url&&<a className="text-button" href={s.url} target="_blank" rel="noopener noreferrer">Open source <ArrowUpRight size={17}/></a>}</article>)}{!w.selectedSources.length&&<div className="empty-copy">No sources attached. Read a public page or add a relevant passage.</div>}<div className="source-commands">{w.selected?.website&&<button className="button secondary" disabled={w.disabled} onClick={()=>w.perform({type:'inspect',leadId:w.selected!.id,url:w.selected!.website!.replace(/^http:/,'https:')},'Reading public source')}>Read public page <ArrowUpRight size={17}/></button>}{w.selected&&<button className="button primary" disabled={w.disabled} onClick={()=>w.chooseEnquiry(w.selected!)}>Draft next enquiry <ArrowRight size={18}/></button>}</div></section><form className="source-composer" onSubmit={async e=>{e.preventDefault();if(!w.selected)return;const result=await w.perform({type:'source',leadId:w.selected.id,...w.sourceForm,url:w.sourceForm.url||undefined},'Saving source note');if(result)w.clearSourceForm();}}><h2>Attach a source</h2><label className="field">Source type<select disabled={w.disabled} value={w.sourceForm.kind} onChange={e=>w.setSourceForm({...w.sourceForm,kind:e.target.value as typeof w.sourceForm.kind})}><option value="user_excerpt">Public source excerpt</option><option value="user_record">Investigator-supplied record</option></select></label><label className="field">Title<input required disabled={w.disabled} value={w.sourceForm.title} onChange={e=>w.setSourceForm({...w.sourceForm,title:e.target.value})}/></label><label className="field">Source link (optional)<input type="url" disabled={w.disabled} value={w.sourceForm.url} onChange={e=>w.setSourceForm({...w.sourceForm,url:e.target.value})} placeholder="https://…"/></label><label className="field">Relevant passage<textarea required rows={5} disabled={w.disabled} value={w.sourceForm.excerpt} onChange={e=>w.setSourceForm({...w.sourceForm,excerpt:e.target.value})}/></label><label className="field">What does it establish?<textarea rows={3} disabled={w.disabled} value={w.sourceForm.note} onChange={e=>w.setSourceForm({...w.sourceForm,note:e.target.value})}/></label><div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}><button className="button primary" disabled={w.disabled||!w.selected}>Attach source <Plus size={18}/></button>{(!!w.sourceForm.title.trim() || !!w.sourceForm.excerpt.trim()) && <button type="button" className="button secondary" disabled={w.disabled} onClick={()=>w.clearSourceForm()}>Discard draft</button>}</div></form></div>;
}

export function EnquiryView({w}:{w:WorkspaceState}) {
  const f=w.file!,e=f.enquiry;
  const lead=f.leads.find(l=>l.id===e?.leadId);
  if(!e)return <div className="workspace-empty"><RecoveryBanner w={w} /><h2>No enquiry drafted yet.</h2><p>Select a place and inspect its sources.</p><button className="button primary" onClick={()=>w.goToStep('leads')}>Explore leads <ArrowRight size={18}/></button></div>;

  const responses = e.responses?.length ? e.responses : (e.response ? [e.response] : []);

  return <div className="enquiry-spread">
    <RecoveryBanner w={w} />
    <section className="enquiry-sheet">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>{lead?.name||'Unresolved Lead'}</h2>
        {lead && <button className="text-button" type="button" disabled={w.disabled} onClick={()=>w.regenerateEnquiry(lead)}>Regenerate draft</button>}
      </div>
      <label className="field">Record to check<textarea rows={3} value={e.recordTarget||''} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,recordTarget:event.target.value}})}/></label>
      {(['question','rationale','draft'] as const).map(key=><label className="field" key={key}>{key==='question'?'The next question':key==='rationale'?'Why this check':'Enquiry draft'}<textarea rows={key==='draft'?10:3} value={e[key]} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,[key]:event.target.value}})}/></label>)}
      <div className="source-commands"><button className="button primary" onClick={w.copy}>Copy enquiry <ArrowUpRight size={17}/></button><button className="button secondary" disabled={w.disabled} onClick={w.download}>Export brief <DownloadSimple size={18}/></button></div>
      <p className="list-note">Draft only. No message has been sent.</p>

      {/* Response Attachment Form */}
      <div className="response-form" style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--line, #ccc)' }}>
        <h3>Record Received Response</h3>
        <form onSubmit={async (evt) => {
          evt.preventDefault();
          if (!w.responseForm.respondent.trim() || !w.responseForm.passage.trim()) return;
          const res = await w.perform({
            type: 'record_enquiry_response',
            leadId: e.leadId,
            respondent: w.responseForm.respondent,
            receivedAt: w.responseForm.receivedAt,
            passage: w.responseForm.passage,
            outcomeBranch: w.responseForm.outcomeBranch,
            sourceIds: e.sourceIds,
            whatChanges: w.responseForm.whatChanges,
            unresolved: w.responseForm.unresolved,
            summary: w.responseForm.summary || `${w.responseForm.respondent} (${w.responseForm.outcomeBranch})`,
            revisedActionText: w.responseForm.revisedActionText || w.responseForm.whatChanges
          }, 'Recording response');
          if (res) {
            w.clearResponseForm();
          }
        }}>
          <label className="field">Source Record Holder / Respondent
            <input required value={w.responseForm.respondent} disabled={w.disabled} onChange={evt=>w.setResponseForm({...w.responseForm, respondent: evt.target.value})} placeholder="Archive officer, venue manager…" />
          </label>
          <label className="field">Date Received
            <input type="date" required value={w.responseForm.receivedAt} disabled={w.disabled} onChange={evt=>w.setResponseForm({...w.responseForm, receivedAt: evt.target.value})} />
          </label>
          <label className="field">Relevant Passage or Absence
            <textarea required rows={4} value={w.responseForm.passage} disabled={w.disabled} onChange={evt=>w.setResponseForm({...w.responseForm, passage: evt.target.value})} placeholder="Extract from reply or confirmation..." />
          </label>
          <label className="field">Conditional Outcome
            <select value={w.responseForm.outcomeBranch} disabled={w.disabled} onChange={evt=>w.setResponseForm({...w.responseForm, outcomeBranch: evt.target.value as 'confirming' | 'conflicting' | 'unavailable'})}>
              <option value="confirming">Confirming (supports stop)</option>
              <option value="conflicting">Conflicting (disproves/conflicts)</option>
              <option value="unavailable">Unavailable (record missing/unclear)</option>
            </select>
          </label>
          <label className="field">What Changes / Revised Action
            <textarea rows={3} value={w.responseForm.whatChanges} disabled={w.disabled} onChange={evt=>w.setResponseForm({...w.responseForm, whatChanges: evt.target.value})} placeholder="How claims or next steps change based on this response..." />
          </label>
          <label className="field">Open Uncertainties
            <textarea rows={3} value={w.responseForm.unresolved} disabled={w.disabled} onChange={evt=>w.setResponseForm({...w.responseForm, unresolved: evt.target.value})} placeholder="What remains unverified or open..." />
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="button primary" disabled={w.disabled || !w.responseForm.respondent.trim() || !w.responseForm.passage.trim()}>
              Record Enquiry Response <Plus size={18}/>
            </button>
            {(!!w.responseForm.respondent.trim() || !!w.responseForm.passage.trim()) && (
              <button type="button" className="button secondary" disabled={w.disabled} onClick={()=>w.clearResponseForm()}>
                Discard draft
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Archived Enquiry History */}
      {!!e.history?.length && (
        <div className="archived-history" style={{ marginTop: '2rem', paddingTop: '1rem', borderTop: '1px solid var(--line, #ccc)' }}>
          <h3>Archived Enquiry History ({e.history.length})</h3>
          {e.history.map((h, hIdx) => {
            const hLead = f.leads.find(l => l.id === h.enquiry.leadId);
            const hResponses = h.enquiry.responses?.length ? h.enquiry.responses : (h.enquiry.response ? [h.enquiry.response] : []);
            return (
              <details key={hIdx} style={{ marginBottom: '1rem', padding: '0.75rem', border: '1px solid var(--line, #ccc)', borderRadius: '4px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold' }}>
                  {hLead?.name || 'Unresolved Lead'} — {h.recordedAt ? when(h.recordedAt) : 'Archived'}
                </summary>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  <p><strong>Question:</strong> {h.enquiry.question}</p>
                  <p><strong>Record to check:</strong> {h.enquiry.recordTarget || 'Not specified'}</p>
                  <p><strong>Rationale:</strong> {h.enquiry.rationale}</p>
                  <div style={{ margin: '0.5rem 0' }}>
                    <strong>Branches:</strong>
                    <ul style={{ paddingLeft: '1.2rem', marginTop: '0.25rem' }}>
                      <li><em>Confirming:</em> {h.enquiry.confirming}</li>
                      <li><em>Conflicting:</em> {h.enquiry.conflicting}</li>
                      <li><em>Unavailable:</em> {h.enquiry.unavailable}</li>
                    </ul>
                  </div>
                  {!!hResponses.length && (
                    <div style={{ marginTop: '0.5rem' }}>
                      <strong>Recorded Responses ({hResponses.length}):</strong>
                      {hResponses.map((r, rIdx) => (
                        <div key={r.id || rIdx} style={{ padding: '0.5rem', marginTop: '0.25rem', border: '1px solid var(--line, #eee)', borderRadius: '4px' }}>
                          <strong>{r.respondent}</strong> ({r.outcomeBranch}) — {r.receivedAt}
                          {r.answeredQuestion && <p style={{ fontSize: '0.85rem', color: '#555' }}><em>Answered Question:</em> {r.answeredQuestion}</p>}
                          {r.selectedBranchText && <p style={{ fontSize: '0.85rem', color: '#555' }}><em>Selected Branch Text:</em> {r.selectedBranchText}</p>}
                          <p style={{ marginTop: '0.25rem' }}>{r.passage}</p>
                          {r.whatChanges && <p style={{ fontSize: '0.85rem', color: '#555' }}><strong>Changes:</strong> {r.whatChanges}</p>}
                          {r.unresolved && <p style={{ fontSize: '0.85rem', color: '#555' }}><strong>Uncertainty:</strong> {r.unresolved}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ fontSize: '0.85rem', cursor: 'pointer' }}>View Archived Draft</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem', marginTop: '0.25rem', padding: '0.5rem', background: '#f8f8f8', borderRadius: '4px' }}>{h.enquiry.draft}</pre>
                  </details>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>

    <aside className="decision-column">
      <h2>Where the answer leads</h2>
      {(['confirming','conflicting','unavailable'] as const).map((key)=><label className="field decision" key={key}>{key==='confirming'?'If it supports the lead':key==='conflicting'?'If it conflicts':'If no answer is available'}<textarea rows={4} value={(e[key] as string)||''} disabled={w.disabled} onChange={event=>w.edit({enquiry:{...e,[key]:event.target.value}})}/></label>)}

      {/* Recorded Responses History */}
      {!!responses.length && (
        <div className="response-history" style={{ marginTop: '1.5rem' }}>
          <h3>Recorded Responses ({responses.length})</h3>
          {responses.map((resp, idx) => (
            <article key={resp.id || idx} style={{ padding: '0.75rem', marginBottom: '0.75rem', border: '1px solid var(--line, #ccc)', borderRadius: '4px' }}>
              <strong>{resp.respondent}</strong> ({resp.outcomeBranch}) — <small>{resp.receivedAt}</small>
              {resp.answeredQuestion && <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.25rem' }}><em>Question:</em> {resp.answeredQuestion}</p>}
              {resp.selectedBranchText && <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '0.25rem' }}><em>Branch Text:</em> {resp.selectedBranchText}</p>}
              <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>{resp.passage}</p>
              {resp.whatChanges && <p style={{ fontSize: '0.85rem', color: '#555' }}><strong>Changes:</strong> {resp.whatChanges}</p>}
              {resp.unresolved && <p style={{ fontSize: '0.85rem', color: '#555' }}><strong>Uncertainty:</strong> {resp.unresolved}</p>}
              {resp.receiptId && <code style={{ fontSize: '0.75rem', display: 'block', marginTop: '0.25rem' }}>{resp.receiptId}</code>}
            </article>
          ))}
        </div>
      )}

      <div className="enquiry-sources"><h3>Sources behind the enquiry</h3>{e.sourceIds.map(id=>{const s=f.sources.find(x=>x.id===id);return s?<button className="text-button" key={id} onClick={()=>{w.setLeadId(s.leadId);w.goToStep('sources');}}><LinkSimple size={17}/>{s.title}<ArrowUpRight size={17}/></button>:null;})}{!e.sourceIds.length&&<p>No sources attached.</p>}</div>
    </aside>
  </div>;
}

