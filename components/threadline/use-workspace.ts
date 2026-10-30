'use client';
import {useEffect,useRef,useState} from 'react';
import type {CaseFile,CaseSummary,CaseEdits,CaseUsage,AgentRunSummary,Clue,Enquiry,Lead,ResearchAction,Services,Step,EnquiryIdentity} from '../../lib/contracts.ts';
import {compareQueries,draftEnquiry,getEnquiryIdentity,getEnquiryIdentityJson} from '../../lib/domain.ts';
import {openingQuery} from './reference-change.ts';

export const regions=[{name:'London',lat:51.5072,lon:-0.1276},{name:'New York',lat:40.7128,lon:-74.006},{name:'Paris',lat:48.8566,lon:2.3522},{name:'Mumbai',lat:19.076,lon:72.8777},{name:'Custom area',lat:0,lon:0}];
async function api<T = {case:CaseFile;cases:CaseSummary[]}>(path:string,method='GET',body?:unknown){
  const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json() as T & {error?:string; code?:string};
  if(!response.ok)throw Object.assign(new Error(data.error||'The request could not be completed.'),{data, status: response.status});
  return data;
}
export function when(value:string){return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short'});}

export function useWorkspace(){
  const [file,setFile]=useState<CaseFile|null>(null),[saved,setSaved]=useState<CaseFile|null>(null),[cases,setCases]=useState<CaseSummary[]>([]),[services,setServices]=useState<Services|null>(null);
  const [editingBrief,setEditingBrief]=useState(false);
  const [recoveryState,setRecoveryState]=useState<{localEdits:CaseFile;serverCase:CaseFile;errorMsg:string}|null>(null);
  const headingRef=useRef<HTMLDivElement>(null);
  const menuRef=useRef<HTMLDialogElement>(null);
  const previousStep=useRef<Step>('case');
  const [step,setStep]=useState<Step>('case'),[busy,setBusy]=useState('Opening workspace'),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [usage,setUsage]=useState<CaseUsage|null>(null);
  const [agentRuns,setAgentRuns]=useState<AgentRunSummary[]|null>(null);
  const usageRefresh=useRef(0);
  const [queryId,setQueryId]=useState(''),[compareId,setCompareId]=useState(''),[leadId,setLeadId]=useState(''),[filter,setFilter]=useState(''),[newClue,setNewClue]=useState(''),[newKind,setNewKind]=useState<Clue['kind']>('artist');

  const initialDateRef = useRef<string>(new Date().toISOString().slice(0, 10));
  const initialDefaultDate = initialDateRef.current;

  const [sourceForm,setSourceForm]=useState({title:'',url:'',excerpt:'',note:'',kind:'user_excerpt' as 'user_excerpt'|'user_record'});
  const [responseForm,setResponseForm]=useState({
    respondent:'',
    receivedAt:initialDefaultDate,
    passage:'',
    outcomeBranch:'confirming' as 'confirming'|'conflicting'|'unavailable',
    sourceIds:[] as string[],
    whatChanges:'',
    unresolved:'',
    summary:'',
    revisedActionText:''
  });
  const [draftVersion, setDraftVersion] = useState(0);
  const bumpDraftVersion = () => setDraftVersion(v => v + 1);

  const sourceDraftsRef = useRef<Map<string, typeof sourceForm>>(new Map());
  const responseDraftsRef = useRef<Map<string, { form: typeof responseForm; enquirySnapshot?: EnquiryIdentity }>>(new Map());
  const activeSourceKeyRef = useRef<string>('');
  const activeResponseKeyRef = useRef<string>('');
  const activeResponseSnapshotRef = useRef<EnquiryIdentity | undefined>(undefined);
  const running=useRef(false);const current=useRef<CaseFile|null>(null);const initialized=useRef(false);

  const defaultSourceForm: typeof sourceForm = { title: '', url: '', excerpt: '', note: '', kind: 'user_excerpt' };
  const defaultResponseForm: typeof responseForm = {
    respondent: '',
    receivedAt: initialDefaultDate,
    passage: '',
    outcomeBranch: 'confirming',
    sourceIds: [],
    whatChanges: '',
    unresolved: '',
    summary: '',
    revisedActionText: ''
  };

  const query=file?.queries.find(q=>q.id===queryId)||file?.queries.at(-1);
  const comparison=file?.queries.find(q=>q.id===compareId && q.id!==query?.id);
  const differences=query?compareQueries(query,comparison):null;
  const leads=(query?.leadIds||file?.leads.map(l=>l.id)||[]).map(id=>file?.leads.find(l=>l.id===id)).filter((l):l is Lead=>!!l);
  const selected=file?.leads.find(l=>l.id===leadId)||leads[0];
  const selectedQuery=query?.leadIds.includes(selected?.id||'')?query:file?.queries.find(q=>q.leadIds.includes(selected?.id||''));
  const selectedSources=file?.sources.filter(s=>s.leadId===selected?.id)||[];

  const selectedSourceLeadId = selected?.id || '';
  const sourceComposerKey = file?.id ? (selectedSourceLeadId ? `${file.id}:source:${selectedSourceLeadId}` : `${file.id}:source`) : '';

  const enquiryIdentityJson = getEnquiryIdentityJson(file?.enquiry);
  const activeEnquirySnapshot = getEnquiryIdentity(file?.enquiry);

  const responseComposerKey = file?.id ? (enquiryIdentityJson ? `${file.id}:response:${enquiryIdentityJson}` : `${file.id}:response`) : '';

  useEffect(() => {
    const prevKey = activeSourceKeyRef.current;
    if (prevKey && prevKey !== sourceComposerKey) {
      sourceDraftsRef.current.set(prevKey, sourceForm);
    }
    if (sourceComposerKey && prevKey !== sourceComposerKey) {
      activeSourceKeyRef.current = sourceComposerKey;
      const restoredSource = sourceDraftsRef.current.get(sourceComposerKey) || defaultSourceForm;
      setSourceForm(restoredSource);
    } else if (!prevKey && sourceComposerKey) {
      activeSourceKeyRef.current = sourceComposerKey;
    }
  }, [sourceComposerKey]);

  useEffect(() => {
    const prevKey = activeResponseKeyRef.current;
    if (prevKey && prevKey !== responseComposerKey) {
      const snap = activeResponseSnapshotRef.current;
      responseDraftsRef.current.set(prevKey, { form: responseForm, enquirySnapshot: snap });
    }
    if (responseComposerKey && prevKey !== responseComposerKey) {
      activeResponseKeyRef.current = responseComposerKey;
      activeResponseSnapshotRef.current = activeEnquirySnapshot || undefined;
      const restored = responseDraftsRef.current.get(responseComposerKey);
      const restoredResponse = restored?.form || {
        ...defaultResponseForm,
        receivedAt: initialDefaultDate,
      };
      setResponseForm(restoredResponse);
    } else if (!prevKey && responseComposerKey) {
      activeResponseKeyRef.current = responseComposerKey;
      activeResponseSnapshotRef.current = activeEnquirySnapshot || undefined;
    } else if (responseComposerKey && activeResponseKeyRef.current === responseComposerKey) {
      activeResponseSnapshotRef.current = activeEnquirySnapshot || undefined;
    }
  }, [responseComposerKey]);

  function clearSourceForm(key?: string) {
    const targetKey = key || sourceComposerKey;
    if (targetKey) sourceDraftsRef.current.delete(targetKey);
    if (!key || key === sourceComposerKey) setSourceForm(defaultSourceForm);
    bumpDraftVersion();
  }

  function clearResponseForm(key?: string) {
    const targetKey = key || responseComposerKey;
    if (targetKey) responseDraftsRef.current.delete(targetKey);
    if (!key || key === responseComposerKey) setResponseForm({ ...defaultResponseForm, receivedAt: initialDefaultDate });
    bumpDraftVersion();
  }

  function clearSourceFormOnSuccess(capturedKey: string, submittedSnapshot: typeof sourceForm) {
    const parked = sourceDraftsRef.current.get(capturedKey);
    if (parked && JSON.stringify(parked) === JSON.stringify(submittedSnapshot)) {
      sourceDraftsRef.current.delete(capturedKey);
    }
    if (activeSourceKeyRef.current === capturedKey) {
      setSourceForm(current => {
        if (JSON.stringify(current) === JSON.stringify(submittedSnapshot)) {
          return defaultSourceForm;
        }
        return current;
      });
    }
    bumpDraftVersion();
  }

  function clearResponseFormOnSuccess(capturedKey: string, submittedSnapshot: typeof responseForm) {
    const parked = responseDraftsRef.current.get(capturedKey);
    if (parked && JSON.stringify(parked.form) === JSON.stringify(submittedSnapshot)) {
      responseDraftsRef.current.delete(capturedKey);
    }
    if (activeResponseKeyRef.current === capturedKey) {
      setResponseForm(current => {
        if (JSON.stringify(current) === JSON.stringify(submittedSnapshot)) {
          return { ...defaultResponseForm, receivedAt: initialDefaultDate };
        }
        return current;
      });
    }
    bumpDraftVersion();
  }

  function countSourceFormFields(f: typeof defaultSourceForm) {
    let count = 0;
    if (f.title.trim()) count++;
    if (f.excerpt.trim()) count++;
    if (f.note.trim()) count++;
    if (f.url.trim()) count++;
    if (f.kind !== defaultSourceForm.kind) count++;
    return count;
  }

  function countResponseFormFields(f: typeof defaultResponseForm) {
    let count = 0;
    if (f.respondent.trim()) count++;
    if (f.passage.trim()) count++;
    if (f.whatChanges.trim()) count++;
    if (f.unresolved.trim()) count++;
    if (f.summary.trim()) count++;
    if (f.revisedActionText.trim()) count++;
    if (f.outcomeBranch !== 'confirming') count++;
    if (f.receivedAt && f.receivedAt !== initialDefaultDate) count++;
    if (f.sourceIds && f.sourceIds.length > 0) count++;
    return count;
  }

  function isSourceFormNonEmpty(f: typeof sourceForm) {
    return countSourceFormFields(f) > 0;
  }

  function isResponseFormNonEmpty(f: typeof responseForm) {
    return countResponseFormFields(f) > 0;
  }

  const activeSourceFields = countSourceFormFields(sourceForm);
  const activeResponseFields = countResponseFormFields(responseForm);
  const parkedSourceFields = Array.from(sourceDraftsRef.current.entries()).reduce((acc, [k, f]) => k !== sourceComposerKey ? acc + countSourceFormFields(f) : acc, 0);
  const parkedResponseFields = Array.from(responseDraftsRef.current.entries()).reduce((acc, [k, entry]) => k !== responseComposerKey ? acc + countResponseFormFields(entry.form) : acc, 0);
  const newClueFields = newClue.trim() ? 1 : 0;

  const totalUnsavedFieldCount = activeSourceFields + activeResponseFields + parkedSourceFields + parkedResponseFields + newClueFields;

  const getParkedDraftSummaries = () => {
    const list: Array<{ key: string; caseId: string; type: 'source' | 'response'; leadId: string; leadName: string; preview: string; details: string }> = [];
    
    if (sourceComposerKey && isSourceFormNonEmpty(sourceForm)) {
      const parts = sourceComposerKey.split(':');
      const caseId = parts[0];
      const lId = parts[2] || '';
      const leadName = file?.leads.find(l => l.id === lId)?.name || 'Selected Place';
      const details = [
        `Kind: ${sourceForm.kind}`,
        sourceForm.title ? `Title: ${sourceForm.title}` : '',
        sourceForm.url ? `Link: ${sourceForm.url}` : '',
        sourceForm.excerpt ? `Excerpt: ${sourceForm.excerpt}` : '',
        sourceForm.note ? `Note: ${sourceForm.note}` : ''
      ].filter(Boolean).join('\n');
      const preview = sourceForm.title || sourceForm.excerpt || `[${sourceForm.kind} selected]`;
      list.push({ key: sourceComposerKey, caseId, type: 'source', leadId: lId, leadName, preview, details });
    }
    for (const [key, form] of sourceDraftsRef.current.entries()) {
      if (key !== sourceComposerKey && isSourceFormNonEmpty(form)) {
        const parts = key.split(':');
        const caseId = parts[0];
        const lId = parts[2] || '';
        const leadName = file?.leads.find(l => l.id === lId)?.name || 'Parked Place';
        const details = [
          `Kind: ${form.kind}`,
          form.title ? `Title: ${form.title}` : '',
          form.url ? `Link: ${form.url}` : '',
          form.excerpt ? `Excerpt: ${form.excerpt}` : '',
          form.note ? `Note: ${form.note}` : ''
        ].filter(Boolean).join('\n');
        const preview = form.title || form.excerpt || `[${form.kind} selected]`;
        list.push({ key, caseId, type: 'source', leadId: lId, leadName, preview, details });
      }
    }

    if (responseComposerKey && isResponseFormNonEmpty(responseForm)) {
      const parts = responseComposerKey.split(':');
      const caseId = parts[0];
      const enquirySnap = getEnquiryIdentity(file?.enquiry);
      const lId = enquirySnap?.leadId || file?.enquiry?.leadId || '';
      const leadName = file?.leads.find(l => l.id === lId)?.name || 'Current Enquiry';
      const detailsLines = [
        `Respondent: ${responseForm.respondent || '(not set)'}`,
        `Date: ${responseForm.receivedAt}`,
        `Passage/Absence: ${responseForm.passage || '(not set)'}`,
        `Outcome Branch: ${responseForm.outcomeBranch}`,
        `Sourced Handles: ${responseForm.sourceIds?.length ? responseForm.sourceIds.join(', ') : 'None'}`,
        responseForm.summary ? `Summary: ${responseForm.summary}` : '',
        responseForm.whatChanges ? `What Changes: ${responseForm.whatChanges}` : '',
        responseForm.unresolved ? `Unresolved: ${responseForm.unresolved}` : '',
        responseForm.revisedActionText ? `Revised Action Text: ${responseForm.revisedActionText}` : '',
      ].filter(Boolean);
      if (enquirySnap) {
        detailsLines.push(
          `--- Original Enquiry Snapshot ---`,
          `Question: ${enquirySnap.question}`,
          enquirySnap.recordTarget ? `Record Target: ${enquirySnap.recordTarget}` : '',
          `Confirming Branch: ${enquirySnap.confirming}`,
          `Conflicting Branch: ${enquirySnap.conflicting}`,
          `Unavailable Branch: ${enquirySnap.unavailable}`,
          enquirySnap.sourceIds?.length ? `Enquiry Sources: ${enquirySnap.sourceIds.join(', ')}` : ''
        );
      }
      const details = detailsLines.filter(Boolean).join('\n');
      const preview = responseForm.respondent || responseForm.passage || `[${responseForm.outcomeBranch} branch selected, date: ${responseForm.receivedAt}]`;
      list.push({ key: responseComposerKey, caseId, type: 'response', leadId: lId, leadName, preview, details });
    }
    for (const [key, entry] of responseDraftsRef.current.entries()) {
      if (key !== responseComposerKey && isResponseFormNonEmpty(entry.form)) {
        const parts = key.split(':');
        const caseId = parts[0];
        const form = entry.form;
        const enquirySnap = entry.enquirySnapshot;
        const lId = enquirySnap?.leadId || '';
        const leadName = file?.leads.find(l => l.id === lId)?.name || 'Parked Enquiry';
        const detailsLines = [
          `Respondent: ${form.respondent || '(not set)'}`,
          `Date: ${form.receivedAt}`,
          `Passage/Absence: ${form.passage || '(not set)'}`,
          `Outcome Branch: ${form.outcomeBranch}`,
          `Sourced Handles: ${form.sourceIds?.length ? form.sourceIds.join(', ') : 'None'}`,
          form.summary ? `Summary: ${form.summary}` : '',
          form.whatChanges ? `What Changes: ${form.whatChanges}` : '',
          form.unresolved ? `Unresolved: ${form.unresolved}` : '',
          form.revisedActionText ? `Revised Action Text: ${form.revisedActionText}` : '',
        ].filter(Boolean);
        if (enquirySnap) {
          detailsLines.push(
            `--- Original Enquiry Snapshot ---`,
            `Question: ${enquirySnap.question}`,
            enquirySnap.recordTarget ? `Record Target: ${enquirySnap.recordTarget}` : '',
            `Confirming Branch: ${enquirySnap.confirming}`,
            `Conflicting Branch: ${enquirySnap.conflicting}`,
            `Unavailable Branch: ${enquirySnap.unavailable}`,
            enquirySnap.sourceIds?.length ? `Enquiry Sources: ${enquirySnap.sourceIds.join(', ')}` : ''
          );
        }
        const details = detailsLines.filter(Boolean).join('\n');
        const preview = form.respondent || form.passage || `[${form.outcomeBranch} branch selected, date: ${form.receivedAt}]`;
        list.push({ key, caseId, type: 'response', leadId: lId, leadName, preview, details });
      }
    }

    return list;
  };

  const hasParkedDrafts = getParkedDraftSummaries().length > 0;
  const dirty = (!!file && !!saved && JSON.stringify(file) !== JSON.stringify(saved)) || totalUnsavedFieldCount > 0;

  async function copyParkedDraft(s: ReturnType<typeof getParkedDraftSummaries>[number]) {
    const text = `Parked ${s.type === 'source' ? 'Source Note' : 'Response'} for ${s.leadName} (Case: ${s.caseId})\n${s.details}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Parked draft contents copied to clipboard.');
    } catch {
      setError('Clipboard access was unavailable.');
    }
  }

  function discardParkedDraft(key: string, type: 'source' | 'response') {
    if (type === 'source') {
      clearSourceForm(key);
    } else {
      clearResponseForm(key);
    }
  }

  function clearAllParkedDrafts() {
    sourceDraftsRef.current.clear();
    responseDraftsRef.current.clear();
    setSourceForm(defaultSourceForm);
    setResponseForm({ ...defaultResponseForm, receivedAt: initialDefaultDate });
    bumpDraftVersion();
  }

  function accept(next:CaseFile){usageRefresh.current++;if(current.current?.id!==next.id){setUsage(null);setAgentRuns(null);}current.current=next;setFile(next);setSaved(next);setRecoveryState(null);setCases(old=>[{id:next.id,title:next.title,mode:next.mode,updatedAt:next.updatedAt},...old.filter(c=>c.id!==next.id)]);localStorage.setItem('threadline-case',next.id);}
  function goToStep(next:Step){if(menuRef.current)menuRef.current.close();setStep(next);setNotice('');}
  useEffect(()=>{if(previousStep.current===step)return;previousStep.current=step;headingRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});},[step]);
  function edit(values:CaseEdits){if(busy)return;setFile(old=>old?{...old,...values}:old);setNotice('');}

  async function handleError(e:unknown){
    const err=e as Error&{data?:{case?:CaseFile;code?:string};status?:number};
    const isConflict = err.data?.code==='case_conflict' || err.data?.code==='enquiry_conflict' || (!err.data?.code && (err.status===409 || err.message?.includes('changed')));
    if (isConflict && file) {
      let serverCase = err.data?.case;
      if (!serverCase) {
        try { const fetched = await api(`/api/cases/${file.id}`); serverCase = fetched.case; } catch {}
      }
      if (serverCase) {
        setRecoveryState({
          localEdits: file,
          serverCase,
          errorMsg: err.message || 'Case was updated on the server. Your local edits are preserved below.'
        });
        setError(err.message || 'Conflict detected: Server has a newer revision.');
        return;
      }
    }
    if(err.data?.case && !isConflict) accept(err.data.case);
    setError(err.message||'Something interrupted this action. Please try again.');
  }

  function resolveConflictKeepServer() {
    if (recoveryState) {
      accept(recoveryState.serverCase);
      setRecoveryState(null);
      setError('');
      setNotice('Server case loaded. Local edits discarded.');
    }
  }

  async function copyLocalWork() {
    if (!file) return;
    const text = `Title: ${file.title}\nQuestion: ${file.question}\nNotes: ${file.notes}\nEnquiry Question: ${file.enquiry?.question||''}\nEnquiry Draft: ${file.enquiry?.draft||''}`;
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Local edits copied to clipboard.');
    } catch {
      setError('Clipboard access was unavailable.');
    }
  }

  async function load(id:string){const data=await api<{case:CaseFile;usage?:CaseUsage;agentRuns?:AgentRunSummary[]}>(`/api/cases/${id}`);accept(data.case);setUsage(data.usage||null);setAgentRuns(data.agentRuns||null);setEditingBrief(!data.case.notes.trim());setQueryId(openingQuery(data.case));setCompareId('');setLeadId('');}
  async function boot(){setBusy('Opening workspace');setError('');try{const [status,list]=await Promise.all([api<Services>('/api/status'),api('/api/cases')]);setServices(status);setCases(list.cases);const stored=localStorage.getItem('threadline-case');const id=list.cases.find((c:CaseSummary)=>c.id===stored)?.id||list.cases[0]?.id;if(id)await load(id);else{const data=await api('/api/cases','POST',{example:true});accept(data.case);setQueryId(openingQuery(data.case));}}catch(e){handleError(e);}finally{setBusy('');}}
  useEffect(()=>{if(initialized.current)return;initialized.current=true;void boot();return()=>{running.current=false;};},[]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);

  async function save(){if(!file)return null;if(!dirty)return file;const {id,revision,referenceRelation,title,question,notes,caseContext,area,latitude,longitude,radius,startDate,endDate,activity,category,clues,enquiry}=file;const data=await api(`/api/cases/${id}`,'PATCH',{revision,edits:{referenceRelation,title,question,notes,caseContext,area,latitude,longitude,radius,startDate,endDate,activity,category,clues,enquiry}});accept(data.case);return data.case as CaseFile;}
  // Action responses carry only the case, so request counts are re-read after provider calls.
  async function refreshUsage(id:string){const generation=++usageRefresh.current;if(current.current?.id===id){setUsage(null);setAgentRuns(null);}try{const data=await api<{usage?:CaseUsage;agentRuns?:AgentRunSummary[]}>(`/api/cases/${id}`);if(current.current?.id===id&&generation===usageRefresh.current){setUsage(data.usage||null);setAgentRuns(data.agentRuns||null);}}catch{}}
  const spendsRequests=new Set<ResearchAction['type']>(['resolve','discover','run_control','inspect','agent_step']);
  async function perform(action:ResearchAction,label:string,nextStep?:Step){
    setBusy(label);setError('');setNotice('');
    const capturedSourceKey = sourceComposerKey;
    const submittedSourceSnapshot = { ...sourceForm };
    const capturedResponseKey = responseComposerKey;
    const submittedResponseSnapshot = { ...responseForm };
    try {
      const active = await save();
      if (!active) return;
      const data = await api(`/api/cases/${active.id}/actions`,'POST',{revision:active.revision,action});
      accept(data.case);
      if (action.type === 'source') {
        clearSourceFormOnSuccess(capturedSourceKey, submittedSourceSnapshot);
      }
      if (action.type === 'record_enquiry_response') {
        clearResponseFormOnSuccess(capturedResponseKey, submittedResponseSnapshot);
      }
      if (action.type === 'discover') {
        setQueryId(data.case.queries.at(-1)?.id||'');
        setLeadId('');
      }
      if (nextStep) goToStep(nextStep);
      return data.case as CaseFile;
    } catch(e) {
      // A failed control still saves the seeded result; show it with its warning.
      const failedCase=(e as {data?:{case?:CaseFile}}).data?.case;
      if (action.type === 'discover' && failedCase) { setQueryId(failedCase.queries.at(-1)?.id||''); setLeadId(''); }
      handleError(e);
    } finally {
      if (spendsRequests.has(action.type) && current.current) void refreshUsage(current.current.id);
      setBusy('');
    }
  }

  async function saveClick(){setBusy('Saving case');setError('');try{await save();setNotice('Changes saved.');}catch(e){handleError(e);}finally{setBusy('');}}
  async function finishBrief(){setBusy('Saving brief');setError('');try{await save();setEditingBrief(false);setNotice('Brief saved.');}catch(e){handleError(e);}finally{setBusy('');}}
  async function create(example=false){setBusy('Opening case');setError('');try{await save();const data=await api('/api/cases','POST',{example});accept(data.case);setUsage(null);setEditingBrief(!example);setQueryId(openingQuery(data.case));setCompareId('');setLeadId('');goToStep('case');}catch(e){handleError(e);}finally{setBusy('');}}
  async function switchCase(id:string){setBusy('Opening case');setError('');try{await save();await load(id);goToStep('case');}catch(e){handleError(e);}finally{setBusy('');}}
  async function runAgent(mode:'resume'|'continue'|'restart'='resume'){
    if(running.current)return;
    setBusy('Agent is reviewing the case');setError('');running.current=true;
    let operatedCaseId:string|undefined;
    try{
      const savedCase=await save();if(!savedCase)return;let active:CaseFile=savedCase;operatedCaseId=active.id;
      if(mode==='resume'&&active.agent.status!=='idle'&&active.agent.status!=='working')throw new Error('Continue from a new enquiry response, or explicitly start a new investigation.');
      if(mode!=='resume'){
        const reset=await api(`/api/cases/${active.id}/actions`,'POST',{revision:active.revision,action:{type:mode==='continue'?'agent_continue':'agent_reset'}});
        active=reset.case;accept(active);
      }
      for(let i=0;i<12&&running.current;i++){
        const caseId:string=active.id;
        const data:{case:CaseFile}=await api<{case:CaseFile}>(`/api/cases/${caseId}/actions`,'POST',{revision:active.revision,action:{type:'agent_step'}});
        if(current.current?.id!==caseId)break;
        active=data.case;accept(active);void refreshUsage(caseId);setQueryId(active.queries.at(-1)?.id||'');
        if(active.agent.status!=='working'){goToStep(active.agent.status==='complete'?'enquiry':active.queries.length?'leads':'case');break;}
        setBusy(active.agent.reason||'Agent is researching');
      }
    }catch(e){await handleError(e);}
    finally{running.current=false;if(operatedCaseId)void refreshUsage(operatedCaseId);setBusy('');}
  }
  const continueAgent=()=>runAgent('continue');
  const restartAgent=()=>runAgent('restart');
  function addClue(){if(!file||!newClue.trim())return;edit({clues:[...file.clues,{id:crypto.randomUUID(),label:newClue.trim(),kind:newKind,provenance:'supplied_interest',enabled:true}]});setNewClue('');}
  function chooseEnquiry(lead:Lead, forceRegenerate = false){
    if(!file||busy)return;
    if (forceRegenerate && isResponseFormNonEmpty(responseForm)) {
      setError('Cannot regenerate enquiry while an unpersisted response draft exists. Park or discard the response draft first.');
      return;
    }
    setLeadId(lead.id);
    const enquiry = draftEnquiry(file, lead, forceRegenerate);
    edit({enquiry});
    goToStep('enquiry');
  }
  function regenerateEnquiry(lead:Lead){
    chooseEnquiry(lead, true);
  }

  async function download(){
    setBusy('Preparing brief');setError('');
    try{
      const active=await save();
      if(!active)return;
      const response = await fetch(`/api/cases/${active.id}/export`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || `Export failed with HTTP status ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brief-${active.id}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNotice('Brief downloaded successfully.');
    }catch(e){
      setError(e instanceof Error ? e.message : 'Brief export failed. Please retry.');
    }finally{
      setBusy('');
    }
  }

  async function copy(){
    try{
      if(file?.enquiry){
        await navigator.clipboard.writeText(file.enquiry.draft);
        setNotice('Enquiry copied.');
      }
    }catch{
      setError('Clipboard access was unavailable. Select and copy the draft below.');
    }
  }

  const disabled=!!busy;const enabledClues=file?.clues.filter(c=>c.enabled)||[];
  return {file,cases,services,usage,agentRuns,editingBrief,setEditingBrief,recoveryState,resolveConflictKeepServer,copyLocalWork,headingRef,menuRef,step,busy,error,setError,notice,setNotice,dirty,query,comparison,differences,leads,selected,selectedQuery,selectedSources,queryId,setQueryId,compareId,setCompareId,leadId,setLeadId,filter,setFilter,newClue,setNewClue,newKind,setNewKind,sourceForm,setSourceForm,responseForm,setResponseForm,clearSourceForm,clearResponseForm,sourceComposerKey,responseComposerKey,getParkedDraftSummaries,copyParkedDraft,discardParkedDraft,clearAllParkedDrafts,hasParkedDrafts,totalUnsavedFieldCount,running,disabled,enabledClues,goToStep,edit,boot,perform,saveClick,finishBrief,create,switchCase,runAgent,continueAgent,restartAgent,addClue,chooseEnquiry,regenerateEnquiry,download,copy};
}
export type WorkspaceState = ReturnType<typeof useWorkspace>;
