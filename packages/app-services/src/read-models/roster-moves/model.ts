// Builds the roster moves view (H6.1.1 strip, H6.1.2 buttons, H6.2.1 active list and coverage board,
// H6.2.3 lock, H6.3.1 elevations) from the club's roster state, the league rules, the depth chart
// records and the public injury report. Pure: same input, same view.
import { roster } from '@gm/league';
import { coverageRows, gapLabels, jobsByPlayer, unitRows, type DepthUnit } from './coverage.ts';
import { staffDraft } from './draft.ts';
import { MINUTES_PER_HOUR, OUT_DESIGNATIONS } from './params.ts';
import type { ActiveListView, ElevationsView, MarkerRow, MarkerTarget, MoveButton, PlayerRow, RosterMovesView } from './types.ts';

export interface PlayerCard { readonly personId: number; readonly name: string; readonly position: string }

/** Who holds the say in this job (L5.2.1 arrangement plus E3 contract clauses). */
export interface PowerInput {
  readonly arrangement: roster.PowerArrangement;
  readonly clauses?: Partial<Record<roster.DecidedMove, roster.Decider>>;
}

export interface RosterMovesInput {
  readonly clubId: number;
  readonly state: roster.LeagueRosters;
  readonly rules: roster.RosterRules;
  /** Rule-set value `substitution.max_players`. */
  readonly sideSize: number;
  /** This week's game, or null in a bye week (H6.1.1 edge case: no G markers). */
  readonly week: roster.WeekInput | null;
  readonly power: PowerInput;
  readonly cards: readonly PlayerCard[];
  /** Injury report designation by person id (H5.2.2). */
  readonly designations: Readonly<Record<string, string | null>>;
  readonly depth: readonly DepthUnit[];
  /** The coach's working list; null means the staff draft is shown as the working list. */
  readonly working: roster.GameDayList | null;
}

const MARKER_TARGET: Record<roster.MarkerType, MarkerTarget> = {
  injury_review: 'review', tryouts: 'signings', protections: 'protections', trade_deadline_meeting: 'review',
  last_transactions: 'elevations', inactives: 'active_list', elevations_revert: 'none',
};
const MARKER_MOVE: Partial<Record<roster.MarkerType, roster.DecidedMove>> = {
  tryouts: 'sign_free_agent', protections: 'protect', last_transactions: 'elevate', inactives: 'game_day_list',
};

/** Every move the screens end in, with its button (H6.1.2 rule 1, acceptance 4). */
export const SCREEN_MOVES: readonly roster.DecidedMove[] = [
  'game_day_list', 'depth_chart', 'elevate', 'protect', 'sign_free_agent', 'sign_from_practice_squad', 'sign_practice_squad',
  'claim', 'release', 'place_reserve', 'activate', 'open_return_window', 'trade',
];

export function decider(power: PowerInput, move: roster.DecidedMove): roster.Decider {
  return roster.deciderFor(move, power.arrangement, power.clauses ?? {});
}

export function minutesToKickoff(state: roster.LeagueRosters, week: roster.WeekInput): number {
  return (roster.absHour(week.kickoff) - roster.absHour(state.now)) * MINUTES_PER_HOUR;
}

