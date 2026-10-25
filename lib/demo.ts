import type { CaseFile, Clue, Lead, Query, Source } from './contracts';

export type DemoData = {
  title: string; notes: string; area: string; startDate: string; endDate: string;
  activity: string; clues: Clue[]; queries: Query[]; leads: Lead[];
  jointId: string; singleId: string; baselineId: string; candidateId: string;
  source: Source;
};

// A demo is a projection of recorded evidence, never a substitute for a live run.
export function buildDemo(file: CaseFile): DemoData | null {
  const queries = file.queries.filter(q => q.mode === 'recorded' && q.receiptId);
  const joint = queries.find(q => q.clueIds.length === 2);
  if (!joint || joint.clueIds.some(id => !file.clues.some(c => c.id === id))) return null;
  const sameScope = (q: Query) => q.category === joint.category &&
    q.geography.latitude === joint.geography.latitude &&
    q.geography.longitude === joint.geography.longitude &&
    q.geography.radius === joint.geography.radius;
  const comparable = queries.filter(sameScope);
  const baseline = comparable.find(q => q.clueIds.length === 0);
  if (!baseline) return null;
  for (const single of comparable.filter(q => q.clueIds.length === 1 && joint.clueIds.includes(q.clueIds[0]))) {
    const otherSingles = comparable.filter(q => q.clueIds.length === 1 && q.id !== single.id && joint.clueIds.includes(q.clueIds[0]));
    if (!otherSingles.length) continue;
    const candidateId = single.leadIds.find(id =>
      !joint.leadIds.includes(id) && !baseline.leadIds.includes(id) &&
      otherSingles.every(q => !q.leadIds.includes(id)) &&
      file.leads.some(l => l.id === id) &&
      file.sources.some(s => s.leadId === id && s.mode === 'recorded'));
    if (!candidateId) continue;
    const source = file.sources.find(s => s.leadId === candidateId && s.mode === 'recorded')!;
    return {
      title: file.title, notes: file.notes, area: file.area,
      startDate: file.startDate, endDate: file.endDate, activity: file.activity,
      clues: file.clues.map(({ matches: _matches, ...clue }) => clue),
      queries, leads: file.leads, jointId: joint.id, singleId: single.id,
      baselineId: baseline.id, candidateId, source,
    };
  }
  return null;
}
