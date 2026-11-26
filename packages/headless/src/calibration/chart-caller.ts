// Scripted chart caller (contract decision D-20; J14.6.1 "scripted callers"). It implements `Decider`
// and stands in for coach AI (K4, K5) until phase 5, so the phase 1 gate can run league-mode batches.
// It sees only the DecisionView (public situation, last called play, the request), plus what the
// team's own coach knows before the game: its depth chart and the field geometry. No truth (Q1.4.1).
//
// Choices are fixed by the chart (params.ts, every number an Assumption) and, inside a mix, by a pure
// hash of (game, play, request, side, salt). It never draws from the engine's random streams, so adding
// or changing the caller cannot shift any other draw of the game (J13), and the same game replays the
// same calls.
//
// Contract gap (sent to the integrator): DecisionView does not show the opposing coach which unit the
// snapping team sent out. The caller predicts it from the situation with its own fourth-down chart and
// sends a return unit for a predicted punt or field goal; a real coach also decides from the situation.
import type {
  Decider, DecisionView, Decision, DecisionRequest, FieldGeometry, FieldedPlayer, GameSituation, Side,
  OffenseCall, DefenseCall, KickCall, ReturnCall, SnappingCall, OpposingCall,
} from '@gm/schema';
import { chartParams } from './params.ts';

export type CallUnit = 'offense' | 'defense' | 'kick' | 'return';

/** Who goes on the field for a unit. Phase 1 uses unit roles only (SimTeam.depth). */
export type RosterSource = (unit: CallUnit, personnelCode: string | null) => FieldedPlayer[];

/**
 * Default roster source: the first eleven ids under the unit's depth-chart key (`offense`, `defense`,
 * `kick`, `return`), each given the unit name as its role. A missing key sends nobody, which the rules
 * then flag (fewer than eleven is allowed and draws a foul, never a refusal: J4.6.1).
 */
export function depthRoster(depth: Readonly<Record<string, readonly number[]>>, perUnit = 11): RosterSource {
  return (unit) => (depth[unit] ?? []).slice(0, perUnit).map((playerId) => ({ playerId, role: unit }));
}

export interface ChartCallerOptions {
  readonly side: Side;
  readonly geometry: FieldGeometry;
  readonly roster: RosterSource;
  /** Number of regulation periods, from the rule set (read by the caller's builder, never typed here). */
  readonly regulationPeriods: number;
  /** Overrides of chart parameters by name (tuning runs). */
  readonly overrides?: Readonly<Record<string, number>>;
}

/** 32-bit mix (splitmix32 finaliser) of integers; integer arithmetic only, so every platform agrees. */
export function mix32(...xs: readonly number[]): number {
  let h = 0x9e3779b9 | 0;
  for (const x of xs) {
    h = (h + (x | 0) + 0x9e3779b9) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}
/** Uniform in [0, 1) from the hash. */
function u01(...xs: readonly number[]): number { return mix32(...xs) / 4294967296; }

/** Picks from (label, weight) pairs; weights need not sum to one. */
function pick<T>(r: number, items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of items) total += Math.max(0, w);
  let x = r * total;
  for (const [v, w] of items) { x -= Math.max(0, w); if (x < 0) return v; }
  return items[items.length - 1]![0];
}

const SALT = { kind: 1, family: 2, personnel: 3, dir: 4, shotgun: 5, tempo: 6, fourth: 7, cover: 8, rush: 9, two: 10 } as const;

