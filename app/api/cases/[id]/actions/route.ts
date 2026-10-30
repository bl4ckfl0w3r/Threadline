import {owner,json,failure,readBody,AppError} from '@/server/runtime';
import {readCase,acquire,saveCase,release} from '@/server/store';
import {actionSchema,draftEnquiry,matchesEnquiryIdentity} from '@/lib/domain';
import {resolveClue,discover,runControl,safeWebsite} from '@/server/qloo';
import {inspect} from '@/server/sources';
import {agentStep} from '@/server/agent';
import type {CaseFile,EnquiryResponse} from '@/lib/contracts';
type Context={params:Promise<{id:string}>};
export async function POST(request:Request,context:Context){
  let user='',id='',token='';let file:CaseFile|undefined;
  try{
    user=await owner(request,true);id=(await context.params).id;const body=await readBody(request);const action=actionSchema.parse(body.action);
    if(!Number.isInteger(body.revision))throw new AppError('A saved case revision is required.');
    file=await readCase(user,id);if(file.revision!==body.revision)throw new AppError('This case changed. Reload to continue.',409,'case_conflict');
    token=await acquire(user,id,body.revision);
    let outcome:{title:string;detail:string;receipt?:string}|undefined;
    if(action.type==='resolve')outcome=await resolveClue(user,file,action.clueId);
    if(action.type==='confirm'){
      const clue=file.clues.find(c=>c.id===action.clueId);const entity=clue?.matches?.find(e=>e.id===action.entityId);
      if(!clue || !entity)throw new AppError('Choose an identity returned for this clue.');clue.entity=entity;outcome={title:'Reference confirmed',detail:entity.name};
    }
    if(action.type==='discover')outcome=await discover(user,file,action.clueIds);
    if(action.type==='run_control')outcome=await runControl(user,file,action.queryId);
    if(action.type==='inspect')outcome=await inspect(user,file,action.leadId,action.url);
    if(action.type==='source'){
      if(!file.leads.some(l=>l.id===action.leadId))throw new AppError('Choose an existing lead.');
      if(action.url && !safeWebsite(action.url))throw new AppError('Use a public HTTP or HTTPS source link.');
      if(file.sources.length>=80)throw new AppError('This case has reached its source limit.',429);
      file.sources.push({id:crypto.randomUUID(),leadId:action.leadId,title:action.title,url:action.url,excerpt:action.excerpt,note:action.note,kind:action.kind,mode:'supplied',capturedAt:new Date().toISOString()});
      outcome={title:'Source note attached',detail:action.title};
    }
    if(action.type==='record_enquiry_response'){
      const lead=file.leads.find(l=>l.id===action.leadId);
      if(!lead)throw new AppError('Choose an existing lead for this enquiry.');
      if(action.sourceIds?.some(id=>!file!.sources.some(s=>s.id===id && s.leadId===action.leadId)))throw new AppError('Sources must belong to the selected lead.');
      if(file.enquiry && file.enquiry.leadId!==action.leadId)throw new AppError('The response target differs from the enquiry being answered. Reload the enquiry before recording a response.',409,'enquiry_conflict');
      if(action.expectedIdentity || action.expectedIdentityJson){
        if(!matchesEnquiryIdentity(file.enquiry, action.expectedIdentity || action.expectedIdentityJson)){
          throw new AppError('The enquiry details changed since this response was drafted. Please review the updated enquiry before recording a response.', 400);
        }
      } else if(action.expectedQuestion && file.enquiry?.question !== action.expectedQuestion){
        throw new AppError('The enquiry question changed since this response was drafted. Please review the updated enquiry before recording a response.', 400);
      }
      if(!file.enquiry || file.enquiry.leadId!==action.leadId){
        file.enquiry=draftEnquiry(file,lead);
      }
      const selectedBranchText=file.enquiry[action.outcomeBranch];
      const answeredQuestion=file.enquiry.question;
      const receipt=`receipt_resp_${crypto.randomUUID().slice(0,8)}`;
      const enquiryResponse:EnquiryResponse={
        id:crypto.randomUUID(),
        respondent:action.respondent,
        receivedAt:action.receivedAt,
        passage:action.passage,
        outcomeBranch:action.outcomeBranch,
        sourceIds:action.sourceIds||[],
        whatChanges:action.whatChanges,
        unresolved:action.unresolved,
        summary:action.summary||`${action.respondent} (${action.outcomeBranch})`,
        receiptId:receipt,
        selectedBranchText,
        answeredQuestion,
      };
      file.enquiry.response=enquiryResponse;
      file.enquiry.responses=[...(file.enquiry.responses||[]),enquiryResponse];
      file.enquiry.outcomeBranch=action.outcomeBranch;
      if(action.revisedActionText || action.whatChanges) file.enquiry.revisedActionText=action.revisedActionText||action.whatChanges;
      if(action.summary) file.enquiry.decisionSummary=action.summary;
      outcome={title:'Enquiry response recorded',detail:`${action.respondent} — ${action.outcomeBranch}`,receipt};
    }
    if(action.type==='agent_step')await agentStep(user,file,request);
    if(action.type==='agent_reset')file.agent={steps:0,status:'idle',reason:''};
    if(outcome)file.activityLog.push({id:crypto.randomUUID(),at:new Date().toISOString(),kind:action.type==='source'||action.type==='inspect'?'source':'research',title:outcome.title,detail:outcome.detail,...(outcome.receipt?{receiptId:outcome.receipt}:{})});
    return json({case:await saveCase(user,file,token)});
  }catch(e){
    if(file && token){
      const errMessage = e instanceof Error ? e.message : 'The action failed.';
      const receiptMatch = errMessage.match(/Receipt:\s*(\S+)/);
      const receiptId = receiptMatch ? receiptMatch[1] : undefined;
      file.activityLog.push({id:crypto.randomUUID(),at:new Date().toISOString(),kind:'error',title:'Research needs attention',detail:e instanceof AppError?e.message:'The action failed. No unsupported result was substituted.',...(receiptId?{receiptId}:{})});
      try{file=await saveCase(user,file,token);const errorResponse=failure(e);const body=await errorResponse.json() as {error:string;code:string};return json({...body,case:file},errorResponse.status);}catch{await release(user,id,token);}
    }
    return failure(e);
  }
}
