// TEST FIXTURES for staff AI (G-75). The game is the real phase 1 game (flow, reference resolver,
// officiating); the K4 and K5 ports are simple stand-ins for G-58 and G-59, which do not exist yet.
// Every number in the stand-in ports is a fixture value and must never be read as a rule or a rate.
import { ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, type GameDeps, type GameInput, type ParamFile, type ParamTable, type Side, type SimPlayer, type SimTeam } from '@gm/schema';
import { DMATH, field, seedFromHex, seedFromNumber, stream, streamSource } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import { generateCoachProfile, type CoachProfile, type CoachRole, type Draws } from '../../src/profile/index.ts';
import {
  DUTY, type AnyCall, type CallContext, type CallerPort, type Decider, type DecisionView, type ManagerPort, type OpposingCall,
  type SnappingCall, type StaffChart, type StaffFacets, type StaffMember,
} from '../../src/staff/index.ts';

export const SEED = seedFromNumber(20261126);
export const draws = (scope: readonly (string | number)[]): Draws => stream(SEED, 'coachAI', scope);

const FILES: readonly ParamFile[] = [
  officiating.clock.PARAMS, officiating.series.PARAMS, officiating.scrimmage.PARAMS, officiating.fouls.PARAMS,
  officiating.crew.PARAMS, officiating.replay.PARAMS, officiating.kick.PARAMS, officiating.restart.PARAMS,
  officiating.overtime.PARAMS, resolver.PARAMS, flow.PARAMS, stats.PARAMS,
];
function paramTable(): ParamTable {
  const map = new Map<string, number>();
  for (const f of FILES) for (const p of f.params) map.set(p.name, p.value);
  return { version: 'test', has: (n) => map.has(n), num(n) { const v = map.get(n); if (v === undefined) throw new Error(`unknown parameter ${n}`); return v; } };
}

const UNITS = ['offense', 'defense', 'kick', 'return'] as const;
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
export const PARAM_TABLE = paramTable();
export const LAST_DOWN = RULES.num('series.downs');
const OFFICIATING = officiating.facade.createOfficiating();

type Geometry = ReturnType<typeof field.fieldGeometry>;
function realGeometry(): Geometry | null {
  try { return field.fieldGeometry(RULES); } catch (e) {
    if (e instanceof Error && e.message.includes('missing required key')) return null;
    throw e;
  }
}
const REAL_GEOMETRY = realGeometry();
/**
 * True when the rule set holds every key the real game reads. On `main` before PR 107 (the field,
 * overtime and replay rule keys) it does not, and the whole-game tests cannot build a game: they are
 * marked skipped, loudly, and run as soon as the keys land. The unit tests need only the two goal lines.
 */
export const GAME_READY = REAL_GEOMETRY !== null;
/** FIXTURE goal lines for the unit tests when the real field keys are missing: 100 yd apart, never read by a game. */
export const GEOMETRY: Geometry = REAL_GEOMETRY ?? ({ goalLineWestX: 0, goalLineEastX: 100 } as Geometry);

/**
 * KNOWN ENGINE FAULT (reported to the integrator, 2026-11-26): every game that reaches overtime
 * throws this from the game flow, with any decider, staff AI or not. A whole-game test treats exactly
 * this error as "game not finished" and counts it; any other error still fails the test.
 */
const OVERTIME_FAULT = 'overtime start answered kickoff with no restart after the toss';
export function isOvertimeFault(e: unknown): boolean {
  return e instanceof Error && e.message.includes(OVERTIME_FAULT);
}

export function gameInput(i: number): GameInput {
  const hex = (0x1000 + i).toString(16).padStart(16, '0');
  return {
    gameId: i + 1, ruleSetId: 'pro_2026', gameType: 'regular', teams: [team(0), team(1)],
    crew: officiating.crew.neutralCrew(1), environment: NEUTRAL_ENVIRONMENT, seedHex: hex, fidelityTier: 'B',
  };
}

export function gameDeps(input: GameInput, deciders: readonly [Decider, Decider]): GameDeps {
  return { rules: RULES, params: PARAM_TABLE, geometry: GEOMETRY, streams: streamSource(seedFromHex(input.seedHex)), math: DMATH, resolver: resolver.REFERENCE_RESOLVER, officiating: OFFICIATING, deciders };
}

const fielded = (side: Side, unit: (typeof UNITS)[number]) => Array.from({ length: 11 }, (_, k) => ({ playerId: (side + 1) * 1000 + UNITS.indexOf(unit) * 100 + k + 1, role: unit }));
const ENV = { rules: RULES, params: PARAM_TABLE, geometry: GEOMETRY } as unknown as flow.FlowEnv;

