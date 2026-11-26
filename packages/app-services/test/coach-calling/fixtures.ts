// TEST FIXTURES for the content-backed AI caller. The game is the real phase 1 game (flow, reference resolver,
// officiating). The staff chart, the K5 manager stand-in and every payoff number in the hand-built K3 sheets are
// fixture values and must never be read as a rule or a rate.
import { DMATH, field, seedFromHex, seedFromNumber, stream, streamSource } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import { profile as coachProfile, staff, type preparation } from '@gm/coach-ai';
import { ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, type FieldedPlayer, type GameDeps, type GameInput, type ParamFile, type ParamTable, type Side, type SimPlayer, type SimTeam } from '@gm/schema';
import type { LineupFor } from '../../src/commands/game-calling/decision.ts';

export const SEED = seedFromNumber(20261126);
export const draws = (scope: readonly (string | number)[]) => stream(SEED, 'coachAI', scope);

const FILES: readonly ParamFile[] = [
  officiating.clock.PARAMS, officiating.series.PARAMS, officiating.scrimmage.PARAMS, officiating.fouls.PARAMS, officiating.crew.PARAMS,
  officiating.replay.PARAMS, officiating.kick.PARAMS, officiating.restart.PARAMS, officiating.overtime.PARAMS, resolver.PARAMS, flow.PARAMS, stats.PARAMS,
];
function paramTable(): ParamTable {
  const map = new Map<string, number>();
  for (const f of FILES) for (const p of f.params) map.set(p.name, p.value);
  return { version: 'test', has: (n) => map.has(n), num(n) { const v = map.get(n); if (v === undefined) throw new Error(`unknown parameter ${n}`); return v; } };
}

const UNITS = ['offense', 'defense', 'kick', 'return'] as const;
/** PLACEHOLDER teams: four units of eleven at one attribute value, no real or generated people. */
function team(side: Side): SimTeam {
  const players: SimPlayer[] = [];
  const depth: Record<string, number[]> = {};
  UNITS.forEach((unit, u) => {
    depth[unit] = [];
    for (let i = 1; i <= 11; i++) {
      const playerId = (side + 1) * 1000 + u * 100 + i;
      const attributes: Record<string, number> = {};
      for (const a of ATTRIBUTE_IDS) attributes[a] = 50;
      players.push({
        playerId, position: unit, jersey: (u * 11 + i) % 100, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
        tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 },
        gameDay: { freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false },
      });
      depth[unit]!.push(playerId);
    }
  });
  return { teamId: side + 1, side, players, depth, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}

export const RULES = resolveRuleSet('pro_2026');
const PARAM_TABLE = paramTable();
export const LAST_DOWN = RULES.num('series.downs');
export const GEOMETRY = field.fieldGeometry(RULES);
export const REGULATION_PERIODS = RULES.num('clock.periods');
const OFFICIATING = officiating.facade.createOfficiating();

/** KNOWN ENGINE FAULT (coach-ai staff fixtures): a game that reaches overtime can throw this; a whole-game test retries. */
export const isOvertimeFault = (e: unknown) => e instanceof Error && e.message.includes('overtime start answered kickoff with no restart after the toss');

export function gameInput(i: number): GameInput {
  return {
    gameId: i + 1, ruleSetId: 'pro_2026', gameType: 'regular', teams: [team(0), team(1)], crew: officiating.crew.neutralCrew(1),
    environment: NEUTRAL_ENVIRONMENT, seedHex: (0x2000 + i).toString(16).padStart(16, '0'), fidelityTier: 'B',
  };
}
export function gameDeps(input: GameInput, deciders: GameDeps['deciders']): GameDeps {
  return { rules: RULES, params: PARAM_TABLE, geometry: GEOMETRY, streams: streamSource(seedFromHex(input.seedHex)), math: DMATH, resolver: resolver.REFERENCE_RESOLVER, officiating: OFFICIATING, deciders };
}

/** The depth chart: the eleven of each unit (fixture teams have no personnel groups). */
export const lineupOf = (side: Side): LineupFor => (unit) => Array.from({ length: 11 }, (_, k): FieldedPlayer => ({ playerId: (side + 1) * 1000 + UNITS.indexOf(unit) * 100 + k + 1, role: unit }));

const ENV = { rules: RULES, params: PARAM_TABLE, geometry: GEOMETRY } as unknown as flow.FlowEnv;
export const conservative = (view: staff.DecisionView): staff.AnyCall => {
  const side = view.request.side;
  if (view.request.type === 'snapping_call') { const p = flow.defaultSnappingCall(ENV, view.situation, []); return { ...p, players: lineupOf(side)(p.unit, null) } as staff.AnyCall; }
  const p = flow.defaultOpposingCall(ENV, view.situation, []);
  return { ...p, players: lineupOf(side)(p.unit, null) } as staff.AnyCall;
};

