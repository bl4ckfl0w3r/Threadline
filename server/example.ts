import type { CaseFile } from '@/lib/contracts';
import { blankCase } from '@/lib/domain';
// Recordings are optional local data and deliberately excluded from Git.
const examples=import.meta.glob('../data/recorded/example.json',{eager:true,import:'default'});
export function exampleCase(id:string):CaseFile {
  const recorded=Object.values(examples)[0] as Partial<CaseFile>|undefined;
  const file=blankCase(id);
  if(!recorded)return {...file,title:'An unidentified stop',question:'Which premises could match a witness’s remembered book browsing and live music?',notes:'Fictional example: a witness cannot identify one stop in their timeline. Confirm the area, period and cultural references before researching.',activity:'Browsing books and hearing live music',mode:'recorded'};
  return {...file,...structuredClone(recorded),id,revision:0,createdAt:file.createdAt,updatedAt:file.updatedAt,agent:{steps:0,status:'idle',reason:''}};
}
