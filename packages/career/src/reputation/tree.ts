// The coaching tree (E5.4.1, E5.4.2, S11.2.1). The tree is a query over employment history and nothing
// else (contract note in schema world/career.ts): rebuilding it from the same stints gives the same edges.
// An edge says who worked under whom; it never claims the mentor caused anything (E5.4.1 rule 5) and never
// changes a play, a player or a call (E5.4.2 rule 4).
import type { JobHistoryRow, PersonOrigin } from '@gm/schema';

export type RowSource = 'sim' | 'history_run' | 'import' | 'user';
import { paramWith, type Overrides } from './params.ts';

export type Side = 'offense' | 'defense' | 'special_teams' | 'whole_team' | 'support';

/** One job stint with what the tree needs. Build from `JobHistoryRow` with `stintFromHistory`. */
export interface Stint {
  readonly personId: number;
  readonly teamId: number;
  readonly competitionId: number;
  /** E2.1.1 rung; null for seats off the ladder (they make no edges). */
  readonly rung: number | null;
  readonly side: Side;
  /** Seasons completed in the seat, first preseason game to last game (S11.2.1 rule 1). */
  readonly fullSeasonYears: readonly number[];
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  /** `history_run` rows are generated history from before the save began (E5.4.1 acceptance 3). */
  readonly source: RowSource;
}

/** What the adapter needs that a history row does not hold: the seat's rung and side, and which seasons were full. */
export interface StintFacts {
  readonly rung: number | null;
  readonly side: Side;
  readonly competitionId: number;
  readonly fullSeasonYears: readonly number[];
  readonly source: RowSource;
}

export function stintFromHistory(row: JobHistoryRow, facts: StintFacts): Stint {
  return { personId: row.personId, teamId: row.teamId, wins: row.wins, losses: row.losses, ties: row.ties, ...facts };
}

export interface TreeEdge {
  readonly mentorId: number;
  readonly pupilId: number;
  /** Distinct full seasons together, summed over separate spells (S11.2.1 edge case). */
  readonly seasons: number;
  readonly years: readonly number[];
  readonly mentorRung: number;
  /** Highest rung the pupil held under the mentor. */
  readonly pupilRung: number;
  readonly teamIds: readonly number[];
}

export interface Pupil {
  readonly edge: TreeEdge;
  /** E5.4.1 rule 2: later held a seat at least one rung higher for a full season, off the mentor's staff. */
  readonly counts: boolean;
  readonly highestRungLater: number | null;
  readonly becameCoordinator: boolean;
  readonly becameHeadCoach: boolean;
  /** Head coach record after leaving (E5.4.1 rule 4: shown beside him, whatever it is). */
  readonly headCoachRecord: { readonly wins: number; readonly losses: number; readonly ties: number };
}

export interface TreeView {
  readonly rootId: number;
  /** "Comes from": head coaches and coordinators he worked under. */
  readonly mentors: readonly TreeEdge[];
  /** Generation 1: everyone with an edge below him. */
  readonly pupils: readonly Pupil[];
  /** Generation 2 person ids (worked under a generation 1 member). */
  readonly generation2: readonly number[];
  /** People deeper than the listed generations: counted, not listed (S11.2.1 rule 2). */
  readonly deeperCount: number;
  readonly counts: { readonly placed: number; readonly coordinators: number; readonly headCoaches: number; readonly headCoachWins: number; readonly headCoachLosses: number; readonly headCoachTies: number };
}

export interface TreeContext {
  originOf(personId: number): PersonOrigin;
  readonly params?: Overrides;
}

function mentors(m: Stint, p: (n: string) => number): boolean {
  if (m.rung === null) return false;
  return m.rung >= p('tree.headCoachRungMin') || m.rung === p('tree.coordinatorRung');
}

/** E5.4.1 rule 1: every mentor-pupil edge in the history, sorted. */
export function buildEdges(stints: readonly Stint[], ctx: TreeContext): TreeEdge[] {
  const p = paramWith(ctx.params);
  const byTeamYear = new Map<string, Stint[]>();
  for (const s of stints) for (const y of s.fullSeasonYears) {
    const k = `${s.teamId}|${y}`;
    const l = byTeamYear.get(k) ?? [];
    l.push(s);
    byTeamYear.set(k, l);
  }
  type Acc = { years: Set<number>; mentorRung: number; pupilRung: number; teams: Set<number> };
  const acc = new Map<string, Acc>();
  for (const [k, list] of byTeamYear) {
    const year = Number(k.split('|')[1]);
    for (const m of list) {
      if (!mentors(m, p)) continue;
      const isHead = m.rung! >= p('tree.headCoachRungMin');
      for (const u of list) {
        if (u.personId === m.personId || u.rung === null || u.rung >= m.rung!) continue;
        if (!isHead && u.side !== m.side) continue;
        const imported = ctx.originOf(m.personId) === 'imported' || ctx.originOf(u.personId) === 'imported';
        if (imported && (m.source === 'history_run' || u.source === 'history_run')) continue;
        const ek = `${m.personId}|${u.personId}`;
        const a = acc.get(ek) ?? { years: new Set<number>(), mentorRung: 0, pupilRung: 0, teams: new Set<number>() };
        a.years.add(year);
        a.mentorRung = Math.max(a.mentorRung, m.rung!);
        a.pupilRung = Math.max(a.pupilRung, u.rung);
        a.teams.add(m.teamId);
        acc.set(ek, a);
      }
    }
  }
  const out: TreeEdge[] = [];
  for (const [ek, a] of acc) {
    const [mentorId, pupilId] = ek.split('|').map(Number) as [number, number];
    const years = [...a.years].sort((x, y) => x - y);
    out.push({ mentorId, pupilId, seasons: years.length, years, mentorRung: a.mentorRung, pupilRung: a.pupilRung, teamIds: [...a.teams].sort((x, y) => x - y) });
  }
  return out.sort((x, y) => x.mentorId - y.mentorId || x.pupilId - y.pupilId);
}

