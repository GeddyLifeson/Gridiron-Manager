// The Hall of Fame in the world's past (Marlon 2026-11-26: "Hall of Fame classes"; C9.3.1, E5.6.3).
// One hall per level. Each season point, after the season's exits, every open hall holds one election:
// the committee reads the record only (coach records, seasons played, titles won, logged honours) and
// never a hidden rating (C9.3.1). The election itself is league `awards.runElection`; this step feeds it
// the world's records, keeps the members, and logs the ballot as honour events.
//
// Today's rules apply to the whole span (Marlon 2026-11-26: the rules have always been the rules): every
// ballot uses the binding's rule values, by default the rules from the Class of 2027. A hall opens a set
// number of seasons after its league's first season, as the real pro hall opened 43 years after the
// league formed; its first class may be larger (the real charter class was 17).
//
// Records are kept incrementally on the world (`world.hall`), one season at a time, so a 157-season run
// never rescans its past. What the record cannot hold yet is said plainly: the player case reads seasons
// and titles, plus honour counters only when an awards step logs them (statistics step owed, X3.4.1).
import { dExp } from '@gm/engine-core';
import { awards } from '@gm/league';
import type { PersonRecord } from '@gm/schema';
import { param } from './params.ts';
import type { LiveWorld, StepHandler } from './types.ts';

export const STREAM_HALL = 'world.hall';

/** One coach season at the head of a team, as the coach records read it (E5.6.2). */
export type CoachSeasonRow = awards.CoachSeasonRow;

/** A player's career as the hall reads it, kept one season at a time. */
export interface PlayerLine {
  readonly personId: number;
  /** Level key of the competition he last played in (data, never compared to a literal). */
  level: string;
  seasons: number;
  titles: number;
  firstSeason: number;
  lastSeason: number;
}

export interface HallMember {
  readonly hallId: string;
  readonly personId: number;
  readonly kind: 'player' | 'coach';
  readonly ballotSeason: number;
  readonly yesShare: number;
  /** True for a member of a hall's first class. */
  readonly charter: boolean;
}

export interface HallBallotRecord {
  readonly hallId: string; readonly ballotSeason: number; readonly eligible: number; readonly finalists: number;
  readonly elected: number; readonly filledToMinimum: boolean;
}

/** What the world keeps for its halls. */
export interface HallState {
  readonly coachRows: CoachSeasonRow[];
  readonly players: Map<number, PlayerLine>;
  /** Head coach to each assistant who served under him: shared seasons and the last one (coaching trees, C9.4.1). */
  readonly treePairs: Map<number, Map<number, { seasons: number; last: number }>>;
  /** Person id to the seasons he was a head coach, for "became a head coach later" (tree count). */
  readonly headSeasons: Map<number, number[]>;
  readonly members: HallMember[];
  readonly ballots: HallBallotRecord[];
}

export function emptyHallState(): HallState {
  return { coachRows: [], players: new Map(), treePairs: new Map(), headSeasons: new Map(), members: [], ballots: [] };
}

export interface HallSpec {
  /** Hall id, written on every honour event (`hall` in the payload). */
  readonly id: string;
  /** Competition level this hall honours (data from the binding). */
  readonly level: string;
  /** Rule values for the election (league awards keys `hall.*`). */
  readonly rules: awards.RuleValues;
  /** Seasons after the league's first season before the first ballot. */
  readonly opensAfterSeasons: number;
  /** Most members in the first class; absent means the normal class maximum. */
  readonly charterClassMax?: number;
  /** `standings.tie_win_value` for coach win share. */
  readonly tieValue: number;
}

export interface HallBinding {
  readonly halls: readonly HallSpec[];
  /**
   * Honour counters of a person (all-league, all-star, major awards, records), from the awards step's
   * events. Absent until an awards step runs in the world: players are then judged on seasons and titles.
   */
  readonly honours?: (world: LiveWorld, personId: number) => Readonly<Record<string, number>>;
  /** Media regard of a person, -1 to 1 (E5.6.3 rule 3). Absent means neutral. */
  readonly regard?: (world: LiveWorld, personId: number) => number;
  /** Logged and detected conduct findings (C11). Absent means none logged. */
  readonly conductFindings?: (world: LiveWorld, personId: number) => number;
}

/**
 * The default halls: one per level key given, each with its proposed league rules (league awards
 * `proposedRules`) and its opening delay. The pro opening (43 seasons) is 1 of 3 until the league's
 * formation year has two more sources; the college values are Assumptions (see params.ts).
 */
export function defaultHalls(levels: { readonly pro: string; readonly college: string }, tieValue: number): HallSpec[] {
  return [
    { id: 'hall.pro', level: levels.pro, rules: awards.proposedRules('pro_2027'), opensAfterSeasons: param('hall.proOpensAfterSeasons'), charterClassMax: param('hall.proCharterClassMax'), tieValue },
    { id: 'hall.college', level: levels.college, rules: awards.proposedRules('college_2027'), opensAfterSeasons: param('hall.collegeOpensAfterSeasons'), tieValue },
  ];
}

