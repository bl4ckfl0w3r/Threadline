import type {CaseFile,CaseUsage,AgentRunSummary} from '../../lib/contracts.ts';

export type AgentStep={id:string;step?:number;tool:string;reason:string;result?:{title:string;detail:string};error?:string};
const toolName=(title:string)=>title==='Example research refresh'?'refresh':title.replace(/^Agent chose /,'');
/** Only explicit run/step metadata can associate a tool outcome with a decision. */
export function agentSteps(f:CaseFile):AgentStep[] {
  if(!f.agent.runId)return f.activityLog.filter(a=>a.kind==='agent').slice(-12).map(a=>({id:a.id,tool:toolName(a.title),reason:a.detail}));
  const steps:AgentStep[]=[];
  for(const a of f.activityLog.filter(a=>a.runId===f.agent.runId)){
    if(a.kind==='agent')steps.push({id:a.id,step:a.step,tool:toolName(a.title),reason:a.detail});
    else if(a.kind==='research'||a.kind==='error'){
      let target=a.step===undefined?undefined:steps.find(s=>s.step===a.step);
      if(!target&&a.kind==='error'){target={id:a.id,step:a.step,tool:'model',reason:'The step did not produce a usable result.'};steps.push(target);}
      if(target){if(a.kind==='error')target.error=a.detail;else target.result={title:a.title,detail:a.detail};}
    }
  }
  return steps;
}
export function hasNewEnquiryResponse(f:CaseFile):boolean {
  const reviewed=new Set(f.agent.reviewedResponseIds||[]);
  return f.agent.status==='complete'&&[...(f.enquiry?.responses||[]),...(f.enquiry?.response?[f.enquiry.response]:[])].some(r=>!!r.id&&!!r.passage.trim()&&(!r.answeredQuestion||r.answeredQuestion===f.enquiry?.question)&&!reviewed.has(r.id));
}
export function requestCounts(usage:CaseUsage|AgentRunSummary['usage']):string {
  const source='sourceAttempts' in usage?`, ${usage.sourceAttempts} source`:'';
  const failed=usage.modelFailed+usage.qlooFailed+('sourceFailed' in usage?usage.sourceFailed:0);
  return `${usage.modelAttempts} model, ${usage.qlooAttempts} Qloo${source}${failed?` (${failed} failed or pending provider results)`:''}`;
}
