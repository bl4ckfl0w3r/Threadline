import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoV2 } from '../lib/demo-v2.ts';

const lines=async filename=>(await readFile(filename,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));

// Classify the recorded receiving entries, never the position or identity of a venue.
export function receivingFinding(documents, expected) {
  let related=false;
  for(const document of documents.filter(d=>d.type==='receiving ledger')) {
    const lines=document.text.split('\n').filter(line=>line.includes('|'));
    const labels=lines.shift()?.split('|').map(value=>value.trim());
    if(!labels)continue;
    for(const line of lines) {
      const values=line.split('|').map(value=>value.trim());
      const row=Object.fromEntries(labels.map((label,i)=>[label,values[i]]));
      if(row.item!==expected.item)continue;
      related=true;
      if(Object.entries(expected).every(([field,value])=>row[field]===value))return 'match';
    }
  }
  return related?'related':'nothing_relevant';
}

export function readableStudyText(value, candidates) {
  let text=value;
  for(const candidate of candidates)text=text.replace(new RegExp(`(?<![\\w-])${candidate.id}(?![\\w-])`,'g'),candidate.name);
  return text.replace(/\s*\(affinity\s+[\d.]+\)/gi,'').replace(/\s+/g,' ').trim();
}
function sentence(value) { return /[.!?]$/.test(value)?value:`${value}.`; }
function firstSentence(value) { return value.match(/^.*?[.!?](?:\s|$)/)?.[0].trim()||value; }
export function inspectionReason(value, candidates) {
  const clauses=readableStudyText(value,candidates).split(';');
  const reason=clauses.find(clause=>/^\s*(?:inspect|continue|check|verify|test|seek)\b/i.test(clause))||clauses[0];
  const text=firstSentence(reason.trim());
  return sentence(text.charAt(0).toUpperCase()+text.slice(1));
}
export function decisionReason(purpose,effect,candidates) {
  return `${sentence(firstSentence(readableStudyText(purpose,candidates)))} ${sentence(firstSentence(readableStudyText(effect,candidates)))}`;
}