/** Rule keys an election cannot run without (league awards `runElection` reads them with no default). */
export const HALL_REQUIRED_KEYS = [awards.KEY.hallCommittee, awards.KEY.hallVoteShare, awards.KEY.hallClassMax] as const;

/**
 * Keys a hall's rules lack. A hall with gaps holds no ballot and says so in the step digest: the college
 * hall's committee size, vote share and class size are research still owed (G-43), and no number is
 * made up to fill them.
 */
export function hallRuleGaps(spec: HallSpec): string[] {
  return HALL_REQUIRED_KEYS.filter((k) => typeof spec.rules[k] !== 'number');
}

/** The first season any team of the level played (team spans; a team with no span played from the world's first season). */
export function leagueFirstSeason(world: LiveWorld, level: string): number | null {
  let first: number | null = null;
  for (const c of world.competitions) {
    if (c.level !== level) continue;
    for (const id of c.teamIds) {
      const y = world.teamSpans.get(id)?.founded ?? world.setup.firstSeasonYear;
      if (first === null || y < first) first = y;
    }
  }
  return first;
}

/** The season of a hall's first ballot, or null when its level has no teams. */
export function hallOpens(world: LiveWorld, spec: HallSpec): number | null {
  const first = leagueFirstSeason(world, spec.level);
  return first === null ? null : first + spec.opensAfterSeasons;
}

/**
 * Fold the season just played into the hall records: each head coach's row, each rostered player's line,
 * and each head coach and assistant pair. Reads `world.results` and this season's staff rows, so it runs
 * at the season point before the results are cleared.
 */
export function recordHallSeason(world: LiveWorld, state: HallState): void {
  const year = world.date.seasonYear;
  const levelOfComp = new Map(world.competitions.map((c) => [c.id, c.level]));
  const levelOfTeam = new Map(world.teams.map((t) => [t.id, levelOfComp.get(t.competitionId)!]));
  const line = new Map<number, { w: number; l: number; t: number; pw: number; title: boolean }>();
  const of = (id: number) => { let e = line.get(id); if (!e) { e = { w: 0, l: 0, t: 0, pw: 0, title: false }; line.set(id, e); } return e; };
  for (const g of world.results) {
    const h = of(g.homeTeamId), a = of(g.awayTeamId);
    if (g.homePoints === g.awayPoints) { if (g.kind === 'regular') { h.t++; a.t++; } continue; }
    const [win, lose] = g.homePoints > g.awayPoints ? [h, a] : [a, h];
    if (g.kind === 'regular') { win.w++; lose.l++; } else win.pw++;
    if (g.title) win.title = true;
  }
  for (const s of world.staffSeasons) {
    if (s.seasonYear !== year || s.headCoachId === null) continue;
    const r = line.get(s.teamId) ?? { w: 0, l: 0, t: 0, pw: 0, title: false };
    const p = world.people.get(s.headCoachId);
    state.coachRows.push({
      personId: s.headCoachId, season: year, level: levelOfTeam.get(s.teamId)!, teamId: s.teamId, wins: r.w, losses: r.l, ties: r.t,
      postseasonWins: r.pw, title: r.title, age: p ? year - p.birthDate.seasonYear : 0, origin: p?.origin === 'imported' ? 'imported' : 'generated',
    });
    const hs = state.headSeasons.get(s.headCoachId) ?? [];
    hs.push(year);
    state.headSeasons.set(s.headCoachId, hs);
    let under = state.treePairs.get(s.headCoachId);
    if (!under) { under = new Map(); state.treePairs.set(s.headCoachId, under); }
    for (const a of s.staffIds) {
      const e = under.get(a);
      if (e) { e.seasons++; e.last = year; } else under.set(a, { seasons: 1, last: year });
    }
  }
  for (const t of world.teams) {
    const roster = world.rosterSeasons.get(`${year}:${t.id}`);
    if (!roster) continue;
    const champion = line.get(t.id)?.title ?? false;
    for (const id of roster) {
      const e = state.players.get(id);
      if (e) {
        if (e.lastSeason !== year) e.seasons++;
        e.lastSeason = year; e.level = levelOfTeam.get(t.id)!;
        if (champion) e.titles++;
      } else state.players.set(id, { personId: id, level: levelOfTeam.get(t.id)!, seasons: 1, titles: champion ? 1 : 0, firstSeason: year, lastSeason: year });
    }
  }
}

/** Former assistants (shared seasons at or past league awards `tree.edgeSeasons`) who later became head coaches. */
export function treeHeadCoachCount(state: HallState, headCoachId: number): number {
  const min = awards.param('tree.edgeSeasons');
  let n = 0;
  for (const [a, e] of state.treePairs.get(headCoachId) ?? []) {
    if (e.seasons < min) continue;
    if ((state.headSeasons.get(a) ?? []).some((y) => y > e.last)) n++;
  }
  return n;
}

const origin = (p: PersonRecord | undefined): awards.Origin => (p?.origin === 'imported' ? 'imported' : 'generated');