/** The conservative calls of J11.6.1 for a view. */
export function safeSnap(view: DecisionView): SnappingCall {
  const s = view.situation;
  const probe = flow.defaultSnappingCall(ENV, s, []);
  return { ...probe, players: fielded(view.request.side, probe.unit === 'kick' ? 'kick' : 'offense') } as SnappingCall;
}
export function safeOppose(view: DecisionView): OpposingCall {
  const probe = flow.defaultOpposingCall(ENV, view.situation, []);
  return { ...probe, players: fielded(view.request.side, probe.unit === 'return' ? 'return' : 'defense') } as OpposingCall;
}
export const conservative = (view: DecisionView): AnyCall => (view.request.type === 'snapping_call' ? safeSnap(view) : safeOppose(view));

/** A decider that answers nothing: the flow applies every default. Used for the other sideline. */
export const silent = (side: Side): Decider => ({ side, decide: () => null });

export interface PortLog { readonly callers: number[]; readonly managers: number[]; readonly callFit: number[] }

/**
 * STAND-IN for K4 (G-58). It passes half the time on early downs, blitzes often, and offers only calls
 * the context permits unless `ignorePermits` is set (a misbehaving caller, to test the K6 check).
 */
export function fakeCaller(log: PortLog, opts: { ignorePermits?: boolean; blitzShare?: number; thinkTenths?: number | null } = {}): CallerPort {
  const ok = (ctx: CallContext, c: AnyCall) => opts.ignorePermits === true || ctx.permits(c);
  const at = (view: DecisionView) => (opts.thinkTenths === undefined || opts.thinkTenths === null ? null : Math.max(0, view.situation.playClockAtSnapTenths - opts.thinkTenths));
  return {
    snappingCall(view, ctx) {
      log.callers.push(ctx.caller.personId);
      log.callFit.push(ctx.caller.profile.behavior.callFit);
      const base = safeSnap(view);
      const u = ctx.draws.uniform();
      const options: SnappingCall[] = [];
      if (base.unit === 'offense') {
        const pass: SnappingCall = { ...base, kind: 'dropback_pass', runDirection: null, shotgun: true };
        const off = fielded(view.request.side, 'offense');
        const kick = (kickKind: 'punt' | 'field_goal'): SnappingCall => ({ unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null, players: fielded(view.request.side, 'kick') });
        options.push(...(u < 0.5 ? [pass, base] : [base, pass]), kick('punt'), kick('field_goal'));
        void off;
      } else {
        const off = fielded(view.request.side, 'offense');
        const go: SnappingCall = { unit: 'offense', playContentId: null, contentHash: null, kind: u < 0.5 ? 'dropback_pass' : 'run', personnelCode: '11', formationId: null, strength: null, motionId: null, protectionId: null, tags: [], runDirection: u < 0.5 ? null : 'middle', shotgun: u < 0.5, tempo: 'huddle', players: off };
        const scrimmage = view.situation.playKind === 'scrimmage';
        const alt: SnappingCall | null = base.unit === 'kick' && scrimmage ? { ...base, kickKind: base.kickKind === 'punt' ? 'field_goal' : 'punt' } : null;
        options.push(base, ...(alt ? [alt] : []), ...(scrimmage ? [go] : []));
      }
      const call = options.find((c) => ok(ctx, c)) ?? null;
      return call === null ? null : { call, acceptedAtPlayClockTenths: at(view) };
    },
    opposingCall(view, ctx) {
      log.callers.push(ctx.caller.personId);
      const base = safeOppose(view);
      const u = ctx.draws.uniform();
      const blitz: OpposingCall | null = base.unit === 'defense' && u < (opts.blitzShare ?? 0.6) ? { ...base, rushers: 6, coverageFamily: 'cover0' } : null;
      const call = [blitz, base].find((c): c is OpposingCall => c !== null && ok(ctx, c)) ?? null;
      return call === null ? null : { call, acceptedAtPlayClockTenths: at(view) };
    },
    suggest(view, ctx, max) {
      const base = view.request.type === 'opposing_call' ? safeOppose(view) : safeSnap(view);
      return [{ call: base, weight: 3 }, { call: base, weight: 2 }, { call: base, weight: 1 }].slice(0, max);
    },
  };
}

/** STAND-IN for K5 (G-59): the first allowed option; on the last down, go when short, else the first unit allowed. */
export function fakeManager(log: PortLog, opts: { lateBy?: number } = {}): ManagerPort {
  return {
    choose(view, ctx) {
      log.managers.push(ctx.decider.personId);
      const pick = ctx.allowed.includes(view.request.defaultOptionId ?? '') ? view.request.defaultOptionId! : ctx.allowed[0];
      if (pick === undefined) return null;
      const d = view.request.deadlinePlayClockTenths;
      return { optionId: pick, acceptedAtPlayClockTenths: d === null ? null : d + (opts.lateBy === undefined ? 10 : -opts.lateBy), errorId: null };
    },
    lastDown(view, ctx) {
      log.managers.push(ctx.decider.personId);
      const want = (view.situation.distanceYd ?? 99) <= 1 ? 'go' : 'punt';
      const choice = ctx.allowedUnits.includes(want) ? want : ctx.allowedUnits[0]!;
      return { choice, errorId: null };
    },
    advise(view, analyst) {
      const first = view.request.options[0]?.optionId ?? 'none';
      return { optionId: first, margin: analyst.profile.behavior.evaluation, close: false };
    },
    genericLine(view) {
      return { optionId: view.request.options[0]?.optionId ?? 'none', margin: 0, close: true };
    },
  };
}

