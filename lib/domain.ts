import { z } from 'zod';
import type { CaseFile, Query, Enquiry, EnquiryResponse, Lead, EnquiryIdentity, QueryScope, ReferenceChange, PlaceMovement, CaseUsage } from './contracts';

export const clueInput = z.object({ id: z.string().min(1).max(80), label: z.string().trim().min(1).max(180), kind: z.enum(['artist','book','brand','movie','place']), provenance: z.enum(['supplied_interest','observation','uncertain']), enabled: z.boolean() });
const date = z.string().refine(value => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)), 'Enter a valid date.');

export const enquiryIdentitySchema = z.object({
  leadId: z.string().max(100),
  question: z.string().max(2000),
  recordTarget: z.string().max(2000).optional(),
  confirming: z.string().max(1500),
  conflicting: z.string().max(1500),
  unavailable: z.string().max(1500),
  sourceIds: z.array(z.string().max(100)).max(20),
});

export const enquiryResponseSchema = z.object({
  id: z.string().max(100),
  respondent: z.string().trim().min(1).max(200),
  receivedAt: date,
  passage: z.string().trim().min(1).max(4000),
  outcomeBranch: z.enum(['confirming', 'conflicting', 'unavailable']),
  sourceIds: z.array(z.string().max(100)).max(20).optional(),
  whatChanges: z.string().trim().max(3000).optional(),
  unresolved: z.string().trim().max(3000).optional(),
  summary: z.string().trim().max(1000).optional(),
  receiptId: z.string().max(100).optional(),
  selectedBranchText: z.string().max(2000).optional(),
  answeredQuestion: z.string().max(2000).optional(),
});

export const enquirySchema: z.ZodType<Enquiry> = z.lazy(() => z.object({
  whyThisCheck: z.string().max(2000).optional(),
  recordTarget: z.string().max(2000).optional(),
  leadId: z.string().max(100),
  question: z.string().max(2000),
  rationale: z.string().max(4000),
  sourceIds: z.array(z.string()).max(20),
  confirming: z.string().max(1500),
  conflicting: z.string().max(1500),
  unavailable: z.string().max(1500),
  draft: z.string().max(12000),
  response: enquiryResponseSchema.optional(),
  responses: z.array(enquiryResponseSchema).max(50).optional(),
  outcomeBranch: z.enum(['confirming', 'conflicting', 'unavailable']).optional(),
  revisedActionText: z.string().max(3000).optional(),
  decisionSummary: z.string().max(1000).optional(),
  history: z.array(z.object({
    enquiry: z.lazy(() => enquirySchema),
    recordedAt: z.string(),
  })).max(100).optional(),
}));

export const editsSchema = z.object({
  referenceRelation: z.enum(['chose_place', 'observed_at_place', 'personal_interests']).optional(),
  title: z.string().trim().min(1).max(160).optional(), question: z.string().max(2000).optional(), notes: z.string().max(12000).optional(), caseContext: z.object({known:z.string().max(3000),gap:z.string().max(3000)}).optional(), area: z.string().max(160).optional(), latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), radius: z.number().int().min(100).max(50000).optional(), startDate: date.optional(), endDate: date.optional(), activity: z.string().max(500).optional(), category: z.enum(['book_store','all_places']).optional(), clues: z.array(clueInput).max(8).optional(), enquiry: enquirySchema.optional(),
});

