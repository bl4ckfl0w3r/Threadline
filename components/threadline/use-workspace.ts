'use client';
import {useEffect,useRef,useState} from 'react';
import type {CaseFile,CaseSummary,CaseEdits,Clue,Enquiry,Lead,ResearchAction,Services,Step} from '@/lib/contracts';
import {compareQueries,draftEnquiry} from '@/lib/domain';

export const regions=[{name:'London',lat:51.5072,lon:-0.1276},{name:'New York',lat:40.7128,lon:-74.006},{name:'Paris',lat:48.8566,lon:2.3522},{name:'Mumbai',lat:19.076,lon:72.8777},{name:'Custom area',lat:0,lon:0}];
async function api<T = {case:CaseFile;cases:CaseSummary[]}>(path:string,method='GET',body?:unknown){const response=await fetch(path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});const data=await response.json() as T & {error?:string};if(!response.ok)throw Object.assign(new Error(data.error||'The request could not be completed.'),{data});return data;}
export function when(value:string){return new Date(value).toLocaleDateString(undefined,{day:'numeric',month:'short'});}

export function useWorkspace(){
  const [file,setFile]=useState<CaseFile|null>(null),[saved,setSaved]=useState<CaseFile|null>(null),[cases,setCases]=useState<CaseSummary[]>([]),[services,setServices]=useState<Services|null>(null);
  const [editingBrief,setEditingBrief]=useState(false);
  const headingRef=useRef<HTMLDivElement>(null);
  const menuRef=useRef<HTMLDialogElement>(null);
  const previousStep=useRef<Step>('case');
  const [step,setStep]=useState<Step>('case'),[busy,setBusy]=useState('Opening workspace'),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [queryId,setQueryId]=useState(''),[compareId,setCompareId]=useState(''),[leadId,setLeadId]=useState(''),[filter,setFilter]=useState(''),[newClue,setNewClue]=useState(''),[newKind,setNewKind]=useState<Clue['kind']>('artist');
  const [sourceForm,setSourceForm]=useState({title:'',url:'',excerpt:'',note:'',kind:'user_excerpt' as 'user_excerpt'|'user_record'});
  const running=useRef(false);const current=useRef<CaseFile|null>(null);const initialized=useRef(false);
  const dirty=!!file&&!!saved&&JSON.stringify(file)!==JSON.stringify(saved);
  const query=file?.queries.find(q=>q.id===queryId)||file?.queries.at(-1);
  const comparison=file?.queries.find(q=>q.id===compareId && q.id!==query?.id);
  const differences=query?compareQueries(query,comparison):null;
  const leads=(query?.leadIds||file?.leads.map(l=>l.id)||[]).map(id=>file?.leads.find(l=>l.id===id)).filter((l):l is Lead=>!!l);
  const selected=file?.leads.find(l=>l.id===leadId)||leads[0];
  const selectedQuery=query?.leadIds.includes(selected?.id||'')?query:file?.queries.find(q=>q.leadIds.includes(selected?.id||''));
  const selectedSources=file?.sources.filter(s=>s.leadId===selected?.id)||[];
  function accept(next:CaseFile){current.current=next;setFile(next);setSaved(next);setCases(old=>[{id:next.id,title:next.title,mode:next.mode,updatedAt:next.updatedAt},...old.filter(c=>c.id!==next.id)]);localStorage.setItem('threadline-case',next.id);}
  function goToStep(next:Step){if(menuRef.current)menuRef.current.close();setStep(next);setNotice('');}
  useEffect(()=>{if(previousStep.current===step)return;previousStep.current=step;headingRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});},[step]);
  function edit(values:CaseEdits){if(busy)return;setFile(old=>old?{...old,...values}:old);setNotice('');}
  function handleError(e:unknown){const err=e as Error&{data?:{case?:CaseFile}};if(err.data?.case)accept(err.data.case);setError(err.message||'Something interrupted this action. Please try again.');}
  async function load(id:string){const data=await api(`/api/cases/${id}`);accept(data.case);setEditingBrief(!data.case.notes.trim());setQueryId(data.case.queries[0]?.id||'');setCompareId('');setLeadId('');}
  async function boot(){setBusy('Opening workspace');setError('');try{const [status,list]=await Promise.all([api<Services>('/api/status'),api('/api/cases')]);setServices(status);setCases(list.cases);const stored=localStorage.getItem('threadline-case');const id=list.cases.find((c:CaseSummary)=>c.id===stored)?.id||list.cases[0]?.id;if(id)await load(id);else{const data=await api('/api/cases','POST',{example:true});accept(data.case);setQueryId(data.case.queries[0]?.id||'');}}catch(e){handleError(e);}finally{setBusy('');}}
  useEffect(()=>{if(initialized.current)return;initialized.current=true;void boot();return()=>{running.current=false;};},[]);
  useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function save(){if(!file)return null;if(!dirty)return file;const {id,revision,title,question,notes,caseContext,area,latitude,longitude,radius,startDate,endDate,activity,category,clues,enquiry}=file;const data=await api(`/api/cases/${id}`,'PATCH',{revision,edits:{title,question,notes,caseContext,area,latitude,longitude,radius,startDate,endDate,activity,category,clues,enquiry}});accept(data.case);return data.case as CaseFile;}
  async function perform(action:ResearchAction,label:string,nextStep?:Step){setBusy(label);setError('');setNotice('');try{const active=await save();if(!active)return;const data=await api(`/api/cases/${active.id}/actions`,'POST',{revision:active.revision,action});accept(data.case);if(action.type==='discover'){setQueryId(data.case.queries.at(-1)?.id||'');setLeadId('');}if(nextStep)goToStep(nextStep);return data.case as CaseFile;}catch(e){handleError(e);}finally{setBusy('');}}
  async function saveClick(){setBusy('Saving case');setError('');try{await save();setNotice('Changes saved.');}catch(e){handleError(e);}finally{setBusy('');}}
  async function finishBrief(){setBusy('Saving brief');setError('');try{await save();setEditingBrief(false);setNotice('Brief saved.');}catch(e){handleError(e);}finally{setBusy('');}}
  async function create(example=false){setBusy('Opening case');setError('');try{await save();const data=await api('/api/cases','POST',{example});accept(data.case);setEditingBrief(!example);setQueryId(data.case.queries[0]?.id||'');setCompareId('');setLeadId('');goToStep('case');}catch(e){handleError(e);}finally{setBusy('');}}
  async function switchCase(id:string){setBusy('Opening case');setError('');try{await save();await load(id);goToStep('case');}catch(e){handleError(e);}finally{setBusy('');}}
  async function runAgent(){setBusy('Agent is reviewing the case');setError('');running.current=true;try{let active=await save();if(!active)return;if(active.agent.status!=='idle'&&active.agent.status!=='working'){const reset=await api(`/api/cases/${active.id}/actions`,'POST',{revision:active.revision,action:{type:'agent_reset'}});active=reset.case;accept(active!);}for(let i=0;i<12&&running.current;i++){const data:{case:CaseFile}=await api(`/api/cases/${active!.id}/actions`,'POST',{revision:active!.revision,action:{type:'agent_step'}});active=data.case;accept(active!);setQueryId(active!.queries.at(-1)?.id||'');if(active!.agent.status!=='working'){goToStep(active!.agent.status==='complete'?'enquiry':active!.queries.length?'leads':'case');break;}setBusy(active!.agent.reason||'Agent is researching');}}catch(e){handleError(e);}finally{running.current=false;setBusy('');}}
  function addClue(){if(!file||!newClue.trim())return;edit({clues:[...file.clues,{id:crypto.randomUUID(),label:newClue.trim(),kind:newKind,provenance:'supplied_interest',enabled:true}]});setNewClue('');}
  function chooseEnquiry(lead:Lead){if(!file||busy)return;setLeadId(lead.id);edit({enquiry:draftEnquiry(file,lead)});goToStep('enquiry');}
  async function download(){setBusy('Preparing brief');setError('');try{const active=await save();if(!active)return;const a=document.createElement('a');a.href=`/api/cases/${active.id}/export`;a.download='';document.body.appendChild(a);a.click();a.remove();setNotice('Brief download requested.');}catch(e){handleError(e);}finally{setBusy('');}}
  async function copy(){try{if(file?.enquiry){await navigator.clipboard.writeText(file.enquiry.draft);setNotice('Enquiry copied.');}}catch{setError('Clipboard access was unavailable. Select and copy the draft below.');}}
  const disabled=!!busy;const enabledClues=file?.clues.filter(c=>c.enabled)||[];
  return {file,cases,services,editingBrief,setEditingBrief,headingRef,menuRef,step,busy,error,setError,notice,setNotice,dirty,query,comparison,differences,leads,selected,selectedQuery,selectedSources,queryId,setQueryId,compareId,setCompareId,leadId,setLeadId,filter,setFilter,newClue,setNewClue,newKind,setNewKind,sourceForm,setSourceForm,running,disabled,enabledClues,goToStep,edit,boot,perform,saveClick,finishBrief,create,switchCase,runAgent,addClue,chooseEnquiry,download,copy};
}
export type WorkspaceState = ReturnType<typeof useWorkspace>;
