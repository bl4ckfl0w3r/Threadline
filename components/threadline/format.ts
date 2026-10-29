const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function parts(iso: string) {
  const match=/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(iso);
  if(!match)return null;
  const date=new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00Z`);
  if(Number.isNaN(date.valueOf())||date.toISOString().slice(0,10)!==iso.slice(0,10))return null;
  return {y:Number(match[1]),m:Number(match[2]),d:Number(match[3])};
}
/** "2026-09-08" → "8 September 2026"; ISO timestamps keep only the date. */
export function humanDate(iso: string, withYear = true): string {
  const p = parts(iso);
  return p ? `${p.d} ${months[p.m - 1]}${withYear ? ` ${p.y}` : ''}` : iso;
}
/** "2026-09-01", "2026-09-21" → "1–21 September 2026" */
export function humanRange(start?: string, end?: string): string {
  const a = start ? parts(start) : null, b = end ? parts(end) : null;
  if (!a && !b) return '';
  if (!a || !b) return [start,end].filter((value):value is string=>!!value).map(value=>humanDate(value)).join(' – ');
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? humanDate(start!) : `${a.d}–${b.d} ${months[a.m - 1]} ${a.y}`;
  return a.y === b.y ? `${humanDate(start!, false)} – ${humanDate(end!)}` : `${humanDate(start!)} – ${humanDate(end!)}`;
}
/** UK postcode when present, otherwise the last part of the address. */
export function placeHint(address?: string): string {
  if (!address) return '';
  return address.match(/[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}/)?.[0] || address.split(',').map(s => s.trim()).filter(Boolean).at(-1) || '';
}
