import { z } from 'zod';
import type { CaseFile, Query, Enquiry, Lead } from './contracts';

export const clueInput = z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(180), kind: z.enum(['artist','book','brand','movie','place']), provenance: z.enum(['supplied_interest','observation','uncertain']), enabled: z.boolean() });
const date = z.string().refine(value => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)), 'Enter a valid date.');
export const enquirySchema = z.object({ leadId: z.string().max(100), question: z.string().max(2000), rationale: z.string().max(4000), sourceIds: z.array(z.string()).max(20), confirming: z.string().max(1500), conflicting: z.string().max(1500), unavailable: z.string().max(1500), draft: z.string().max(12000) });
export const editsSchema = z.object({
  title: z.string().trim().min(1).max(160).optional(), question: z.string().max(2000).optional(), notes: z.string().max(12000).optional(), area: z.string().max(160).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), radius: z.number().int().min(100).max(50000).optional(), startDate: date.optional(), endDate: date.optional(), activity: z.string().max(500).optional(), category: z.enum(['book_store','all_places']).optional(), clues: z.array(clueInput).max(8).optional(), enquiry: enquirySchema.optional(),
});
export const actionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('resolve'),clueId:z.string()}),
  z.object({type:z.literal('confirm'),clueId:z.string(),entityId:z.string()}),
  z.object({type:z.literal('discover'),clueIds:z.array(z.string()).max(8)}),
  z.object({type:z.literal('source'),leadId:z.string(),title:z.string().trim().min(1).max(200),url:z.string().url().max(2000).optional(),excerpt:z.string().trim().min(1).max(16000),note:z.string().max(3000),kind:z.enum(['user_record','user_excerpt'])}),
  z.object({type:z.literal('inspect'),leadId:z.string(),url:z.string().url().max(2000)}),
  z.object({type:z.literal('agent_step')}),z.object({type:z.literal('agent_reset')}),
]);
export function blankCase(id: string): CaseFile {
  const now = new Date().toISOString();
  return {id,revision:0,title:'Untitled investigation',question:'Which place’s records should I inspect next?',notes:'',area:'London',latitude:51.5072,longitude:-0.1276,radius:10000,startDate:'',endDate:'',activity:'',category:'book_store',mode:'live',createdAt:now,updatedAt:now,clues:[],leads:[],queries:[],sources:[],activityLog:[],agent:{steps:0,status:'idle',reason:''}};
}
export function applyEdits(file: CaseFile, value: unknown): CaseFile {
  const edits = editsSchema.parse(value);
  const clues = edits.clues?.map(clue => {
    const previous=file.clues.find(c=>c.id===clue.id && c.label===clue.label && c.kind===clue.kind);
    return {...clue, ...(previous ? {entity:previous.entity,matches:previous.matches}: {})};
  });
  if (clues && new Set(clues.map(c=>c.id)).size!==clues.length) throw new Error('Each clue must have a unique identifier.');
  const result={...file,...edits,...(clues?{clues}:{})};
  if(result.startDate && result.endDate && result.startDate>result.endDate) throw new Error('The end date must follow the start date.');
  if(result.enquiry && !validEnquiry(result,result.enquiry)) throw new Error('The enquiry must refer to a place and its sources in this case.');
  return result;
}
export function validEnquiry(file: CaseFile, enquiry: Enquiry) {
  return file.leads.some(l=>l.id===enquiry.leadId) && enquiry.sourceIds.every(id=>file.sources.some(s=>s.id===id && s.leadId===enquiry.leadId));
}
export function compareQueries(current: Query, previous?: Query) {
  if(!previous) return {added:current.leadIds,removed:[],retained:[]};
  return {added:current.leadIds.filter(id=>!previous.leadIds.includes(id)),removed:previous.leadIds.filter(id=>!current.leadIds.includes(id)),retained:current.leadIds.filter(id=>previous.leadIds.includes(id))};
}
export function draftEnquiry(file: CaseFile, lead: Lead): Enquiry {
  const sources=file.sources.filter(s=>s.leadId===lead.id);
  const when=file.startDate ? `between ${file.startDate} and ${file.endDate || file.startDate}` : 'during the relevant period';
  const question=`Which public programme or premises information could establish whether ${lead.name} matched the remembered activity ${when}?`;
  return {leadId:lead.id,question,rationale:`${lead.name} is a candidate for checking against the case observations. ${sources.length ? `${sources.length} source record(s) are attached for review.` : 'Public source support is still needed.'} A cultural association does not establish a visit.`,sourceIds:sources.map(s=>s.id),confirming:'Use any confirmed activity, date and branch details to formulate a narrower case-specific enquiry.',conflicting:'Record the precise conflict and reassess this premises against the original observations.',unavailable:'Keep the question unresolved and identify another source or a clarifying recollection.',draft:`Subject: Public programme enquiry — ${lead.name}\n\nI am checking an account of ${file.activity || 'an unidentified stop'} ${when}. Could you point me to a public programme or relevant premises information for that period?\n\nIn particular: ${question}\n\nThis is an enquiry about the premises and its advertised activity; whether it is connected to the case remains unresolved.`};
}
export function exportBrief(file: CaseFile) {
  const enquiry=file.enquiry;const lead=file.leads.find(l=>l.id===enquiry?.leadId);
  return [`# ${file.title}`,file.mode==='recorded'?'Fictional example case; recorded results are labelled individually.':'Investigation working brief',`Question: ${file.question}`,`Area: ${file.area}; centre ${file.latitude}, ${file.longitude}; radius ${file.radius} m`,`Period: ${file.startDate||'Not supplied'} to ${file.endDate||'Not supplied'}`,`## Observations\n${file.notes}`,`## Cultural references\n${file.clues.map(c=>`${c.enabled?'Included':'Withdrawn'}: ${c.label} (${c.provenance.replaceAll('_',' ')})`).join('\n')}`,enquiry?`## Next enquiry: ${lead?.name||'Unresolved'}\n${enquiry.question}\n\n${enquiry.rationale}\n\nConfirming response: ${enquiry.confirming}\nConflicting response: ${enquiry.conflicting}\nUnavailable response: ${enquiry.unavailable}\n\n### Draft\n${enquiry.draft}`:'## Next enquiry\nNot yet selected.',`## Sources\n${file.sources.map(s=>`### ${s.title}\n${s.url||'Investigator-supplied record'}\n${s.kind}; ${s.mode}; captured ${s.capturedAt}\n${s.excerpt}\n${s.note}`).join('\n\n')}`,`## Query provenance\n${file.queries.map(q=>`${q.label} — ${q.mode}, ${q.createdAt}; ${q.leadIds.length} returned places; receipt ${q.receiptId}. ${q.warnings.join(' ')}`).join('\n')}`].join('\n\n');
}
