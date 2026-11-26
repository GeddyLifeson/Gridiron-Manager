// The G-36 recruiting module bound to the live world: its state in `LiveWorld.systemState`, its program facts
// read from teams, staffs and rosters, its staff reads from people, and its rule set and calendar over the
// league rules. Every stand-in is a README decision (RC-06). Nothing here decides a recruiting act.
import { stream } from '@gm/engine-core';
import { calendar, compliance, recruiting } from '@gm/league';
import type { PersonRecord, RuleSet } from '@gm/schema';
import { complianceOf, dispositionOf, partyOf, setCompliance, sinkFor, STREAM_CONDUCT, HEAD_COACH } from '../compliance/binding.ts';
import { param as genParam } from '../generation/params.ts';
import { isActive } from '../loop/lifecycle.ts';
import type { LiveWorld, StepContext } from '../loop/types.ts';
import { levelOfTeam, specOf, type Level, type TurnoverBinding } from '../turnover/binding.ts';
import { param as turnoverParam, RULE_KEY } from '../turnover/params.ts';
import { RecruitingCalendar } from './calendar.ts';
import { param } from './params.ts';

type PositionGroup = recruiting.PositionGroup;

/** `LiveWorld.systemState` key of the recruiting state. */
export const RECRUITING_KEY = 'recruiting';
/** J13 stream name of the module's own draws (G-36 `recruiting` scope stream). */
export const STREAM_RECRUITING = 'recruiting';

/** What the world keeps between passes. Plain data: it is folded into `worldHash`. */
export interface WorldRecruiting {
  state: recruiting.RecruitingState;
  /** Class years open now, oldest first (two overlap from January to the February signing date). */
  classes: number[];
  /** The last recruiting Wednesday run; null before the first. */
  throughDay: number | null;
  /** Person id to the team he signed with, for classes that have signed and not yet enrolled. */
  letters: Record<number, number>;
  /** Class years already opened or passed over (RC-03), so a class is never opened twice. */
  seen: number[];
}

export function recruitingOf(world: LiveWorld): WorldRecruiting {
  let r = world.systemState.get(RECRUITING_KEY) as WorldRecruiting | undefined;
  if (!r) {
    r = { state: recruiting.emptyRecruiting(), classes: [], throughDay: null, letters: {}, seen: [] };
    world.systemState.set(RECRUITING_KEY, r);
  }
  return r;
}

/** What the composition root gives the recruiting binding. */
export interface RecruitingBinding {
  readonly turnover: TurnoverBinding;
  /** The calendar files to project (G-12 `CALENDAR_FILES`). */
  readonly calendarFiles: readonly calendar.CalendarFile[];
  /** K7.5.1 hooks on board order, offer count and committable offers (front office); absent keeps the G-36 defaults. */
  readonly policy?: (world: LiveWorld) => recruiting.AiProgramPolicy | undefined;
  /**
   * The user's own program (T4, X12.1.1): left out of the AI programs, and its queued acts taken through
   * `act` on each recruiting Wednesday before the week resolves. Absent (history runs), every program is AI.
   */
  readonly user?: (world: LiveWorld) => UserRecruiting | undefined;
}

/** What the composition root gives for the user's program in one pass. */
export interface UserRecruiting {
  readonly teamIds: readonly number[];
  /** Takes the user's queued acts for this recruiting day (league `takeAct`, `takeLook`, `makeOffer`...). */
  act(a: UserRecruitingDay): void;
  /** The user's answer on a commitment to a non-committable offer; absent, his staff answers as an AI program would. */
  readonly decide?: recruiting.CommitDecider;
}

export interface UserRecruitingDay {
  readonly state: recruiting.RecruitingState;
  readonly ctx: recruiting.RecruitingContext;
  readonly hook: recruiting.ComplianceHook;
  readonly classYear: number;
  readonly day: number;
  /** Every program this pass, the user's included. */
  readonly programs: readonly recruiting.ProgramInfo[];
}

/** World position code to the G-36 position group (T4.8.1 rooms). Unknown codes go to the nearest room by side. */
const GROUP_OF: Readonly<Record<string, PositionGroup>> = {
  QB: 'QB', RB: 'RB', FB: 'RB', HB: 'RB', WR: 'WR', TE: 'TE',
  C: 'OL', G: 'OL', T: 'OL', OG: 'OL', OT: 'OL', LT: 'OL', RT: 'OL', LG: 'OL', RG: 'OL', OL: 'OL',
  DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', EDGE: 'DL',
  ILB: 'LB', MLB: 'LB', OLB: 'LB', LB: 'LB',
  CB: 'DB', FS: 'DB', SS: 'DB', S: 'DB', DB: 'DB', NB: 'DB',
  K: 'ST', P: 'ST', LS: 'ST', KR: 'ST', PR: 'ST',
};

export function groupOf(position: string): PositionGroup | null { return GROUP_OF[position] ?? null; }

