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
import { full } from '@gm/football-content';
import { chartParams, PASS_PHASE_NAMES, PASS_MARGIN_NAMES, PASS_MARGIN_UPPER, PASS_DOWN_NAMES, PASS_TOGO_NAMES, PASS_TOGO_UPPER, FOURTH_TOGO_NAMES, FOURTH_TOGO_UPPER, FOURTH_ZONE_NAMES, FOURTH_ZONE_UPPER } from './params.ts';

export type CallUnit = 'offense' | 'defense' | 'kick' | 'return';

/**
 * Who goes on the field for a unit. Phase 1 uses unit roles only (SimTeam.depth). `detail` is the kick or
 * return kind of a kick or return call (punt, field_goal, kick_return ...), null on offense and defense.
 */
export type RosterSource = (unit: CallUnit, personnelCode: string | null, detail?: string | null) => FieldedPlayer[];

/**
 * Default roster source: the first eleven ids under the unit's most specific depth-chart key, `unit:detail`
 * (a kick or return kind: `kick:punt`), then `unit:personnel` (`offense:12`), then the unit (`offense`,
 * `defense`, `kick`, `return`), each given the unit name as its role. Placeholder rosters carry only the unit
 * keys; world rosters (world/gameday) carry the others too. A missing key sends nobody, which the rules then
 * flag (fewer than eleven is allowed and draws a foul, never a refusal: J4.6.1).
 */
export function depthRoster(depth: Readonly<Record<string, readonly number[]>>, perUnit = 11): RosterSource {
  return (unit, personnel, detail) => {
    const ids = (detail ? depth[`${unit}:${detail}`] : undefined) ?? (personnel ? depth[`${unit}:${personnel}`] : undefined) ?? depth[unit] ?? [];
    return ids.slice(0, perUnit).map((playerId) => ({ playerId, role: unit }));
  };
}

