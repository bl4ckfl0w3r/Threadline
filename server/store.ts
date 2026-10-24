import type { CaseFile } from '@/lib/contracts';
import { database, AppError } from './runtime';

export async function listCases(owner:string) {
  const result=await database().prepare('SELECT id,title,mode,updated_at AS updatedAt FROM cases WHERE owner=? ORDER BY updated_at DESC LIMIT 40').bind(owner).all();return result.results;
}
export async function readCase(owner:string,id:string):Promise<CaseFile> {
  const row=await database().prepare('SELECT document FROM cases WHERE id=? AND owner=?').bind(id,owner).first<{document:string}>();
  if(!row)throw new AppError('This case is not available.',404,'case_not_found');return JSON.parse(row.document);
}
export async function createCase(owner:string,file:CaseFile) {
  const count=await database().prepare('SELECT count(*) AS total FROM cases WHERE owner=?').bind(owner).first<{total:number}>();
  if((count?.total||0)>=40)throw new AppError('The workspace has reached its 40-case limit.',429,'case_limit');
  await database().prepare('INSERT INTO cases (id,owner,title,mode,document,revision,updated_at) VALUES (?,?,?,?,?,?,?)').bind(file.id,owner,file.title,file.mode,JSON.stringify(file),file.revision,file.updatedAt).run();return file;
}
export async function acquire(owner:string,id:string,revision:number) {
  const token=crypto.randomUUID();
  const result=await database().prepare('UPDATE cases SET lock_token=?,locked_until=? WHERE id=? AND owner=? AND revision=? AND locked_until<?').bind(token,Date.now()+150000,id,owner,revision,Date.now()).run();
  if(result.meta.changes!==1)throw new AppError('This case changed or is researching. Reload it before continuing.',409,'case_conflict');return token;
}
export async function release(owner:string,id:string,token:string) {await database().prepare('UPDATE cases SET lock_token=NULL,locked_until=0 WHERE id=? AND owner=? AND lock_token=?').bind(id,owner,token).run();}
export async function saveCase(owner:string,file:CaseFile,token:string) {
  const next={...file,revision:file.revision+1,updatedAt:new Date().toISOString()};
  const result=await database().prepare('UPDATE cases SET title=?,mode=?,document=?,revision=?,updated_at=?,lock_token=NULL,locked_until=0 WHERE id=? AND owner=? AND revision=? AND lock_token=?').bind(next.title,next.mode,JSON.stringify(next),next.revision,next.updatedAt,next.id,owner,file.revision,token).run();
  if(result.meta.changes!==1)throw new AppError('The case changed during this action. Reload it to continue.',409,'case_conflict');return next;
}
// Attempt and result are distinct immutable rows, including failed provider attempts.
export async function beginReceipt(owner:string,caseId:string,provider:string,request:unknown) {
  const count=await database().prepare("SELECT count(*) AS total FROM receipts WHERE owner=? AND phase='attempt' AND created_at>?").bind(owner,new Date(Date.now()-86400000).toISOString()).first<{total:number}>();
  if((count?.total||0)>=200)throw new AppError('The workspace has used its daily research allowance.',429,'research_limit');
  const id=crypto.randomUUID();await database().prepare('INSERT INTO receipts (id,case_id,owner,provider,phase,request,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,caseId,owner,provider,'attempt',JSON.stringify(request),new Date().toISOString()).run();return id;
}
export async function endReceipt(owner:string,caseId:string,provider:string,id:string,status:number,response:unknown) {
  await database().prepare('INSERT INTO receipts (id,case_id,owner,provider,phase,request,response,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id+':result',caseId,owner,provider,'result',JSON.stringify({attempt:id}),JSON.stringify(response),status,new Date().toISOString()).run();
}
