import type { CaseFile, Entity, Lead, Query } from '@/lib/contracts';
import { AppError, bindings } from './runtime';
import { beginReceipt, endReceipt } from './store';

type Row={entity_id?:string;name?:string;properties?:{address?:string;website?:string};location?:{lat?:number;lon?:number};tags?:{name?:string}[];query?:{affinity?:number};affinity?:number};
async function request(owner:string,file:CaseFile,path:string,params:Record<string,string>) {
  const key=bindings().QLOO_API_KEY;if(!key)throw new AppError('Qloo is not configured on the server.',503,'qloo_unavailable');
  const receipt=await beginReceipt(owner,file.id,'qloo',{path,params});
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
export async function discover(owner:string,file:CaseFile,clueIds:string[]) {
  if(new Set(clueIds).size!==clueIds.length)throw new AppError('Choose each clue once.');
  const clues=clueIds.map(id=>file.clues.find(c=>c.id===id));
  if(clues.some(c=>!c || !c.enabled || !c.entity))throw new AppError('Confirm and enable the selected cultural references first.');
  const params:Record<string,string>={'filter.type':'urn:entity:place',take:'20','filter.location':`POINT(${file.longitude} ${file.latitude})`,'filter.location.radius':String(file.radius)};
  if(file.category==='book_store')params['filter.tags']='urn:tag:category:place:book_store';
  if(clues.length)params['signal.interests.entities']=clues.map(c=>c!.entity!.id).join(',');
  const {result,receipt}=await request(owner,file,'/v2/insights',params);
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
    category: file.category,
    geography: { latitude: file.latitude, longitude: file.longitude, radius: file.radius },
    clues: clues.map(c => ({
      id: c!.id,
      label: c!.label,
      entityId: c!.entity?.id,
      entityName: c!.entity?.name,
      provenance: c!.provenance
    }))
  };
  const query:Query={id,label:clues.length?clues.map(c=>c!.entity!.name).join(' + '):'Area & activity only',mode:'live',createdAt:new Date().toISOString(),clueIds,leadIds,affinities,warnings,receiptId:receipt,geography:{latitude:file.latitude,longitude:file.longitude,radius:file.radius},category:file.category,inputSnapshot,rawRows:rows.map((r,idx)=>({...r,ordinal:idx}))};
  file.queries.push(query);
  return {receipt,title:`${leadIds.length} places returned`,detail:`${query.label}. ${warnings.length?'Provider warnings require review.':'Check premises facts before selecting an enquiry.'}`};
}
export function safeWebsite(value?:string) {if(!value)return undefined;try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol))return undefined;return url.href;}catch{return undefined;}}