export function buildRosterMovesView(input: RosterMovesInput): RosterMovesView {
  const { state, rules, clubId } = input;
  const club = state.clubs.find((c) => c.clubId === clubId);
  if (!club) throw new Error(`roster-moves: no club ${clubId}`);
  const now = roster.absHour(state.now);
  const buttons: Record<string, MoveButton> = {};
  for (const m of SCREEN_MOVES) buttons[m] = roster.moveButton(decider(input.power, m));

  const markers: MarkerRow[] = input.week
    ? roster.weeklyRosterMarkers(input.week, rules).map((m) => {
      const move = MARKER_MOVE[m.type];
      const d = move ? decider(input.power, move) : null;
      return {
        type: m.type, status: roster.markerStatus(m, state.now), opensAtHour: roster.absHour(m.opensAt), deadlineHour: roster.absHour(m.deadline),
        hoursLeft: Math.max(0, roster.absHour(m.deadline) - now), target: MARKER_TARGET[m.type], decider: d, button: d ? roster.moveButton(d) : null,
      };
    }).sort((a, b) => a.deadlineHour - b.deadlineHour || (a.type < b.type ? -1 : 1))
    : [];

  const candidates = roster.gameDayCandidates(state, clubId);
  const candidateSet = new Set(candidates);
  const out = new Set<number>();
  for (const id of candidates) {
    const d = input.designations[String(id)];
    if (d && OUT_DESIGNATIONS.includes(d)) out.add(id);
  }
  const fact = (id: number) => state.players[String(id)];
  const linemen = new Set(candidates.filter((id) => fact(id)?.offensiveLineman));
  const draft = rules.gameDay ? staffDraft({ candidates, out, linemen, depth: input.depth, rules }) : { actives: candidates.filter((id) => !out.has(id)), reasons: {} };
  const working: roster.GameDayList = input.working ?? { clubId, actives: draft.actives, emergencyQb: null };
  const activeSet = new Set(working.actives);

  const coverage = coverageRows(input.depth, activeSet);
  const units = unitRows(input.depth, activeSet, input.sideSize);
  const { jobs, stFirsts } = jobsByPlayer(input.depth);
  const cards = new Map(input.cards.map((c) => [c.personId, c]));

  const players: PlayerRow[] = club.entries
    .filter((e) => e.list === roster.LIST.active || e.list === roster.LIST.practiceSquad || candidateSet.has(e.personId))
    .map((e): PlayerRow => {
      const card = cards.get(e.personId);
      return {
        personId: e.personId, name: card?.name ?? `#${e.personId}`, position: card?.position ?? '', list: e.list,
        elevated: e.list === roster.LIST.practiceSquad && e.elevatedForGame === club.gamesPlayed,
        designation: input.designations[String(e.personId)] ?? null, out: out.has(e.personId),
        offensiveLineman: !!fact(e.personId)?.offensiveLineman, quarterback: !!fact(e.personId)?.quarterback,
        jobs: jobs.get(e.personId) ?? [], specialTeamsFirsts: stFirsts.get(e.personId) ?? 0,
        candidate: candidateSet.has(e.personId), active: activeSet.has(e.personId),
      };
    })
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.personId - b.personId));

  let active: ActiveListView | null = null;
  const g = rules.gameDay;
  if (g) {
    const verdict = roster.validateGameDayList(state, working, rules);
    const linemenActive = working.actives.filter((id) => linemen.has(id)).length;
    const toKick = input.week ? minutesToKickoff(state, input.week) : Number.POSITIVE_INFINITY;
    const locked = input.week ? roster.gameDayListLocked(toKick, rules) : false;
    const rosterQbs = club.entries.filter((e) => e.list === roster.LIST.active && fact(e.personId)?.quarterback).length;
    active = {
      actives: [...working.actives], emergencyQb: working.emergencyQb, count: working.actives.length,
      limit: roster.activeLimitFor(linemenActive, rules), linemenActive, minLinemen: g.minLinemen, floor: g.floor,
      inactives: verdict.ok ? [...verdict.inactives] : candidates.filter((id) => !activeSet.has(id) && id !== working.emergencyQb).sort((a, b) => a - b),
      refusal: verdict.ok ? null : { rule: verdict.rule, message: verdict.message, fix: verdict.fix },
      locked, minutesToLock: locked || !Number.isFinite(toKick) ? 0 : Math.max(0, toKick - g.lockMinutes),
      redGaps: gapLabels(coverage, units, 'red'), amberGaps: gapLabels(coverage, units, 'amber'),
      outDressed: working.actives.filter((id) => out.has(id)), staffDraft: draft.actives, staffReasons: draft.reasons,
      emergencyQbOffered: rosterQbs >= g.emergencyQbActiveQbs + 1,
    };
  }

  let elevations: ElevationsView | null = null;
  const ps = rules.practiceSquad;
  if (ps) {
    const rows = club.entries.filter((e) => e.list === roster.LIST.practiceSquad).map((e) => {
      const isElevated = e.elevatedForGame === club.gamesPlayed;
      const unlimited = state.phase === 'postseason' && ps.postseasonUnlimited;
      const trial = isElevated ? null : roster.applyTransaction(state, { type: 'elevate', clubId, personId: e.personId }, rules);
      const card = cards.get(e.personId);
      return {
        personId: e.personId, name: card?.name ?? `#${e.personId}`, position: card?.position ?? '', used: e.elevationsThisSeason,
        left: unlimited ? null : Math.max(0, ps.elevationsPerPlayerSeason - e.elevationsThisSeason), elevated: isElevated,
        blocked: trial && !trial.ok ? trial.message : null,
      };
    }).sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.personId - b.personId));
    elevations = { perGame: ps.elevationsPerGame, usedThisGame: roster.clubCounts(club, state.players, rules).elevationsNextGame, rows };
  }

  return {
    clubId, hasGameDayLimit: !!g, hasPracticeSquad: !!ps, nowHour: now, markers, players, coverage, units, active, elevations, buttons,
  };
}
