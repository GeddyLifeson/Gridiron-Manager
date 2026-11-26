// The head coach's staff on game day (K6.1.1, L4.1.2, I9.4.1, I9.4.2 proposed in plans/head-coach-nuance.md item
// 2b). Each coordinator calls his own unit unless the head coach says otherwise before or during the game (Marlon,
// 2026-11-26 19:15 UTC: "each coordinator should be allowed to call their stuff in the games unless I say before
// or during the game"). The head coach keeps game management (fourth down, the try, timeouts, challenges, penalty
// choices) unless he hands it to the staff member who holds it.
//
// A unit changes hands only at a dead ball, only when the head coach says so, and is never taken from a coordinator
// automatically. The change is a chart change: the duty's assignment becomes "keeps" (the head coach) or goes back
// to the holder the staff chart had before the game.
//
// `chartCallerStaff` is the stand-in call engine for a staff whose K3 week is not wired yet: each coordinator calls
// through the level's chart caller (world season chart). The decisions are still made and logged in his name, so a
// watched game, a takeover and the decision log behave as they will with full K4 callers.
import { stream, type WorldSeed } from '@gm/engine-core';
import { profile as coachProfile, staff } from '@gm/coach-ai';
import type { Decider, DecisionView, FieldedPlayer, KickCall, SnappingCall } from '@gm/schema';
import type { LineupFor } from './decision.ts';

/** A unit of calls the head coach can keep or hand to his staff. */
export type SeatUnit = 'offense' | 'defense' | 'special_teams' | 'management';
export const SEAT_UNITS: readonly SeatUnit[] = ['offense', 'defense', 'special_teams', 'management'];

export const UNIT_DUTY: Readonly<Record<SeatUnit, staff.Duty>> = {
  offense: staff.DUTY.callOffense,
  defense: staff.DUTY.callDefense,
  special_teams: staff.DUTY.callSpecialTeams,
  management: staff.DUTY.gameManagement,
};

export function unitOfDuty(duty: staff.Duty): SeatUnit | null {
  for (const u of SEAT_UNITS) if (UNIT_DUTY[u] === duty) return u;
  return null;
}

/** The units the head coach keeps when he says nothing before the game: game management only (Marlon 19:15). */
export const DEFAULT_KEEP: readonly SeatUnit[] = ['management'];

/** Everything a seat's staff needs to run the user's side of a game. */
export interface SeatStaff {
  /** The staff as hired: who holds each duty before the head coach keeps anything. The user is the head coach. */
  readonly chart: staff.StaffChart;
  readonly caller: staff.CallerPort;
  readonly manager: staff.ManagerPort;
  readonly instructions?: readonly staff.StandingInstruction[];
  readonly sheets?: Readonly<Record<string, staff.SheetRef>>;
  conservative?(view: staff.DecisionView): staff.AnyCall | null;
  /** Stream `coachAI` for a scope (J13.2.1). */
  draws(scope: readonly (string | number)[]): ReturnType<staff.StaffDeciderConfig['draws']>;
}

/** The chart with `keep` taken by the head coach and every other game unit with the holder it was hired with. */
export function chartKeeping(base: staff.StaffChart, keep: ReadonlySet<SeatUnit>): staff.StaffChart {
  const assignments: Record<string, staff.Assignment> = { ...base.assignments };
  for (const u of SEAT_UNITS) {
    const duty = UNIT_DUTY[u];
    if (keep.has(u)) assignments[duty] = { holderId: null, autonomy: 'keeps' };
    else if (base.assignments[duty]) assignments[duty] = base.assignments[duty]!;
    else delete assignments[duty];
  }
  return { ...base, assignments };
}

/** Who calls a unit under a chart: the user, a staff member (by id), or nobody present. */
export function callerOf(chart: staff.StaffChart, unit: SeatUnit): { readonly isUser: boolean; readonly personId: number | null } {
  const o = staff.ownerOf(chart, UNIT_DUTY[unit]);
  return { isUser: o.isUser, personId: o.personId };
}

/** The person the hired chart gives a unit to when the head coach hands it back, or null when he holds it himself. */
export function holderOf(base: staff.StaffChart, unit: SeatUnit): number | null {
  const a = base.assignments[UNIT_DUTY[unit]];
  return a && a.autonomy !== 'keeps' && a.holderId !== null && a.holderId !== base.headCoachId ? a.holderId : null;
}

function kickCall(kickKind: KickCall['kickKind'], players: FieldedPlayer[]): KickCall {
  return { unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null, players } as KickCall;
}

/**
 * K4 and K5 ports over a scripted decider (the chart caller) for a staff with no K3 sheets yet. The coordinator
 * whose turn it is decides with the chart's call; when the head coach's fourth-down choice rules the chart's call
 * out, the coordinator calls what the choice asks for: his third-down call of the same distance for "go", the
 * kicking unit for a punt or field goal.
 */