/** STAND-IN for K5 (G-59): the default option; on the last down go when one yard or less, else punt. */
export function manager(): staff.ManagerPort {
  return {
    choose(view, ctx) {
      const pick = ctx.allowed.includes(view.request.defaultOptionId ?? '') ? view.request.defaultOptionId! : ctx.allowed[0];
      if (pick === undefined) return null;
      const d = view.request.deadlinePlayClockTenths;
      return { optionId: pick, acceptedAtPlayClockTenths: d === null ? null : d + 10, errorId: null };
    },
    lastDown(view, ctx) {
      const want = (view.situation.distanceYd ?? 99) <= 1 ? 'go' : 'punt';
      return { choice: ctx.allowedUnits.includes(want) ? want : ctx.allowedUnits[0]!, errorId: null };
    },
    advise(view, analyst) { return { optionId: view.request.options[0]?.optionId ?? 'none', margin: analyst.profile.behavior.evaluation, close: false }; },
    genericLine(view) { return { optionId: view.request.options[0]?.optionId ?? 'none', margin: 0, close: true }; },
  };
}

export function profileOf(personId: number, role: coachProfile.CoachRole): coachProfile.CoachProfile {
  const p = coachProfile.generateCoachProfile({ personId: `p${personId}`, level: 'pro', role, age: 45, playedSide: null, seasonsCalling: 3, seasonsAsHeadCoach: 0 }, stream(SEED, 'worldgen', ['coach', personId]));
  return { ...p, behavior: { callFit: 0, preparation: 0, adjustment: 0, selfScout: 0, clockManagement: 0, teaching: 0, evaluation: 0 } };
}

export const HC = 1, OC = 10, DC = 11, STC = 12, AHC = 13;
const MID: staff.StaffFacets = { candor: 50, ego: 50, workHabits: 50, loyalty: 50, riskTolerance: 50, ruleRespectZ: 0 };
const member = (personId: number, role: coachProfile.CoachRole, seat: 'booth' | 'sideline' = 'sideline'): staff.StaffMember =>
  ({ personId, profile: profileOf(personId, role), facets: MID, seat, available: true, imported: false });

/** An AI staff: no user on it, every game duty with its coordinator. */
export function aiStaff(): staff.StaffChart {
  return {
    headCoachId: HC, userId: null,
    members: [member(HC, 'headCoach'), member(OC, 'offensiveCoordinator', 'booth'), member(DC, 'defensiveCoordinator'), member(STC, 'specialTeamsCoordinator'), member(AHC, 'positionCoach')],
    assignments: {
      [staff.DUTY.callOffense]: { holderId: OC, autonomy: 'decides' }, [staff.DUTY.callDefense]: { holderId: DC, autonomy: 'decides' },
      [staff.DUTY.callSpecialTeams]: { holderId: STC, autonomy: 'decides' }, [staff.DUTY.gameManagement]: { holderId: HC, autonomy: 'decides' },
      [staff.DUTY.gameManagementAdvice]: { holderId: AHC, autonomy: 'decides' },
    },
    succession: { '*': [AHC, OC, DC] },
  };
}

/** FIXTURE K3 matrix: payoffs are made-up numbers that vary by call and look, nothing more. */
export function matrix(bucketId: string, unit: 'offense' | 'defense', candidates: readonly string[], looks: readonly string[], shares: readonly number[]): preparation.BucketMatrix {
  const a = candidates.map((_, i) => looks.map((_, j) => (((i * 7 + j * 3) % 11) - 5) / 20));
  return {
    bucketId, unit, payoffIn: 'expectedPoints', candidates, looks, shares, counts: shares.map((s) => Math.round(s * 40)),
    a, uncertainty: a.map((r) => r.map(() => 0.1)), sigmaStar: null,
  };
}

/** FIXTURE K3 sheet over catalogue situations, each box listing the given content ids. */
export function aiSheet(unit: 'offense' | 'defense', boxes: Readonly<Record<string, readonly string[]>>, looks: readonly string[], shares: readonly number[]): preparation.AiSheet {
  const ids = Object.keys(boxes);
  return {
    unit, gameId: 1, uncovered: [], script: [], sequences: [], mustCalls: [], lockedAt: null, version: 1,
    boxes: ids.map((situationId, priority) => ({ id: `${unit}:${situationId}`, situationId, priority, entries: boxes[situationId]!.map((callId, rank) => ({ callId, rank })) })),
    matrices: ids.map((situationId) => matrix(situationId, unit, boxes[situationId]!, looks, shares)),
  };
}
