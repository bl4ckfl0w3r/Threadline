import type{DemoDataV2}from'../../lib/contracts.ts';
export function checksScore(data:DemoDataV2){
 const [listed,qloo]=data.arms,target=data.highlightedLeadId;
 const reached=(arm:typeof listed)=>arm.inspections.find(i=>i.leadId===target&&i.found==='match')?.order;
 const actual=(label:string,arm:typeof listed)=>{const at=reached(arm);return{label,value:at?`Check ${at}`:'Not reached',note:at?'Recorded run':`In ${arm.inspections.length} check${arm.inspections.length===1?'':'s'} · recorded run`};};
 const controlAt=data.control.order.find(o=>o.leadId===target)?.rank;
 return [actual('Listed order',listed),{label:'Qloo, no favourites',value:controlAt===undefined?'Not returned':controlAt<=data.inspectionBudget?`Check ${controlAt}`:'Outside the check budget',note:'Order only · not run'},actual('Qloo, with favourites',qloo)];
}
