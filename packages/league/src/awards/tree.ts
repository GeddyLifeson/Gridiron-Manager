// C9.4.1 the coaching tree. An edge runs from a head coach to an assistant after enough full seasons
// together; a shorter stint is "worked with". Tree standing is the later success of former assistants,
// discounted by time, and is a view per observer (X2 reputation rule): an observer who lost to those
// assistants rates the tree higher. The user's tree starts empty and grows only through his assistants.
import { param } from './params.ts';
import type { PersonId, TeamId } from './types.ts';

/** One season an assistant spent on a head coach's staff (from hired and departed events in the log). */
export interface StaffSeason { readonly headCoachId: PersonId; readonly assistantId: PersonId; readonly teamId: TeamId; readonly season: number }

export interface TreeEdge { readonly headCoachId: PersonId; readonly assistantId: PersonId; readonly seasons: number; readonly firstSeason: number; readonly lastSeason: number; readonly kind: 'tree' | 'worked_with' }

/** Every pair with shared seasons; `tree` once the seasons reach the edge threshold. */
export function treeEdges(rows: readonly StaffSeason[]): TreeEdge[] {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (r.headCoachId === r.assistantId) continue;
    const k = `${r.headCoachId}:${r.assistantId}`;
    by.set(k, [...(by.get(k) ?? []), r.season]);
  }
  const need = param('tree.edgeSeasons');
  return [...by].map(([k, seasons]) => {
    const [h, a] = k.split(':').map(Number) as [number, number];
    const uniq = [...new Set(seasons)].sort((x, y) => x - y);
    return { headCoachId: h, assistantId: a, seasons: uniq.length, firstSeason: uniq[0]!, lastSeason: uniq[uniq.length - 1]!, kind: uniq.length >= need ? 'tree' as const : 'worked_with' as const };
  }).sort((x, y) => x.headCoachId - y.headCoachId || x.assistantId - y.assistantId);
}

/** A later job a former assistant held (from the log). */
export interface LaterJob { readonly personId: PersonId; readonly season: number; readonly role: 'head_coach' | 'coordinator' }

/** E5.6.3 input: former assistants who became head coaches after leaving the staff. */
export function treeHeadCoaches(headCoachId: PersonId, edges: readonly TreeEdge[], jobs: readonly LaterJob[]): PersonId[] {
  const mine = edges.filter((e) => e.headCoachId === headCoachId && e.kind === 'tree');
  return mine.filter((e) => jobs.some((j) => j.personId === e.assistantId && j.role === 'head_coach' && j.season > e.lastSeason))
    .map((e) => e.assistantId).sort((a, b) => a - b);
}

/**
 * Tree standing of a head coach as one observer sees it. `lossesTo` counts the observer's losses to each
 * former assistant's teams; each loss raises how much that assistant's later jobs count.
 */
export function treeStanding(headCoachId: PersonId, edges: readonly TreeEdge[], jobs: readonly LaterJob[], season: number,
  lossesTo: (assistantId: PersonId) => number = () => 0): number {
  const discount = param('tree.discountPerSeason');
  let total = 0;
  for (const e of edges) {
    if (e.headCoachId !== headCoachId || e.kind !== 'tree') continue;
    const boost = 1 + param('tree.observerLossWeight') * lossesTo(e.assistantId);
    for (const j of jobs) {
      if (j.personId !== e.assistantId || j.season <= e.lastSeason || j.season > season) continue;
      const w = j.role === 'head_coach' ? param('tree.headCoachWeight') : param('tree.coordinatorWeight');
      let d = 1;
      for (let i = j.season; i < season; i++) d *= discount;
      total += w * d * boost;
    }
  }
  return total;
}
