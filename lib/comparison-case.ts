import {z} from 'zod';
import type{CaseFile}from'./contracts.ts';
import {blankCase,candidateEntityIdsSchema}from'./domain.ts';

const text=z.string().trim().min(1).max(3000);
const proof=z.object({receiptId:z.string().min(1).max(200),capturedAt:z.string().datetime({offset:true})}).strict();
const reference=z.object({label:text,kind:z.enum(['movie','artist']),entityId:z.string().uuid(),entityName:text,year:z.number().int().optional(),origin:text,reliability:text,proof}).strict();
const candidate=z.object({entityId:z.string().uuid(),name:text,address:text,website:z.string().url().refine(s=>['http:','https:'].includes(new URL(s).protocol)).optional(),proof}).strict();
export const comparisonIntakeSchema=z.object({
 version:z.literal(1),studyId:z.literal('CH01'),fictional:z.literal(true),title:text,question:text,notes:z.string().min(1).max(12000),known:text,gap:text,
 area:text,latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),radius:z.literal(8000),
 date:z.literal('2026-09-08'),activity:text,category:z.literal('all_places'),
 references:z.array(reference).length(3),candidates:z.array(candidate).length(5),
}).strict().superRefine((v,ctx)=>{
 const expected=[['Interstellar','movie',2014],['Inception','movie',2010],['Daft Punk','artist',undefined]];
 if(v.references.some((r,i)=>r.label!==expected[i][0]||r.kind!==expected[i][1]||r.year!==expected[i][2]))ctx.addIssue({code:'custom',message:'CH01 requires its three verified reference identities and film versions.'});
 if(!candidateEntityIdsSchema.safeParse(v.candidates.map(c=>c.entityId)).success||new Set(v.references.map(r=>r.entityId.toLowerCase())).size!==3)ctx.addIssue({code:'custom',message:'Canonical identities must be unique.'});
});
export type ComparisonIntake=z.infer<typeof comparisonIntakeSchema>;
export const createCaseSchema=z.union([z.object({example:z.boolean().optional()}).strict(),z.object({fromDemo:z.literal('ch01')}).strict()]);
export class ComparisonUnavailable extends Error {}

// Explicit projection: recorded results and operational records have no path into this case.
export function createComparisonCase(id:string,input:unknown):CaseFile {
 const v=comparisonIntakeSchema.parse(input),file=blankCase(id);
 return {...file,title:v.title,question:v.question,notes:v.notes,
  caseContext:{known:v.known,gap:v.gap},area:v.area,latitude:v.latitude,longitude:v.longitude,radius:v.radius,
  startDate:v.date,endDate:v.date,activity:v.activity,category:v.category,referenceRelation:'chose_place',
  origin:{kind:'demo_comparison',studyId:'CH01',fictional:true},candidateEntityIds:v.candidates.map(c=>c.entityId),
  clues:v.references.map((r,i)=>({id:`CH01-ref-${i+1}`,label:r.label,kind:r.kind,provenance:'supplied_interest',enabled:true,
    entity:{id:r.entityId,name:r.entityName,kind:r.kind},matches:[{id:r.entityId,name:r.entityName,kind:r.kind}]})),
  leads:v.candidates.map(c=>({id:c.entityId,name:c.name,address:c.address,...(c.website?{website:c.website}:{}),tags:[],introducedBy:'supplied:ch01-intake',note:'Supplied candidate in a fictional case; identity resolved from a recorded Qloo search, not a new discovery.'})),
 };
}