export const newLog = (): PortLog => ({ callers: [], managers: [], callFit: [] });

const MID: StaffFacets = { candor: 50, ego: 50, workHabits: 50, loyalty: 50, riskTolerance: 50, ruleRespectZ: 0 };

export function profile(personId: number, role: CoachRole, behavior: Partial<CoachProfile['behavior']> = {}): CoachProfile {
  const p = generateCoachProfile({ personId: `p${personId}`, level: 'pro', role, age: 45, playedSide: null, seasonsCalling: 3, seasonsAsHeadCoach: 0 }, stream(SEED, 'worldgen', ['coach', personId]));
  return { ...p, behavior: { callFit: 0, preparation: 0, adjustment: 0, selfScout: 0, clockManagement: 0, teaching: 0, evaluation: 0, ...behavior } };
}

export function staffer(personId: number, role: CoachRole, over: { behavior?: Partial<CoachProfile['behavior']>; facets?: Partial<StaffFacets>; seat?: 'booth' | 'sideline'; available?: boolean; imported?: boolean } = {}): StaffMember {
  return {
    personId, profile: profile(personId, role, over.behavior), facets: { ...MID, ...over.facets }, seat: over.seat ?? 'sideline',
    available: over.available ?? true, imported: over.imported ?? false,
  };
}

export const USER = 1;
export const OC = 10, DC = 11, STC = 12, AHC = 13, ANALYST = 14, QB_COACH = 15;

/** A head coach user with every game duty delegated. */
export function fullStaff(over: Partial<StaffChart> = {}, members: StaffMember[] = [
  staffer(OC, 'offensiveCoordinator', { seat: 'booth' }), staffer(DC, 'defensiveCoordinator'), staffer(STC, 'specialTeamsCoordinator'),
  staffer(AHC, 'positionCoach'), staffer(ANALYST, 'positionCoach', { seat: 'booth' }), staffer(QB_COACH, 'positionCoach'),
]): StaffChart {
  return {
    headCoachId: USER, userId: USER, members,
    assignments: {
      [DUTY.callOffense]: { holderId: OC, autonomy: 'decides' },
      [DUTY.callDefense]: { holderId: DC, autonomy: 'decides' },
      [DUTY.callSpecialTeams]: { holderId: STC, autonomy: 'decides' },
      [DUTY.gameManagement]: { holderId: AHC, autonomy: 'decides' },
      [DUTY.gameManagementAdvice]: { holderId: ANALYST, autonomy: 'decides' },
    },
    succession: { [DUTY.callOffense]: [QB_COACH, AHC], '*': [AHC, OC, DC] },
    ...over,
  };
}

/** A synthetic view for unit tests: third and 8 at midfield in the second quarter unless overridden. */
export function view(over: { type?: DecisionView['request']['type']; side?: Side; options?: string[]; defaultOptionId?: string | null; deadline?: number | null; requestId?: number; situation?: Partial<DecisionView['situation']> } = {}): DecisionView {
  const side = over.side ?? 0;
  const type = over.type ?? 'snapping_call';
  const offense: Side = type === 'opposing_call' ? (side === 0 ? 1 : 0) : side;
  const mid = (GEOMETRY.goalLineWestX + GEOMETRY.goalLineEastX) / 2;
  return {
    lastCalled: null,
    request: {
      requestId: over.requestId ?? 7, type, side, options: (over.options ?? []).map((optionId) => ({ optionId, labelKey: optionId })),
      deadlinePlayClockTenths: over.deadline === undefined ? 0 : over.deadline, windowTenths: null, defaultOptionId: over.defaultOptionId ?? null,
    },
    situation: {
      gameId: 1, playNumber: 20, driveNumber: 3, playKind: 'scrimmage', period: 2, overtime: false, clockTenths: 6000, clockStatus: 'running',
      playClockAtSnapTenths: 400, offense, attackDir: 1, down: 3, distanceYd: 8, goalToGo: false, ballX: mid, ballY: 0, lineToGainX: mid + 8,
      score: [0, 0], timeoutsLeft: [3, 3], insideTwoMinute: false, untimedDown: false, ...over.situation,
    },
  };
}
