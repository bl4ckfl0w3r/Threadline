import type {CaseFile, AgentRequestContext} from './contracts.ts';
import {enquiryResponseSchema,validEnquiry} from './domain.ts';

export function startAgentRun(file:CaseFile, now=new Date().toISOString()) {
  file.agent={steps:0,status:'idle',reason:'',runId:crypto.randomUUID(),startedAt:now,
    ...(file.agent.reviewedResponseIds?{reviewedResponseIds:[...file.agent.reviewedResponseIds]}:{})};
}
export function ensureAgentRun(file:CaseFile) {
  // An upgraded legacy run keeps its existing step cap; old entries stay ungrouped.
  file.agent.runId??=crypto.randomUUID();file.agent.startedAt??=new Date().toISOString();
}
export function agentActivityContext(file:CaseFile):Partial<AgentRequestContext> {
  return file.agent.runId?{runId:file.agent.runId,...(file.agent.steps>0?{step:file.agent.steps}:{})}:{};
}
export function continueAgentRun(file:CaseFile) {
  const enquiry=file.enquiry;
  if(file.agent.status!=='complete'||!enquiry||!validEnquiry(file,enquiry))throw new Error('Continue requires a recorded response to the current completed enquiry.');
  const responses=[...(enquiry.responses||[]),...(enquiry.response?[enquiry.response]:[])];
  const reviewed=new Set(file.agent.reviewedResponseIds||[]);
  const fresh=responses.filter(r=>enquiryResponseSchema.safeParse(r).success&&(!r.answeredQuestion||r.answeredQuestion===enquiry.question)&&!reviewed.has(r.id));
  if(!fresh.length)throw new Error('Record a new response to this enquiry before continuing.');
  fresh.forEach(r=>reviewed.add(r.id));
  if(reviewed.size>5000)throw new Error('The response review history is full. Export this case before continuing.');
  startAgentRun(file);file.agent.reviewedResponseIds=[...reviewed];file.agent.continuedFromEnquiry=true;
}

// A judge can start from the supplied example. Refresh it once per explicit
// new run; continuation from an answer must keep following that new evidence.
export function exampleRefreshClueIds(file:CaseFile):string[]|undefined {
  if(file.mode!=='recorded'||file.agent.steps!==0||file.agent.continuedFromEnquiry||!file.queries.length)return;
  const clues=file.clues.filter(c=>c.enabled);
  if(clues.some(c=>!c.entity))return;
  // Re-run the supplied comparison even for legacy examples without a stated
  // reference relationship. Its weakness stays visible; no visit is inferred.
  return clues.map(c=>c.id);
}