/** Levels that recruit: those whose league holds a seasons-of-competition rule (T5), as turnover reads them. */
export function recruitingLevels(b: TurnoverBinding): Level[] {
  return (Object.keys(b.content.levels).sort() as Level[]).filter((l) => b.rule(l, RULE_KEY.seasonsOfCompetition) !== undefined);
}

/** RC-06: overall true quality, the mean of the true attributes (D6.1 internal skill scale). Truth, never shown. */
export function trueQuality(p: PersonRecord): number {
  const v = Object.values(p.playing?.attributes ?? {});
  return v.length === 0 ? 0 : v.reduce((a, x) => a + x, 0) / v.length;
}

/** The college rule set recruiting reads on a day: the league rules by key, holding only the recruiting keys the league defines. */
export function recruitingRules(b: TurnoverBinding, level: Level, seasonYear: number): RuleSet {
  const held = recruiting.RULE_KEYS.map((k) => k.key).filter((k) => b.rule(level, k) !== undefined).sort();
  const num = (k: string): number => {
    const v = b.rule(level, k);
    if (v === undefined) throw new Error(`league ${level} holds no rule ${k}`);
    return v;
  };
  return { id: `world:${level}:recruiting`, level: 'college', seasonYear, num, bool: (k) => num(k) !== 0, opt: (k) => String(num(k)), keys: () => held };
}

/** Everything one pass needs: the context, the compliance hook and the AI people over the world. */
export interface PassBinding {
  readonly ctx: recruiting.RecruitingContext;
  readonly hook: recruiting.ComplianceHook;
  readonly people: recruiting.AiPeople;
  readonly programs: () => recruiting.ProgramInfo[];
  readonly level: Level;
  /** Writes the compliance state back to the world. */
  done(): void;
}

const CALENDARS = new WeakMap<RecruitingBinding, RecruitingCalendar>();

export function recruitingCalendar(b: RecruitingBinding): RecruitingCalendar {
  let c = CALENDARS.get(b);
  if (!c) {
    const level = recruitingLevels(b.turnover)[0];
    const rules = calendar.calendarLookup((k) => (level === undefined ? undefined : b.turnover.rule(level, k)));
    c = new RecruitingCalendar(b.calendarFiles, rules);
    CALENDARS.set(b, c);
  }
  return c;
}

