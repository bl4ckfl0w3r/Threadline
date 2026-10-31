export type EntityKind = 'artist' | 'book' | 'brand' | 'movie' | 'place';
export type Step = 'case' | 'leads' | 'sources' | 'enquiry';
export type Entity = { id: string; name: string; kind: EntityKind };
export type Clue = { id: string; label: string; kind: EntityKind; provenance: 'supplied_interest' | 'observation' | 'uncertain'; enabled: boolean; entity?: Entity; matches?: Entity[] };
export type Lead = { id: string; name: string; address: string; latitude?: number; longitude?: number; website?: string; tags: string[]; introducedBy: string; note?: string };
export type QueryInputSnapshot = {
  category: string;
  geography: { latitude: number; longitude: number; radius: number };
  clues: Array<{ id: string; label: string; entityId?: string; entityName?: string; provenance: string }>;
};
export type Query = { scope?: QueryScope; controlQueryId?: string; id: string; label: string; mode: 'live' | 'recorded'; createdAt: string; clueIds: string[]; leadIds: string[]; affinities: Record<string, number>; warnings: string[]; receiptId: string; geography: { latitude: number; longitude: number; radius: number }; category: string; inputSnapshot?: QueryInputSnapshot; rawRows?: unknown[] };
export type Source = { id: string; leadId: string; title: string; url?: string; excerpt: string; kind: 'public_page' | 'user_record' | 'user_excerpt'; mode: 'live' | 'recorded' | 'supplied'; capturedAt: string; note: string; receiptId?: string };
export type EnquiryResponse = {
  id: string;
  respondent: string;
  receivedAt: string;
  passage: string;
  outcomeBranch: 'confirming' | 'conflicting' | 'unavailable';
  sourceIds?: string[];
  whatChanges?: string;
  unresolved?: string;
  summary?: string;
  receiptId?: string;
  selectedBranchText?: string;
  answeredQuestion?: string;
};
export type Enquiry = {
  whyThisCheck?: string;
  recordTarget?: string;
  leadId: string;
  question: string;
  rationale: string;
  sourceIds: string[];
  confirming: string;
  conflicting: string;
  unavailable: string;
  draft: string;
  response?: EnquiryResponse;
  responses?: EnquiryResponse[];
  outcomeBranch?: 'confirming' | 'conflicting' | 'unavailable';
  revisedActionText?: string;
  decisionSummary?: string;
  history?: Array<{ enquiry: Enquiry; recordedAt: string }>;
};
export type AgentRequestContext = { runId: string; step: number };
export type AgentRequestUsage = CaseUsage & { sourceAttempts: number; sourceFailed: number };
export type AgentRunSummary = { runId: string; usage: AgentRequestUsage; steps: Array<{step:number;usage:AgentRequestUsage}> };
export type Activity = { runId?: string; step?: number; id: string; at: string; kind: 'research' | 'source' | 'agent' | 'error' | 'edit'; title: string; detail: string; receiptId?: string };
export type CaseFile = {
  candidateEntityIds?: string[];
  origin?: { kind: 'demo_comparison'; studyId: 'CH01'; fictional: true };
  referenceRelation?: 'chose_place' | 'observed_at_place' | 'personal_interests';
  id: string; revision: number; title: string; question: string; notes: string;
  caseContext?: { known: string; gap: string };
  area: string; latitude: number; longitude: number; radius: number;
  startDate: string; endDate: string; activity: string; category: 'book_store' | 'all_places';
  mode: 'live' | 'recorded'; createdAt: string; updatedAt: string; clues: Clue[];
  leads: Lead[]; queries: Query[]; sources: Source[]; enquiry?: Enquiry; activityLog: Activity[];
  agent: { runId?:string; startedAt?:string; continuedFromEnquiry?:boolean; stopReason?:'ask'|'limit'|'manual'|'error'; pendingQuestion?:{id:string;question:string;reason:string;inputFingerprint:string}; reviewedResponseIds?:string[]; steps: number; status: 'idle' | 'working' | 'stopped' | 'complete' | 'error'; reason: string };
};
export type Services = { qloo: boolean; model: boolean; storage: boolean; signedIn: boolean; modelName?: string };
export type CaseSummary = Pick<CaseFile, 'id' | 'title' | 'mode' | 'updatedAt'>;
export type CaseEdits = Partial<Pick<CaseFile, 'referenceRelation' | 'title' | 'question' | 'notes' | 'caseContext' | 'area' | 'latitude' | 'longitude' | 'radius' | 'startDate' | 'endDate' | 'activity' | 'category' | 'clues' | 'enquiry'>>;
export type EnquiryIdentity = {
  leadId: string;
  question: string;
  recordTarget?: string;
  confirming: string;
  conflicting: string;
  unavailable: string;
  sourceIds: string[];
};

