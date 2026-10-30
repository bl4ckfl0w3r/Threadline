import type { CaseFile } from '@/lib/contracts';
import { AppError, bindings } from './runtime';
import type {AgentRequestContext} from '../lib/contracts.ts';
import { beginReceipt, endReceipt } from './store';
import { isLeadHost } from '../lib/source-hosts.ts';

export function sourceURL(value:string,leadWebsite?:string) {
  const url=new URL(value);if(url.protocol==='http:' && isLeadHost(url.hostname,leadWebsite))url.protocol='https:';const allowed=(bindings().SOURCE_ALLOWED_HOSTS||'www.ica.art,ica.art,www.bookandrecordbar.co.uk,bookandrecordbar.co.uk,www.roughtrade.com,roughtrade.com').split(',').map(s=>s.trim().toLowerCase());
  if(url.protocol!=='https:' || url.username || url.password || (url.port && url.port!=='443') || !(allowed.includes(url.hostname) || isLeadHost(url.hostname,leadWebsite)))throw new AppError('Automatic reading is not enabled for this website. Open the page and attach an excerpt instead.',422,'source_host_unavailable');
  return url;
}
function textFromHTML(html:string) {return html.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,code:string)=>{const value=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):parseInt(code,10);return value>0 && value<=0x10ffff?String.fromCodePoint(value):' ';}).replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();}
export async function inspect(owner:string,file:CaseFile,leadId:string,value:string,context?:AgentRequestContext) {
  const lead=file.leads.find(l=>l.id===leadId);if(!lead)throw new AppError('Choose a place in this case.');
  let url=sourceURL(value,lead.website);
  const receipt=await beginReceipt(owner,file.id,'source',{leadId,url:url.href},undefined,context);
  let status=0;let recorded=false;
  try {
    let response:Response|undefined;
    for(let i=0;i<4;i++){
      response=await fetch(url,{redirect:'manual',headers:{Accept:'text/html,text/plain','User-Agent':'Threadline/0.1 public-source research'},signal:AbortSignal.timeout(15000)});
      status=response.status;
      if(status>=300 && status<400){const target=response.headers.get('location');await response.body?.cancel();if(!target)throw new Error('Missing redirect');url=sourceURL(new URL(target,url).href,lead.website);continue;}break;
    }
    if(!response || !response.ok)throw new AppError('This source could not be read. You can open it and attach an excerpt.',502,'source_unavailable');
    if(!/text\/html|text\/plain/.test(response.headers.get('content-type')||''))throw new AppError('Attach an excerpt for this source format.',422,'source_format');
    // Only the start of a page is kept, so a long page is read in part rather than refused.
    const reader=response.body?.getReader();if(!reader)throw new Error('Empty response');const chunks:Uint8Array[]=[];let size=0;
    while(size<700000){const {done,value:chunk}=await reader.read();if(done)break;size+=chunk.byteLength;chunks.push(chunk);}
    if(size>=700000)await reader.cancel();
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const raw=new TextDecoder().decode(bytes);
    const text=textFromHTML(raw).slice(0,32000);const title=textFromHTML(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]||lead.name).slice(0,200);
    if(!text)throw new AppError('This page has no readable text. Open it and attach an excerpt instead.',422,'source_format');
    await endReceipt(owner,file.id,'source',receipt,status,{url:url.href,title,text});recorded=true;
    file.sources.push({id:crypto.randomUUID(),leadId,title,url:url.href,excerpt:text.slice(0,1800),kind:'public_page',mode:'live',capturedAt:new Date().toISOString(),note:'Page text retrieved. Review the relevant passage, date and publisher before relying on it; a page does not establish attendance.',receiptId:receipt});
    return {receipt,title:'Source captured',detail:`${title}. Review the passage and note what it supports.`};
  }catch(error){if(!recorded)await endReceipt(owner,file.id,'source',receipt,status,{error:'Source retrieval failed; no fact established.'});if(error instanceof AppError)throw error;throw new AppError('The page could not be read. Attach an excerpt to continue.',502,'source_unavailable');}
}
