// Who may start a review (B9.1.1, B9.1.2, B13.9.1). The count of challenges, the condition for one
// more, the timeout a challenge needs and the plays kept for the booth are rule keys.
import type { CalledPlay, FoulRecord, PlayResultType, ReviewRequest, RulingAspect, RulingContext, Side } from '@gm/schema';
import { foulReplaySwitch } from '../crew/index.ts';
import { catalogue, foulExists } from '../fouls/index.ts';
import { changesTheResult, evidenceQuality, reviewCanChange } from './evidence.ts';
import { KEY, MODEL, REFUSED, REPLAY, THIRD_IF, boothOnlyKey } from './params.ts';

const TURNOVER_RESULTS: readonly PlayResultType[] = ['interception', 'fumble_lost'];
const KICK_DOWN_RESULTS: readonly PlayResultType[] = ['punt', 'kickoff', 'safety_kick'];
const SCRIMMAGE_RESULTS: readonly PlayResultType[] = ['run', 'pass_complete', 'pass_incomplete', 'sack'];

/** Booth-only by the situation alone: knowable before the play is ruled. */
export function boothOnlySituation(ctx: RulingContext): boolean {
  const s = ctx.situation;
  const on = (item: Parameters<typeof boothOnlyKey>[0]) => ctx.rules.bool(boothOnlyKey(item));
  return (s.insideTwoMinute && on('after_two_minute')) || (s.overtime && on('overtime')) || (s.playKind === 'try' && on('try'));
}

/**
 * Booth-only by what was ruled on the field (B9.1.2 rules 3 and 5). It reads called values only. A
 * ruling of no score, no turnover or a made last down is not on the list, so the coach must challenge it.
 */
export function boothOnlyRuling(called: CalledPlay, ctx: RulingContext): boolean {
  const s = ctx.situation;
  const o = called.calledOutcome;
  const on = (item: Parameters<typeof boothOnlyKey>[0]) => ctx.rules.bool(boothOnlyKey(item));
  if (o.score !== null && on('scoring_play')) return true;
  if (TURNOVER_RESULTS.includes(o.resultType) && on('turnover')) return true;
  if (KICK_DOWN_RESULTS.includes(o.resultType) && o.possessionAfter === o.snappingSide && on('kick_possession')) return true;
  if (s.down !== null && s.lineToGainX !== null && s.down === ctx.rules.num(KEY.downs) && SCRIMMAGE_RESULTS.includes(o.resultType)
    && !o.changeOfPossession && o.score === null && (o.spotX - s.lineToGainX) * s.attackDir < 0 && on('failed_fourth_down')) return true;
  if (called.fouls.some((f) => f.called && (f.dq === 'automatic' || (f.dq === 'if_flagrant' && f.flagrant))) && on('disqualification')) return true;
  return false;
}

/** The booth may start a review of this play (B9.1.2; in the all-plays model, every play: B13.9.1). */
export function boothMayReview(called: CalledPlay, ctx: RulingContext): boolean {
  return ctx.rules.opt(KEY.model) === MODEL.boothAllPlays || boothOnlySituation(ctx) || boothOnlyRuling(called, ctx);
}

/** Challenges `side` still has, from the counters of the state at the snap (B9.1.1 rules 1 and 2). */
export function challengesLeft(side: Side, ctx: RulingContext): number {
  const used = ctx.before.challengesUsed[side];
  const base = ctx.rules.num(KEY.challengeCount);
  const earned = ctx.rules.opt(KEY.thirdIf) === THIRD_IF.eitherWon && ctx.before.challengesWon[side] >= 1 ? 1 : 0;
  const left = base + earned - used;
  return left > 0 ? left : 0;
}

/**
 * Why a coach's challenge gets no review, or null when it is permitted (B9.1.1 rules 4, 8 and 10).
 * The throw itself is never blocked: the caller charges the timeout or the foul of rules 4a and 5.
 * `called` is null where only the situation is known; the booth-only rulings are then not tested.
 */
export function challengeRefusal(called: CalledPlay | null, side: Side, ctx: RulingContext): string | null {
  if (ctx.situation.overtime && !ctx.rules.bool(KEY.allowedInOvertime)) return REFUSED.overtime;
  if (ctx.rules.opt(KEY.model) === MODEL.challengePlusBooth && (boothOnlySituation(ctx) || (called !== null && boothOnlyRuling(called, ctx)))) return REFUSED.boothOnly;
  if (challengesLeft(side, ctx) === 0) return REFUSED.noChallenges;
  if (ctx.rules.bool(KEY.needsTimeout) && ctx.before.timeoutsLeft[side] === 0) return REFUSED.noTimeout;
  return null;
}