export interface ChartCallerOptions {
  readonly side: Side;
  readonly geometry: FieldGeometry;
  readonly roster: RosterSource;
  /** Number of regulation periods, from the rule set (read by the caller's builder, never typed here). */
  readonly regulationPeriods: number;
  /** Overrides of chart parameters by name (tuning runs). */
  readonly overrides?: Readonly<Record<string, number>>;
  /**
   * The staff's starter book (G3). With a book, every scrimmage call names a play or defensive call from the menu of
   * the chosen kind or coverage family (by weight, by its own hash), so a dropback pass is one of many concepts and not
   * always the same one. Without one, calls carry no content id (the resolver then uses its default per kind).
   */
  readonly book?: full.StarterBook | null;
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

const SALT = { kind: 1, family: 2, personnel: 3, dir: 4, shotgun: 5, tempo: 6, fourth: 7, cover: 8, rush: 9, two: 10, box: 11, hurry: 12, timeout: 13, motion: 14, fourthKick: 15, fourthLate: 16, play: 17, call: 18 } as const;

export function createChartCaller(opts: ChartCallerOptions): Decider {
  const P = chartParams(opts.overrides);
  const g = opts.geometry;
  const side = opts.side;

  const yardsToGoal = (s: GameSituation): number => (s.attackDir === 1 ? g.goalLineEastX - s.ballX : s.ballX - g.goalLineWestX);
  const margin = (s: GameSituation, team: Side): number => s.score[team] - s.score[team === 0 ? 1 : 0];
  const lastPeriodLate = (s: GameSituation, tenths: number): boolean => !s.overtime && s.period === opts.regulationPeriods && s.clockTenths <= tenths;
  const ytg = (s: GameSituation): number => (s.distanceYd === null ? 10 : s.distanceYd);
  const r = (s: GameSituation, req: DecisionRequest, salt: number): number => u01(s.gameId, s.playNumber, req.requestId, side, salt);
  const book = opts.book ?? null;
  /** The book situation (J11): goal line inside the 3, short yardage on third or fourth and 1 (Assumption). */
  const situationOf = (s: GameSituation): full.BookSituation =>
    s.playKind === 'scrimmage' && yardsToGoal(s) <= 3 ? 'goalLine' : s.playKind === 'scrimmage' && s.down !== null && s.down >= 3 && ytg(s) <= 1 ? 'shortYardage' : 'any';

  /**
   * Fourth-down chart for the team with the ball (also used by the defense to predict it). The draws leave the side and
   * the request out of the hash, so both teams read the same choice: the defense sees which unit runs on.
   */
  function fourthDownChoice(s: GameSituation): 'punt' | 'fieldGoal' | 'go' {
    const toGoal = yardsToGoal(s), kickYd = toGoal + P('chart.fourth.kickDistanceAddYd');
    const draw = (salt: number): number => u01(s.gameId, s.playNumber, salt);
    const trailingLate = margin(s, s.offense) < 0 && lastPeriodLate(s, P('chart.fourth.trailingLateTenths'));
    if (trailingLate && draw(SALT.fourthLate) < P('chart.fourth.trailingLateGoShare')) return 'go';
    const togo = togoInt(s);
    const line = Math.max(1, Math.round(toGoal));
    let z = 0; while (z < FOURTH_ZONE_UPPER.length && line > FOURTH_ZONE_UPPER[z]!) z++;
    let t = 0; while (t < FOURTH_TOGO_UPPER.length && togo > FOURTH_TOGO_UPPER[t]!) t++;
    if (draw(SALT.fourth) < P(`chart.fourth.go.${FOURTH_ZONE_NAMES[z]!}.${FOURTH_TOGO_NAMES[t]!}`) * P('chart.fourth.goScale')) return 'go';
    const sure = P('chart.fourth.fieldGoalSureKickYd'), max = P('chart.fourth.fieldGoalMaxKickYd');
    if (kickYd <= sure) return 'fieldGoal';
    if (kickYd < max && draw(SALT.fourthKick) < (max - kickYd) / (max - sure)) return 'fieldGoal';
    return toGoal <= P('chart.fourth.puntMinYardsToGoal') ? 'go' : 'punt';
  }

  /** Whole yards to go, the public convention: the nearest yard, and inches count as 1. */
  const togoInt = (s: GameSituation): number => Math.max(1, Math.round(ytg(s)));

  function passShare(s: GameSituation): number {
    if (s.playKind === 'scrimmage') {
      const line = Math.max(1, Math.round(yardsToGoal(s)));
      if (line <= 1) return P('chart.passShare.goalLine1');
      if (line <= 2) return P('chart.passShare.goalLine2');
    }
    const togo = togoInt(s);
    let t = 0; while (t < PASS_TOGO_UPPER.length && togo > PASS_TOGO_UPPER[t]!) t++;
    const d = Math.min(Math.max(s.down ?? 1, 1), PASS_DOWN_NAMES.length) - 1;
    // Score and quarter: the first and third quarters, the second, and the last period (and overtime).
    const half = opts.regulationPeriods / 2;
    const phase = s.overtime || s.period >= opts.regulationPeriods ? 2 : s.period === half ? 1 : 0;
    const m = margin(s, s.offense);
    let mi = 0; while (mi < PASS_MARGIN_UPPER.length && m > PASS_MARGIN_UPPER[mi]!) mi++;
    const game = P(`chart.passShare.game.${PASS_PHASE_NAMES[phase]!}.${PASS_MARGIN_NAMES[mi]!}`);
    return Math.min(1, P(`chart.passShare.${PASS_DOWN_NAMES[d]!}.${PASS_TOGO_NAMES[t]!}`) * game * P('chart.passShare.scale'));
  }

  /** The last period of a half in regulation, with no more than `tenths` on the clock. */
  const halfEnding = (s: GameSituation, tenths: number): boolean =>
    !s.overtime && (s.period === opts.regulationPeriods || s.period + s.period === opts.regulationPeriods) && s.clockTenths <= tenths;

  /** Tempo: hurry-up with the clock running at the end of a half (in the last period only when not ahead), more no-huddle when far behind late. */
  function tempoOf(s: GameSituation, req: DecisionRequest): OffenseCall['tempo'] {
    const m = margin(s, side);
    const last = !s.overtime && s.period === opts.regulationPeriods;
    if (s.clockStatus === 'running' && halfEnding(s, P('chart.hurry.clockTenths')) && (!last || m <= 0) && r(s, req, SALT.hurry) < P('chart.hurry.share')) return 'hurry_up';
    const share = last && m <= -P('chart.noHuddle.trailingLateMargin') ? P('chart.noHuddle.trailingLateShare') : P('chart.noHuddleShare');
    return r(s, req, SALT.tempo) < share ? 'no_huddle' : 'huddle';
  }

  /** A charged timeout with the clock running late in a half: the offense that hurries, the defense that needs the ball. */
  function wantsTimeout(s: GameSituation, req: DecisionRequest): boolean {
    // The chart takes its timeout as soon as the ball is dead (the request open to the end of the play clock), never
    // in the later window between the calls and the snap, whose deadline is the snap.
    if (req.deadlinePlayClockTenths !== 0) return false;
    if (s.clockStatus !== 'running' || !halfEnding(s, P('chart.timeout.clockTenths'))) return false;
    const m = margin(s, side);
    const last = s.period === opts.regulationPeriods;
    let share: number;
    if (s.offense === side) share = !last || m <= 0 ? P('chart.timeout.offenseShare') : 0;
    else share = last ? (m < 0 ? P('chart.timeout.defenseTrailingShare') : 0) : P('chart.timeout.defenseFirstHalfShare');
    return r(s, req, SALT.timeout) < share;
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
    const play = book !== null && kind !== 'kneel' ? full.bookPlay(book, kind, dir, situationOf(s), r(s, req, SALT.play)) : null;
    if (play !== null) {
      // The play carries its own personnel and shotgun choice (G1): the chart's personnel draw stands only without a book.
      return {
        unit: 'offense', playContentId: play.id, contentHash: null, kind, personnelCode: play.personnel, formationId: play.formationId, strength: null,
        motionId: r(s, req, SALT.motion) < P(isRun ? 'chart.motion.runShare' : 'chart.motion.passShare') ? 'chart_motion' : null,
        protectionId: null, tags: [], runDirection: dir, shotgun: play.shotgun, tempo: tempoOf(s, req), players: opts.roster('offense', play.personnel),
      };
    }
    return {
      unit: 'offense', playContentId: null, contentHash: null, kind, personnelCode: personnel, formationId: null, strength: null,
      motionId: kind !== 'kneel' && r(s, req, SALT.motion) < P(isRun ? 'chart.motion.runShare' : 'chart.motion.passShare') ? 'chart_motion' : null,
      protectionId: null, tags: [], runDirection: dir, shotgun: kind === 'kneel' ? false : (!isRun || kind === 'run') && r(s, req, SALT.shotgun) < P('chart.shotgunShare'),
      tempo: kind === 'kneel' ? 'huddle' : tempoOf(s, req), players: opts.roster('offense', personnel),
    };
  }

  /**
   * Go for two when it is the planned share, or when down by 2 late (a two-point try ties). The draw leaves the request
   * out of the hash, so the try choice (which moves the ball to the two-point spot) and the call that follows agree.
   */
  function goesForTwo(s: GameSituation): boolean {
    const late = lastPeriodLate(s, P('chart.fourth.trailingLateTenths'));
    return (late && margin(s, side) === -2) || u01(s.gameId, s.playNumber, side, SALT.two) < P('chart.try.twoPointShare');
  }

  function kickCall(kickKind: KickCall['kickKind']): KickCall {
    return { unit: 'kick', kickKind, callContentId: null, contentHash: null, direction: null, players: opts.roster('kick', null, kickKind) };
  }

  function snappingCall(s: GameSituation, req: DecisionRequest): SnappingCall {
    switch (s.playKind) {
      case 'kickoff': return kickCall(margin(s, side) < 0 && lastPeriodLate(s, P('chart.onside.trailingLateTenths')) ? 'onside_kick' : 'kickoff');
      case 'safety_kick': return kickCall('safety_kick');
      case 'fair_catch_kick': return kickCall('fair_catch_kick');
      case 'try': {
        return goesForTwo(s) ? offenseCall(s, req) : kickCall('try_kick');
      }
      case 'scrimmage': {
        if (s.down === 4) {
          const c = fourthDownChoice(s);
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
    const call = book !== null ? full.bookCall(book, fam, situationOf(s), r(s, req, SALT.call)) : null;
    if (call !== null) {
      // The named call sets its own rush and box (its content draws them); the chart's rush and box draws stand only without a book.
      return {
        unit: 'defense', callContentId: call.id, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
        coverageFamily: call.coverageFamily === 'other' ? fam : call.coverageFamily, rushers: call.rushers, players: opts.roster('defense', null), boxCount: call.boxCount,
      };
    }
    return {
      unit: 'defense', callContentId: null, contentHash: null, packageId: null, frontId: null, coverageId: null, pressureId: null,
      coverageFamily: fam, rushers, players: opts.roster('defense', null),
      boxCount: pick(r(s, req, SALT.box), [[6, P('chart.box.six')], [8, P('chart.box.eight')], [9, P('chart.box.nine')],
        [7, Math.max(0, 1 - P('chart.box.six') - P('chart.box.eight') - P('chart.box.nine'))]] as const),
    };
  }

  function returnCall(kind: ReturnCall['returnKind']): ReturnCall {
    return { unit: 'return', returnKind: kind, callContentId: null, contentHash: null, players: opts.roster('return', null, kind) };
  }

  function opposingCall(s: GameSituation, req: DecisionRequest): OpposingCall {
    switch (s.playKind) {
      case 'kickoff': return returnCall(margin(s, s.offense) < 0 && lastPeriodLate(s, P('chart.onside.trailingLateTenths')) ? 'hands_team' : 'kick_return');
      case 'safety_kick': case 'fair_catch_kick': return returnCall('kick_return');
      case 'try': return defenseCall(s, req);
      case 'scrimmage': {
        if (s.down === 4) {
          // Predict the other team's unit with the same chart, from its side of the situation.
          const c = fourthDownChoice(s);
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
        case 'timeout': {
          // The option that is not the default is the timeout; its id belongs to the flow, not to the chart.
          const take = req.options.find((o) => o.optionId !== req.defaultOptionId);
          if (take && wantsTimeout(s, req)) return answer(req, { optionId: take.optionId });
          return req.defaultOptionId === null ? null : answer(req, { optionId: req.defaultOptionId });
        }
        case 'try_choice': {
          // The option that is not the default is the try by run or pass, snapped from its own spot (B7.3.1).
          const two = req.options.find((o) => o.optionId !== req.defaultOptionId);
          if (two && goesForTwo(s)) return answer(req, { optionId: two.optionId });
          return req.defaultOptionId === null ? null : answer(req, { optionId: req.defaultOptionId });
        }
        // Every other prompt (toss, penalty, challenge, runoff, overtime) takes the
        // rule set's default option: the chart has no opinion, and the option ids belong to the rule set.
        default: return req.defaultOptionId === null ? null : answer(req, { optionId: req.defaultOptionId });
      }
    },
  };
}