export const actionSchema = z.discriminatedUnion('type', [
  z.object({type:z.literal('resolve'),clueId:z.string()}),
  z.object({type:z.literal('confirm'),clueId:z.string(),entityId:z.string()}),
  z.object({type:z.literal('discover'),clueIds:z.array(z.string()).max(8)}),
  z.object({type:z.literal('run_control'),queryId:z.string().min(1)}),
  z.object({type:z.literal('source'),leadId:z.string(),title:z.string().trim().min(1).max(200),url:z.string().url().max(2000).optional(),excerpt:z.string().trim().min(1).max(16000),note:z.string().max(3000),kind:z.enum(['user_record','user_excerpt'])}),
  z.object({type:z.literal('inspect'),leadId:z.string(),url:z.string().url().max(2000)}),
  z.object({
    type: z.literal('record_enquiry_response'),
    leadId: z.string().max(100),
    expectedQuestion: z.string().trim().max(2000).optional(),
    expectedIdentity: enquiryIdentitySchema.optional(),
    expectedIdentityJson: z.string().optional(),
    respondent: z.string().trim().min(1).max(200),
    receivedAt: date,
    passage: z.string().trim().min(1).max(4000),
    outcomeBranch: z.enum(['confirming', 'conflicting', 'unavailable']),
    sourceIds: z.array(z.string().max(100)).max(20).optional(),
    whatChanges: z.string().trim().max(3000).optional(),
    unresolved: z.string().trim().max(3000).optional(),
    summary: z.string().trim().max(1000).optional(),
    revisedActionText: z.string().trim().max(3000).optional(),
  }),
  z.object({type:z.literal('agent_step')}),z.object({type:z.literal('agent_reset')}),
]);

export function getEnquiryIdentity(enquiry?: Enquiry): EnquiryIdentity | null {
  if (!enquiry) return null;
  return {
    leadId: enquiry.leadId || '',
    question: enquiry.question || '',
    recordTarget: enquiry.recordTarget || '',
    confirming: enquiry.confirming || '',
    conflicting: enquiry.conflicting || '',
    unavailable: enquiry.unavailable || '',
    sourceIds: [...(enquiry.sourceIds || [])].sort(),
  };
}

export function getEnquiryIdentityJson(enquiry?: Enquiry): string {
  const identity = getEnquiryIdentity(enquiry);
  return identity ? JSON.stringify(identity) : '';
}

export function matchesEnquiryIdentity(
  enquiry: Enquiry | undefined,
  expected: EnquiryIdentity | string | undefined
): boolean {
  if (!expected || !enquiry) return true;
  const currentIdentityJson = getEnquiryIdentityJson(enquiry);
  if (typeof expected === 'string') {
    return currentIdentityJson === expected;
  }
  const expectedNormalizedJson = JSON.stringify({
    leadId: expected.leadId || '',
    question: expected.question || '',
    recordTarget: expected.recordTarget || '',
    confirming: expected.confirming || '',
    conflicting: expected.conflicting || '',
    unavailable: expected.unavailable || '',
    sourceIds: [...(expected.sourceIds || [])].sort(),
  });
  return currentIdentityJson === expectedNormalizedJson;
}

