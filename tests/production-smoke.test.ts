import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {demoFixture} from './fixtures/demo-v2.ts';

test('release verification checks the UI V2 recording and rejects missing or old demo data',()=>{
 const directory=mkdtempSync(join(tmpdir(),'threadline-smoke-'));
 const revision='a'.repeat(40),entry=fileURLToPath(new URL('../scripts/verify-production.mjs',import.meta.url));
 try{
  for(const mode of ['missing','v1','valid']){
   const preload=join(directory,`${mode}.mjs`);
   writeFileSync(preload,`const recording=${JSON.stringify(demoFixture())};
globalThis.fetch=async(input,init)=>{
 const url=new URL(input);
 if(url.pathname==='/')return new Response('Home',{headers:{'X-Threadline-Revision':'${revision}','X-Robots-Tag':'noindex','Set-Cookie':'test-session=value; Secure; HttpOnly'}});
 if(url.pathname==='/api/status')return Response.json({storage:true,signedIn:true,qloo:true});
 if(url.pathname==='/api/cases')return init?.headers?.Cookie?Response.json({cases:[]}):Response.json({error:'No session'},{status:401});
 if(url.pathname==='/api/demo'){
  if(url.searchParams.get('version')!=='2')return Response.json({demo:{version:1}});
  return ${mode==='missing'?"Response.json({code:'demo_unavailable'},{status:503})":mode==='v1'?"Response.json({demo:{version:1}})":"Response.json({demo:recording})"};
 }
 throw new Error('Unexpected smoke request');
};
`);
   const result=spawnSync(process.execPath,['--experimental-strip-types','--import',preload,entry,'https://threadline.test',revision],{encoding:'utf8',timeout:10000});
   assert.ifError(result.error);
   assert.equal(result.status,mode==='valid'?0:1,result.stderr);
   if(mode==='valid')assert.match(result.stdout,/demo passed/);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});
