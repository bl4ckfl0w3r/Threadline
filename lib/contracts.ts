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
export type Query = { id: string; label: string; mode: 'live' | 'recorded'; createdAt: string; clueIds: string[]; leadIds: string[]; affinities: Record<string, number>; warnings: string[]; receiptId: string; geography: { latitude: number; longitude: number; radius: number }; category: string; inputSnapshot?: QueryInputSnapshot; rawRows?: unknown[] };
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
};
export type Enquiry = {
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
export type Activity = { id: string; at: string; kind: 'research' | 'source' | 'agent' | 'error' | 'edit'; title: string; detail: string; receiptId?: string };
export type CaseFile = {
  id: string; revision: number; title: string; question: string; notes: string;
  caseContext?: { known: string; gap: string };
  area: string; latitude: number; longitude: number; radius: number;
  startDate: string; endDate: string; activity: string; category: 'book_store' | 'all_places';
  mode: 'live' | 'recorded'; createdAt: string; updatedAt: string; clues: Clue[];
  leads: Lead[]; queries: Query[]; sources: Source[]; enquiry?: Enquiry; activityLog: Activity[];
  agent: { steps: number; status: 'idle' | 'working' | 'stopped' | 'complete' | 'error'; reason: string };
};
export type Services = { qloo: boolean; model: boolean; storage: boolean; signedIn: boolean; modelName?: string };
export type CaseSummary = Pick<CaseFile, 'id' | 'title' | 'mode' | 'updatedAt'>;
export type CaseEdits = Partial<Pick<CaseFile, 'title' | 'question' | 'notes' | 'caseContext' | 'area' | 'latitude' | 'longitude' | 'radius' | 'startDate' | 'endDate' | 'activity' | 'category' | 'clues' | 'enquiry'>>;
export type ResearchAction =
  | { type: 'resolve'; clueId: string }
  | { type: 'confirm'; clueId: string; entityId: string }
  | { type: 'discover'; clueIds: string[] }
  | { type: 'source'; leadId: string; title: string; url?: string; excerpt: string; note: string; kind: 'user_record' | 'user_excerpt' }
  | { type: 'inspect'; leadId: string; url: string }
  | {
      type: 'record_enquiry_response';
      leadId: string;
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
  | { type: 'agent_reset' };
export type ApiFailure = { error: string; code: string };
