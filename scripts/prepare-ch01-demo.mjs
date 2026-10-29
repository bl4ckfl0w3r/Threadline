import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDemoV2 } from '../lib/demo-v2.ts';

const lines=async filename=>(await readFile(filename,'utf8')).split('\n').filter(Boolean).map(line=>JSON.parse(line));
export async function prepareCh01Demo(studyRoot) {
  const read=async relative=>JSON.parse(await readFile(path.join(studyRoot,relative),'utf8'));
  const intake=(await read('public/cases.json')).find(c=>c.id==='CH01');
  if(!intake)throw new Error('CH01 public intake missing.');
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
        const expected={date:'2026-09-08',customer:'Northline Distribution',item:'SD-2716',slip:'R41'};
        const labels=header?.split(' | '),values=mainRow?.split(' | ');
        const fields=labels&&values&&labels.length===values.length?labels.map((label,i)=>({label,value:values[i],...(label in expected?{matchesIntake:values[i]===expected[label]}:{})})):relevant.split('\n').map((value,i)=>({label:`Recorded row ${i+1}`,value}));
        const record={id:d.id,leadId,type:d.type,fictional:true,excerpt:relevant,fields};
        if(records.has(d.id)&&JSON.stringify(records.get(d.id))!==JSON.stringify(record))throw new Error('Inspected arms disagree on the same record.');
        records.set(d.id,record);
      }
      return {order:bundle.inspection,leadId,reason:bundle.request.reason,found:leadId==='L04'?'match':'related',recordIds:docs.map(d=>d.id)};
    });
  }
  const decisions=await lines(path.join(studyRoot,'runs/B/CH01/decision-log.jsonl'));
  const webA=await lines(path.join(studyRoot,'runs/A/CH01/web-receipts.jsonl'));
  const webB=await lines(path.join(studyRoot,'runs/B/CH01/web-receipts.jsonl'));
  const document={version:2,study:{id:'CH01',label:'Fictional screening-drive enquiry'},title:intake.title,
    intake:{summary:"Northline Distribution cannot account for screening drive SD-2716 after a courier handover on 8 September. A torn slip retains R41 and 17:__, while a courier export lists five possible cinema sites. The organiser's booking email is missing.",item:'SD-2716',handoverDate:'2026-09-08',caseDescription:'Black hard case, recently replaced orange latch',slip:{visible:['R41','17:__'],missing:'venue line'},area:intake.geography.city},
    bridge:'The organiser chose and booked the cinema. No preference-to-booking link has been observed.',references:intake.supplied_interests.map((r,i)=>({id:`CH01-ref-${i+1}`,label:r.name,kind:r.type,suppliedBy:r.origin+' '+r.reliability,relation:'chose_place'})),
    candidates:intake.candidates.map((c,i)=>({leadId:c.id,name:c.name,address:c.address,listedPosition:i+1})),inspectionBudget:3,control:query(control,'control'),seeded:query(seeded,'seeded'),highlightedLeadId:'L04',
    arms:[{id:'listed',label:'Recorded LLM run — listed order',whyThisOrder:aInitial.reason,inspections:inspections(a),outcome:'The three inspected sites contain similar identifiers but no exact SD-2716 receiving entry; the missing transfer remains unresolved.'},{id:'qloo',label:'Recorded LLM run — Qloo order with the references',whyThisOrder:'The recorded cultural query moved L04 from second to first against the same-candidate control; the agent inspected its records first.',inspections:inspections(b),outcome:'L04 has a matching customer/date/item/slip receiving entry. A same-bay docket is worth checking, but its contents and delivery remain unproven.'}],
    records:[...records.values()],openQuestion:'Does docket QN-644 actually contain SD-2716? The shared bay P4 is not an explicit item-to-docket join, and delivery is not established.',
    nextRequest:{leadId:'L04',request:'Request the QN-644 consignment contents or collection manifest from Parcel Loop, plus shared depot D2 intake and proof-of-delivery records for 8 September, checked against SD-2716.',confirming:'An explicit SD-2716-to-QN-644 entry supports that assignment; evaluate depot intake and delivery separately.',conflicting:'Record an explicit different item or destination and revise the onward-docket hypothesis.',unavailable:'Keep the item-to-docket join and delivery unresolved; seek the booking email or an independent case-linked transfer record.'},
    agentDecisions:decisions.map((d,i)=>({step:i+1,action:d.action,reason:d.purpose+' '+d.next_step_effect})),
    usage:{qlooAttempts:receipts.reduce((n,r)=>n+Number(r.raw.attempt||1),0),qlooFailed:receipts.filter(r=>r.raw.status<200||r.raw.status>=300||r.raw.error).length,webRequests:webA.length+webB.length},
    provenance:{realData:'Venue names and Qloo responses are real, captured 25 October 2026.',fictionalData:'The incident, customers and operational records are fictional.',runLabel:'Recorded research runs in the study harness (both arms used a language model), not the app’s live agent.',caveat:'Without the references, Qloo ranked this site second. Missing candidates are not ruled out. The broader study did not establish a general cultural advantage.',counterfactual:'The unseeded Qloo order would also reach L04 at the second inspection. This follows from its recorded order; that queue was not run as a third investigator.'}};
  const result=buildDemoV2(document);if(!result)throw new Error('Prepared CH01 projection failed validation.');
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=process.argv[2];if(!root)throw new Error('Usage: node scripts/prepare-ch01-demo.mjs STUDY_FOLDER');
  const demo=await prepareCh01Demo(root);await mkdir('data/recorded',{recursive:true});await writeFile('data/recorded/ch01-demo.json',JSON.stringify(demo,null,2)+'\n',{mode:0o600});
  console.log(`Prepared CH01: ${demo.usage.qlooAttempts} attempts (${demo.usage.qlooFailed} failed); ${demo.records.length} inspected fictional records. No remote data changed.`);
}
