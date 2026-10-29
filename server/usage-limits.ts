export class UsageLimitError extends Error {
  status = 429;
  code = 'usage_limit';
}

export const BUDGET_SQL = `INSERT INTO usage_buckets (bucket,used,expires_at) VALUES (?,1,?)
ON CONFLICT(bucket) DO UPDATE SET used=used+1 WHERE used<? RETURNING used`;

export async function reserveBudget(db: D1Database, bucket: string, limit: number, seconds: number, now = Date.now()) {
  const interval = Math.floor(now / (seconds * 1000));
  const row = await db.prepare(BUDGET_SQL).bind(`${bucket}:${interval}`, (interval + 1) * seconds * 1000, limit).first<{used:number}>();
  if (!row) throw new UsageLimitError('This preview has reached a usage limit. Please try again later.');
}

export async function clientBucket(request: Request, secret: string) {
  // Cloudflare supplies this header; the address itself is never stored.
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// One statement reserves every bucket or none. SELECT reads the pre-update snapshot.
export const RESERVE_RESEARCH_SQL = `
INSERT INTO usage_buckets (bucket,used,expires_at)
SELECT json_extract(value,'$.bucket'), ?, json_extract(value,'$.expiresAt')
FROM json_each(?)
WHERE NOT EXISTS (
  SELECT 1 FROM json_each(?) AS limits
  LEFT JOIN usage_buckets AS b ON b.bucket=json_extract(limits.value,'$.bucket')
  WHERE coalesce(b.used,0)+? > json_extract(limits.value,'$.limit')
) AND (SELECT count(*) FROM receipts WHERE owner=? AND phase='attempt' AND created_at>?)
  + (SELECT coalesce(sum(used),0) FROM usage_buckets WHERE substr(bucket,1,length(?))=? AND expires_at>?) + ? <= 200
ON CONFLICT(bucket) DO UPDATE SET used=used+excluded.used
RETURNING bucket`;

export type ResearchReservation = { remaining: number; buckets: string[]; pendingBucket: string };
export async function reserveResearchBudget(db:D1Database, owner:string, provider:string, count:number, now=Date.now()):Promise<ResearchReservation> {
  if(!Number.isInteger(count)||count<1)throw new Error('A positive request count is required.');
  const interval=Math.floor(now/86400000);
  const limits=[{bucket:`research-owner:${owner}:${interval}`,limit:200,expiresAt:(interval+1)*86400000},
    {bucket:`research-global:${interval}`,limit:1000,expiresAt:(interval+1)*86400000},
    ...(provider==='model'?[{bucket:`model-global:${interval}`,limit:100,expiresAt:(interval+1)*86400000}]:[])];
  const pendingPrefix=`research-pending:${owner}:`;
  const pendingBucket=pendingPrefix+crypto.randomUUID();
  // This lease only covers the gap before each attempt receipt is inserted.
  limits.push({bucket:pendingBucket,limit:200,expiresAt:now+150000});
  const encoded=JSON.stringify(limits);
  const rows=await db.prepare(RESERVE_RESEARCH_SQL).bind(count,encoded,encoded,count,owner,new Date(now-86400000).toISOString(),pendingPrefix,pendingPrefix,now,count).all();
  if(rows.results.length!==limits.length)throw new UsageLimitError(`The remaining research allowance cannot cover ${count} request${count===1?'':'s'}. No provider request was made.`);
  return {remaining:count,buckets:limits.map(l=>l.bucket),pendingBucket};
}
export async function releaseResearchBudget(db:D1Database, reservation:ResearchReservation) {
  if(!reservation.remaining)return;
  await db.prepare('UPDATE usage_buckets SET used=max(0,used-?) WHERE bucket IN (SELECT value FROM json_each(?))')
    .bind(reservation.remaining,JSON.stringify(reservation.buckets)).run();
  reservation.remaining=0;
}

export async function caseUsage(db:D1Database,owner:string,caseId:string) {
  const result=await db.prepare(`SELECT a.provider, count(*) AS attempts,
    sum(CASE WHEN r.status>=200 AND r.status<300 THEN 0 ELSE 1 END) AS failed
    FROM receipts a LEFT JOIN receipts r ON r.id=a.id||':result' AND r.owner=a.owner AND r.case_id=a.case_id AND r.provider=a.provider AND r.phase='result'
    WHERE a.owner=? AND a.case_id=? AND a.phase='attempt' GROUP BY a.provider`).bind(owner,caseId).all<{provider:string;attempts:number;failed:number}>();
  const qloo=result.results.find(r=>r.provider==='qloo'),model=result.results.find(r=>r.provider==='model');
  return {qlooAttempts:qloo?.attempts||0,qlooFailed:qloo?.failed||0,modelAttempts:model?.attempts||0,modelFailed:model?.failed||0};
}
