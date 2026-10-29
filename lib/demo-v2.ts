import { z } from 'zod';
import type { DemoDataV2 } from './contracts.ts';

const text=z.string().min(1);
const scope=z.object({endpoint:text,filterType:text,category:text,tags:z.array(text),geography:z.object({latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),radius:z.number().positive()}).strict(),take:z.number().int().positive(),candidateEntityIds:z.array(text).optional()}).strict();
const query=z.object({id:text,role:z.enum(['control','seeded']),label:text,clueIds:z.array(text),scope,order:z.array(z.object({leadId:text,rank:z.number().int().positive(),affinity:z.number().finite().optional()}).strict()),receiptId:text,capturedAt:z.string().datetime({offset:true})}).strict();
const record=z.object({id:text,leadId:text,type:text,fictional:z.literal(true),excerpt:text,fields:z.array(z.object({label:text,value:text,matchesIntake:z.boolean().optional()}).strict())}).strict();
const inspection=z.object({order:z.number().int().positive(),leadId:text,reason:text,found:z.enum(['match','related','nothing_relevant']),recordIds:z.array(text)}).strict();
const arm=z.object({id:z.enum(['listed','qloo']),label:text,whyThisOrder:text,inspections:z.array(inspection),outcome:text}).strict();
const schema=z.object({
  version:z.literal(2),study:z.object({id:z.literal('CH01'),label:text}).strict(),title:text,
  intake:z.object({summary:text,item:text,handoverDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),caseDescription:text,slip:z.object({visible:z.array(text),missing:text}).strict(),area:text}).strict(),
  bridge:text,references:z.array(z.object({id:text,label:text,kind:z.enum(['movie','artist']),suppliedBy:text,relation:z.literal('chose_place')}).strict()),
  candidates:z.array(z.object({leadId:text,name:text,address:text,listedPosition:z.number().int().positive()}).strict()),inspectionBudget:z.number().int().positive(),control:query,seeded:query,highlightedLeadId:text,arms:z.tuple([arm,arm]),records:z.array(record),
  openQuestion:text,nextRequest:z.object({leadId:text,request:text,confirming:text,conflicting:text,unavailable:text}).strict(),agentDecisions:z.array(z.object({step:z.number().int().positive(),action:text,reason:text}).strict()),
  usage:z.object({qlooAttempts:z.number().int().nonnegative(),qlooFailed:z.number().int().nonnegative(),webRequests:z.number().int().nonnegative()}).strict(),
  provenance:z.object({realData:text,fictionalData:text,runLabel:text,caveat:text,counterfactual:text}).strict(),
}).strict();
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function privateMaterial(value:unknown):boolean {
  if(typeof value==='string')return /\.dev\.vars|(?:API_KEY|SESSION_SIGNING_KEY)\s*[=:]/i.test(value);
  if(Array.isArray(value))return value.some(privateMaterial);
  if(value&&typeof value==='object')return Object.entries(value).some(([key,v])=>key==='owner'||key==='caseId'||((key==='id')&&typeof v==='string'&&uuid.test(v))||privateMaterial(v));
  return false;
}
function canonicalScope(value:z.infer<typeof scope>) {
  return JSON.stringify({...value,tags:[...value.tags].sort(),...(value.candidateEntityIds?{candidateEntityIds:[...value.candidateEntityIds].sort()}: {})});
}
// Validates and projects only the public study contract. Never accept a saved case.
export function buildDemoV2(input:unknown):DemoDataV2|null {
  if(privateMaterial(input))return null;
  const parsed=schema.safeParse(input);if(!parsed.success)return null;
  const d=parsed.data;
  if(d.control.role!=='control'||d.control.clueIds.length||d.seeded.role!=='seeded'||!d.seeded.clueIds.length||d.control.id===d.seeded.id)return null;
  if(canonicalScope(d.control.scope)!==canonicalScope(d.seeded.scope))return null;
  const leads=new Set(d.candidates.map(c=>c.leadId)), refs=new Set(d.references.map(c=>c.id)), records=new Map(d.records.map(r=>[r.id,r]));
  if(leads.size!==d.candidates.length||refs.size!==d.references.length||records.size!==d.records.length)return null;
  if(!leads.has(d.highlightedLeadId)||!leads.has(d.nextRequest.leadId))return null;
  for(const q of [d.control,d.seeded]) {
    if(q.clueIds.some(id=>!refs.has(id))||q.order.some(r=>!leads.has(r.leadId))||new Set(q.order.map(r=>r.leadId)).size!==q.order.length)return null;
    if(q.order.some((r,i)=>r.rank!==i+1)||!q.order.some(r=>r.leadId===d.highlightedLeadId))return null;
  }
  if(d.arms[0].id!=='listed'||d.arms[1].id!=='qloo'||d.usage.qlooFailed>d.usage.qlooAttempts)return null;
  const inspected=new Set<string>();
  for(const a of d.arms) {
    if(a.inspections.length>d.inspectionBudget||a.inspections.some((i,n)=>i.order!==n+1))return null;
    for(const i of a.inspections){
      if(!leads.has(i.leadId)||i.recordIds.some(id=>records.get(id)?.leadId!==i.leadId))return null;
      i.recordIds.forEach(id=>inspected.add(id));
    }
  }
  if(d.records.some(r=>!leads.has(r.leadId)||!inspected.has(r.id)))return null;
  return structuredClone(d) as DemoDataV2;
}
