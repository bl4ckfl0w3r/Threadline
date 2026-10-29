import type { CaseFile } from '../lib/contracts.ts';
import { blankCase } from '../lib/domain.ts';
export class InvalidDemoData extends Error {}
export function isMissingDemoTable(error:unknown):boolean {
  const message=error instanceof Error ? error.message : String(error);
  return /no such table:\s*demo_assets/i.test(message);
}
// The curated fictional recording is server-side data, independent of builds.
// Never read an investigator-owned case as a public demo.
export async function loadExampleCase(db: D1Database, id:string):Promise<CaseFile> {
  let row:{document:string}|null=null;
  try{row=await db.prepare("SELECT document FROM demo_assets WHERE id='curated-fictional-example'").first<{document:string}>();}
  catch(error){if(!isMissingDemoTable(error))throw error;}
  let recorded:Partial<CaseFile>|undefined;
  try{recorded=row?JSON.parse(row.document):undefined;}catch{throw new InvalidDemoData('The curated demo data is invalid.');}
  if(recorded && (recorded.mode !== 'recorded' || !Array.isArray(recorded.queries) || !Array.isArray(recorded.sources))) throw new InvalidDemoData('The curated demo data is invalid.');
  const file=blankCase(id);
  if(!recorded)return {...file,title:'An unidentified stop',question:'Which record could identify a missing stop in the reported timeline?',notes:'Fictional case: someone reports missing property and remembers an unidentified stop during the interval before noticing the loss. Confirm the account, area, dates and supplied references before researching.',caseContext:{known:'Record the reported last sighting and when the loss was noticed, including their sources.',gap:'Identify the unknown stop and a record that could corroborate it.'},activity:'',mode:'recorded'};
  return {...file,...structuredClone(recorded),id,revision:0,createdAt:file.createdAt,updatedAt:file.updatedAt,agent:{steps:0,status:'idle',reason:''}};
}