export async function prepareCh01Demo(studyRoot) {
  const read=async relative=>JSON.parse(await readFile(path.join(studyRoot,relative),'utf8'));
  const intake=(await read('public/cases.json')).find(c=>c.id==='CH01');
  if(!intake)throw new Error('CH01 public intake missing.');
  const expected={date:'2026-09-08',customer:'Northline Distribution',item:'SD-2716',slip:'R41'};
  const readable=value=>readableStudyText(value,intake.candidates);
  const budgets=await lines(path.join(studyRoot,'runs/B/CH01/budget.jsonl'));
  const receipts=await Promise.all(budgets.map(async b=>{
    const filename=path.basename(b.receipt);
    return {filename,raw:await read(`raw/${filename}`)};
  }));
  const seeded=receipts.find(r=>r.raw.params?.['signal.interests.entities']&&r.raw.path==='/v2/insights');
  const control=receipts.find(r=>!r.raw.params?.['signal.interests.entities']&&r.raw.path==='/v2/insights');
  if(!seeded||!control)throw new Error('Both raw comparison receipts are required.');
  const eligible=seeded.raw.params['filter.results.entities'].split(',');
  if(eligible.length!==intake.candidates.length)throw new Error('Candidate restriction differs from intake.');
  // Resolve each branch from its canonical search receipt, not fuzzy name guesses.
  const byEntity=new Map();
  const seededRequest=await read('runs/B/CH01/qloo-insights.json');
  for(const c of intake.candidates) {
    // Frozen candidate_rows are source handles with an explicit result index.
    const handle=seeded.raw.params['filter.results.entities'].split(',')[intake.candidates.indexOf(c)];
    const search=receipts.find(r=>r.raw.sequence===seededRequest.candidate_rows[intake.candidates.indexOf(c)].sequence);
    const entities=search?.raw.response?.results?.entities||search?.raw.response?.results||[];
    const rows=Array.isArray(entities)?entities:[];
    if(!rows.some(e=>e.entity_id===handle&&e.name===c.name))throw new Error(`Cannot verify canonical venue identity for ${c.id}.`);
    byEntity.set(handle,c.id);
  }
  function query(receipt,role) {
    const p=receipt.raw.params;
    const point=/^POINT\(([-\d.]+) ([-\d.]+)\)$/.exec(p['filter.location']);
    if(!point||receipt.raw.status!==200||receipt.raw.response?.success!==true)throw new Error('Invalid recorded comparison response.');
    const rows=receipt.raw.response.results.entities;
    return {id:`CH01-${role}`,role,label:role==='control'?'Without the references':"With the organiser's references",clueIds:role==='control'?[]:intake.supplied_interests.map((_,i)=>`CH01-ref-${i+1}`),scope:{endpoint:receipt.raw.path,filterType:p['filter.type'],category:'cinema',tags:[],geography:{latitude:Number(point[2]),longitude:Number(point[1]),radius:Number(p['filter.location.radius'])},take:Number(p.take),candidateEntityIds:p['filter.results.entities'].split(',').sort()},order:rows.map((e,i)=>{
      const leadId=byEntity.get(e.entity_id);if(!leadId)throw new Error('Response includes a venue outside the candidate set.');
      return {leadId,rank:i+1,...(typeof e.query?.affinity==='number'?{affinity:e.query.affinity}:{})};
    }),receiptId:receipt.filename,capturedAt:new Date(receipt.raw.at).toISOString()};
  }
  const aInitial=await read('runs/A/CH01/initial.json');
  const a=[];
  for(let i=1;i<=3;i++)a.push(await read(`runs/A/CH01/inspection-${i}-${aInitial.initial_queue[i-1]}.json`));
  const b=await lines(path.join(studyRoot,'runs/B/CH01/inspections.jsonl'));
  const records=new Map();
  function inspections(bundles) {
    return bundles.map(bundle=>{
      if(bundle.synthetic!==true)throw new Error('Every operational bundle must be explicitly fictional.');
      const leadId=bundle.request.candidate_id;
      const docs=bundle.response.documents;
      for(const d of docs) {
        const relevant=d.text.split('\n').filter(line=>/^(13 |22 |QN-64\d |Margin:|Signed scan)/.test(line)).join('\n')||d.text;
        const header=d.text.split('\n').find(line=>line.includes(' | ')&&!/^\d|^QN-/.test(line));
        const mainRow=relevant.split('\n').find(line=>line.includes(' | '));
        const labels=header?.split(' | '),values=mainRow?.split(' | ');
        const fields=labels&&values&&labels.length===values.length?labels.map((label,i)=>({label,value:values[i],...(label in expected?{matchesIntake:values[i]===expected[label]}:{})})):relevant.split('\n').map((value,i)=>({label:`Recorded row ${i+1}`,value}));
        const record={id:d.id,leadId,type:d.type,fictional:true,excerpt:relevant,fields};
        if(records.has(d.id)&&JSON.stringify(records.get(d.id))!==JSON.stringify(record))throw new Error('Inspected arms disagree on the same record.');
        records.set(d.id,record);
      }
      return {order:bundle.inspection,leadId,reason:inspectionReason(bundle.request.reason,intake.candidates),found:receivingFinding(docs,expected),recordIds:docs.map(d=>d.id)};
    });
  }
  const decisions=await lines(path.join(studyRoot,'runs/B/CH01/decision-log.jsonl'));
  const webA=await lines(path.join(studyRoot,'runs/A/CH01/web-receipts.jsonl'));
  const webB=await lines(path.join(studyRoot,'runs/B/CH01/web-receipts.jsonl'));
  const listedInspections=inspections(a),qlooInspections=inspections(b);
  const matches=[...new Set([...listedInspections,...qlooInspections].filter(i=>i.found==='match').map(i=>i.leadId))];
  if(matches.length!==1)throw new Error('The inspected records do not identify a unique matching receiving entry.');
  const highlightedLeadId=matches[0],highlightedName=intake.candidates.find(c=>c.id===highlightedLeadId)?.name;
  const controlQuery=query(control,'control'),seededQuery=query(seeded,'seeded');
  const controlRank=controlQuery.order.find(r=>r.leadId===highlightedLeadId)?.rank;
  const seededRank=seededQuery.order.find(r=>r.leadId===highlightedLeadId)?.rank;
  const position=rank=>({1:'first',2:'second',3:'third',4:'fourth',5:'fifth'}[rank]||`position ${rank}`);
  const document={version:2,study:{id:'CH01',label:'Fictional screening-drive enquiry'},title:intake.title,
    intake:{summary:"Northline Distribution cannot account for screening drive SD-2716 after a courier handover on 8 September. A torn slip retains R41 and 17:__, while a courier export lists five possible cinema sites. The organiser's booking email is missing.",item:'SD-2716',handoverDate:'2026-09-08',caseDescription:'Black hard case, recently replaced orange latch',slip:{visible:['R41','17:__'],missing:'venue line'},area:intake.geography.city},
    bridge:'The organiser chose and booked the cinema. Her favourites are self-reported; no preference-to-booking link or attendance has been established.',references:intake.supplied_interests.map((r,i)=>({id:`CH01-ref-${i+1}`,label:r.name,kind:r.type,suppliedBy:'The organiser, during fictional intake (self-report).',relation:'chose_place'})),
    candidates:intake.candidates.map((c,i)=>({leadId:c.id,name:c.name,address:c.address,listedPosition:i+1})),inspectionBudget:3,control:controlQuery,seeded:seededQuery,highlightedLeadId,
    arms:[{id:'listed',label:'Recorded LLM run — listed order',whyThisOrder:'Nothing in the supplied case distinguished the sites, so the recorded LLM kept the courier’s listed order.',inspections:listedInspections,outcome:'No inspected entry matched the item, customer, date and slip together; the missing transfer remains unresolved.'},{id:'qloo',label:'Recorded LLM run — Qloo order with the references',whyThisOrder:`The references moved ${highlightedName} from ${position(controlRank)} to ${position(seededRank)} against the same-candidate control.`,inspections:qlooInspections,outcome:`${highlightedName} has a matching customer/date/item/slip receiving entry. A same-bay docket is worth checking, but its contents and delivery remain unproven.`}],
    records:[...records.values()],openQuestion:'Does docket QN-644 actually contain SD-2716? The shared bay P4 is not an explicit item-to-docket join, and delivery is not established.',
    nextRequest:{leadId:highlightedLeadId,request:'Request the QN-644 consignment contents or collection manifest from Parcel Loop, plus shared depot D2 intake and proof-of-delivery records for 8 September, checked against SD-2716.',confirming:'An explicit SD-2716-to-QN-644 entry supports that assignment; evaluate depot intake and delivery separately.',conflicting:'Record an explicit different item or destination and revise the onward-docket hypothesis.',unavailable:'Keep the item-to-docket join and delivery unresolved; seek the booking email or an independent case-linked transfer record.'},
    agentDecisions:decisions.map((d,i)=>({step:i+1,action:readable(d.action),reason:decisionReason(d.purpose,d.next_step_effect,intake.candidates)})),
    usage:{qlooAttempts:receipts.reduce((n,r)=>n+Number(r.raw.attempt||1),0),qlooFailed:receipts.filter(r=>r.raw.status<200||r.raw.status>=300||r.raw.error).length,webRequests:webA.length+webB.length},
    provenance:{realData:'Venue names and Qloo responses are real, captured 25 October 2026.',fictionalData:'The incident, customers and operational records are fictional.',runLabel:'Recorded research runs in the study harness (both arms used a language model), not the app’s live agent.',caveat:`Without the references, Qloo ranked ${highlightedName} ${position(controlRank)}. Missing candidates are not ruled out. The broader study did not establish a general cultural advantage.`,counterfactual:`The unseeded Qloo order would also reach ${highlightedName} at the ${position(controlRank)} inspection. This follows from its recorded order; that queue was not run as a third investigator.`}};
  const result=buildDemoV2(document);if(!result)throw new Error('Prepared CH01 projection failed validation.');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=process.argv[2];if(!root)throw new Error('Usage: node scripts/prepare-ch01-demo.mjs STUDY_FOLDER');
  const demo=await prepareCh01Demo(root);await mkdir('data/recorded',{recursive:true});await writeFile('data/recorded/ch01-demo.json',JSON.stringify(demo,null,2)+'\n',{mode:0o600});
  console.log(`Prepared CH01: ${demo.usage.qlooAttempts} attempts (${demo.usage.qlooFailed} failed); ${demo.records.length} inspected fictional records. No remote data changed.`);
}