export function chartCallerStaff(decider: Decider, lineup: LineupFor): { caller: staff.CallerPort; manager: staff.ManagerPort } {
  const ask = (view: DecisionView) => decider.decide(view);
  const caller: staff.CallerPort = {
    snappingCall(view, ctx) {
      const d = ask(view);
      const call = d?.snappingCall ?? null;
      if (call && ctx.permits(call)) return { call, acceptedAtPlayClockTenths: d!.acceptedAtPlayClockTenths };
      const s = view.situation;
      if (s.playKind === 'scrimmage' && s.down !== null && s.down >= 4) {
        const again = ask({ ...view, situation: { ...s, down: 3 } })?.snappingCall ?? null;
        if (again && again.unit === 'offense' && ctx.permits(again)) return { call: again, acceptedAtPlayClockTenths: null };
        for (const k of ['punt', 'field_goal'] as const) {
          const kc = kickCall(k, lineup('kick', null, k));
          if (ctx.permits(kc as SnappingCall)) return { call: kc as SnappingCall, acceptedAtPlayClockTenths: null };
        }
      }
      return null;
    },
    opposingCall(view, ctx) {
      const d = ask(view);
      const call = d?.opposingCall ?? null;
      return call && ctx.permits(call) ? { call, acceptedAtPlayClockTenths: d!.acceptedAtPlayClockTenths } : null;
    },
    suggest() { return []; },
  };
  const manager: staff.ManagerPort = {
    choose(view, ctx) {
      const d = ask(view);
      const id = d?.optionId ?? null;
      const pick = id !== null && ctx.allowed.includes(id) ? id : (ctx.allowed.includes(view.request.defaultOptionId ?? '') ? view.request.defaultOptionId : ctx.allowed[0]) ?? null;
      return pick === null ? null : { optionId: pick, acceptedAtPlayClockTenths: d?.acceptedAtPlayClockTenths ?? null, errorId: null };
    },
    lastDown(view, ctx) {
      const call = ask(view)?.snappingCall ?? null;
      const want: staff.LastDownChoice = call && call.unit === 'kick' ? (call.kickKind === 'field_goal' ? 'field_goal' : 'punt') : 'go';
      return { choice: ctx.allowedUnits.includes(want) ? want : ctx.allowedUnits[0]!, errorId: null };
    },
    advise() { return null; },
    genericLine() { return null; },
  };
  return { caller, manager };
}

/** PLACEHOLDER staff ids for a seat team until hired staffs reach the game (the user is the head coach). */
export function placeholderStaffIds(teamId: number): { headCoach: number; offense: number; defense: number; specialTeams: number; assistant: number } {
  const base = 9_000_000 + teamId * 10;
  return { headCoach: base + 1, offense: base + 2, defense: base + 3, specialTeams: base + 4, assistant: base + 5 };
}

const MID_FACETS: staff.StaffFacets = { candor: 50, ego: 50, workHabits: 50, loyalty: 50, riskTolerance: 50, ruleRespectZ: 0 };

/**
 * PLACEHOLDER staff chart for a seat team: the user as head coach, a coordinator holding each unit, and an
 * assistant head coach holding game management for when the head coach hands it over. Profiles are generated from
 * the season seed (hidden parameters, E9.5.2), so the same season gives the same staff. Facets sit at the middle until
 * hired staffs with their people records reach the game.
 */
export function placeholderStaffChart(o: { readonly teamId: number; readonly level: 'pro' | 'college'; readonly seed: WorldSeed }): staff.StaffChart {
  const id = placeholderStaffIds(o.teamId);
  const member = (personId: number, role: coachProfile.CoachRole, seat: staff.Seat): staff.StaffMember => ({
    personId, facets: MID_FACETS, seat, available: true, imported: false,
    profile: coachProfile.generateCoachProfile(
      { personId: `p${personId}`, level: o.level, role, age: 45, playedSide: null, seasonsCalling: role === 'headCoach' ? 0 : 3, seasonsAsHeadCoach: 0 },
      stream(o.seed, 'coachAI', ['placeholder_staff', o.teamId, personId]),
    ),
  });
  return {
    headCoachId: id.headCoach, userId: id.headCoach,
    members: [
      member(id.offense, 'offensiveCoordinator', 'booth'), member(id.defense, 'defensiveCoordinator', 'sideline'),
      member(id.specialTeams, 'specialTeamsCoordinator', 'sideline'), member(id.assistant, 'positionCoach', 'sideline'),
    ],
    assignments: {
      [staff.DUTY.callOffense]: { holderId: id.offense, autonomy: 'decides' },
      [staff.DUTY.callDefense]: { holderId: id.defense, autonomy: 'decides' },
      [staff.DUTY.callSpecialTeams]: { holderId: id.specialTeams, autonomy: 'decides' },
      [staff.DUTY.gameManagement]: { holderId: id.assistant, autonomy: 'decides' },
    },
    succession: { '*': [id.assistant, id.offense, id.defense] },
  };
}
