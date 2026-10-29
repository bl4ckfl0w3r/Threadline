import { buildDemoV2 } from '../lib/demo-v2.ts';
import { buildDemo } from '../lib/demo.ts';
import { loadExampleCase, isMissingDemoTable, InvalidDemoData } from './example-data.ts';

// Separate public replay data from the CaseFile used by editable examples.
export async function loadDemoDocument(db:D1Database) {
  try {
    const row=await db.prepare("SELECT document FROM demo_assets WHERE id='ch01-demo'").first<{document:string}>();
    if(!row)return null;
    try{return buildDemoV2(JSON.parse(row.document));}catch{return null;}
  }catch(error){if(isMissingDemoTable(error))return null;throw error;}
}
export async function demoResponse(db:D1Database, version?:string|null) {
  const unavailable={status:503,body:{error:'The recorded demonstration is not installed on this server.',code:'demo_unavailable'}};
  if(version==='2') {
    const demo=await loadDemoDocument(db);
    return demo?{status:200,body:{demo}}:unavailable;
  }
  // The current UI consumes V1. It opts into V2 when its renderer is ready.
  let demo;
  try{demo=buildDemo(await loadExampleCase(db,'demo'));}
  catch(error){if(error instanceof InvalidDemoData)return unavailable;throw error;}
  return demo?{status:200,body:{demo}}:unavailable;
}