function pupilOf(edge: TreeEdge, stints: readonly Stint[], p: (n: string) => number): Pupil {
  const firstYear = edge.years[0]!;
  const mentorSeats = new Set(stints.filter((s) => s.personId === edge.mentorId).flatMap((s) => s.fullSeasonYears.map((y) => `${s.teamId}|${y}`)));
  let highest: number | null = null;
  let counts = false;
  let w = 0, l = 0, t = 0;
  for (const s of stints) {
    if (s.personId !== edge.pupilId || s.rung === null) continue;
    const later = s.fullSeasonYears.filter((y) => y > firstYear && !mentorSeats.has(`${s.teamId}|${y}`));
    if (later.length === 0) continue;
    highest = highest === null ? s.rung : Math.max(highest, s.rung);
    if (s.rung >= edge.pupilRung + p('tree.riseRungs')) counts = true;
    if (s.rung >= p('tree.headCoachRungMin')) { w += s.wins; l += s.losses; t += s.ties; }
  }
  return {
    edge, counts, highestRungLater: highest,
    becameCoordinator: counts && highest !== null && highest >= p('tree.coordinatorRung'),
    becameHeadCoach: counts && highest !== null && highest >= p('tree.headCoachRungMin'),
    headCoachRecord: { wins: w, losses: l, ties: t },
  };
}

/** The tree view of one coach (E5.4.1 rule 3, S11.2.1 rules 2 and 3). Works for any coach in the world. */
export function treeOf(rootId: number, stints: readonly Stint[], ctx: TreeContext, edges = buildEdges(stints, ctx)): TreeView {
  const p = paramWith(ctx.params);
  const below = new Map<number, number[]>();
  for (const e of edges) below.set(e.mentorId, [...(below.get(e.mentorId) ?? []), e.pupilId]);
  const pupils = edges.filter((e) => e.mentorId === rootId).map((e) => pupilOf(e, stints, p));
  const seen = new Set<number>([rootId, ...pupils.map((x) => x.edge.pupilId)]);
  let frontier = pupils.map((x) => x.edge.pupilId);
  const generations: number[][] = [];
  while (frontier.length) {
    const next: number[] = [];
    for (const id of frontier) for (const c of below.get(id) ?? []) if (!seen.has(c)) { seen.add(c); next.push(c); }
    if (next.length) generations.push(next.sort((a, b) => a - b));
    frontier = next;
  }
  const listedDeeper = p('tree.listedGenerations') - 1;
  const counted = pupils.filter((x) => x.counts);
  const heads = counted.filter((x) => x.becameHeadCoach);
  return {
    rootId,
    mentors: edges.filter((e) => e.pupilId === rootId),
    pupils,
    generation2: generations.slice(0, listedDeeper).flat(),
    deeperCount: generations.slice(listedDeeper).reduce((n, g) => n + g.length, 0),
    counts: {
      placed: counted.length,
      coordinators: counted.filter((x) => x.becameCoordinator).length,
      headCoaches: heads.length,
      headCoachWins: heads.reduce((n, x) => n + x.headCoachRecord.wins, 0),
      headCoachLosses: heads.reduce((n, x) => n + x.headCoachRecord.losses, 0),
      headCoachTies: heads.reduce((n, x) => n + x.headCoachRecord.ties, 0),
    },
  };
}

/** E5.4.2 rule 2: familiarity on the E2.3.2 candidate score for an assistant of a coach with a tree. */
export function treeFamiliarity(tree: TreeView, hiredByParty: readonly number[], o?: Overrides): number {
  const p = paramWith(o);
  const placed = new Set(tree.pupils.filter((x) => x.counts).map((x) => x.edge.pupilId));
  const hires = hiredByParty.filter((id) => placed.has(id)).length;
  return Math.min(p('tree.familiarityCap'), hires * p('tree.familiarityPerHire'));
}

export interface ReverseHiringTerm { readonly memberId: number; readonly term: number; readonly seasons: number }

/**
 * S11.2.1 rule 4: when the root is out of work, each generation 1 member now a head coach adds a hiring term
 * for him in that member's staff search. Zero for a member the root fired unless their edge has recovered.
 */
export function reverseHiringTerms(tree: TreeView, nowHeadCoach: (id: number) => boolean, firedByRoot: (id: number) => boolean, recovered: (id: number) => boolean, o?: Overrides): ReverseHiringTerm[] {
  const p = paramWith(o);
  return tree.pupils
    .filter((x) => nowHeadCoach(x.edge.pupilId))
    .map((x) => {
      const blocked = firedByRoot(x.edge.pupilId) && !recovered(x.edge.pupilId);
      const term = blocked ? 0 : x.edge.seasons >= p('tree.reverseLongSeasons') ? p('tree.reverseLong') : p('tree.reverseShort');
      return { memberId: x.edge.pupilId, term, seasons: x.edge.seasons };
    });
}

/** Mentors on whose tree a pupil sits: the people a hire up by him should notify (S11.2.1 news, E5.4.2). */
export function mentorsOf(pupilId: number, edges: readonly TreeEdge[]): number[] {
  return edges.filter((e) => e.pupilId === pupilId).map((e) => e.mentorId);
}