export function blankCase(id: string): CaseFile {
  const now = new Date().toISOString();
  return {id,revision:0,title:'Untitled investigation',question:'Which place’s records should I inspect next?',notes:'',caseContext:{known:'',gap:''},area:'London',latitude:51.5072,longitude:-0.1276,radius:10000,startDate:'',endDate:'',activity:'',category:'book_store',mode:'live',createdAt:now,updatedAt:now,clues:[],leads:[],queries:[],sources:[],activityLog:[],agent:{steps:0,status:'idle',reason:''}};
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

export function validEnquiry(file: CaseFile, enquiry: Enquiry): boolean {
  const leadValid = file.leads.some(l => l.id === enquiry.leadId);
  const sourcesValid = enquiry.sourceIds.every(id => file.sources.some(s => s.id === id && s.leadId === enquiry.leadId));
  const responseSourcesValid = !enquiry.response?.sourceIds || enquiry.response.sourceIds.every(id => file.sources.some(s => s.id === id && s.leadId === enquiry.leadId));
  const responsesValid = !enquiry.responses || enquiry.responses.every(r => !r.sourceIds || r.sourceIds.every(id => file.sources.some(s => s.id === id && s.leadId === enquiry.leadId)));
  const historyValid = !enquiry.history || enquiry.history.every(h => validEnquiry(file, h.enquiry));
  return leadValid && sourcesValid && responseSourcesValid && responsesValid && historyValid;
}

export function isScopeCompatible(current: Query, previous?: Query): boolean {
  if (!previous) return true;
  if (current.scope && previous.scope) return sameQueryScope(current.scope, previous.scope);
  if (!current.geography || !previous.geography) return true;
  return (current.category || '') === (previous.category || '') &&
    current.geography.latitude === previous.geography.latitude &&
    current.geography.longitude === previous.geography.longitude &&
    current.geography.radius === previous.geography.radius;
}

export function compareQueries(current: Query, previous?: Query): { compatible?: boolean; reason?: string; added: string[]; removed: string[]; retained: string[] } {
  if (!previous) return { added: current.leadIds, removed: [] as string[], retained: [] as string[], ...(current.geography ? { compatible: true } : {}) };
  if (current.geography && previous.geography && !isScopeCompatible(current, previous)) {
    return {
      compatible: false,
      reason: `Query scope differs: category '${current.category}' (${current.geography.radius}m) vs '${previous.category}' (${previous.geography.radius}m). Direct comparison is disabled for incompatible query scopes.`,
      added: [] as string[],
      removed: [] as string[],
      retained: [] as string[]
    };
  }
  return {
    added: current.leadIds.filter(id => !previous.leadIds.includes(id)),
    removed: previous.leadIds.filter(id => !current.leadIds.includes(id)),
    retained: current.leadIds.filter(id => previous.leadIds.includes(id)),
    ...(current.geography && previous.geography ? { compatible: true } : {})
  };
}

// A model may propose a draft, but only an investigator can record an answer.
export function applyAgentEnquiry(previous:Enquiry|undefined,generated:Enquiry,now=new Date().toISOString()):Enquiry {
  const draft:Enquiry={leadId:generated.leadId,question:generated.question,recordTarget:generated.recordTarget,
    whyThisCheck:generated.whyThisCheck,rationale:generated.rationale,sourceIds:[...generated.sourceIds],
    confirming:generated.confirming,conflicting:generated.conflicting,unavailable:generated.unavailable,draft:generated.draft};
  if(!previous)return draft;
  if(matchesEnquiryIdentity(previous,getEnquiryIdentity(draft)!))return {...structuredClone(previous),...draft};
  const {history,...answered}=previous;
  if((history?.length||0)>=100)throw new Error('Enquiry history is full. Export this case before starting another enquiry.');
  return {...draft,history:[...structuredClone(history||[]),{enquiry:structuredClone(answered),recordedAt:now}]};
}

export function draftEnquiry(file: CaseFile, lead: Lead, forceRegenerate = false): Enquiry {
  if (!forceRegenerate && file.enquiry && file.enquiry.leadId === lead.id) {
    return file.enquiry;
  }
  const sources=file.sources.filter(s=>s.leadId===lead.id);
  const when=file.startDate ? `between ${file.startDate} and ${file.endDate || file.startDate}` : 'during the relevant period';
  const question=`What record could help establish whether the reported stop was at ${lead.name} ${when}?`;
  const recordTarget='Check dated event listings or venue information for compatibility. If the details fit, identify a case-linked receipt, booking confirmation or other record that could corroborate the stop.';
  const gap=file.caseContext?.gap?.trim() || file.question;
  const fresh: Enquiry = {
    leadId:lead.id,question,recordTarget,whyThisCheck:'',
    rationale:`Case question: ${file.question}\nGap to resolve: ${gap}\n${sources.length ? `${sources.length} attached source record(s) need review against this question.` : 'No supporting source has been attached yet.'} A cultural association does not establish a visit.`,
    sourceIds:sources.map(s=>s.id),
    confirming:'If public facts fit, seek a record tied to the reported stop. If that record corroborates the stop, update the timeline and identify which uncertainty remains.',
    conflicting:'Record what conflicts. A reliable date, branch or activity mismatch can reduce this lead’s priority; a missing web listing alone cannot rule it out.',
    unavailable:'Leave the stop unresolved. Seek another source or a more precise recollection; lack of a response does not disprove a visit.',
    draft:`Subject: Venue and event information — ${lead.name}\n\nI am checking an account involving ${file.activity || 'an unidentified stop'} ${when}. Could you point me to dated event listings or venue information that would help check those details?\n\nI am first trying to establish activity and date compatibility. Whether this was the reported stop remains unresolved.\n\nThank you.`
  };

  if (!file.enquiry) {
    return fresh;
  }

  const stripHistory = (enq: Enquiry): Enquiry => {
    const { history: _, ...clean } = enq;
    return clean;
  };

  const now = new Date().toISOString();
  const existingHistory = file.enquiry.history || [];

  if (file.enquiry.leadId === lead.id && forceRegenerate) {
    const archivedSnapshot = stripHistory(file.enquiry);
    const newHistory = [...existingHistory, { enquiry: archivedSnapshot, recordedAt: now }];
    return {
      ...fresh,
      history: newHistory,
    };
  }

  const historyForTargetIndex = existingHistory.findLastIndex ? existingHistory.findLastIndex(h => h.enquiry.leadId === lead.id) : (() => {
    for (let i = existingHistory.length - 1; i >= 0; i--) {
      if (existingHistory[i].enquiry.leadId === lead.id) return i;
    }
    return -1;
  })();
  if (historyForTargetIndex >= 0 && !forceRegenerate) {
    const targetEntry = existingHistory[historyForTargetIndex];
    const archivedActive = stripHistory(file.enquiry);
    const remainingHistory = existingHistory.filter((_, idx) => idx !== historyForTargetIndex);
    return {
      ...targetEntry.enquiry,
      history: [...remainingHistory, { enquiry: archivedActive, recordedAt: now }],
    };
  }

  const archivedActive = stripHistory(file.enquiry);
  return {
    ...fresh,
    history: [...existingHistory, { enquiry: archivedActive, recordedAt: now }],
  };
}

function formatResponse(r: EnquiryResponse, index: number) {
  const answeredQ = r.answeredQuestion || 'not captured (legacy)';
  const selectedBranch = r.selectedBranchText || 'not captured (legacy)';
  const receipt = r.receiptId ? `\n- Receipt: ${r.receiptId}` : '\n- Receipt: Unspecified (legacy)';
  const sourceHandles = r.sourceIds?.length ? `\n- Sourced Handles: ${r.sourceIds.join(', ')}` : '\n- Sourced Handles: None';

  return `#### Response ${index + 1} (${r.outcomeBranch})
- Answered Question: ${answeredQ}
- Selected Branch Text: ${selectedBranch}
- Record Holder: ${r.respondent}
- Date: ${r.receivedAt}
- Passage/Absence: ${r.passage}${r.summary ? `\n- Summary: ${r.summary}` : ''}${r.whatChanges ? `\n- What Changes: ${r.whatChanges}` : ''}${r.unresolved ? `\n- Open Uncertainties: ${r.unresolved}` : ''}${receipt}${sourceHandles}`;
}

export function exportBrief(file: CaseFile, usage?: CaseUsage) {
  const enquiry=file.enquiry;const lead=file.leads.find(l=>l.id===enquiry?.leadId);
  const responses = enquiry?.responses?.length ? enquiry.responses : (enquiry?.response ? [enquiry.response] : []);
  const responseSection = responses.length
    ? `### Response History\n` + responses.map((r, i) => formatResponse(r, i)).join('\n\n')
    : 'No responses recorded yet.';

  const outcomeText = enquiry?.outcomeBranch
    ? `### Selected Branch Outcome: ${enquiry.outcomeBranch}\n${enquiry.revisedActionText || enquiry.decisionSummary || ''}`
    : '';

  const historySection = enquiry?.history?.length
    ? `\n\n## Archived Enquiry History\n` + enquiry.history.map((h, i) => {
        const archivedLead = file.leads.find(l => l.id === h.enquiry.leadId);
        const archivedResponses = h.enquiry.responses?.length ? h.enquiry.responses : (h.enquiry.response ? [h.enquiry.response] : []);
        const respText = archivedResponses.length
          ? archivedResponses.map((r, ri) => formatResponse(r, ri)).join('\n\n')
          : 'No responses recorded for this archived enquiry.';
        const archivedOutcomeText = h.enquiry.outcomeBranch
          ? `\n\n#### Selected Branch Outcome: ${h.enquiry.outcomeBranch}\n${h.enquiry.revisedActionText || h.enquiry.decisionSummary || ''}`
          : '';
        return `### Archived Enquiry ${i + 1}: ${archivedLead?.name || 'Unresolved Lead'} (${h.recordedAt})\nQuestion: ${h.enquiry.question}\nRecord to check: ${h.enquiry.recordTarget || 'Not specified.'}\n\nWhy this check: ${h.enquiry.whyThisCheck || 'Not specified.'}\n\nRationale:\n${h.enquiry.rationale}\n\nConfirming branch: ${h.enquiry.confirming}\nConflicting branch: ${h.enquiry.conflicting}\nUnavailable branch: ${h.enquiry.unavailable}\n\n${respText}${archivedOutcomeText}\n\n#### Draft (Draft only — no message sent via system)\n${h.enquiry.draft}`;
      }).join('\n\n')
    : '';

  return [
    `# ${file.title}`,
    file.mode==='recorded'?'Fictional example case; recorded results are labelled individually.':'Investigation working brief',
    `Question: ${file.question}`,
    `Reference relation: ${file.referenceRelation || 'Not supplied'}`,
    ...(usage ? [`Research usage: ${usage.qlooAttempts} Qloo attempts (${usage.qlooFailed} failed or pending); ${usage.modelAttempts} model attempts (${usage.modelFailed} failed or pending).`] : []),
    ...(file.enquiry?.whyThisCheck ? [`Why this check: ${file.enquiry.whyThisCheck}`] : []),
    `Area: ${file.area}; centre ${file.latitude}, ${file.longitude}; radius ${file.radius} m`,
    `Period: ${file.startDate||'Not supplied'} to ${file.endDate||'Not supplied'}`,
    `## Reported account\n${file.notes}`,
    `## Known timeline\n${file.caseContext?.known||'Not yet recorded.'}`,
    `## Gap to resolve\n${file.caseContext?.gap||'Not yet recorded.'}`,
    `## Cultural references\n${file.clues.map(c=>`${c.enabled?'Included':'Withdrawn'}: ${c.label} (${c.provenance.replaceAll('_',' ')})`).join('\n')}`,
    enquiry?`## Next enquiry: ${lead?.name||'Unresolved'}\n${enquiry.question}\n\nRecord to check: ${enquiry.recordTarget||'Not specified.'}\n\n${enquiry.rationale}\n\nConfirming response: ${enquiry.confirming}\nConflicting response: ${enquiry.conflicting}\nUnavailable response: ${enquiry.unavailable}\n\n${responseSection}${outcomeText ? `\n\n${outcomeText}` : ''}\n\n### Draft (Draft only — no message sent via system)\n${enquiry.draft}${historySection}`:'## Next enquiry\nNot yet selected.',
    `## Sources\n${file.sources.map(s=>`### ${s.title}\n${s.url||'Investigator-supplied record'}\n${s.kind}; ${s.mode}; captured ${s.capturedAt}\n${s.excerpt}\n${s.note}`).join('\n\n')}`,
    `## Query provenance\n${file.queries.map(q=>`${q.label} — ${q.mode}, ${q.createdAt}; ${q.leadIds.length} returned places; receipt ${q.receiptId}.${q.inputSnapshot ? ` Input snapshot: ${q.inputSnapshot.clues.map(c=>c.label).join(', ')||'None'}.` : ''} ${q.warnings.join(' ')}`).join('\n')}`
  ].join('\n\n');
}


export function sameQueryScope(a: QueryScope, b: QueryScope): boolean {
  const canonical = (s: QueryScope) => JSON.stringify({
    endpoint:s.endpoint,filterType:s.filterType,category:s.category,tags:[...s.tags].sort(),
    geography:{latitude:s.geography.latitude,longitude:s.geography.longitude,radius:s.geography.radius},
    take:s.take,candidateEntityIds:s.candidateEntityIds && [...s.candidateEntityIds].sort(),
  });
  return canonical(a) === canonical(b);
}
// Shared by provider requests and the UI's saved-input matching.
export function discoveryScope(file:CaseFile):QueryScope {
  return {endpoint:'/v2/insights',filterType:'urn:entity:place',category:file.category,
    tags:file.category==='book_store'?['urn:tag:category:place:book_store']:[],
    geography:{latitude:file.latitude,longitude:file.longitude,radius:file.radius},take:20};
}
export function controlFor(file: CaseFile, query: Query, options: { forReuse?: boolean } = {}): Query | undefined {
  if (!query.clueIds.length) return undefined;
  return [...file.queries].reverse().find(q => {
    if(q.id===query.id || q.clueIds.length || q.mode!==query.mode)return false;
    if(query.controlQueryId && query.controlQueryId!==q.id)return false;
    if(query.scope && q.scope)return sameQueryScope(query.scope,q.scope) &&
      (!!query.controlQueryId || q.createdAt.slice(0,10)===query.createdAt.slice(0,10));
    // Historical display may compare legacy category/geography with the warning
    // returned by whatTheReferencesChanged. Missing scope never permits live reuse.
    return !options.forReuse && isScopeCompatible(query,q);
  });
}
export function whatTheReferencesChanged(control: Query, seeded: Query): ReferenceChange {
  const result: ReferenceChange = {
    compatible:isScopeCompatible(seeded,control),controlQueryId:control.id,seededQueryId:seeded.id,
    capturedAt:{control:control.createdAt,seeded:seeded.createdAt},
    warnings:control.scope && seeded.scope ? [] : ['Filters and result limit were not recorded for one of these queries'],
    places:[],counts:{up:0,down:0,same:0,new:0,dropped:0},
  };
  if (!result.compatible) { result.reason='Query scopes differ; direct comparison is disabled.'; return result; }
  const before = providerRanks(control);
  const after = providerRanks(seeded);
  for (const leadId of [...new Set([...seeded.leadIds,...control.leadIds])]) {
    const controlRank=before.get(leadId),seededRank=after.get(leadId);
    const change:PlaceMovement['change']=controlRank===undefined?'new':seededRank===undefined?'dropped':controlRank>seededRank?'up':controlRank<seededRank?'down':'same';
    const movement:PlaceMovement={leadId,controlRank,seededRank,change};
    if(change==='up'||change==='down')movement.delta=controlRank!-seededRank!;
    result.places.push(movement); result.counts[change]++;
  }
  return result;
}

// Accept slim live rows and legacy full rows; skipped or duplicate rows never compress positions.
export function providerRanks(query:Query):Map<string,number> {
  const ranks=new Map<string,number>();
  for(const [index,row] of (query.rawRows||[]).entries()){
    if(!row || typeof row!=='object')continue;
    const value=row as {entity_id?:unknown;ordinal?:unknown};
    if(typeof value.entity_id!=='string'||!query.leadIds.includes(value.entity_id)||ranks.has(value.entity_id))continue;
    const ordinal=typeof value.ordinal==='number'&&Number.isInteger(value.ordinal)&&value.ordinal>=0?value.ordinal:index;
    ranks.set(value.entity_id,ordinal+1);
  }
  query.leadIds.forEach((id,index)=>{if(!ranks.has(id))ranks.set(id,index+1);});
  return ranks;
}
