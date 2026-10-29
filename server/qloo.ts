import type { CaseFile, Entity, Lead, Query, QueryScope } from '@/lib/contracts';
import { AppError, bindings } from './runtime';
import { beginReceipt, endReceipt, reserveRequests, releaseRequests } from './store';
import { controlFor } from '../lib/domain';
import type { ResearchReservation } from './usage-limits';

const incompleteControlWarning='Comparison incomplete: the control request failed. Retry only the control for this query.';

type Row={entity_id?:string;name?:string;properties?:{address?:string;website?:string};location?:{lat?:number;lon?:number};tags?:{name?:string}[];query?:{affinity?:number};affinity?:number};
async function request(owner:string,file:CaseFile,path:string,params:Record<string,string>,reservation?:ResearchReservation) {
  const key=bindings().QLOO_API_KEY;if(!key)throw new AppError('Qloo is not configured on the server.',503,'qloo_unavailable');
  const receipt=await beginReceipt(owner,file.id,'qloo',{path,params},reservation);
  let status=0;let body:unknown;let recorded=false;
  try {
    const response=await fetch(`https://hackathon.api.qloo.com${path}?${new URLSearchParams(params)}`,{headers:{'X-Api-Key':key,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
    status=response.status;const text=await response.text();if(text.length>2500000)throw new AppError('Qloo returned a response too large to process.',502,'provider_response');
    let parseError = false;
    try{body=JSON.parse(text);}catch{body={error:'Non-JSON provider response'}; parseError = true;}
    await endReceipt(owner,file.id,'qloo',receipt,status,body);recorded=true;
    if(!response.ok)throw new AppError(`Qloo could not complete this request (${status}). Receipt: ${receipt}`,502,'qloo_request_failed');
    if(parseError) throw new AppError(`Qloo returned a non-JSON or malformed response. Receipt: ${receipt}`,502,'provider_response');
    const result=body as {success?:boolean;results?:Row[]|{entities?:Row[]};warnings?:unknown;warning?:unknown;error?:unknown};
    if(result.error || result.success===false)throw new AppError(`Qloo did not accept this query. Receipt: ${receipt}`,422,'qloo_rejected');
    return {result,receipt};
  }catch(error){
    if(!recorded)await endReceipt(owner,file.id,'qloo',receipt,status,{error:'Request failed, was too large, or timed out.'});
    if(error instanceof AppError) {
      if(receipt && !error.message.includes(receipt)) error.message = `${error.message} (Receipt: ${receipt})`;
      throw error;
    }
    throw new AppError(`Qloo did not respond in time. Receipt: ${receipt}`,504,'qloo_timeout');
  }
}
export async function resolveClue(owner:string,file:CaseFile,clueId:string) {
  const clue=file.clues.find(c=>c.id===clueId);if(!clue)throw new AppError('Choose a clue in this case.');
  const {result,receipt}=await request(owner,file,'/search',{query:clue.label,types:`urn:entity:${clue.kind}`,take:'5'});
  if(!Array.isArray(result.results))throw new AppError(`Qloo search returned an unexpected response. Receipt: ${receipt}`,502);
  const matches:Entity[]=result.results.filter(r=>r.entity_id && r.name).map(r=>({id:r.entity_id!,name:r.name!,kind:clue.kind}));
  clue.matches=matches;delete clue.entity;
  return {receipt,title:`Resolved “${clue.label}”`,detail:matches.length ? `${matches.length} possible identities. Confirm the intended entity before research.`:'No matching identity was returned. Try a more specific name.'};
}
async function discoverOne(owner:string,file:CaseFile,clueIds:string[],scope:QueryScope,reservation:ResearchReservation) {
  if(new Set(clueIds).size!==clueIds.length)throw new AppError('Choose each clue once.');
  const clues=clueIds.map(id=>file.clues.find(c=>c.id===id));
  if(clues.some(c=>!c || !c.enabled || !c.entity))throw new AppError('Confirm and enable the selected cultural references first.');
  const params:Record<string,string>={'filter.type':scope.filterType,take:String(scope.take),'filter.location':`POINT(${scope.geography.longitude} ${scope.geography.latitude})`,'filter.location.radius':String(scope.geography.radius)};
  if(scope.tags.length)params['filter.tags']=scope.tags.join(',');
  if(scope.candidateEntityIds)params['filter.results.entities']=scope.candidateEntityIds.join(',');
  if(clues.length)params['signal.interests.entities']=clues.map(c=>c!.entity!.id).join(',');
  const {result,receipt}=await request(owner,file,scope.endpoint,params,reservation);
  const rows=!Array.isArray(result.results)?result.results?.entities:undefined;
  if(!Array.isArray(rows))throw new AppError(`Qloo Insights returned an unexpected response. Receipt: ${receipt}`,502);
  const id=crypto.randomUUID();const warnings=[result.warnings,result.warning].filter(Boolean).map(w=>typeof w==='string'?w:JSON.stringify(w));
  const affinities:Record<string,number>={};const leadIds:string[]=[];
  for(const row of rows){
    if(!row.entity_id || !row.name || leadIds.includes(row.entity_id))continue;
    const lead:Lead={id:row.entity_id,name:row.name,address:row.properties?.address||'Address not returned',website:safeWebsite(row.properties?.website),latitude:row.location?.lat,longitude:row.location?.lon,tags:(row.tags||[]).map(t=>t.name||'').filter(Boolean).slice(0,12),introducedBy:id};
    leadIds.push(lead.id);if(!file.leads.some(l=>l.id===lead.id))file.leads.push(lead);
    const affinity=row.query?.affinity ?? row.affinity;if(typeof affinity==='number')affinities[lead.id]=affinity;
  }
  const inputSnapshot = {
    category: scope.category,
    geography: {...scope.geography},
    clues: clues.map(c => ({
      id: c!.id,
      label: c!.label,
      entityId: c!.entity?.id,
      entityName: c!.entity?.name,
      provenance: c!.provenance
    }))
  };
  const query:Query={id,scope:structuredClone(scope),label:clues.length?clues.map(c=>c!.entity!.name).join(' + '):'Area & activity only',mode:'live',createdAt:new Date().toISOString(),clueIds,leadIds,affinities,warnings,receiptId:receipt,geography:{...scope.geography},category:scope.category,inputSnapshot,rawRows:rows.map((r,idx)=>({...r,ordinal:idx}))};
  file.queries.push(query);
  return {query,receipt,title:`${leadIds.length} places returned`,detail:`${query.label}. ${warnings.length?'Provider warnings require review.':'Check premises facts before selecting an enquiry.'}`};
}
export function safeWebsite(value?:string) {if(!value)return undefined;try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return undefined;return url.href;}catch{return undefined;}}

export function discoveryScope(file:CaseFile):QueryScope {
  return {endpoint:'/v2/insights',filterType:'urn:entity:place',category:file.category,
    tags:file.category==='book_store'?['urn:tag:category:place:book_store']:[],
    geography:{latitude:file.latitude,longitude:file.longitude,radius:file.radius},take:20};
}
export async function discover(owner:string,file:CaseFile,clueIds:string[]) {
  if(!bindings().QLOO_API_KEY)throw new AppError('Qloo is not configured on the server.',503,'qloo_unavailable');
  if(new Set(clueIds).size!==clueIds.length || clueIds.some(id=>!file.clues.some(c=>c.id===id&&c.enabled&&c.entity)))throw new AppError('Confirm and enable each selected cultural reference once.');
  const scope=discoveryScope(file);
  const probe={id:'',scope,createdAt:new Date().toISOString(),mode:'live',clueIds} as Query;
  const existing=clueIds.length?controlFor(file,probe):undefined;
  const reservation=await reserveRequests(owner,'qloo',clueIds.length&&!existing?2:1);
  try {
    const outcome=await discoverOne(owner,file,clueIds,scope,reservation);
    if(clueIds.length){
      let control=existing;
      if(!control){
        try { control=(await discoverOne(owner,file,[],scope,reservation)).query; }
        catch(error){
          outcome.query.warnings.push(incompleteControlWarning);
          if(error instanceof Error)error.message=`The seeded query was saved, but its control failed. ${error.message}`;
          throw error;
        }
      }
      outcome.query.controlQueryId=control.id;
      // Existing clients select the latest query after discovery; keep the requested result last.
      file.queries=file.queries.filter(q=>q.id!==outcome.query.id);file.queries.push(outcome.query);
    }
    return outcome;
  } finally { await releaseRequests(reservation); }
}
export async function runControl(owner:string,file:CaseFile,queryId:string) {
  const query=file.queries.find(q=>q.id===queryId);
  if(!query?.scope || !query.clueIds.length || query.mode!=='live')throw new AppError('Choose a live seeded query with its full scope recorded.');
  const existing=controlFor(file,query);
  if(existing){query.controlQueryId=existing.id;query.warnings=query.warnings.filter(w=>w!==incompleteControlWarning);return {title:'Control paired',detail:'Reused the identical-scope control captured on the same UTC day.',receipt:existing.receiptId};}
  if(!bindings().QLOO_API_KEY)throw new AppError('Qloo is not configured on the server.',503,'qloo_unavailable');
  const reservation=await reserveRequests(owner,'qloo',1);
  try {
    const outcome=await discoverOne(owner,file,[],query.scope,reservation);
    query.controlQueryId=outcome.query.id;
    query.warnings=query.warnings.filter(w=>w!==incompleteControlWarning);
    return outcome;
  } finally { await releaseRequests(reservation); }
}