export function createChartCaller(opts: ChartCallerOptions): Decider {
  const P = chartParams(opts.overrides);
  const g = opts.geometry;
  const side = opts.side;

  const yardsToGoal = (s: GameSituation): number => (s.attackDir === 1 ? g.goalLineEastX - s.ballX : s.ballX - g.goalLineWestX);
  const margin = (s: GameSituation, team: Side): number => s.score[team] - s.score[team === 0 ? 1 : 0];
  const lastPeriodLate = (s: GameSituation, tenths: number): boolean => !s.overtime && s.period === opts.regulationPeriods && s.clockTenths <= tenths;
  const ytg = (s: GameSituation): number => (s.distanceYd === null ? 10 : s.distanceYd);
  const r = (s: GameSituation, req: DecisionRequest, salt: number): number => u01(s.gameId, s.playNumber, req.requestId, side, salt);

  /** Fourth-down chart for the team with the ball (also used by the defense to predict it). */
  function fourthDownChoice(s: GameSituation, rr: number): 'punt' | 'fieldGoal' | 'go' {
    const togo = ytg(s), toGoal = yardsToGoal(s), kickYd = toGoal + P('chart.fourth.kickDistanceAddYd');
    const trailingLate = margin(s, s.offense) < 0 && lastPeriodLate(s, P('chart.fourth.trailingLateTenths'));
    if (trailingLate) return 'go';
    const fgRange = kickYd <= P('chart.fourth.fieldGoalMaxKickYd');
    if (togo <= P('chart.fourth.goMaxYardsToGo') && toGoal <= P('chart.fourth.goMaxYardsToGoal') && rr < P('chart.fourth.goShortShare')) return 'go';
    if (fgRange) return 'fieldGoal';
    return toGoal <= P('chart.fourth.puntMinYardsToGoal') ? 'go' : 'punt';
  }

  function passShare(s: GameSituation): number {
    const short = ytg(s) <= P('chart.shortYardsToGo');
    switch (s.down) {
      case 1: return P('chart.passShare.down1');
      case 2: return P(short ? 'chart.passShare.down2Short' : 'chart.passShare.down2Long');
      case 3: return P(short ? 'chart.passShare.down3Short' : 'chart.passShare.down3Long');
      default: return P(short ? 'chart.passShare.down4Short' : 'chart.passShare.down4Long');
    }
  }

  function offenseCall(s: GameSituation, req: DecisionRequest): OffenseCall {
    const leadingLate = margin(s, side) > 0 && lastPeriodLate(s, P('chart.kneel.clockTenths'));
    const personnel = pick(r(s, req, SALT.personnel), [['12', P('chart.personnel.p12')], ['21', P('chart.personnel.p21')], ['13', P('chart.personnel.p13')], ['22', P('chart.personnel.p22')], ['10', P('chart.personnel.p10')],
      ['11', Math.max(0, 1 - P('chart.personnel.p12') - P('chart.personnel.p21') - P('chart.personnel.p13') - P('chart.personnel.p22') - P('chart.personnel.p10'))]] as const);
    let kind: OffenseCall['kind'];
    if (leadingLate && s.playKind === 'scrimmage') kind = 'kneel';
    else if (r(s, req, SALT.kind) < passShare(s)) {
      const pa = P('chart.pass.playActionShare'), sc = P('chart.pass.screenShare'), qk = P('chart.pass.quickShare'), rpo = P('chart.pass.rpoShare');
      kind = pick(r(s, req, SALT.family), [['play_action', pa], ['screen', sc], ['quick_pass', qk], ['rpo', rpo], ['dropback_pass', Math.max(0, 1 - pa - sc - qk - rpo)]] as const);
    } else kind = 'run';
    const isRun = kind === 'run' || kind === 'kneel';
    const dir = kind === 'run' ? pick(r(s, req, SALT.dir), [['left', P('chart.run.leftShare')], ['middle', P('chart.run.middleShare')], ['right', Math.max(0, 1 - P('chart.run.leftShare') - P('chart.run.middleShare'))]] as const) : null;
    return {
      unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: personnel, formationId: null, strength: null, motionId: null,
      protectionId: null, tags: [], runDirection: dir, shotgun: kind === 'kneel' ? false : (!isRun || kind === 'run') && r(s, req, SALT.shotgun) < P('chart.shotgunShare'),
      tempo: r(s, req, SALT.tempo) < P('chart.noHuddleShare') ? 'no_huddle' : 'huddle', players: opts.roster('offense', personnel),
    };
  }

  function kickCall(kickKind: KickCall['kickKind']): KickCall {
    return { unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null, players: opts.roster('kick', null) };
  }

  function snappingCall(s: GameSituation, req: DecisionRequest): SnappingCall {
    switch (s.playKind) {
      case 'kickoff': return kickCall(margin(s, side) < 0 && lastPeriodLate(s, P('chart.onside.trailingLateTenths')) ? 'onside_kick' : 'kickoff');
      case 'safety_kick': return kickCall('safety_kick');
      case 'fair_catch_kick': return kickCall('fair_catch_kick');
      case 'try': {
        // Go for two when it is the planned share, or when down by 2 late (a two-point try ties).
        const late = lastPeriodLate(s, P('chart.fourth.trailingLateTenths'));
        const goTwo = (late && margin(s, side) === -2) || r(s, req, SALT.two) < P('chart.try.twoPointShare');
        return goTwo ? offenseCall(s, req) : kickCall('try_kick');
      }
      case 'scrimmage': {
        if (s.down === 4) {
          const c = fourthDownChoice(s, r(s, req, SALT.fourth));
          if (c === 'punt') return kickCall('punt');
          if (c === 'fieldGoal') return kickCall('field_goal');
        }
        return offenseCall(s, req);
      }
    }
  }

  function defenseCall(s: GameSituation, req: DecisionRequest): DefenseCall {
    const fam = pick(r(s, req, SALT.cover), [['cover1', P('chart.cover.cover1')], ['cover2', P('chart.cover.cover2')], ['cover4', P('chart.cover.cover4')], ['cover0', P('chart.cover.cover0')], ['cover6', P('chart.cover.cover6')], ['two_man', P('chart.cover.twoMan')],
      ['cover3', Math.max(0, 1 - P('chart.cover.cover1') - P('chart.cover.cover2') - P('chart.cover.cover4') - P('chart.cover.cover0') - P('chart.cover.cover6') - P('chart.cover.twoMan'))]] as const);
    const rushers = fam === 'cover0' ? 6 : pick(r(s, req, SALT.rush), [[3, P('chart.rush.three')], [5, P('chart.rush.five')], [6, P('chart.rush.six')], [7, P('chart.rush.seven')],
      [4, Math.max(0, 1 - P('chart.rush.three') - P('chart.rush.five') - P('chart.rush.six') - P('chart.rush.seven'))]] as const);
    return {
      unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
      coverageFamily: fam, rushers, boxCount: P('chart.box.base'), players: opts.roster('defense', null),
    };
  }

  function returnCall(kind: ReturnCall['returnKind']): ReturnCall {
    return { unit: 'return', returnKind: kind, callContentId: null, contentHash: null, players: opts.roster('return', null) };
  }

  function opposingCall(s: GameSituation, req: DecisionRequest): OpposingCall {
    switch (s.playKind) {
      case 'kickoff': return returnCall(margin(s, s.offense) < 0 && lastPeriodLate(s, P('chart.onside.trailingLateTenths')) ? 'hands_team' : 'kick_return');
      case 'safety_kick': case 'fair_catch_kick': return returnCall('kick_return');
      case 'try': return defenseCall(s, req);
      case 'scrimmage': {
        if (s.down === 4) {
          // Predict the other team's unit with the same chart, from its side of the situation.
          const c = fourthDownChoice(s, r(s, req, SALT.fourth));
          if (c === 'punt') return returnCall('punt_return');
          if (c === 'fieldGoal') return returnCall('field_goal_block');
        }
        return defenseCall(s, req);
      }
    }
  }

  function answer(req: DecisionRequest, extra: Partial<Pick<Decision, 'optionId' | 'snappingCall' | 'opposingCall'>>): Decision {
    return {
      requestId: req.requestId, type: req.type, side, optionId: extra.optionId ?? null, snappingCall: extra.snappingCall ?? null,
      opposingCall: extra.opposingCall ?? null, acceptedAtPlayClockTenths: null, actor: { kind: 'ai', personId: null },
    };
  }

  return {
    side,
    decide(view: DecisionView): Decision | null {
      const { request: req, situation: s } = view;
      if (req.side !== side) return null;
      switch (req.type) {
        case 'snapping_call': return answer(req, { snappingCall: snappingCall(s, req) });
        case 'opposing_call': return answer(req, { opposingCall: opposingCall(s, req) });
        // Every other prompt (toss, penalty, timeout, challenge, runoff, overtime, try choice) takes the
        // rule set's default option: the chart has no opinion, and the option ids belong to the rule set.
        default: return req.defaultOptionId === null ? null : answer(req, { optionId: req.defaultOptionId });
      }
    },
  };
}
