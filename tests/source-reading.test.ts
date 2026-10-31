import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {blankCase} from '../lib/domain.ts';

let results:unknown[][]=[];
const state={bindings:()=>({SOURCE_ALLOWED_HOSTS:'venue.example.org'}),beginReceipt:async()=> 'source-receipt',endReceipt:async(...args:unknown[])=>{results.push(args);}};
(globalThis as unknown as {__sourceReadingTest:typeof state}).__sourceReadingTest=state;
const hooks=registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/server/sources.ts')){
  if(specifier==='./runtime')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent("export class AppError extends Error{constructor(message,status=400,code='invalid_request'){super(message);this.status=status;this.code=code;}}export const bindings=()=>globalThis.__sourceReadingTest.bindings();")};
  if(specifier==='./store')return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent(['beginReceipt','endReceipt'].map(name=>`export const ${name}=(...args)=>globalThis.__sourceReadingTest.${name}(...args);`).join('\n'))};
 }
 return next(specifier,context);
}});
const {inspect}=await import('../server/sources.ts');hooks.deregister();
const originalFetch=globalThis.fetch;
const makeCase=()=>{const file=blankCase('source-case');file.leads=[{id:'venue',name:'Venue',address:'Here',website:'https://venue.example.org/',tags:[],introducedBy:'qloo'}];return file;};

test('one oversized page chunk is capped and explicitly saved as a partial capture',async()=>{
 results=[];let cancelled=false;
 const bytes=new TextEncoder().encode('<title>Events</title><p>'+ 'a'.repeat(710000) + 'AFTER_READ_LIMIT');
 globalThis.fetch=async()=>new Response(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(bytes);},cancel(){cancelled=true;}}),{headers:{'Content-Type':'text/html'}});
 const file=makeCase(),outcome=await inspect('owner',file,'venue','https://venue.example.org/events');
 const receipt=results[0][5] as {text:string;capture:{bytesRead:number;byteLimitReached:boolean;partial:boolean}};
 assert.equal(cancelled,true);assert.equal(receipt.capture.bytesRead,700000);assert.equal(receipt.capture.byteLimitReached,true);assert.equal(receipt.capture.partial,true);assert.equal(receipt.text.length,32000);assert.doesNotMatch(receipt.text,/AFTER_READ_LIMIT/);
 assert.equal(file.sources[0].excerpt.length,1800);assert.match(file.sources[0].note,/Partial page capture/);assert.match(file.sources[0].note,/first 1,800 characters/);assert.match(outcome.title,/partially/);assert.match(outcome.detail,/later content was not reviewed/);
});
test('text clipping is disclosed even when the byte limit is not reached',async()=>{
 results=[];globalThis.fetch=async()=>new Response('x'.repeat(40000),{headers:{'Content-Type':'text/plain'}});
 const file=makeCase();await inspect('owner',file,'venue','https://venue.example.org/');const receipt=results[0][5] as {capture:{byteLimitReached:boolean;textLimitReached:boolean;partial:boolean}};
 assert.deepEqual(receipt.capture,{bytesRead:40000,byteLimitReached:false,textLimitReached:true,partial:true});assert.match(file.sources[0].note,/Partial page capture/);
});
test('a normal page preserves readable text and records complete capture metadata',async()=>{
 results=[];const html='<title>Events &amp; visits</title><nav>Menu</nav><p>Open at 17:00.</p>';
 globalThis.fetch=async()=>new Response(html,{headers:{'Content-Type':'text/html'}});
 const file=makeCase(),outcome=await inspect('owner',file,'venue','https://venue.example.org/');const receipt=results[0][5] as {title:string;text:string;capture:{partial:boolean}};
 assert.equal(receipt.title,'Events & visits');assert.match(receipt.text,/Open at 17:00/);assert.doesNotMatch(receipt.text,/Menu/);assert.equal(receipt.capture.partial,false);assert.equal(outcome.title,'Source captured');assert.doesNotMatch(file.sources[0].note,/Partial/);
});
test('unreadable formats retain a failure receipt and cannot become a source',async()=>{
 results=[];globalThis.fetch=async()=>new Response('PDF bytes',{headers:{'Content-Type':'application/pdf'}});const file=makeCase();
 await assert.rejects(inspect('owner',file,'venue','https://venue.example.org/'),(error:unknown)=>error instanceof Error&&'code' in error&&error.code==='source_format');
 assert.equal(results.length,1);assert.equal(file.sources.length,0);assert.deepEqual(results[0][5],{error:'Source retrieval failed; no fact established.'});
});
test.after(()=>{globalThis.fetch=originalFetch;delete (globalThis as unknown as {__sourceReadingTest?:typeof state}).__sourceReadingTest;});