export type ResearchAction =
  | { type: 'resolve'; clueId: string }
  | { type: 'confirm'; clueId: string; entityId: string }
  | { type: 'discover'; clueIds: string[] }
  | { type: 'run_control'; queryId: string }
  | { type: 'source'; leadId: string; title: string; url?: string; excerpt: string; note: string; kind: 'user_record' | 'user_excerpt' }
  | { type: 'inspect'; leadId: string; url: string }
  | {
      type: 'record_enquiry_response';
      leadId: string;
      expectedQuestion?: string;
      expectedIdentity?: EnquiryIdentity;
      expectedIdentityJson?: string;
      respondent: string;
      receivedAt: string;
      passage: string;
      outcomeBranch: 'confirming' | 'conflicting' | 'unavailable';
      sourceIds?: string[];
      whatChanges?: string;
      unresolved?: string;
      summary?: string;
      revisedActionText?: string;
    }
  | { type: 'agent_step' }
  | { type: 'agent_reset' }
  | { type: 'agent_continue' };
export type ApiFailure = { error: string; code: string };

export type QueryScope = {
  endpoint: string; filterType: string; category: string; tags: string[];
  geography: { latitude: number; longitude: number; radius: number };
  take: number; candidateEntityIds?: string[];
};
export type PlaceMovement = {
  leadId: string; controlRank?: number; seededRank?: number;
  change: 'up' | 'down' | 'same' | 'new' | 'dropped'; delta?: number;
};
export type ReferenceChange = {
  compatible: boolean; reason?: string; controlQueryId: string; seededQueryId: string;
  capturedAt: { control: string; seeded: string }; warnings: string[];
  places: PlaceMovement[];
  counts: { up: number; down: number; same: number; new: number; dropped: number };
};
export type CaseUsage = { qlooAttempts: number; qlooFailed: number; modelAttempts: number; modelFailed: number };


export type DemoRankedPlace = { leadId: string; rank: number; affinity?: number };

export type DemoQuery = {
  id: string;
  role: 'control' | 'seeded';
  label: string;                 // e.g. "Without the references", "With the organiser's references"
  clueIds: string[];             // [] for the control
  scope: QueryScope;             // section 4.2; identical for control and seeded
  order: DemoRankedPlace[];      // the five candidate venues, in provider order
  receiptId: string;
  capturedAt: string;            // ISO
};

export type DemoRecordField = { label: string; value: string; matchesIntake?: boolean };

export type DemoRecord = {
  id: string;                    // e.g. "CH01-L04-D01"
  leadId: string;
  type: string;                  // e.g. "receiving ledger"
  fictional: true;
  excerpt: string;               // the relevant rows only, verbatim
  fields: DemoRecordField[];     // what the UI highlights
};

export type DemoInspection = {
  order: number;                 // 1..3
  leadId: string;
  reason: string;                // short, from the run's request
  found: 'match' | 'related' | 'nothing_relevant';
  recordIds: string[];
};

export type DemoArm = {
  id: 'listed' | 'qloo';
  label: string;                 // "Listed order" / "Qloo order with the references"
  whyThisOrder: string;          // listed: from runs/A initial.json ("nothing distinguished the sites")
  inspections: DemoInspection[];
  outcome: string;               // one bounded sentence
};

export type DemoDecision = { step: number; action: string; reason: string };

export type DemoDataV2 = {
  version: 2;
  study: { id: 'CH01'; label: string };   // study identifier, not an investigator case ID
  title: string;                 // "The unreturned screening drive"
  intake: {
    summary: string;             // two or three sentences, story voice
    item: string;                // "SD-2716"
    handoverDate: string;        // "2026-09-08"
    caseDescription: string;     // "black hard case, recently replaced orange latch"
    slip: { visible: string[]; missing: string };   // ["R41", "17:__"], "venue line"
    area: string;                // "London"
  };
  bridge: string;                // "She chose and booked the cinema. Nothing yet links her favourites to that booking."
  references: Array<{ id: string; label: string; kind: 'movie' | 'artist'; suppliedBy: string; relation: 'chose_place' }>;
  candidates: Array<{ leadId: string; name: string; address: string; listedPosition: number }>;
  inspectionBudget: number;      // 3
  control: DemoQuery;
  seeded: DemoQuery;
  highlightedLeadId: string;     // "L04" (Prince Charles Cinema)
  arms: [DemoArm, DemoArm];      // listed first, qloo second
  records: DemoRecord[];         // only records an arm actually inspected
  openQuestion: string;          // the unproven docket join, bounded
  nextRequest: {
    leadId: string;
    request: string;             // docket QN-644 contents / collection manifest, depot intake or proof of delivery
    confirming: string;
    conflicting: string;
    unavailable: string;
  };
  agentDecisions: DemoDecision[];  // from the Qloo arm's decision log, labelled as a recorded study run
  usage: { qlooAttempts: number; qlooFailed: number; webRequests: number };   // attempts counted once
  provenance: {
    realData: string;            // "Venue names and Qloo responses are real, captured 25 October 2026."
    fictionalData: string;       // "The incident and operational records are fictional."
    runLabel: string;            // "Recorded research runs in the study harness (both arms used a language model), not the app's live agent."
    caveat: string;              // "Without the references, Qloo ranked this site second."
    counterfactual: string;      // "Qloo's order without the references would also have reached it, at the second inspection. This follows from the recorded order; that queue was not run as a third investigator."
  };
};