const distinct = (list: readonly RulingAspect[]): RulingAspect[] => list.filter((a, i) => list.indexOf(a) === i);

/** ReplayRules.challengeable: the reviewable aspects of the play, from called values only (B9.3.1). */
export function challengeable(called: CalledPlay, side: Side, ctx: RulingContext): RulingAspect[] {
  if (challengeRefusal(called, side, ctx) !== null) return [];
  return distinct(called.rulings.filter((r) => r.reviewable).map((r) => r.aspect));
}

/**
 * ReplayRules.boothReview (B9.1.2, B13.9.1). The booth looks at every play in its reach and stops
 * the game when the evidence for a change is above the stop threshold. A foul that the rule set
 * sends to replay every time it is called (B13.8.1) is reviewed whatever the evidence.
 */
export function boothReview(called: CalledPlay, ctx: RulingContext): ReviewRequest | null {
  const aspects: RulingAspect[] = [];
  if (called.fouls.some((f) => f.called && foulReplaySwitch(ctx.rules, f.foulId, 'replay_reviewed'))) aspects.push('foul');
  if (boothMayReview(called, ctx)) {
    const threshold = ctx.params.num(REPLAY.boothStopThreshold);
    for (const r of called.rulings) {
      if (reviewCanChange(r) && changesTheResult(r, ctx) && evidenceQuality(r, ctx) > threshold) aspects.push(r.aspect);
    }
  }
  return aspects.length ? { source: 'booth', side: null, aspects: distinct(aspects) } : null;
}

/**
 * What a finished coach's challenge costs (B9.1.1 rules 4a, 6 and 7; B13.9.1). A challenge is won
 * when any ruling was changed. A lost or refused one costs a timeout; a won one costs a timeout only
 * where the rule set does not give it back. A team with no timeout to pay is fouled by the caller (rule 5).
 */
export function challengeAccounting(request: ReviewRequest, result: { allowed: boolean; reversed: readonly number[] }, ctx: RulingContext): { timeoutCharged: boolean; challengeLost: boolean } {
  if (request.source !== 'coach_challenge') return { timeoutCharged: false, challengeLost: false };
  const won = result.allowed && result.reversed.length > 0;
  // A team with no timeout left has none to lose: it is fouled instead (rule 5), never charged a timeout it does not have.
  const hasTimeout = request.side !== null && ctx.before.timeoutsLeft[request.side] > 0;
  return { challengeLost: !won, timeoutCharged: hasTimeout && (!won || !ctx.rules.bool(KEY.overturnRefundsTimeout)) };
}

/** The foul of B9.1.1 rule 5 in the foul catalogue (B8.1.2). */
export const NO_TIMEOUT_FOUL = 'challenge_without_timeout';

/**
 * The flag the officials throw for a coach's challenge (B9.1.1 rule 5), or null when none is due.
 * A team that challenges when it has exhausted its timeouts is fouled where the level has that foul
 * (pro: Rule 15-1-1(d) penalty, 15 yards, always a foul between downs by 14-1-2 Item 4 exception).
 * Where it does not (college: 12-5-1-b-6, and 3-3-1-b says the request is not acknowledged) the
 * challenge simply gets no review. The foul is no act of the play: it has no player and no truth
 * event, and as a foul between downs its spot and phase are recorded, never enforced from.
 */
export function challengeFoul(request: ReviewRequest, called: CalledPlay, t: number, ctx: RulingContext): FoulRecord | null {
  if (request.source !== 'coach_challenge' || request.side === null) return null;
  if (!ctx.rules.bool(KEY.needsTimeout) || ctx.before.timeoutsLeft[request.side] > 0) return null;
  if (!foulExists(NO_TIMEOUT_FOUL, ctx.rules)) return null;
  const row = catalogue(NO_TIMEOUT_FOUL, ctx);
  const o = called.calledOutcome;
  return {
    foulId: NO_TIMEOUT_FOUL, side: request.side, playerId: null, spot: { x: o.spotX, y: o.spotY }, t,
    timing: 'between_downs', phase: ctx.situation.playKind === 'try' ? 'try' : 'running_play',
    yards: row.yards, afd: row.afd, lod: row.lod, spotFoul: row.spotFoul, runoffEligible: row.runoffEligible,
    foulClass: row.foulClass, dq: row.dq, beforeChangeOfPossession: true,
    eventIndex: null, sameAct: null, called: true, correct: true, flagrant: false,
  };
}
