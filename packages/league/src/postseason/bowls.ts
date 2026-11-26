// Bowl eligibility and selection (T3.6.1). Bowls and their conference tie-ins are content data (G-11
// generated names; real bowl names are marks). Fill order: tie-ins by conference standing, then
// at-large by ranking, then, if eligible teams run short, teams below the eligibility line ordered by
// academic measure (Unverified ordering, T3.6.1 rule 3). Nobody under `bowl.fill_min_wins` is invited.
import { num } from '../standings/params.ts';
import type { GameResult, RuleValues, TeamId } from '../standings/types.ts';
import { KEY } from './params.ts';

export interface BowlTieIn {
  readonly conferenceId: number;
  /** Pick order inside the conference's tie-ins: lower picks first. */
  readonly priority: number;
}

export interface BowlDef {
  readonly bowlId: number;
  /** Selection order among bowls: lower picks first. */
  readonly order: number;
  /** Two slots; a slot with no tie-in (null) is at-large. */
  readonly slots: readonly [BowlTieIn | null, BowlTieIn | null];
}

export interface BowlTeam {
  readonly teamId: TeamId;
  readonly conferenceId: number | null;
  /** Place in the final conference standings, 1 first (T3.3.1). */
  readonly conferenceRank: number;
  /** Academic measure for the short-fill rule (T5.3), higher is better. */
  readonly academicScore: number;
}

export interface BowlInput {
  readonly teams: readonly BowlTeam[];
  /** Regular-season results (wins count toward eligibility). */
  readonly results: readonly GameResult[];
  /** Committee ranking, best first. */
  readonly ranking: readonly TeamId[];
  /** Teams already in the playoff: never sent to a bowl outside it. */
  readonly playoffTeams: readonly TeamId[];
  readonly bowls: readonly BowlDef[];
}

export interface BowlGame { readonly bowlId: number; readonly teams: readonly [TeamId, TeamId] }

export interface BowlSelection {
  readonly games: readonly BowlGame[];
  readonly eligible: readonly TeamId[];
  /** Teams taken below the eligibility line to fill bowls. */
  readonly shortFill: readonly TeamId[];
  /** Bowls left without two teams (when even the short fill ran out). */
  readonly unfilled: readonly number[];
}

/** Wins that count toward eligibility: every top-subdivision win plus up to the allowed lower-subdivision wins. */
export function countedWins(teamId: TeamId, topTeams: ReadonlySet<TeamId>, results: readonly GameResult[], rules: RuleValues): number {
  let top = 0, lower = 0;
  for (const g of results) {
    if (g.phase !== 'regular') continue;
    if (g.teams[0] !== teamId && g.teams[1] !== teamId) continue;
    const side = g.teams[0] === teamId ? 0 : 1;
    const other = side === 0 ? 1 : 0;
    if (g.points[side] <= g.points[other]) continue;
    if (topTeams.has(g.teams[other])) top++; else lower++;
  }
  return top + Math.min(lower, num(rules, KEY.bowlLowerDivisionWinsCounted));
}

export function selectBowls(input: BowlInput, rules: RuleValues): BowlSelection {
  const top = new Set(input.teams.map((t) => t.teamId));
  const wins = new Map(input.teams.map((t) => [t.teamId, countedWins(t.teamId, top, input.results, rules)]));
  const needed = num(rules, KEY.bowlEligibilityWins);
  const floor = num(rules, KEY.bowlFillMinWins);
  const inPlayoff = new Set(input.playoffTeams);
  const rankOf = new Map(input.ranking.map((t, i) => [t, i]));
  const rank = (t: TeamId) => rankOf.get(t) ?? Number.MAX_SAFE_INTEGER;

  const eligible = input.teams.filter((t) => !inPlayoff.has(t.teamId) && wins.get(t.teamId)! >= needed);
  const placed = new Set<TeamId>();
  const slots: { bowlId: number; order: number; idx: number; tieIn: BowlTieIn | null; team: TeamId | null }[] = [];
  for (const b of input.bowls) b.slots.forEach((tieIn, idx) => slots.push({ bowlId: b.bowlId, order: b.order, idx, tieIn, team: null }));

  // 1. Tie-ins: bowls pick in order; within a conference, tie-ins of higher priority first.
  const tieSlots = slots.filter((s) => s.tieIn).sort((a, b) => a.tieIn!.priority - b.tieIn!.priority || a.order - b.order || a.idx - b.idx);
  for (const s of tieSlots) {
    const pick = eligible.filter((t) => t.conferenceId === s.tieIn!.conferenceId && !placed.has(t.teamId))
      .sort((a, b) => a.conferenceRank - b.conferenceRank || rank(a.teamId) - rank(b.teamId) || a.teamId - b.teamId)[0];
    if (pick) { s.team = pick.teamId; placed.add(pick.teamId); }
  }
  // 2. At-large by ranking, then unranked by wins.
  const byMerit = (list: readonly BowlTeam[]) => [...list].sort((a, b) => rank(a.teamId) - rank(b.teamId) || wins.get(b.teamId)! - wins.get(a.teamId)! || a.teamId - b.teamId);
  const open = () => slots.filter((s) => s.team === null).sort((a, b) => a.order - b.order || a.idx - b.idx);
  for (const s of open()) {
    const pick = byMerit(eligible).find((t) => !placed.has(t.teamId));
    if (!pick) break;
    s.team = pick.teamId; placed.add(pick.teamId);
  }
  // 3. Short fill below the line, by academic measure (never under the floor).
  const shortFill: TeamId[] = [];
  const below = input.teams.filter((t) => !inPlayoff.has(t.teamId) && !placed.has(t.teamId) && wins.get(t.teamId)! >= floor && wins.get(t.teamId)! < needed)
    .sort((a, b) => wins.get(b.teamId)! - wins.get(a.teamId)! || b.academicScore - a.academicScore || a.teamId - b.teamId);
  for (const s of open()) {
    const pick = below.find((t) => !placed.has(t.teamId));
    if (!pick) break;
    s.team = pick.teamId; placed.add(pick.teamId); shortFill.push(pick.teamId);
  }
  const games: BowlGame[] = [];
  const unfilled: number[] = [];
  for (const b of input.bowls) {
    const [x, y] = slots.filter((s) => s.bowlId === b.bowlId).sort((p, q) => p.idx - q.idx).map((s) => s.team);
    if (x != null && y != null) games.push({ bowlId: b.bowlId, teams: [x, y] }); else unfilled.push(b.bowlId);
  }
  return { games, eligible: eligible.map((t) => t.teamId), shortFill, unfilled };
}
