// UI wording and input matching for the Leads view. Pairing and comparison come
// from the shared helpers in lib/domain.ts (controlFor, whatTheReferencesChanged).
import type { CaseFile, Query, ReferenceChange } from '../../lib/contracts.ts';
import { discoveryScope, sameQueryScope } from '../../lib/domain.ts';

export function sameClues(a: string[], b: string[]) { return new Set(a).size === a.length && new Set(b).size === b.length && a.length === b.length && a.every(id => b.includes(id)); }

/** True when a captured query was run with exactly the case's current inputs: references, confirmed identities, area and category. */
export function matchesInputs(file: CaseFile, query: Query, clueIds: string[]): boolean {
  if (!sameClues(query.clueIds, clueIds)) return false;
  // Legacy queries remain viewable/comparable, but their full input match is unknown.
  if (!query.scope || !sameQueryScope(query.scope, discoveryScope(file))) return false;
  if (!clueIds.length) return true;
  const captured = query.inputSnapshot?.clues;
  if (!captured || !sameClues(captured.map(c => c.id), clueIds)) return false;
  return captured.every(c => !!c.entityId && file.clues.find(x => x.id === c.id && x.enabled)?.entity?.id === c.entityId);
}

export function openingQuery(file:CaseFile):string {
  const ids=file.clues.filter(clue=>clue.enabled).map(clue=>clue.id);
  return (file.queries.filter(query=>matchesInputs(file,query,ids)).at(-1)||file.queries.at(-1))?.id||'';
}

/** "Against the same search without references, the references moved 3 places up, surfaced 5 and dropped 5." */
export function changeSentence(change: ReferenceChange): string {
  const { up, down, new: surfaced, dropped } = change.counts;
  if (!up && !down && !surfaced && !dropped) return 'Against the same search without references, the references didn’t change the returned places or their order.';
  const parts = [up && `moved ${up} place${up === 1 ? '' : 's'} up`, down && `moved ${down} place${down === 1 ? '' : 's'} down`, surfaced && `surfaced ${surfaced}`, dropped && `dropped ${dropped}`].filter(Boolean) as string[];
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return `Against the same search without references, the references ${list}.`;
}
