import {readFile,writeFile,mkdir}from'node:fs/promises';
import path from'node:path';import{fileURLToPath}from'node:url';
import {comparisonIntakeSchema}from'../lib/comparison-case.ts';

// Read only the public intake, identity lookups and request parameters. Never read
// operational records, result orders, decision logs or an answer-key file.
export async function prepareCh01Intake(studyRoot){
 const read=async name=>JSON.parse(await readFile(path.join(studyRoot,name),'utf8'));
 const intake=(await read('public/cases.json')).find(c=>c.id==='CH01');
 if(!intake||intake.candidates.length!==5||intake.supplied_interests.length!==3)throw new Error('Expected the CH01 public intake.');
 const wrapper=await read('runs/B/CH01/qloo-insights.json');
 const budgets=(await readFile(path.join(studyRoot,'runs/B/CH01/budget.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);
 const receipts=await Promise.all(budgets.map(async b=>{const filename=path.basename(b.receipt);return{filename,raw:await read('raw/'+filename)};}));
 const seeded=receipts.find(r=>r.raw.path==='/v2/insights'&&r.raw.params?.['signal.interests.entities']&&r.raw.status===200);
 if(!seeded)throw new Error('Verified candidate-restricted request missing.');
 const params=seeded.raw.params,eligible=params['filter.results.entities']?.split(',')||[],signals=params['signal.interests.entities'].split(',');
 if(eligible.length!==5||signals.length!==3||params['filter.type']!=='urn:entity:place'||Number(params.take)!==20||Number(params['filter.location.radius'])!==8000||params['filter.tags'])throw new Error('Unexpected recorded request scope.');
 const point=/^POINT\(([-\d.]+) ([-\d.]+)\)$/.exec(params['filter.location']);
 if(!point||Number(point[2])!==intake.geography.center[0]||Number(point[1])!==intake.geography.center[1]||intake.geography.radius_m!==8000)throw new Error('Recorded and supplied geography differ.');
 function identity(handle,name,kind){
  const receipt=receipts.find(r=>r.raw.sequence===handle?.sequence);
  const rows=receipt?.raw.response?.results?.entities||receipt?.raw.response?.results;
  const row=Array.isArray(rows)?rows[handle?.index]:undefined;
  if(receipt?.raw.status!==200||receipt?.raw.path!=='/search'||handle?.name!==name||row?.name!==name||!row.types?.includes('urn:entity:'+kind))throw new Error('Canonical identity mapping could not be verified.');
  return{row,proof:{receiptId:receipt.filename,capturedAt:new Date(receipt.raw.at).toISOString()}};
 }
 const references=intake.supplied_interests.map((r,i)=>{
  const{row,proof}=identity(wrapper.seed_rows[i],r.name,r.type);
  if(row.entity_id!==signals[i])throw new Error('Reference identity differs from the recorded request.');
  const year=i<2?[2014,2010][i]:undefined;
  if(year&&Number(row.properties?.release_year||row.properties?.release_date?.slice(0,4))!==year)throw new Error('Film version could not be verified.');
  return{label:r.name,kind:r.type,entityId:row.entity_id,entityName:row.name,...(year?{year}:{}),origin:r.origin,reliability:r.reliability,proof};
 });
 const candidates=intake.candidates.map((c,i)=>{
  const{row,proof}=identity(wrapper.candidate_rows[i],c.name,'place');
  if(!eligible.includes(row.entity_id))throw new Error('Candidate identity is outside the recorded restriction.');
  const website=row.properties?.website;
  return{entityId:row.entity_id,name:row.name,address:c.address,...(website&&/^https?:\/\//i.test(website)?{website}:{}),proof};
 });
 const notes=`Fictional CH01 enquiry. ${intake.brief}\n\nThe interests are the organiser's self-report; no preference-to-booking link or attendance has been established. Canonical identities were resolved in recorded Qloo searches on 25 October 2026. Creating this case makes no new provider request. Subsequent research is live.`;
 return comparisonIntakeSchema.parse({version:1,studyId:'CH01',fictional:true,title:intake.title,question:'Which cinema’s records should be inspected first, and what could establish the drive’s onward transfer?',notes,
 known:'Reported handover on 8 September 2026; the torn slip retains R41 and 17:__. A supplied courier export lists five possible sites. The organiser chose and booked a cinema, but the booking email is missing and no link from her stated preferences to that booking is established.',
 gap:'Identify a case-linked receiving record for SD-2716 and the next record needed to establish any onward transfer. No venue or onward movement has been established.',
 area:intake.geography.city,latitude:intake.geography.center[0],longitude:intake.geography.center[1],radius:8000,date:'2026-09-08',activity:'Private cinema preview',category:'all_places',references,candidates});
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(!process.argv[2])throw new Error('Usage: node scripts/prepare-ch01-intake.mjs STUDY_FOLDER');
 const intake=await prepareCh01Intake(process.argv[2]);await mkdir('data/recorded',{recursive:true});await mkdir('private',{recursive:true});
 const document=JSON.stringify(intake);await writeFile('data/recorded/ch01-comparison-intake.json',JSON.stringify(intake,null,2)+'\n',{mode:0o600});
 await writeFile('private/ch01-comparison-intake.sql',`INSERT INTO demo_assets (id,document) VALUES ('ch01-comparison-intake','${document.replaceAll("'","''")}') ON CONFLICT(id) DO NOTHING;\n`,{mode:0o600});
 console.log('Prepared answer-free CH01 inputs: three verified references and five verified venues. Seed is insert-only for its separate asset; no database changed.');
}
