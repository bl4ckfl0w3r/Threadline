import {createComparisonCase,ComparisonUnavailable}from'../lib/comparison-case.ts';
import {isMissingDemoTable}from'./example-data.ts';
export async function loadComparisonCase(db:D1Database,id:string){
 let row:{document:string}|null;
 try{row=await db.prepare("SELECT document FROM demo_assets WHERE id='ch01-comparison-intake'").first<{document:string}>();}
 catch(error){if(isMissingDemoTable(error))throw new ComparisonUnavailable();throw error;}
 if(!row)throw new ComparisonUnavailable();
 try{return createComparisonCase(id,JSON.parse(row.document));}catch{throw new ComparisonUnavailable();}
}
