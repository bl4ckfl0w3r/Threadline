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
