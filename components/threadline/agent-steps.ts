// Groups the activity log into the agent's current run for the Research agent timeline.
import type { CaseFile } from '../../lib/contracts.ts';

export type AgentStep={id:string;tool:string;reason:string;result?:{title:string;detail:string}};
type RunActivity=CaseFile['activityLog'][number]&{runId?:string};

/** The agent's steps in its current run. With server run IDs, exactly that run; on older cases, the last `agent.steps` decisions and the result logged straight after each. */
export function agentSteps(f:CaseFile):AgentStep[] {
  const log=f.activityLog as RunActivity[], runId=(f.agent as {runId?:string}).runId;
  let entries=log;
  if(runId)entries=log.filter(a=>a.runId===runId);
  else{if(!f.agent.steps)return [];let seen=0,start=log.length;for(let i=log.length-1;i>=0&&seen<f.agent.steps;i--)if(log[i].kind==='agent'){seen++;start=i;}entries=log.slice(start);}
  const steps:AgentStep[]=[];let previous:RunActivity|undefined;
  for(const a of entries){
    if(a.kind==='agent')steps.push({id:a.id,tool:a.title.replace(/^Agent chose /,''),reason:a.detail});
    else if(a.kind==='research'&&previous?.kind==='agent'&&steps.length&&!steps.at(-1)!.result)steps.at(-1)!.result={title:a.title,detail:a.detail};
    previous=a;
  }
  return steps;
}