/** Candidates for one hall's ballot: every coach and player of its level, each person once (his stronger case). */
export function hallCandidates(world: LiveWorld, state: HallState, spec: HallSpec, b: HallBinding): awards.HallCandidate[] {
  const year = world.date.seasonYear;
  const elected = new Set(state.members.filter((m) => m.hallId === spec.id).map((m) => m.personId));
  const byPerson = new Map<number, awards.HallCandidate>();
  const add = (c: awards.HallCandidate): void => {
    const prev = byPerson.get(c.personId);
    if (!prev || awards.caseScore(c) > awards.caseScore(prev)) byPerson.set(c.personId, c);
  };
  const totals = awards.coachTotals(state.coachRows, spec.level, spec.tieValue);
  const lastHead = new Map<number, number>();
  for (const r of state.coachRows) if (r.level === spec.level) lastHead.set(r.personId, Math.max(lastHead.get(r.personId) ?? r.season, r.season));
  const honours = (id: number): Record<string, number> => ({ ...(b.honours?.(world, id) ?? {}) });
  for (const t of totals) {
    const p = world.people.get(t.personId);
    const last = lastHead.get(t.personId)!;
    const h = honours(t.personId);
    h[awards.COUNTER.title] = (h[awards.COUNTER.title] ?? 0) + t.titles;
    add({
      personId: t.personId, kind: 'coach', origin: origin(p), lastSeason: last, active: last === year && world.status.get(t.personId) === 'active',
      age: p ? year - p.birthDate.seasonYear : 0,
      rollup: { personId: t.personId, seasons: t.seasons, countsByBand: {}, honourCounters: h, topEventIds: [] },
      coach: t, treeHeadCoaches: treeHeadCoachCount(state, t.personId), conductFindings: b.conductFindings?.(world, t.personId) ?? 0,
      regard: b.regard?.(world, t.personId) ?? 0, elected: elected.has(t.personId),
    });
  }
  for (const l of state.players.values()) {
    if (l.level !== spec.level) continue;
    const p = world.people.get(l.personId);
    const h = honours(l.personId);
    h[awards.COUNTER.title] = (h[awards.COUNTER.title] ?? 0) + l.titles;
    add({
      personId: l.personId, kind: 'player', origin: origin(p), lastSeason: l.lastSeason, active: l.lastSeason === year,
      age: p ? year - p.birthDate.seasonYear : 0,
      rollup: { personId: l.personId, seasons: l.seasons, countsByBand: {}, honourCounters: h, topEventIds: [] },
      conductFindings: b.conductFindings?.(world, l.personId) ?? 0, regard: b.regard?.(world, l.personId) ?? 0, elected: elected.has(l.personId),
    });
  }
  return [...byPerson.values()].sort((a, c) => a.personId - c.personId);
}

/**
 * The season-point `hall` step. It first records the season just played, then holds one election per
 * open hall. The first ballot of a hall may elect up to `charterClassMax`. Every finalist, member and
 * passed-over finalist is logged as an honour event.
 */
export function hallStep(b: HallBinding): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const state = world.hall;
    recordHallSeason(world, state);
    const year = world.date.seasonYear;
    let ballots = 0, elected = 0, eligible = 0, refused = 0;
    for (const spec of b.halls) {
      const opens = hallOpens(world, spec);
      if (opens === null || year < opens) continue;
      if (hallRuleGaps(spec).length > 0) { refused++; continue; }
      const charter = !state.ballots.some((x) => x.hallId === spec.id);
      const rules: awards.RuleValues = charter && spec.charterClassMax !== undefined
        ? { ...spec.rules, [awards.KEY.hallClassMax]: spec.charterClassMax, ...(spec.rules[awards.KEY.hallCandidates] === undefined ? {} : { [awards.KEY.hallCandidates]: Math.max(Number(spec.rules[awards.KEY.hallCandidates]), spec.charterClassMax) }) }
        : spec.rules;
      const cands = hallCandidates(world, state, spec, b);
      const rng = ctx.open(STREAM_HALL, [spec.id]);
      const cls = awards.runElection(cands, year, rules, { next: () => rng.uniform() }, { exp: dExp });
      const kindOf = new Map(cands.map((c) => [c.personId, c.kind]));
      const share = new Map(cls.finalists.map((f) => [f.personId, f.yesShare]));
      for (const id of cls.elected) state.members.push({ hallId: spec.id, personId: id, kind: kindOf.get(id)!, ballotSeason: year, yesShare: share.get(id)!, charter });
      state.ballots.push({ hallId: spec.id, ballotSeason: year, eligible: cls.eligible.length, finalists: cls.finalists.length, elected: cls.elected.length, filledToMinimum: cls.filledToMinimum });
      const drafts = awards.hallDrafts(spec.id, cls, { date: world.date, competitionId: null, tier: 3, source: ctx.source });
      for (const d of drafts) {
        ctx.emit({
          type: d.type, date: d.when.date, competitionId: d.competitionId, teamId: d.where.teamId, actors: d.actors, subjects: d.subjects,
          payload: d.payload, witnesses: d.witnesses, tier: d.tier,
        });
      }
      ballots++; elected += cls.elected.length; eligible += cls.eligible.length;
    }
    return { ballots, elected, eligible, refused, members: state.members.length };
  };
}