/** The program facts for one pass, read from the world and cached for the pass (rosters do not change inside it). */
export function passBinding(ctx: StepContext, b: RecruitingBinding, levels: readonly Level[]): PassBinding & { setDay(d: number): void; setClass(y: number): void } {
  const level = levels[0]!;
  const { world } = ctx;
  const cal = recruitingCalendar(b);
  const teams = world.teams.filter((t) => isActive(world, t.id) && levels.includes(levelOfTeam(world, t.id))).sort((x, y) => x.id - y.id);
  const seasons = b.turnover.rule(level, RULE_KEY.seasonsOfCompetition);
  const clock = b.turnover.rule(level, RULE_KEY.clockYears);
  const regionOfTeam = new Map<number, string>();
  for (const t of teams) {
    const placeId = world.placeOfTeam.get(t.id);
    regionOfTeam.set(t.id, world.places.find((p) => p.id === placeId)?.region ?? '');
  }
  const staffOf = new Map<number, { head: number | null; staff: number[] }>();
  for (const j of [...world.jobs.values()].sort((x, y) => x.id - y.id)) {
    if (j.holderPersonId === null) continue;
    const e = staffOf.get(j.teamId) ?? { head: null, staff: [] };
    if (j.positionId === HEAD_COACH) e.head = j.holderPersonId;
    else if (j.recruitsOffCampus && !e.staff.includes(j.holderPersonId)) e.staff.push(j.holderPersonId);
    staffOf.set(j.teamId, e);
  }
  // Rooms by position group now, and the players who will still be eligible in the class's first season.
  const room = new Map<number, Record<string, { have: number; returning: number }>>();
  const roomFor = (teamId: number, classYear: number) => {
    const key = teamId * 1e4 + classYear;
    let r = room.get(key);
    if (r) return r;
    r = {};
    for (const id of world.rosters.get(teamId) ?? []) {
      const p = world.people.get(id);
      const g = p?.playing ? groupOf(p.playing.position) : null;
      if (!p || !g) continue;
      const row = (r[g] ??= { have: 0, returning: 0 });
      row.have++;
      // RC-07: he returns if the season under way, counted as used, leaves him seasons and clock years in that season.
      const e = p.playing!.eligibility.college;
      const start = e?.clockStartYear ?? p.birthDate.seasonYear + genParam('age.collegeFirstYear');
      const usedBy = (e?.seasonsOfCompetitionUsed ?? 0) + (classYear - world.date.seasonYear);
      if ((seasons === undefined || usedBy < seasons) && (clock === undefined || classYear - start < clock)) row.returning++;
    }
    room.set(key, r);
    return r;
  };
  const wr = recruitingOf(world);
  const incoming = (teamId: number, classYear: number, position: PositionGroup): number => {
    let n = 0;
    for (const p of Object.values(wr.state.prospects)) {
      if (p.classYear >= classYear || p.position !== position) continue;
      const st = wr.state.status[p.personId];
      if (st?.teamId === teamId && (st.status === 'committed' || st.status === 'signed')) n++;
    }
    for (const [id, t] of Object.entries(wr.letters)) {
      if (t !== teamId) continue;
      const pos = world.people.get(Number(id))?.playing?.position;
      if (pos !== undefined && groupOf(pos) === position) n++;
    }
    return n;
  };
  const streak = new Map<number, number>();
  for (const g of world.results) {
    if (g.homePoints === g.awayPoints) continue;
    const loser = g.homePoints > g.awayPoints ? g.awayTeamId : g.homeTeamId;
    const winner = g.homePoints > g.awayPoints ? g.homeTeamId : g.awayTeamId;
    streak.set(loser, (streak.get(loser) ?? 0) + 1);
    streak.set(winner, 0);
  }
  const infos = new Map<number, recruiting.ProgramInfo>();
  for (const t of teams) {
    const s = staffOf.get(t.id);
    const head = s?.head ?? s?.staff[0] ?? null;
    if (head === null) continue;
    const prestige = t.prestige * param('program.prestigeScale');
    infos.set(t.id, {
      teamId: t.id, prestige,
      tier: t.resourceBand === 'top' ? 'top' : t.resourceBand === 'middle' ? 'middle' : 'lower',
      region: regionOfTeam.get(t.id) ?? '',
      academics: param('program.academics'),
      // RC-06: no recruiting budget is held per team yet; money follows prestige, as in the G-36 calibration.
      money: prestige,
      headCoachId: head,
      staffIds: [head, ...(s?.staff ?? []).filter((x) => x !== head)],
    });
  }
  let classYearNow = world.date.seasonYear + 1;
  const facts: recruiting.ProgramFacts = {
    program: (teamId) => {
      const i = infos.get(teamId);
      if (!i) throw new Error(`recruiting: team ${teamId} has no program this pass`);
      return i;
    },
    opportunity: (teamId, position) => {
      const target = recruiting.ROSTER_SHAPE[position];
      const have = roomFor(teamId, classYearNow)[position]?.returning ?? 0;
      return target <= 0 ? 0 : Math.max(0, Math.min(1, 1 - have / target));
    },
    schemeFit: () => param('facts.schemeFit'),
    // RC-07: an earlier class's committed and signed players (and letters not yet enrolled) also return.
    returning: (teamId, position) => (roomFor(teamId, classYearNow)[position]?.returning ?? 0) + incoming(teamId, classYearNow, position),
    headCoachOn: (teamId) => infos.get(teamId)?.headCoachId ?? 0,
    lossStreak: (teamId) => streak.get(teamId) ?? 0,
    // T4.8.1, T5.1.1: the class plan fits the world roster limit (RC-11).
    rosterLimit: (teamId) => specOf(b.turnover, world, teamId).rosterLimit,
  };
  const ruleCache = new Map<number, RuleSet>();
  const rctx: recruiting.RecruitingContext & { setClass(y: number): void } = {
    rulesOn: (day) => {
      const y = calendar.civil(day).y;
      let r = ruleCache.get(y);
      if (!r) { r = recruitingRules(b.turnover, level, y); ruleCache.set(y, r); }
      return r;
    },
    get calendar() { return cal.engineFor(currentDay); },
    programs: facts,
    rng: (scope) => stream(world.seed, STREAM_RECRUITING, scope),
    setClass: (y: number) => { classYearNow = y; },
  };
  let currentDay = 0;
  const hook: recruiting.ComplianceHook = {
    // The pass holds the log alone until done(): acts push onto one copy instead of copying it per act.
    state: compliance.ownLog(complianceOf(world)), sink: sinkFor(ctx), tier: 3, source: ctx.source,
    party: (staffId, teamId) => partyOf(world, staffId, infos.get(teamId)?.headCoachId === staffId ? 'head_coach' : 'recruiter', teamId),
  };
  const people: recruiting.AiPeople = {
    disposition: (staffId) => (world.people.has(staffId) ? dispositionOf(world, staffId, param('people.pressure')) : null),
    evaluationSkill: () => turnoverParam('grade.aiSkill') / param('people.skillScale'),
    judgementError: () => param('people.judgementError'),
    reach: () => param('people.reach'),
    conduct: (scope) => stream(world.seed, STREAM_CONDUCT, [STREAM_RECRUITING, ...scope]),
  };
  const pass: PassBinding & { setDay(d: number): void; setClass(y: number): void } = {
    ctx: rctx, hook, people, level,
    programs: () => [...infos.values()],
    done: () => setCompliance(world, compliance.releaseLog(hook.state)),
    setDay: (d) => { currentDay = d; },
    setClass: (y) => rctx.setClass(y),
  };
  return pass;
}
