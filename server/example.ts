import type { CaseFile } from '@/lib/contracts';
import { blankCase } from '@/lib/domain';
// Recordings are optional local data and deliberately excluded from Git.
const examples=import.meta.glob('../data/recorded/example.json',{eager:true,import:'default'});
export function exampleCase(id:string):CaseFile {
  const recorded=Object.values(examples)[0] as Partial<CaseFile>|undefined;
  const file=blankCase(id);
  if(!recorded)return {...file,title:'An unidentified stop',question:'Which record could identify a missing stop in the reported timeline?',notes:'Fictional case: someone reports missing property and remembers an unidentified stop during the interval before noticing the loss. Confirm the account, area, dates and supplied references before researching.',caseContext:{known:'Record the reported last sighting and when the loss was noticed, including their sources.',gap:'Identify the unknown stop and a record that could corroborate it.'},activity:'Browsing books and hearing live music',mode:'recorded'};
  return {...file,...structuredClone(recorded),id,revision:0,createdAt:file.createdAt,updatedAt:file.updatedAt,agent:{steps:0,status:'idle',reason:''}};
}
